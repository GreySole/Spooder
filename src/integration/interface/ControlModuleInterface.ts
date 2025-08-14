import { Router } from 'express';
import { KeyedObject } from '../../Types';

export interface ControlModuleInterface {
  connected: boolean;
  autoLogin: () => Promise<boolean>;
  getResponseHandlers: () => KeyedObject;
  call: (command: string, data: KeyedObject) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  onOSC: (message: any) => void;
}
