import { KeyedObject } from 'src/Types';

export function triggerExistsAndEnabled(triggers: KeyedObject, triggerType: string) {
  if (triggers[triggerType]) {
    if (triggers[triggerType].enabled) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}
