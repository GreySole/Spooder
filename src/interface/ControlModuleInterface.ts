import { Router } from 'express';
import { ActionExecutionContext, ActionNodeDef, KeyedObject, TriggerNodeDef } from '../Types';

export interface ControlModuleInterface {
  connected: boolean;
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
