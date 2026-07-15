import fs from 'fs';
import path from 'path';
import { ActionExecutionContext, ActionNodeDef, KeyedObject, NodeManifest, userDir } from '../../Types';
import ModuleService from './ModuleService';
import PluginService from './PluginService';

function pluginFormToActionNodes(form: KeyedObject): ActionNodeDef[] {
  return Object.keys(form).map((actionId) => ({
    id: actionId,
    label: form[actionId].label ?? actionId,
    form: form[actionId].form ?? {},
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
      };
    } catch (e) {
      return undefined;
    }
  }

  static getAllManifests(): NodeManifest[] {
    const manifests: NodeManifest[] = [];

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

  static executeAction(
    moduleName: string,
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) {
    const mod = ModuleService.findModule(moduleName);
    if (!mod) {
      return () => {
        console.log(`NodeRegistryService: module '${moduleName}' not found for event ${ctx.eventName}`);
      };
    }
    return mod.executeActionNode(nodeId, values, ctx);
  }
}
