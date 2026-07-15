import { Router } from 'express';
import { ActionExecutionContext, ActionNodeDef, KeyedObject, TriggerNodeDef } from '../Types';

export interface CommunityModuleInterface {
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  autoLogin: () => Promise<boolean>;
  sendDM: (userId: string, message: string) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getResponseHandlers: () => KeyedObject;
  lastMessage: KeyedObject;
  onExternalNetworkChanged: () => void;
  getTriggerNodes: () => TriggerNodeDef[];
  getActionNodes: () => ActionNodeDef[];
  executeActionNode: (
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) => () => void | Promise<void>;
}
