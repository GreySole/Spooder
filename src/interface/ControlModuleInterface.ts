import { Router } from 'express';
import { ActionExecutionContext, ActionNodeDef, KeyedObject, TriggerNodeDef } from '../Types';

export interface ControlModuleInterface {
  connected: boolean;
  // Opt in to a private OSC websocket at /osc/<oscChannel> instead of sharing /osc with core
  // and plugins. For modules whose traffic would drown the shared socket; messages sent on it
  // only reach webui pages that mount an OscProvider with the matching tag, and inbound
  // messages on it are routed to this module's onOSC alone.
  oscChannel?: string;
  autoLogin: () => Promise<boolean>;
  getResponseHandlers: () => KeyedObject;
  call: (command: string, data: KeyedObject) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  onOSC: (message: any) => void;
  getTriggerNodes: () => TriggerNodeDef[];
  getActionNodes: () => ActionNodeDef[];
  executeActionNode: (
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) => () => void | Promise<void>;
}
