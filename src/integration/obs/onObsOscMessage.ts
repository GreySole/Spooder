import ModuleService from '../../core/service/ModuleService';
import { hasObsChannelClients, sendToObsChannel } from './ObsOsc';
import OBS from './obs';

export default async function onObsOscMessage(message: any) {
  const sendToTCP = sendToObsChannel;
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
            // The deck normally turns meters off on unmount, but a closed laptop or a killed
            // tab never sends that. Nobody left on /osc/obs means nobody is watching, so tear
            // the subscription down rather than keep pushing frames into the void.
            if (!hasObsChannelClients()) {
              obsWebsocket.obsClient.off('InputVolumeMeters');
              return;
            }
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
