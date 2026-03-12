import ModuleService from '../../core/service/ModuleService';
import OSCService from '../../core/service/OSCService';
import OBS from './obs';

export default async function onObsOscMessage(message: any) {
  const sendToTCP = OSCService.sendToTCP;
  const obsModule = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obsModule.websocket;

  let address = message.address.split('/');

  if (address[1] == 'obs') {
    if (obsModule.websocket.connected == false) {
      sendToTCP('/obs/status/connection', 0);
      return;
    }

    if (address[2] == 'set') {
      if (address[3] == 'input') {
        if (address[4] == 'mute') {
          let vObj = JSON.parse(message.args[0]);
          obsWebsocket.call('SetInputMute', {
            inputName: vObj.inputName,
            inputMuted: vObj.inputMuted,
          });
        } else if (address[4] == 'volume') {
          let vObj = JSON.parse(message.args[0]);
          obsWebsocket.call('SetInputVolume', {
            inputName: vObj.inputName,
            inputVolumeMul: vObj.value,
          });
        }
      }
    } else if (address[2] == 'event') {
      if (address[3] == 'InputVolumeMeters') {
        if (message.args[0] == 1) {
          obsWebsocket.obsClient.on('InputVolumeMeters', (data: any) => {
            sendToTCP('/obs/sound/InputVolumeMeters', JSON.stringify(data), false);
          });
        } else {
          obsWebsocket.obsClient.off('InputVolumeMeters');
          sendToTCP('/obs/event/InputVolumeMeters', 1, false);
        }
      }
    }
  }
}
