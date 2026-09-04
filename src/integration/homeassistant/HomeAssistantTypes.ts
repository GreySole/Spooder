import { KeyedObject } from '../../Types';

export type HAComponent = 'sensor' | 'binary_sensor' | 'switch' | 'button';

export interface HomeAssistantSettings {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  useTls?: boolean;
  // MQTT discovery is namespaced under two prefixes: `discoveryPrefix` is where Home
  // Assistant looks for `<component>/<nodeId>/<entityId>/config` topics (its own setting,
  // 'homeassistant' unless someone changed it), while `nodeId` is Spooder's own device
  // identifier and the root of every state/command topic Spooder publishes or subscribes to.
  discoveryPrefix?: string;
  nodeId?: string;
  deviceName?: string;
}

export const DEFAULT_PORT = 1883;
export const DEFAULT_DISCOVERY_PREFIX = 'homeassistant';
export const DEFAULT_NODE_ID = 'spooder';

// A blank selection renders as 'none' in the option list; device_class is simply omitted from
// the discovery payload for it, which is how HA spells "no special class - just a plain value".
export const SENSOR_DEVICE_CLASS_SELECTIONS: KeyedObject = {
  none: 'None',
  duration: 'Duration',
  timestamp: 'Timestamp',
  temperature: 'Temperature',
  humidity: 'Humidity',
  power: 'Power',
  energy: 'Energy',
  voltage: 'Voltage',
  current: 'Current',
  frequency: 'Frequency',
  data_size: 'Data Size',
  data_rate: 'Data Rate',
};

export const BINARY_SENSOR_DEVICE_CLASS_SELECTIONS: KeyedObject = {
  none: 'None',
  connectivity: 'Connectivity',
  motion: 'Motion',
  occupancy: 'Occupancy',
  presence: 'Presence',
  running: 'Running',
  sound: 'Sound',
  problem: 'Problem',
  update: 'Update',
};

// HA entity IDs are restricted to lowercase letters, digits and underscores; this both keeps
// the resulting MQTT topics predictable and matches what HA itself would slugify the name to.
export function slugifyEntityId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
