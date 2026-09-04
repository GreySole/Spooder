import fs from 'fs';
import {
  ActionExecutionContext,
  ActionNodeDef,
  KeyedObject,
  TriggerNodeDef,
  userDir,
} from '../../Types';
import { ControlModuleInterface } from '../../interface/ControlModuleInterface';
import { spooderLog } from '../../core/Logging';
import getHomeAssistantRouter from './HomeAssistantRouter';
import HomeAssistantMqttClient from './HomeAssistantMqttClient';
import {
  BINARY_SENSOR_DEVICE_CLASS_SELECTIONS,
  HAComponent,
  HomeAssistantSettings,
  SENSOR_DEVICE_CLASS_SELECTIONS,
  slugifyEntityId,
} from './HomeAssistantTypes';

const ENTITY_TYPE_SELECTIONS: KeyedObject = {
  sensor: 'Sensor',
  binary_sensor: 'Binary Sensor',
  switch: 'Switch',
  button: 'Button',
};

const SETTINGS_PATH = userDir + '/settings/homeassistant.json';

export default class HomeAssistant implements ControlModuleInterface {
  client = new HomeAssistantMqttClient();
  settings = {} as HomeAssistantSettings;

  constructor() {
    if (fs.existsSync(SETTINGS_PATH)) {
      try {
        this.settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, { encoding: 'utf-8' }));
      } catch (e) {
        console.log('Something is wrong with the Home Assistant settings file. Try reconnecting.');
        this.settings = {};
      }
    }
  }

  get connected() {
    return this.client.connected;
  }

  set connected(value: boolean) {
    this.client.connected = value;
  }

  onPluginsLoaded() {}

  onOSC() {}

  call(command: string, data: KeyedObject) {
    if (command === 'publish') {
      this.client.publishRaw(String(data.topic ?? ''), String(data.payload ?? ''), Boolean(data.retain));
    }
  }

  getPluginFunctions = () => {
    return {
      setSensor: (entityId: string, value: string, name?: string, unit?: string) => {
        const id = slugifyEntityId(entityId);
        this.client.publishDiscovery('sensor', id, name?.trim() || id, {
          state_topic: this.client.stateTopic('sensor', id),
          ...(unit ? { unit_of_measurement: unit } : {}),
        });
        this.client.publishState('sensor', id, value);
      },
      setBinarySensor: (entityId: string, value: boolean, name?: string) => {
        const id = slugifyEntityId(entityId);
        this.client.publishDiscovery('binary_sensor', id, name?.trim() || id, {
          state_topic: this.client.stateTopic('binary_sensor', id),
          payload_on: 'ON',
          payload_off: 'OFF',
        });
        this.client.publishState('binary_sensor', id, value ? 'ON' : 'OFF');
      },
      setSwitchState: (entityId: string, value: boolean, name?: string) => {
        const id = slugifyEntityId(entityId);
        this.client.publishDiscovery('switch', id, name?.trim() || id, {
          state_topic: this.client.stateTopic('switch', id),
          command_topic: this.client.switchCommandTopic(id),
          payload_on: 'ON',
          payload_off: 'OFF',
          state_on: 'ON',
          state_off: 'OFF',
          optimistic: true,
        });
        this.client.publishState('switch', id, value ? 'ON' : 'OFF');
      },
      removeEntity: (component: HAComponent, entityId: string) => {
        this.client.removeEntity(component, slugifyEntityId(entityId));
      },
    };
  };

  getRouters() {
    return {
      baseUrl: '/homeassistant',
      router: getHomeAssistantRouter(),
      publicRouter: undefined,
    };
  }

  async connect(settings: HomeAssistantSettings): Promise<boolean> {
    this.settings = { ...this.settings, ...settings };
    return this.client.connect(this.settings);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  saveLogin(settings: HomeAssistantSettings) {
    this.settings = { ...this.settings, ...settings };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.settings), 'utf-8');
    console.log('Home Assistant connection saved!');
  }

  async autoLogin() {
    if (!this.settings.host) {
      return false;
    }
    try {
      return await this.client.connect(this.settings);
    } catch (e) {
      console.log('Home Assistant auto-login error', e);
      return false;
    }
  }

  getResponseHandlers() {
    return {};
  }

  getTriggerNodes = (): TriggerNodeDef[] => {
    return [
      {
        id: 'switch_toggled',
        label: 'HA Switch Toggled',
        description:
          'Fires when a switch entity declared by Set HA Switch State is toggled from Home Assistant. Leave Switch ID empty to catch every switch.',
        form: {
          entityId: { label: 'Switch ID (empty = any)', type: 'text' },
        },
        defaults: { entityId: '' },
        outputs: [
          { id: 'entityId', label: 'Switch ID', dataType: 'string' },
          { id: 'state', label: 'State', dataType: 'boolean' },
        ],
      },
      {
        id: 'button_pressed',
        label: 'HA Button Pressed',
        description:
          'Fires when a button entity declared by Register HA Button is pressed from Home Assistant. Leave Button ID empty to catch every button.',
        form: {
          entityId: { label: 'Button ID (empty = any)', type: 'text' },
        },
        defaults: { entityId: '' },
        outputs: [{ id: 'entityId', label: 'Button ID', dataType: 'string' }],
      },
    ];
  };

  getActionNodes = (): ActionNodeDef[] => {
    return [
      {
        id: 'set_sensor',
        label: 'Set HA Sensor',
        description:
          'Creates or updates a Home Assistant sensor entity with the given value. Publishes discovery every run, so a changed name or unit takes effect on the next one.',
        form: {
          entityId: { label: 'Sensor ID', type: 'text', portType: 'string' },
          name: { label: 'Display Name', type: 'text', portType: 'string' },
          value: { label: 'Value', type: 'text', portType: 'string' },
          unit: { label: 'Unit of Measurement', type: 'text' },
          deviceClass: {
            label: 'Device Class',
            type: 'select',
            options: { selections: SENSOR_DEVICE_CLASS_SELECTIONS },
          },
        },
        defaults: { entityId: '', name: '', value: '', unit: '', deviceClass: 'none' },
      },
      {
        id: 'set_binary_sensor',
        label: 'Set HA Binary Sensor',
        description: 'Creates or updates a Home Assistant on/off sensor entity.',
        form: {
          entityId: { label: 'Sensor ID', type: 'text', portType: 'string' },
          name: { label: 'Display Name', type: 'text', portType: 'string' },
          value: { label: 'State', type: 'boolean', portType: 'boolean' },
          deviceClass: {
            label: 'Device Class',
            type: 'select',
            options: { selections: BINARY_SENSOR_DEVICE_CLASS_SELECTIONS },
          },
        },
        defaults: { entityId: '', name: '', value: false, deviceClass: 'none' },
      },
      {
        id: 'set_switch_state',
        label: 'Set HA Switch State',
        description:
          "Creates or updates a Home Assistant switch entity and sets its state. The switch is optimistic - toggling it in HA fires the HA Switch Toggled trigger immediately rather than waiting on this node to confirm it, since what a switch actually does is up to whatever the graph wires it to.",
        form: {
          entityId: { label: 'Switch ID', type: 'text', portType: 'string' },
          name: { label: 'Display Name', type: 'text', portType: 'string' },
          value: { label: 'State', type: 'boolean', portType: 'boolean' },
        },
        defaults: { entityId: '', name: '', value: false },
      },
      {
        id: 'register_button',
        label: 'Register HA Button',
        description:
          'Ensures a button entity exists in Home Assistant. A button has no state of its own, so this only needs to run once (e.g. from a Spooder startup event) - pressing it in HA fires the HA Button Pressed trigger.',
        form: {
          entityId: { label: 'Button ID', type: 'text', portType: 'string' },
          name: { label: 'Display Name', type: 'text', portType: 'string' },
        },
        defaults: { entityId: '', name: '' },
      },
      {
        id: 'remove_entity',
        label: 'Remove HA Entity',
        description: 'Removes a previously declared entity from Home Assistant.',
        form: {
          entityId: { label: 'Entity ID', type: 'text', portType: 'string' },
          component: {
            label: 'Entity Type',
            type: 'select',
            options: { selections: ENTITY_TYPE_SELECTIONS },
          },
        },
        defaults: { entityId: '', component: 'sensor' },
      },
    ];
  };

  executeActionNode = (nodeId: string, values: KeyedObject, ctx: ActionExecutionContext) => {
    return () => {
      if (!this.connected) {
        spooderLog(
          `A Home Assistant action for ${ctx.eventName} was triggered, but Home Assistant is not connected.`,
        );
        return;
      }

      const entityId = slugifyEntityId(String(values.entityId ?? ''));
      if (entityId === '') {
        spooderLog(`Home Assistant action for ${ctx.eventName} had no entity ID, so it was skipped.`);
        return;
      }
      const name = String(values.name ?? '').trim() || entityId;

      switch (nodeId) {
        case 'set_sensor': {
          const unit = String(values.unit ?? '').trim();
          const deviceClass = String(values.deviceClass ?? 'none');
          const extra: KeyedObject = { state_topic: this.client.stateTopic('sensor', entityId) };
          if (unit) {
            extra.unit_of_measurement = unit;
          }
          if (deviceClass !== 'none') {
            extra.device_class = deviceClass;
          }
          this.client.publishDiscovery('sensor', entityId, name, extra);
          this.client.publishState('sensor', entityId, String(values.value ?? ''));
          break;
        }
        case 'set_binary_sensor': {
          const deviceClass = String(values.deviceClass ?? 'none');
          const extra: KeyedObject = {
            state_topic: this.client.stateTopic('binary_sensor', entityId),
            payload_on: 'ON',
            payload_off: 'OFF',
          };
          if (deviceClass !== 'none') {
            extra.device_class = deviceClass;
          }
          this.client.publishDiscovery('binary_sensor', entityId, name, extra);
          this.client.publishState('binary_sensor', entityId, values.value ? 'ON' : 'OFF');
          break;
        }
        case 'set_switch_state': {
          this.client.publishDiscovery('switch', entityId, name, {
            state_topic: this.client.stateTopic('switch', entityId),
            command_topic: this.client.switchCommandTopic(entityId),
            payload_on: 'ON',
            payload_off: 'OFF',
            state_on: 'ON',
            state_off: 'OFF',
            optimistic: true,
          });
          this.client.publishState('switch', entityId, values.value ? 'ON' : 'OFF');
          break;
        }
        case 'register_button': {
          this.client.publishDiscovery('button', entityId, name, {
            command_topic: this.client.buttonCommandTopic(entityId),
          });
          break;
        }
        case 'remove_entity': {
          const component = String(values.component ?? 'sensor') as HAComponent;
          this.client.removeEntity(component, entityId);
          break;
        }
        default:
          spooderLog(`Unknown Home Assistant action node '${nodeId}' for event ${ctx.eventName}`);
      }
    };
  };
}
