import { Router } from 'express';
import { KeyedObject } from '../../Types.ts';

export interface StreamModuleInterface {
  getRouters: () => { baseUrl: string; router: Router; publicRouter: Router };
  autoLogin: () => void;
  sayInChat: (message: string, channel: string) => void;
  onEventFileSaved: () => void;
  onExternalNetworkChange: () => void;
  getChannelInfo: (channel?: string) => Promise<KeyedObject>;
  onExternalNetworkChanged: () => void;
  lastMessage: KeyedObject;
}
