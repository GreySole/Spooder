import { Router } from 'express';
import { KeyedObject } from '../../Types.ts';

export interface CommunityModuleInterface {
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  autoLogin: () => void;
  sendDM: (userId: string, message: string) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getResponseHandlers: () => KeyedObject;
  lastMessage: KeyedObject;
  onExternalNetworkChanged: () => void;
}
