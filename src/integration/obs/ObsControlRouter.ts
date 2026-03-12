import { Request, Response, Router } from 'express';
import ModuleService from '../../core/service/ModuleService';
import OBS from './obs';

export default function ObsControlRouter() {
  const router = Router();
  const obs = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obs.websocket;
  const obsSettings = obs.settings;

  function obsSuccess(data: any, res: Response) {
    res.send({ data, status: 'ok' });
    return data;
  }

  function obsError(reason: any) {
    console.log('OBS Control Error', reason);
  }

  router.get('/get_output_status', (req: Request, res: Response) => {
    obsWebsocket
      .call('GetStats')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Streaming
  router.get('/start_stream', (req: Request, res: Response) => {
    obsWebsocket
      .call('StartStream')
      .then((data) => {
        return obsSuccess(data, res);
      })
      .catch(obsError);
  });

  router.get('/stop_stream', (req: Request, res: Response) => {
    obsWebsocket
      .call('StopStream')
      .then((data) => {
        return obsSuccess(data, res);
      })
      .catch(obsError);
  });

  //Recording
  router.get('/start_record', async (req, res) => {
    if (obsSettings.recordRename) {
      await obsWebsocket.setRecordingNameToStream();
    }
    obsWebsocket
      .call('StartRecord')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/stop_record', async (req, res) => {
    if (obsSettings.recordRename) {
      await obsWebsocket.setRecordingNameToDefault();
    }
    obsWebsocket
      .call('StopRecord')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/pause_record', async (req, res) => {
    obsWebsocket
      .call('PauseRecord')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/resume_record', async (req, res) => {
    obsWebsocket
      .call('ResumeRecord')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Studio Mode
  router.post('/set_studio_mode', (req: Request, res: Response) => {
    const studioModeEnabled = req.body.studioModeEnabled;
    console.log(req.body);
    obsWebsocket
      .call('SetStudioModeEnabled', { studioModeEnabled: studioModeEnabled })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.post('/set_current_preview_scene', (req: Request, res: Response) => {
    const sceneName = req.body.sceneName;
    obsWebsocket
      .call('SetCurrentPreviewScene', { sceneName: sceneName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.post('/set_current_program_scene', (req: Request, res: Response) => {
    const sceneName = req.body.sceneName;
    obsWebsocket
      .call('SetCurrentProgramScene', { sceneName: sceneName })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.get('/transition', (req: Request, res: Response) => {
    obsWebsocket
      .call('TriggerStudioModeTransition')
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Volume
  router.post('/set_input_mute', (req: Request, res: Response) => {
    const inputName = req.body.inputName;
    const inputMuted = req.body.inputMuted;
    obsWebsocket
      .call('SetInputMute', { inputName, inputMuted })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  router.post('/set_input_volume', (req: Request, res: Response) => {
    const inputName = req.body.inputName;
    const inputVolumeMul = req.body.inputVolumeMul;
    obsWebsocket
      .call('SetInputVolume', { inputName, inputVolumeMul })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  //Scene Item
  router.post('/set_scene_item_enabled', (req: Request, res: Response) => {
    const sceneName = req.body.sceneName;
    const sceneItemId = req.body.sceneItemId;
    const sceneItemEnabled = req.body.sceneItemEnabled;
    obsWebsocket
      .call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled })
      .then((data) => obsSuccess(data, res))
      .catch(obsError);
  });

  return router;
}
