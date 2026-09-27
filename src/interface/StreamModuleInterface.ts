import { Router } from 'express';
import { ActionExecutionContext, ActionNodeDef, KeyedObject, TriggerNodeDef } from '../Types';

export interface StreamModuleInterface {
  api: any;
  oauth: any;
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
  sayInChat: (message: string, channel: string) => void;
  onEventFileSaved: () => void;
  getTriggerNodes: () => TriggerNodeDef[];
  getActionNodes: () => ActionNodeDef[];
  executeActionNode: (
    nodeId: string,
    values: KeyedObject,
    ctx: ActionExecutionContext,
  ) => () => void | KeyedObject | Promise<void | KeyedObject>;
  getChannelInfo: (channel?: string) => Promise<KeyedObject>;
  getActiveShares: () => Promise<KeyedObject>;
  getUserInfo: (user?: string) => Promise<KeyedObject>;
  verifyShareTarget: (target: string) => Promise<KeyedObject>;
  getPluginFunctions: () => KeyedObject;
  joinChannel: (channelname: string, joinmsg: string | undefined) => Promise<void>;
  leaveChannel: (channelname: string, leavemsg: string | undefined) => Promise<void>;
  refreshShareUserInfo(id: string): Promise<KeyedObject>;
  onExternalNetworkChanged: () => void;
  onPluginsLoaded: () => void;
  onSharesChanged: () => void;
  getResponseHandlers: () => KeyedObject;
  shareUsers: KeyedObject;
  lastMessage: KeyedObject;
  homeChannel: string;
}
