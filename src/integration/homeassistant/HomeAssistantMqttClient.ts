import mqtt, { MqttClient } from 'mqtt';
import { EventService } from '../../core/service/EventService';
import { spooderLog } from '../../core/Logging';
import { websocketTest } from '../../core/util/NetUtil';
import { buildMockStreamMessage } from '../../core/util/ResponseUtil';
import { KeyedObject } from '../../Types';
import {
  DEFAULT_DISCOVERY_PREFIX,
  DEFAULT_NODE_ID,
  DEFAULT_PORT,
  HAComponent,
  HomeAssistantSettings,
} from './HomeAssistantTypes';

// Owns the one MQTT connection this module keeps to the broker Home Assistant is also on, and
// speaks HA's MQTT discovery convention over it: a retained JSON 'config' document per entity
// tells HA the entity exists and how to reach it, a retained value on a state topic is what HA
// displays, and - for anything HA can command - a topic Spooder subscribes to carries requests
// the other way. None of this is Spooder-specific; it is exactly what ESPHome and every other
// third-party MQTT device do to appear in HA with no YAML on the HA side.
export default class HomeAssistantMqttClient {
  private client: MqttClient | null = null;
  private nodeId = DEFAULT_NODE_ID;
  private discoveryPrefix = DEFAULT_DISCOVERY_PREFIX;
  private deviceName = 'Spooder';
  connected = false;

  async connect(settings: HomeAssistantSettings): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    if (!settings.host) {
      return false;
    }

    const port = settings.port ?? DEFAULT_PORT;
    const reachable = await websocketTest(settings.host, port, 3000);
    if (!reachable) {
      spooderLog(`Home Assistant MQTT broker ${settings.host}:${port} is not reachable.`);
      return false;
    }

    this.nodeId = settings.nodeId?.trim() || DEFAULT_NODE_ID;
    this.discoveryPrefix = settings.discoveryPrefix?.trim() || DEFAULT_DISCOVERY_PREFIX;
    this.deviceName = settings.deviceName?.trim() || 'Spooder';

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: boolean) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      const protocol = settings.useTls ? 'mqtts' : 'mqtt';
      const client = mqtt.connect(`${protocol}://${settings.host}:${port}`, {
        username: settings.username || undefined,
        password: settings.password || undefined,
        will: { topic: this.availabilityTopic(), payload: 'offline', qos: 1, retain: true },
        reconnectPeriod: 5000,
        connectTimeout: 8000,
      });

      client.on('connect', () => {
        this.connected = true;
        client.publish(this.availabilityTopic(), 'online', { qos: 1, retain: true });
        client.subscribe(`${this.nodeId}/switch/+/set`);
        client.subscribe(`${this.nodeId}/button/+/press`);
        spooderLog('Connected to the Home Assistant MQTT broker.');
        settle(true);
      });
      client.on('message', (topic, payload) => this.onMessage(topic, payload));
      client.on('error', (err) => {
        spooderLog('Home Assistant MQTT error:', err.message);
        settle(false);
      });
      client.on('close', () => {
        this.connected = false;
      });

      this.client = client;
    });
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }
    this.client = null;
    this.connected = false;
    await new Promise<void>((resolve) => {
      client.publish(this.availabilityTopic(), 'offline', { qos: 1, retain: true }, () => {
        client.end(false, {}, () => resolve());
      });
    });
  }

  private onMessage(topic: string, payload: Buffer) {
    const parts = topic.split('/');
    if (parts.length !== 4 || parts[0] !== this.nodeId) {
      return;
    }
    const [, component, entityId, action] = parts;
    const streamMessage = buildMockStreamMessage('');

    if (component === 'switch' && action === 'set') {
      const state = payload.toString().trim().toUpperCase() === 'ON';
      const eventPayload: KeyedObject = { entityId, state };
      streamMessage.platformEventData = eventPayload;
      EventService.emitTrigger('homeassistant', 'switch_toggled', eventPayload, streamMessage);
    } else if (component === 'button' && action === 'press') {
      const eventPayload: KeyedObject = { entityId };
      streamMessage.platformEventData = eventPayload;
      EventService.emitTrigger('homeassistant', 'button_pressed', eventPayload, streamMessage);
    }
  }

  stateTopic(component: HAComponent, entityId: string): string {
    return `${this.nodeId}/${component}/${entityId}/state`;
  }

  switchCommandTopic(entityId: string): string {
    return `${this.nodeId}/switch/${entityId}/set`;
  }

  buttonCommandTopic(entityId: string): string {
    return `${this.nodeId}/button/${entityId}/press`;
  }

  private availabilityTopic(): string {
    return `${this.nodeId}/status`;
  }

  private discoveryTopic(component: HAComponent, entityId: string): string {
    return `${this.discoveryPrefix}/${component}/${this.nodeId}/${entityId}/config`;
  }

  // Publishes (or refreshes) the discovery document for one entity. Safe to call every time
  // the entity's value changes - it is small, retained, and idempotent, and it is the only way
  // a renamed label or changed unit ever reaches HA.
  publishDiscovery(component: HAComponent, entityId: string, name: string, extra: KeyedObject) {
    if (!this.client || !this.connected) {
      return;
    }
    const payload = {
      name,
      unique_id: `${this.nodeId}_${entityId}`,
      availability_topic: this.availabilityTopic(),
      device: {
        identifiers: [this.nodeId],
        name: this.deviceName,
        manufacturer: 'Spooder',
        model: 'Spooder Event Graph',
      },
      ...extra,
    };
    this.client.publish(this.discoveryTopic(component, entityId), JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
  }

  publishState(component: HAComponent, entityId: string, value: string) {
    if (!this.client || !this.connected) {
      return;
    }
    this.client.publish(this.stateTopic(component, entityId), value, { qos: 0, retain: true });
  }

  // Publishing an empty retained payload to an entity's discovery topic is HA's own convention
  // for un-registering it; clearing the retained state alongside it stops a stale value from
  // reappearing if the entity is ever re-declared later.
  removeEntity(component: HAComponent, entityId: string) {
    if (!this.client) {
      return;
    }
    this.client.publish(this.discoveryTopic(component, entityId), '', { qos: 1, retain: true });
    this.client.publish(this.stateTopic(component, entityId), '', { qos: 0, retain: true });
  }

  // Escape hatch for anything that isn't one of the declared component shapes - a plugin
  // publishing to a topic of its own choosing.
  publishRaw(topic: string, payload: string, retain = false) {
    if (!this.client || !this.connected) {
      return;
    }
    this.client.publish(topic, payload, { retain });
  }
}
