import { userDir, KeyedObject } from 'src/Types.ts';
import { ControlModuleInterface } from '../interface/ControlModuleInterface.ts';
import { OBSRequestTypes } from 'obs-websocket-js';
import getObsRouters from './ObsRouter.ts';
import ObsWebsocket from './ObsWebsocket.ts';
import fs from 'fs';
import onObsOscMessage from './onObsOscMessage.ts';
import OSC from 'osc-js';

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

  onOSC(message: OSC.Message) {
    onObsOscMessage(message);
  }

  call(command: string, data: KeyedObject) {
    const obsCommand = command as keyof OBSRequestTypes;
    this.websocket.call(obsCommand, data);
  }

  getRouters() {
    const router = getObsRouters();
    return {
      baseUrl: '/obs',
      router,
      publicRouter: undefined,
    };
  }

  settings = {} as KeyedObject;

  autoLogin() {
    return new Promise(async (res, rej) => {
      if (this.settings.host != null) {
        await this.websocket.connect(
          this.settings.host,
          this.settings.port,
          this.settings.password,
        );
        res('success');
      }
    });
  }

  saveLogin(host: string, port: number, password: string) {
    this.settings.host = host;
    this.settings.port = port;
    this.settings.password = password;
    fs.writeFileSync(userDir + '/settings/obs.json', JSON.stringify(this.settings), 'utf-8');
    console.log('OBS Login Saved!');
  }

  connected = this.websocket.connected;
  statusInterval: NodeJS.Timeout | undefined = undefined;
  deckClients = {};
  streamReconnecting = false;
  streamBleeding = false;
  streamBleedCount = 0;
  skippedFrames = 0;
}
