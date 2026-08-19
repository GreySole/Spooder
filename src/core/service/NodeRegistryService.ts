import fs from 'fs';
import path from 'path';
import {
  ActionExecutionContext,
  ActionNodeDef,
  KeyedObject,
  NodeFieldDef,
  NodeForm,
  NodePortDataType,
  NodeManifest,
  userDir,
} from '../../Types';
import { spooderLog } from '../Logging';
import { runResponseScript } from '../util/ResponseUtil';
import { getCoreActionNodes, getCoreTriggerNodes } from './CoreNodeManifest';
import ModuleService from './ModuleService';
import PluginService from './PluginService';

// events-form.json predates connectable ports and so never declares `portType`, which is
// what makes a field render as a wireable input socket on the node card (see the frontend's
// nodeLayout.computeNodePortLayout). Infer one from the field's editor type so every plugin
// event gets sockets without each plugin having to update its events-form.json - matching
// what the legacy generic 'plugin' node declares by hand. 'custom' is deliberately left
// unwired: it's rendered by a module-supplied component and may hold a non-scalar value.
const FIELD_TYPE_PORT_TYPES: { [fieldType: string]: NodePortDataType } = {
  asset: 'string',
  code: 'string',
  color: 'string',
  select: 'string',
  text: 'string',
  number: 'number',
  boolean: 'boolean',
};

function withInferredPortTypes(form: NodeForm): NodeForm {
  const ported: NodeForm = {};
  for (const fieldName in form) {
    const field: NodeFieldDef = form[fieldName];
    // An explicitly declared portType always wins.
    ported[fieldName] = field.portType
      ? field
      : { ...field, portType: FIELD_TYPE_PORT_TYPES[field.type] };
  }
  return ported;
}

// An events-form.json event may set `nodeWidth` beside its label to say how wide its node card
// should start out - worth doing for an event whose fields need the room (an asset picker draws
// a preview, a code field an editor). Anything unusable is dropped rather than clamped, so a
// typo falls back to the standard width instead of silently becoming some other number; the
// frontend clamps what's left to the same range a user can drag a card to.
function pluginNodeWidth(declared: any): number | undefined {
  const width = Number(declared);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

function pluginFormToActionNodes(form: KeyedObject): ActionNodeDef[] {
  return Object.keys(form).map((actionId) => ({
    id: actionId,
    label: form[actionId].label ?? actionId,
    nodeWidth: pluginNodeWidth(form[actionId].nodeWidth),
    form: withInferredPortTypes(form[actionId].form ?? {}),
    defaults: form[actionId].defaults ?? {},
  }));
}

export default class NodeRegistryService {
  static getPluginManifest(pluginName: string): NodeManifest | undefined {
    const formPath = path.join(userDir, 'plugins', pluginName, 'events-form.json');
    if (!fs.existsSync(formPath)) {
      return undefined;
    }
    try {
      const form = JSON.parse(fs.readFileSync(formPath, { encoding: 'utf8' }));
      return {
        moduleName: pluginName,
        triggers: [],
        actions: pluginFormToActionNodes(form),
        isPlugin: true,
      };
    } catch (e) {
      return undefined;
    }
  }

  static getAllManifests(): NodeManifest[] {
    const manifests: NodeManifest[] = [
      {
        moduleName: 'core',
        triggers: getCoreTriggerNodes(),
        actions: getCoreActionNodes(Object.keys(ModuleService.getStreamModules())),
      },
    ];

    const streamModules = ModuleService.getStreamModules();
    for (const name in streamModules) {
      manifests.push({
        moduleName: name,
        triggers: streamModules[name].getTriggerNodes(),
        actions: streamModules[name].getActionNodes(),
      });
    }

    const communityModules = ModuleService.getCommunityModules();
    for (const name in communityModules) {
      manifests.push({
        moduleName: name,
        triggers: communityModules[name].getTriggerNodes(),
        actions: communityModules[name].getActionNodes(),
      });
    }

    const controlModules = ModuleService.getControlModules();
    for (const name in controlModules) {
      manifests.push({
        moduleName: name,
        triggers: controlModules[name].getTriggerNodes(),
        actions: controlModules[name].getActionNodes(),
      });
    }

    const activePlugins = PluginService.getActivePlugins();
    for (const name in activePlugins) {
      const manifest = NodeRegistryService.getPluginManifest(name);
      if (manifest) {
        manifests.push(manifest);
      }
    }

    return manifests;
  }

  // Fires one of a plugin's events-form.json events directly, the dedicated-node equivalent
  // of the legacy generic 'plugin' node (see event/EventPluginCommand.ts). Because the node's
  // form def is available here, fields needing response-script preprocessing are read straight
  // off the manifest - no need for the legacy node's `_`-prefixed sibling-key convention.
  private static executePluginAction(
    pluginName: string,
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) {
    return async () => {
      const action = NodeRegistryService.getPluginManifest(pluginName)?.actions.find(
        (a) => a.id === nodeId,
      );

      const eventValues: KeyedObject = { ...values };
      for (const fieldName in action?.form ?? {}) {
        if (!action!.form[fieldName].options?.use_response_processor) {
          continue;
        }
        const response = await runResponseScript(
          ctx.eventName,
          ctx.streamMessage,
          ctx.extra,
          eventValues[fieldName],
        );
        if (response.status === 'ok') {
          eventValues[fieldName] = response.response;
        } else {
          spooderLog(
            `Error preprocessing plugin response script for ${pluginName} in ${nodeId} for ${ctx.eventName}: ${response.response}`,
          );
        }
      }

      ctx.streamMessage.pluginEventData = eventValues;
      PluginService.getActivePlugins()[pluginName].onEvent(nodeId, ctx.streamMessage);
    };
  }

  static executeAction(
    moduleName: string,
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) {
    const mod = ModuleService.findModule(moduleName);
    if (mod) {
      return mod.executeActionNode(nodeId, values, ctx);
    }

    // Plugins aren't modules (ModuleService only tracks stream/community/control modules),
    // so per-event plugin nodes resolve here instead.
    if (PluginService.getActivePlugins()[moduleName]) {
      return NodeRegistryService.executePluginAction(moduleName, nodeId, values, ctx);
    }

    return () => {
      console.log(`NodeRegistryService: module '${moduleName}' not found for event ${ctx.eventName}`);
    };
  }
}
