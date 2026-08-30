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

// OBS's stream output states, named for the Stream State Changed trigger. The raw
// OBS_WEBSOCKET_OUTPUT_* strings are what the websocket sends, and a graph shouldn't have to
// know them - the node filters on these names and hands out booleans instead.
export const STREAM_STATE_NAMES: KeyedObject = {
  OBS_WEBSOCKET_OUTPUT_STARTING: 'starting',
  OBS_WEBSOCKET_OUTPUT_STARTED: 'started',
  OBS_WEBSOCKET_OUTPUT_STOPPING: 'stopping',
  OBS_WEBSOCKET_OUTPUT_STOPPED: 'stopped',
  OBS_WEBSOCKET_OUTPUT_RECONNECTING: 'reconnecting',
  OBS_WEBSOCKET_OUTPUT_RECONNECTED: 'reconnected',
};

const STREAM_STATE_SELECTIONS: KeyedObject = {
  any: 'Any',
  starting: 'Starting',
  started: 'Started',
  stopping: 'Stopping',
  stopped: 'Stopped',
  reconnecting: 'Reconnecting',
  reconnected: 'Reconnected',
};

// Filename date presets for the Set Recording Name node. These are OBS's own format tokens and
// go into the filename format verbatim: OBS expands them when a recording starts, so what lands
// on disk is the time of that recording rather than the time the node ran.
const DATE_FORMAT_SELECTIONS: KeyedObject = {
  '%CCYY-%MM-%DD': 'Date (2026-08-25)',
  '%CCYY-%MM-%DD %hh-%mm-%ss': 'Date and Time (2026-08-25 14-30-52)',
  '%DD-%MM-%CCYY': 'Day First (25-08-2026)',
  '%MM-%DD-%CCYY': 'Month First (08-25-2026)',
  '%hh-%mm-%ss': 'Time (14-30-52)',
  custom: 'Custom',
};

// Joins the title and the date format into one filename format. Either half can be missing - a
// node with no title is just a date - and the separator is only worth writing when there are
// two sides to keep apart.
export function buildRecordingName(values: KeyedObject) {
  const title = String(values.title ?? '').trim();
  const format = String(
    (values.dateFormat === 'custom' ? values.dateCustom : values.dateFormat) ?? '',
  ).trim();

  if (values.datePosition == null || values.datePosition === 'none' || format === '') {
    return title;
  }
  if (title === '') {
    return format;
  }
  const separator = String(values.separator ?? '');
  return values.datePosition === 'before'
    ? format + separator + title
    : title + separator + format;
}

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

  // OBS gets its own OSC websocket (/osc/obs). Volume meters alone arrive at frame rate, and
  // the shared /osc socket is carrying core events, plugin traffic and the OSC monitor.
  oscChannel = 'obs';

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
        description:
          'Fires when streaming starts, stops, drops into reconnecting, or comes back. Leave State on Any to catch every one of those and tell them apart from the outputs.',
        form: {
          state: {
            label: 'State',
            type: 'select',
            options: { selections: STREAM_STATE_SELECTIONS },
          },
        },
        defaults: { state: 'any' },
        outputs: [
          { id: 'isStreaming', label: 'Is Streaming', dataType: 'boolean' },
          { id: 'isReconnecting', label: 'Is Reconnecting', dataType: 'boolean' },
        ],
      },
      {
        id: 'stream_frame_drops',
        label: 'Stream Frame Drops',
        description:
          'Fires once the stream has been skipping frames for several seconds, and again once it stabilizes. Is Dropping says which of the two just happened.',
        form: {},
        defaults: {},
        outputs: [
          { id: 'isDropping', label: 'Is Dropping', dataType: 'boolean' },
          { id: 'skippedFrames', label: 'Skipped Frames', dataType: 'number' },
          { id: 'totalFrames', label: 'Total Frames', dataType: 'number' },
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
      {
        id: 'setrecordingname',
        label: 'Set Recording Name',
        description:
          "Sets the filename format new recordings are saved under. OBS reads it when a recording starts, so this only affects the next one - and it sticks until something sets it back, which is what Reset To Default is for. The date is written as OBS format tokens and left for OBS to fill in at record time, so every recording gets its own timestamp rather than the one this node ran at.",
        form: {
          etype: {
            label: 'Mode',
            type: 'select',
            options: { selections: { set: 'Set Name', reset: 'Reset To Default' } },
          },
          title: {
            label: 'Title',
            type: 'text',
            portType: 'string',
            showif: { variable: 'etype', condition: 'equals', value: 'set' },
          },
          datePosition: {
            label: 'Date',
            type: 'select',
            options: {
              selections: { none: 'No Date', before: 'Before Title', after: 'After Title' },
            },
            showif: { variable: 'etype', condition: 'equals', value: 'set' },
          },
          dateFormat: {
            label: 'Date Format',
            type: 'select',
            options: {
              selections: DATE_FORMAT_SELECTIONS,
            },
            showif: { variable: 'datePosition', condition: 'notEquals', value: 'none' },
          },
          dateCustom: {
            label: 'Custom Date Format',
            type: 'text',
            portType: 'string',
            showif: { variable: 'dateFormat', condition: 'equals', value: 'custom' },
          },
          separator: {
            label: 'Separator',
            type: 'text',
            showif: { variable: 'datePosition', condition: 'notEquals', value: 'none' },
          },
        },
        defaults: {
          etype: 'set',
          title: '',
          datePosition: 'none',
          dateFormat: '%CCYY-%MM-%DD',
          dateCustom: '',
          separator: '_',
        },
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
        case 'setrecordingname': {
          if (values.etype == 'reset') {
            this.websocket.setRecordingNameToDefault().catch((e) => {
              spooderLog(`Failed to reset the OBS recording name for ${ctx.eventName}`, e);
            });
            break;
          }
          const fileName = buildRecordingName(values);
          if (fileName === '') {
            spooderLog(
              `Set Recording Name for ${ctx.eventName} came out empty, so OBS was left alone.`,
            );
            break;
          }
          this.websocket.setRecordingName(fileName).catch((e) => {
            spooderLog(`Failed to set the OBS recording name for ${ctx.eventName}`, e);
          });
          break;
        }
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
}
