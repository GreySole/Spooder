import { Router } from 'express';
import { KeyedObject } from '../../Types.ts';

export interface StreamModuleInterface {
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  autoLogin: () => void;
  sayInChat: (message: string, channel: string) => void;
  onEventFileSaved: () => void;
  getChannelInfo: (channel?: string) => Promise<KeyedObject>;
  getUserInfo: (user?: string) => Promise<KeyedObject>;
  joinChannel: (channelname: string, joinmsg: string) => Promise<void>;
  leaveChannel: (channelname: string, leavemsg: string) => Promise<void>;
  refreshShareUserInfo(id: string): Promise<KeyedObject>;
  onExternalNetworkChanged: () => void;
  onSharesChanged: () => void;
  getResponseHandlers: () => KeyedObject;
  shareUsers: KeyedObject;
  lastMessage: KeyedObject;
}
