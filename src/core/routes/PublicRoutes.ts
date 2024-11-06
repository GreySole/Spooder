import STwitch from '../../integration/twitch/main.ts';
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
    const twitch = ModuleService.getStreamModule('twitch') as STwitch;
    res.send({
      botName: twitch.api.botUsername,
      homeChannel: twitch.api.homeChannel,
      theme: ConfigService.getThemes().public,
      plugins: publicPlugins,
    });
  }

  router.get('/public/data', getPublicData);

  publicRouter.get('/public/data', getPublicData);

  return {
    local: router,
    public: router,
  };
}
