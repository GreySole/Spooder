import STwitch from '../../../../integration/twitch/main.ts';
import { KeyedObject } from '../../../../Types.ts';
import ConfigManager from '../../ConfigManager.ts';
import ModuleManager from '../../ModuleManager.ts';
import PluginManager from '../../PluginManager.ts';
import express, { Request, Response } from 'express';

export function PublicRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  function getPublicData(req: Request, res: Response) {
    const activePlugins = PluginManager.getActivePlugins();
    let publicPlugins = {} as KeyedObject;
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins[p] = activePlugins[p].name;
      }
    }

    //Only Twitch supported currently
    //TODO: Make this work on an Interface level
    const twitch = ModuleManager.getStreamModule('twitch') as STwitch;
    res.send({
      botName: twitch.api.botUsername,
      homeChannel: twitch.api.homeChannel,
      theme: ConfigManager.getThemes().public,
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
