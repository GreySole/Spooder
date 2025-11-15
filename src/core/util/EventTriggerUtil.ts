import { KeyedObject } from '../../Types';
import { EventService } from '../service/EventService';

export function triggerExistsAndEnabled(event: KeyedObject, triggerType: string) {
  if (groupIsDisabled(event)) {
    return false;
  }
  if (event.triggers[triggerType]) {
    if (event.triggers[triggerType].enabled) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function groupIsDisabled(event: KeyedObject) {
  EventService.getDisabledGroups().forEach((groupName: string) => {
    if (event.group === groupName) {
      return true;
    }
  });
  return false;
}
