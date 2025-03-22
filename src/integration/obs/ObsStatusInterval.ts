import { sayInChat } from 'src/core/service/EventService';
import ModuleService from 'src/core/service/ModuleService';
import { KeyedObject } from 'src/Types';
import Twitch from '../twitch/main';
import OBS from './main';
import OSCService from 'src/core/service/OSCService';

export default async function ObsStatusInterval() {
  const obsModule = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obsModule.websocket;
  const sendToTCP = OSCService.sendToTCP;

  let objects = ['stream', 'record'];
  let finalStatusObj: KeyedObject = {};
  const twitch = ModuleService.getStreamModule('twitch') as Twitch;
  for (let o in objects) {
    if (objects[o] == 'stream') {
      finalStatusObj[objects[o]] = await obsWebsocket.call('GetStreamStatus');
      if (
        finalStatusObj[objects[o]].outputReconnecting == true &&
        obsModule.streamReconnecting == false
      ) {
        twitch.chat.restartChat(obsModule.settings.disconnectAlert ? 'disconnected' : '');
        obsModule.streamReconnecting = true;
        obsModule.streamBleeding = false;
        obsModule.skippedFrames = 0;
      } else if (
        finalStatusObj[objects[o]].outputReconnecting == false &&
        obsModule.streamReconnecting == true
      ) {
        obsModule.streamReconnecting = false;
        twitch.chat.restartChat(obsModule.settings.disconnectAlert ? 'reconnect' : '');
      }

      if (obsModule.settings.frameDropAlert) {
        if (obsModule.streamReconnecting == false) {
          if (finalStatusObj[objects[o]].outputSkippedFrames > obsModule.skippedFrames) {
            obsModule.skippedFrames = finalStatusObj[objects[o]].outputSkippedFrames;
            if (obsModule.streamBleeding == false) {
              obsModule.streamBleedCount++;
              if (obsModule.streamBleedCount >= 10) {
                obsModule.streamBleedCount = 0;
                obsModule.streamBleeding = true;
                sayInChat(
                  "Looks like the stream is bleeding frames :( I'll let you know when it stops.",
                );
              }
            }
          } else {
            if (obsModule.streamBleeding == true) {
              obsModule.streamBleedCount++;
              if (obsModule.streamBleedCount >= 10) {
                obsModule.streamBleedCount = 0;
                obsModule.streamBleeding = false;
                sayInChat('I think the bleeding stopped. Refresh your browser to catch up :D');
              }
            }
          }
        }
      }
    } else if (objects[o] == 'record') {
      finalStatusObj[objects[o]] = await obsWebsocket.call('GetRecordStatus');
    } else if (objects[o] == 'obs') {
      finalStatusObj[objects[o]] = await obsWebsocket.call('GetStats');
    }
  }
  if (
    finalStatusObj['stream'].outputActive == false &&
    finalStatusObj['record'].outputActive == false
  ) {
    clearInterval(obsModule.statusInterval);
    obsModule.statusInterval = undefined;
  }
  sendToTCP('/obs/get/status', JSON.stringify(finalStatusObj), false);
}
