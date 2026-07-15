import {
  ActionExecutionContext,
  ActionNodeDef,
  userDir,
  KeyedObject,
  TriggerNodeDef,
} from '../../Types';
import { ControlModuleInterface } from '../../interface/ControlModuleInterface';
import { OBSRequestTypes } from 'obs-websocket-js';
import getObsRouters from './ObsRouter';
import ObsWebsocket from './ObsWebsocket';
import fs from 'fs';
import OSC from '@spooder/osc-js';
import { spooderLog } from '../../core/Logging';
import { websocketTest } from '../../core/util/NetUtil';
import { EventService } from '../../core/service/EventService';
import ObsStreamMonitor from './ObsStreamMonitor';

export default class OBS implements ControlModuleInterface {
  constructor() {
    if (fs.existsSync(userDir + '/settings/obs.json')) {
      try {
        this.settings = JSON.parse(
          fs.readFileSync(userDir + '/settings/obs.json', { encoding: 'utf-8' }),
        );
      } catch (e) {
        console.log('Somethings wrong with obs login file. Try entering it again.');
        this.settings = {};
      }
    }
  }

  websocket = new ObsWebsocket();
  monitor = new ObsStreamMonitor();

  onPluginsLoaded() {}

  onOSC(message: OSC.Message) {
    this.websocket.onOSC(message);
  }

  call(command: string, data: KeyedObject) {
    const obsCommand = command as keyof OBSRequestTypes;
    this.websocket.call(obsCommand, data);
  }

  getPluginFunctions = () => {
    return {};
  };

  getTriggerNodes = (): TriggerNodeDef[] => {
    return [
      {
        id: 'scene_changed',
        label: 'Scene Changed',
        description: 'Fires when the current program scene changes.',
        form: {
          sceneName: { label: 'Scene Name (empty = any scene)', type: 'text' },
        },
        defaults: { sceneName: '' },
        outputs: [{ id: 'sceneName', label: 'Scene Name', dataType: 'string' }],
      },
      {
        id: 'stream_state_changed',
        label: 'Stream State Changed',
        description: 'Fires when streaming starts, stops, or reconnects.',
        form: {
          state: {
            label: 'State',
            type: 'select',
            options: {
              selections: { any: 'Any', started: 'Started', stopped: 'Stopped', reconnecting: 'Reconnecting' },
            },
          },
        },
        defaults: { state: 'any' },
        outputs: [
          { id: 'outputActive', label: 'Output Active', dataType: 'boolean' },
          { id: 'outputState', label: 'Output State', dataType: 'string' },
        ],
      },
    ];
  };

