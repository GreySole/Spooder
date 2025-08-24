import { Router } from 'express';
import { KeyedObject } from '../../Types';

export interface StreamModuleInterface {
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  autoLogin: () => Promise<boolean>;
  sayInChat: (message: string, channel: string) => void;
  onEventFileSaved: () => void;
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
