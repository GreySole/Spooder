import OBSWebSocket, { EventSubscription, OBSRequestTypes } from 'obs-websocket-js';
import ModuleService from 'src/core/service/ModuleService.ts';
import OSCService from 'src/core/service/OSCService.ts';
import { KeyedObject } from 'src/Types.ts';
import OBS from './main.ts';
import OSC from 'osc-js';
import onObsOscMessage from './onObsOscMessage.ts';

export default class ObsWebsocket {
  constructor() {}

  obsClient = new OBSWebSocket();
  deckClients = [] as string[];
  connected = false;

  async connect(host?: string, port?: number, password?: string) {
    const sendToTCP = OSCService.sendToTCP;
    const obsClient = this.obsClient;
    const obsModule = ModuleService.getControlModule('obs') as OBS;

    if (this.connected) {
      return;
    }
    if (host == null && port == null && password == null) {
      if (
        obsModule.settings.hhost != null &&
        obsModule.settings.port != null &&
        obsModule.settings.password != null
      ) {
        host = obsModule.settings.host;
        port = obsModule.settings.port;
        password = obsModule.settings.password;
      } else {
        return;
      }
    }
    try {
      console.log('CONNECTING TO OBS...');
      await this.obsClient.connect('ws://' + host + ':' + port, password, {
        eventSubscriptions:
          EventSubscription.All | EventSubscription.InputVolumeMeters | EventSubscription.Ui,
      });
      console.log('OBS CONNECT SUCCESS');
      this.connected = true;
      obsModule.connected = true;
      sendToTCP('/obs/status/connection', 1);

      obsClient.on('StreamStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/StreamStateChanged', JSON.stringify(data));
      });
      obsClient.on('RecordStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/RecordStateChanged', JSON.stringify(data));
      });
      obsClient.on('ReplayBufferStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/ReplayBufferStateChanged', JSON.stringify(data));
      });
      obsClient.on('VirtualcamStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/VirtualcamStateChanged', JSON.stringify(data));
      });
      obsClient.on('StudioModeStateChanged', (data: KeyedObject) => {
        console.log('STUDIO MODE CHANGED');
        sendToTCP('/obs/event/StudioModeStateChanged', data.studioModeEnabled);
      });
      obsClient.on('CurrentProgramSceneChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/CurrentProgramSceneChanged', data.sceneName);
      });
      obsClient.on('CurrentPreviewSceneChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/CurrentPreviewSceneChanged', data.sceneName);
      });
      obsClient.on('InputMuteStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/InputMuteStateChanged', JSON.stringify(data));
      });
      obsClient.on('InputVolumeChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/InputVolumeChanged', JSON.stringify(data));
      });
      obsClient.on('SceneItemEnableStateChanged', (data: KeyedObject) => {
        sendToTCP('/obs/event/SceneItemEnableStateChanged', JSON.stringify(data));
      });
      obsClient.on('ConnectionClosed', () => {
        obsClient.disconnect();
        this.connected = false;
        sendToTCP('/obs/status/shutdown', 'OBS has shutdown');
      });
    } catch (error: any) {
      console.log('OBS ERROR', error.message);
      this.connected = false;
    }
  }

  onOSC(message: OSC.Message) {
    onObsOscMessage(message);
  }

  setRecordingNameToStream() {
    return new Promise(async (res, rej) => {
      let defaultFileName: any = (await this.call('GetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'FilenameFormatting',
      })) ?? { defaultParameterValue: '' };

      const firstStreamModule = ModuleService.getStreamModule('twitch');

      let channelInfo = await firstStreamModule.getChannelInfo();
      console.log(channelInfo);
      if (channelInfo == null) {
        console.log("COULDN'T GET CHANNEL INFO");
        return;
      }
      let title = channelInfo.title;
      let splitTitle = title;
      if (title.includes('|')) {
        splitTitle = title.split('|')[0];
      }

      splitTitle = splitTitle.replaceAll(/[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g, '');

      let recordingTitle = defaultFileName.defaultParameterValue.split(' ')[0] + '_' + splitTitle;

      if (channelInfo) {
        await this.call('SetProfileParameter', {
          parameterCategory: 'Output',
          parameterName: 'FilenameFormatting',
          parameterValue: recordingTitle,
        });
        res(recordingTitle);
      }
    });
  }

  setRecordingNameToDefault() {
    return new Promise(async (res, rej) => {
      let defaultFileName: any = await this.call('GetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'FilenameFormatting',
      });
      await this.call('SetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'FilenameFormatting',
        parameterValue: defaultFileName.defaultParameterValue,
      });
      res(defaultFileName.defaultParameterValue);
    });
  }

  async getInputList() {
    return new Promise((res, rej) => {
      this.call('GetInputList')
        .then((data: any) => {
          res(data.inputs);
        })
        .catch((e) => rej(e));
    });
  }

  setInputMute(iName: string, iMute: boolean) {
    this.call('SetInputMute', { inputName: iName, inputMuted: iMute });
  }

  subscribeToInputVolumeMeters(iName: string) {
    this.deckClients.push(iName);
    console.log('SUBSCRIBE', this.deckClients);
    this.obsClient.on('InputVolumeMeters', (data: any) => {
      OSCService.sendToTCP('/obs/sound/InputVolumeMeters', JSON.stringify(data), false);
    });
  }

  unsubscribeToInputVolumeMeters(iName: string) {
    this.deckClients.splice(this.deckClients.indexOf(iName), 1);
    console.log('UNSUBSCRIBE', this.deckClients);
    if (this.deckClients.length == 0) {
      this.obsClient.off('InputVolumeMeters');
      OSCService.sendToTCP('/obs/event/InputVolumeMeters', 1, false);
    }
  }

  async call(name: keyof OBSRequestTypes, data?: any) {
    const obsClient = this.obsClient;
    await this.connect();

    return new Promise((res, rej) => {
      if (!this.connected) {
        rej('OBS Not connected');
        return;
      }
      if (data) {
        obsClient
          .call(name, data)
          .then((obsData: any) => {
            res(obsData);
          })
          .catch((e: any) => rej(e));
      } else {
        obsClient
          .call(name)
          .then((obsData: any) => {
            res(obsData);
          })
          .catch((e: any) => rej(e));
      }
    });
  }
}
