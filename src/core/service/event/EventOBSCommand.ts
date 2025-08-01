import { spooderLog } from '../../Logging';
import { EventService } from '../EventService';
import ModuleService from '../ModuleService';

export default function EventOBSCommand(eCommand: any, eventName: string) {
  const obs = ModuleService.getControlModule('obs');
  if (!obs.connected) {
    return () => {
      spooderLog(`An OBS command for ${eventName} was triggered, but OBS is not connected.`);
    };
  }
  return () => {
    let commandDuration = parseFloat(eCommand.duration);
    if (eCommand.function == 'setinputmute') {
      if (eCommand.etype == 'timed') {
        obs.call('SetInputMute', {
          inputName: eCommand.item,
          inputMuted: eCommand.valueOn == 1,
        });
        EventService.createTimeout(
          eventName,
          eCommand,
          eCommand.type,
          function () {
            obs.call('SetInputMute', {
              inputName: eCommand.item,
              inputMuted: eCommand.valueOff == 1,
            });
          },
          commandDuration,
        );
      } else {
        obs.call('SetInputMute', {
          inputName: eCommand.item,
          inputMuted: eCommand.valueOn == 1,
        });
      }
    } else if (eCommand.function == 'switchscenes') {
      if (eCommand.etype == 'timed') {
        obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOn });
        EventService.createTimeout(
          eventName,
          eCommand,
          eCommand.type,
          function () {
            obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOff });
          },
          commandDuration,
        );
      } else {
        obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOn });
      }
    } else if (eCommand.function == 'enablesceneitem') {
      if (eCommand.etype == 'timed') {
        obs.call('SetSceneItemEnabled', {
          sceneName: eCommand.scene,
          sceneItemId: parseInt(eCommand.item),
          sceneItemEnabled: eCommand.valueOn == 1,
        });
        EventService.createTimeout(
          eventName,
          eCommand,
          eCommand.type,
          function () {
            obs.call('SetSceneItemEnabled', {
              sceneName: eCommand.scene,
              sceneItemId: parseInt(eCommand.item),
              sceneItemEnabled: eCommand.valueOff == 0,
            });
          },
          commandDuration,
        );
      } else {
        obs.call('SetSceneItemEnabled', {
          sceneName: eCommand.scene,
          sceneItemId: parseInt(eCommand.item),
          sceneItemEnabled: eCommand.valueOn == 1,
        });
      }
    }
  };
}
