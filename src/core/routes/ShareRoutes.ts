import express, { Request, Response } from 'express';
import { KeyedObject } from '../../Types.ts';
import { EventService } from '../service/EventService.ts';
import ModuleService from '../service/ModuleService.ts';
import PluginService from '../service/PluginService.ts';
import ShareService from '../service/ShareService.ts';
import { webLog } from '../Logging.ts';

export function ShareRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.get('/list', async (req: Request, res: Response) => {
    let chatCommands = {} as KeyedObject;

    const events = EventService.getEvents();
    const activePlugins = PluginService.getActivePlugins();
    const shares = ShareService.getShares();

    for (let e in events) {
      if (events[e].triggers.chat.enabled) {
        chatCommands[e] = events[e].triggers.chat.command;
      }
    }
    let plugins = {} as KeyedObject;
    for (let p in activePlugins) {
      plugins[p] = activePlugins[p].name;
    }

    res.send(shares);
  });

  router.get('/active_shares', async (req: Request, res: Response) => {
    const activeShares = ShareService.getActiveShares();
    res.send(activeShares);
  });

  router.get('/verify_share_target', async (req: Request, res: Response) => {
    const shareUser = req.query.shareuser;
    const sharePlatform = req.query.shareplatform as string;
    const streamModules = ModuleService.getStreamModules();
    if (!streamModules[sharePlatform]) {
      return;
    }
    const userInfo = await streamModules[sharePlatform].getUserInfo(shareUser);

    if (userInfo != null) {
      res.send({
        status: 'ok',
        info: userInfo,
      });
    } else {
      res.send({
        status: 'notfound',
      });
    }
  });

  router.post('/save_shares', async (req: Request, res: Response) => {
    const newShares = req.body;
    ShareService.saveShares(newShares);
    res.send({ status: 'ok' });
    webLog('SAVED THE SHARES');
  });

  router.post('/set_share', (req: Request, res: Response) => {
    const shareUser = req.body.shareId;
    const isEnabled = req.body.enabled;
    const message = req.body.message;

    ShareService.setShare(shareUser, isEnabled, message);

    res.send({ status: 'ok' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
