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
  EventService.getDisabledGroups()?.forEach((groupName: string) => {
    if (event.group === groupName) {
      return true;
    }
  });
  return false;
}

const NO_FILTER_VALUES = ['', 'any', false, undefined, null];

export function matchesTriggerValues(
  triggerNodeId: string,
  config: KeyedObject,
  payload: KeyedObject,
) {
  if (config.nodeTypeId && config.nodeTypeId !== triggerNodeId) {
    return false;
  }
  for (const key in config) {
    if (key === 'enabled' || key === 'nodeTypeId') {
      continue;
    }
    const configValue = config[key];
    if (NO_FILTER_VALUES.includes(configValue)) {
      continue;
    }
    if (payload[key] === undefined) {
      continue;
    }
    if (key.endsWith('Prefix')) {
      if (!String(payload[key]).startsWith(configValue)) {
        return false;
      }
      continue;
    }
    if (payload[key] !== configValue) {
      return false;
    }
  }
  return true;
}
