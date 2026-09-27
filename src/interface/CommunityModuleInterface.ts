import { Router } from 'express';
import {
  ActionExecutionContext,
  ActionNodeDef,
  KeyedObject,
  OperationNodeDef,
  TriggerNodeDef,
} from '../Types';

export interface CommunityModuleInterface {
  getRouters: () => {
    baseUrl: string;
    router?: Router;
    publicRouter?: Router;
    // The few endpoints of `router` a moderator may call through the public URL, for the node
    // inspectors and test panels the module's UI contributes to the mod UI. Answered only to a
    // logged-in moderator; build it with modSafeRouter.
    modRouter?: Router;
  };
  autoLogin: () => Promise<boolean>;
  sendDM: (userId: string, message: string) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getResponseHandlers: () => KeyedObject;
  lastMessage: KeyedObject;
  onExternalNetworkChanged: () => void;
  getTriggerNodes: () => TriggerNodeDef[];
  getActionNodes: () => ActionNodeDef[];
  // Pure value nodes (no exec pins) the module contributes to the palette. Their `category`
  // must be the module's own name: the palette stamps it on the placed node as moduleName, which
  // is how the executor finds the module to evaluate them (see evaluateOperationNode).
  getOperationNodes?: () => OperationNodeDef[];
  evaluateOperationNode?: (nodeId: string, values: KeyedObject) => KeyedObject;
  executeActionNode: (
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) => () => void | KeyedObject | Promise<void | KeyedObject>;
}
