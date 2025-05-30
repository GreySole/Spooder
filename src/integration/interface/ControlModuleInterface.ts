import { Router } from 'express';
import { KeyedObject } from '../../Types.ts';

export interface ControlModuleInterface {
  autoLogin: () => void;
  call: (command: string, data: KeyedObject) => void;
  getPluginFunctions: () => KeyedObject;
  onPluginsLoaded: () => void;
  getRouters: () => { baseUrl: string; router?: Router; publicRouter?: Router };
  onOSC: (message: any) => void;
}
