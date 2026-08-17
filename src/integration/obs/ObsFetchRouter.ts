import { Response, Router } from 'express';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject } from '../../Types';
import OBS from './obs';

export default function ObsFetchRouter() {
  const router = Router();
  const obs = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obs.websocket;
  function obsSuccess(data: any, res: Response) {
    res.send({ data, status: 'ok' });
    return data;
  }

  function obsError(reason: any) {
    console.log('OBS Fetch Error', reason);
  }

  //Streaming
  router.get('/get_stream_status', (req, res) => {
    obsWebsocket
      .call('GetStreamStatus')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Recording
  router.get('/get_record_status', (req, res) => {
    obsWebsocket
      .call('GetRecordStatus')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Volume
  router.get('/get_input_mute', (req, res) => {
    const inputName = req.query.inputName;
    obsWebsocket
      .call('GetInputMute', { inputName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_input_volume', (req, res) => {
    const inputName = req.query.inputName;
    obsWebsocket
      .call('GetInputVolume', { inputName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_input_list', (req, res) => {
    obsWebsocket
      .call('GetInputList')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_volume_deck', (req, res) => {
    let finalInputList = {
      items: {},
      groups: {},
    } as KeyedObject;

    obsWebsocket.call('GetCurrentProgramScene').then((programScene: any) => {
      finalInputList.currentProgramSceneName = programScene.currentProgramSceneName;
      obsWebsocket
        .call('GetSceneItemList', {
          sceneName: programScene.currentProgramSceneName,
        })
        .then(async (sceneItemListRaw: any) => {
          const sceneItemList = sceneItemListRaw.sceneItems;

          for (const item in sceneItemList) {
            finalInputList.items[sceneItemList[item].sceneItemId] = {
              name: sceneItemList[item].sourceName,
              id: sceneItemList[item].sceneItemId,
              enabled: sceneItemList[item].sceneItemEnabled,
            };

            const volumeData = await obsWebsocket
              .call('GetInputVolume', {
                inputName: sceneItemList[item].sourceName,
              })
              .catch((e) => {});
            const volumeMuteData = await obsWebsocket
              .call('GetInputMute', {
                inputName: sceneItemList[item].sourceName,
              })
              .catch((e) => {});
            if (volumeData != null) {
              finalInputList.items[sceneItemList[item].sceneItemId].volumeData = volumeData;
              finalInputList.items[sceneItemList[item].sceneItemId].volumeMuteData = volumeMuteData;
            }

            if (sceneItemList[item].isGroup == true) {
              const thisGroupItems = await obsWebsocket
                .call('GetGroupSceneItemList', {
                  sceneName: sceneItemList[item].sourceName,
                })
                .then((groupItemData: any) => groupItemData.sceneItems);
              finalInputList.groups[sceneItemList[item].sourceName] = thisGroupItems;
              for (const gi in thisGroupItems) {
                const thisVolumeData = await obsWebsocket
                  .call('GetInputVolume', {
                    inputName: thisGroupItems[gi].sourceName,
                  })
                  .catch((e) => {});
                const thisVolumeMuteData = await obsWebsocket
                  .call('GetInputMute', {
                    inputName: thisGroupItems[gi].sourceName,
                  })
                  .catch((e) => {});
                finalInputList.items[gi + thisGroupItems[gi].sceneItemId] = {
                  name: thisGroupItems[gi].sourceName,
                  id: thisGroupItems[gi].sceneItemId,
                  enabled: thisGroupItems[gi].sceneItemEnabled,
                  volumeData: thisVolumeData,
                  volumeMuteData: thisVolumeMuteData,
                };
              }
            }
          }
          res.send({ data: finalInputList, status: 'ok' });
        });
    });
  });

  //Scene
  router.get('/get_scene_list', (req, res) => {
    obsWebsocket
      .call('GetSceneList')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_scene_item_list', (req, res) => {
    const sceneName = req.query.sceneName;
    obsWebsocket
      .call('GetSceneItemList', { sceneName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Group
  router.get('/get_group_list', (req, res) => {
    obsWebsocket
      .call('GetGroupList')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_group_scene_item_list', (req, res) => {
    const sceneName = req.query.sceneName;
    obsWebsocket
      .call('GetGroupSceneItemList', { sceneName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Studio mode
  router.get('/get_studio_mode_enabled', (req, res) => {
    obsWebsocket
      .call('GetStudioModeEnabled')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_current_preview_scene', (req, res) => {
    obsWebsocket
      .call('GetCurrentPreviewScene')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/get_current_program_scene', (req, res) => {
    obsWebsocket
      .call('GetCurrentProgramScene')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  return router;
}
