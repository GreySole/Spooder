import Twitch from '../../integration/twitch/main.ts';
import { KeyedObject } from '../../Types.ts';
import ConfigService from '../service/ConfigService.ts';
import ModuleService from '../service/ModuleService.ts';
import PluginService from '../service/PluginService.ts';
import express, { Request, Response } from 'express';

export function PublicRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  function getPublicData(req: Request, res: Response) {
    const activePlugins = PluginService.getActivePlugins();
    let publicPlugins = {} as KeyedObject;
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins[p] = activePlugins[p].name;
      }
    }

    //Only Twitch supported currently
    //TODO: Make this work on an Interface level
    const twitch = ModuleService.getStreamModule('twitch') as Twitch;
    res.send({
      botName: twitch.api.botUsername,
      homeChannel: twitch.api.homeChannel,
      clientId: twitch.oauth['client-id'],
      theme: ConfigService.getThemes().public,
      spooderpet: ConfigService.getThemes().spooderpet,
      plugins: publicPlugins,
    });
  }

  router.get('/data', getPublicData);
  publicRouter.get('/data', getPublicData);

  return {
    local: router,
    public: router,
  };
}
