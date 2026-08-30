import { Request, Response, Router } from 'express';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject } from '../../Types';
import OBS from './obs';
import ObsControlRouter from './ObsControlRouter';
import ObsFetchRouter from './ObsFetchRouter';

export default function getObsRouters() {
  const obsModule = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obsModule.websocket;
  const router = Router();

  router.get('/get_connection_status', (req: Request, res: Response) => {
    res.send({ connected: obsModule.websocket.connected });
  });

  // Output behaviour that used to live here as settings - chat alerts on reconnects and dropped
  // frames, renaming the recording file after the stream title - is now built from OBS trigger
  // and action nodes, so there is nothing left to save.
  router.get('/get_output_settings', (req: Request, res: Response) => {
    res.send(obsModule.settings);
  });

  router.post('/connect', async (req: Request, res: Response) => {
    const obsModule = ModuleService.getControlModule('obs') as OBS;
    let connectObj = req.body;
    console.log('CONNECTING TO OBS...', req.body);

    obsModule.websocket.connect(connectObj.host, connectObj.port, connectObj.password);
    if (connectObj.remember == true) {
      obsModule.saveLogin(connectObj.host, connectObj.port, connectObj.password);
    }

    res.send({ status: 'ok' });
  });

  router.get('/connect_remote', (req: Request, res: Response) => {
    if (obsModule.connected == false) {
      res.send({ status: 'notconnected' });
      return;
    }
    obsWebsocket.subscribeToInputVolumeMeters(req.ip ?? '');
    res.send({ status: 'ok' });
  });

  router.get('/disconnect_remote', (req: Request, res: Response) => {
    if (obsModule.connected == false) {
      res.send({ status: 'notconnected' });
      return;
    }
    obsWebsocket.unsubscribeToInputVolumeMeters(req.ip ?? '');
    res.send({ status: 'ok' });
  });

  router.get('/get_scenes', async (req: Request, res: Response) => {
    if (obsModule.connected == false) {
      res.send({ status: 'notconnected' });
    } else {
      let obsReturn = {} as KeyedObject;
      let obsScenes: KeyedObject =
        (await obsModule.websocket.call('GetSceneList')) ?? ({ scenes: {} } as KeyedObject);
      if (obsScenes == null) {
        res.send({});
        return;
      }
      obsReturn.scenes = {} as KeyedObject;
      for (let s in obsScenes.scenes) {
        obsReturn.scenes[obsScenes.scenes[s].sceneIndex] = obsScenes.scenes[s];
      }
      obsReturn.sceneItems = {};

      for (let s in obsReturn.scenes) {
        let sceneItems = await obsModule.websocket
          .call('GetSceneItemList', {
            sceneName: obsReturn.scenes[s].sceneName,
          })
          .then((data: any) => data.sceneItems);
        obsReturn.sceneItems[s] = {};
        for (let si in sceneItems) {
          obsReturn.sceneItems[s][sceneItems[si].sceneItemId] = sceneItems[si];
        }
      }

      let obsInputs: KeyedObject =
        (await obsModule.websocket.call('GetInputList')) ?? ({} as KeyedObject);

      obsReturn.inputs = obsInputs.inputs;

      obsReturn.status = 'ok';
      res.send(obsReturn);
    }
  });

  router.use('/fetch', ObsFetchRouter());
  router.use('/control', ObsControlRouter());

  return router;
}
