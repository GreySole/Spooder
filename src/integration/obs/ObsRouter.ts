import { Router, Request, Response, json } from 'express';
import ModuleService from '../../core/service/ModuleService';
import { userDir, KeyedObject } from '../../Types';
import OBS from './main';
import fs from 'fs';
import ObsControlRouter from './ObsControlRouter';
import ObsFetchRouter from './ObsFetchRouter';

export default function getObsRouters() {
  const obsModule = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obsModule.websocket;
  const router = Router();

  router.get('/get_connection_status', (req: Request, res: Response) => {
    res.send({ connected: obsModule.websocket.connected });
  });

  router.get('/get_output_settings', (req: Request, res: Response) => {
    res.send(obsModule.settings);
  });

  router.post('/save_output_settings', (req: Request, res: Response) => {
    let newSettings = req.body;
    obsModule.settings.recordRename = newSettings.recordRename;
    obsModule.settings.frameDropAlert = newSettings.frameDropAlert;
    obsModule.settings.disconnectAlert = newSettings.disconnectAlert;
    fs.writeFileSync(userDir + '/settings/obs.json', JSON.stringify(obsModule.settings), 'utf-8');

    res.send({ status: 'ok' });
  });

  router.post('/connect', async (req: Request, res: Response) => {
    const obsModule = ModuleService.getControlModule('obs') as OBS;
    obsModule.monitor.startMonitoring();
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
