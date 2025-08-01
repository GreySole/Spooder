import { Router } from 'express';
import { KeyedObject } from '../../Types';

export interface CommunityModuleInterface {
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  autoLogin: () => Promise<boolean>;
  sendDM: (userId: string, message: string) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getResponseHandlers: () => KeyedObject;
  lastMessage: KeyedObject;
  onExternalNetworkChanged: () => void;
}
