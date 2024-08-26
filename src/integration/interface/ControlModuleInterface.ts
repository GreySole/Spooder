import { KeyedObject } from '../../Types.ts';

export interface ControlModuleInterface {
  autoLogin: () => void;
  call: (command: string, data: KeyedObject) => void;
}
