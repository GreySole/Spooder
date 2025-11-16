import { userDir, KeyedObject } from '../../Types';
import { ControlModuleInterface } from '../../interface/ControlModuleInterface';
import { OBSRequestTypes } from 'obs-websocket-js';
import getObsRouters from './ObsRouter';
import ObsWebsocket from './ObsWebsocket';
import fs from 'fs';
import OSC from '@spooder/osc-js';
import { websocketTest } from '../../core/util/NetUtil';
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