  getActionNodes = (): ActionNodeDef[] => {
    return [
      {
        id: 'switchscenes',
        label: 'Switch Scene',
        form: {
          itemOn: { label: 'Scene', type: 'text', portType: 'string' },
          etype: { label: 'Mode', type: 'select', options: { selections: { single: 'Single', timed: 'Timed' } } },
          itemOff: {
            label: 'Revert To Scene',
            type: 'text',
            portType: 'string',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
          duration: {
            label: 'Duration (seconds)',
            type: 'number',
            portType: 'number',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
        },
        defaults: { itemOn: '', etype: 'single', itemOff: '', duration: '0' },
        supportsTimed: true,
      },
      {
        id: 'setinputmute',
        label: 'Set Input Mute',
        form: {
          item: { label: 'Input Name', type: 'text', portType: 'string' },
          valueOn: { label: 'Mute', type: 'boolean' },
          etype: { label: 'Mode', type: 'select', options: { selections: { single: 'Single', timed: 'Timed' } } },
          valueOff: {
            label: 'Revert Mute State',
            type: 'boolean',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
          duration: {
            label: 'Duration (seconds)',
            type: 'number',
            portType: 'number',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
        },
        defaults: { item: '', valueOn: true, etype: 'single', valueOff: false, duration: '0' },
        supportsTimed: true,
      },
      {
        id: 'enablesceneitem',
        label: 'Enable/Disable Scene Item',
        form: {
          scene: { label: 'Scene Name', type: 'text', portType: 'string' },
          item: { label: 'Scene Item ID', type: 'text', portType: 'string' },
          valueOn: { label: 'Enabled', type: 'boolean' },
          etype: { label: 'Mode', type: 'select', options: { selections: { single: 'Single', timed: 'Timed' } } },
          valueOff: {
            label: 'Revert Enabled State',
            type: 'boolean',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
          duration: {
            label: 'Duration (seconds)',
            type: 'number',
            portType: 'number',
            showif: { variable: 'etype', condition: 'equals', value: 'timed' },
          },
        },
        defaults: { scene: '', item: '', valueOn: true, etype: 'single', valueOff: false, duration: '0' },
        supportsTimed: true,
      },
    ];
  };

  executeActionNode = (nodeId: string, values: KeyedObject, ctx: ActionExecutionContext) => {
    if (!this.connected) {
      return () => {
        spooderLog(`An OBS command for ${ctx.eventName} was triggered, but OBS is not connected.`);
      };
    }
    return () => {
      const duration = parseFloat(values.duration);
      switch (nodeId) {
        case 'switchscenes':
          this.call('SetCurrentProgramScene', { sceneName: values.itemOn });
          if (values.etype == 'timed') {
            EventService.createTimeout(
              ctx.eventName,
              values,
              'obs',
              () => {
                this.call('SetCurrentProgramScene', { sceneName: values.itemOff });
              },
              duration,
            );
          }
          break;
        case 'setinputmute':
          this.call('SetInputMute', { inputName: values.item, inputMuted: values.valueOn == 1 });
          if (values.etype == 'timed') {
            EventService.createTimeout(
              ctx.eventName,
              values,
              'obs',
              () => {
                this.call('SetInputMute', { inputName: values.item, inputMuted: values.valueOff == 1 });
              },
              duration,
            );
          }
          break;
        case 'enablesceneitem':
          this.call('SetSceneItemEnabled', {
            sceneName: values.scene,
            sceneItemId: parseInt(values.item),
            sceneItemEnabled: values.valueOn == 1,
          });
          if (values.etype == 'timed') {
            EventService.createTimeout(
              ctx.eventName,
              values,
              'obs',
              () => {
                this.call('SetSceneItemEnabled', {
                  sceneName: values.scene,
                  sceneItemId: parseInt(values.item),
                  sceneItemEnabled: values.valueOff == 0,
                });
              },
              duration,
            );
          }
          break;
        default:
          spooderLog(`Unknown obs action node '${nodeId}' for event ${ctx.eventName}`);
      }
    };
  };

  getRouters() {
    const router = getObsRouters();
    return {
      baseUrl: '/obs',
      router,
      publicRouter: undefined,
    };
  }

  settings = {} as KeyedObject;

  async autoLogin() {
    try {
      return await new Promise<boolean>(async (res, rej) => {
        if (this.settings.host != null) {
          const portAlive = await websocketTest(this.settings.host, this.settings.port);
          if (!portAlive) {
            console.log(`OBS host ${this.settings.host}:${this.settings.port} is not reachable.`);
            res(false);
            return;
          }
          await this.websocket.connect(
            this.settings.host,
            this.settings.port,
            this.settings.password,
          );
          res(true);
        } else {
          res(false);
        }
      });
    } catch (e) {
      console.log('OBS auto-login error', e);
      return false;
    }
  }

  getResponseHandlers() {
    return {};
  }

  saveLogin(host: string, port: number, password: string) {
    this.settings.host = host;
    this.settings.port = port;
    this.settings.password = password;
    fs.writeFileSync(userDir + '/settings/obs.json', JSON.stringify(this.settings), 'utf-8');
    console.log('OBS Login Saved!');
  }

  get connected() {
    return this.websocket.connected;
  }

  set connected(value: boolean) {
    this.websocket.connected = value;
  }

  deckClients = [] as any[];
  streamReconnecting = false;
  streamBleeding = false;
  streamBleedCount = 0;
  skippedFrames = 0;
}
