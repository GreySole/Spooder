import express, { Request, Response } from 'express';
import { KeyedObject } from '../../../../Types.ts';
import { EventManager } from '../../EventManager.ts';
import ModuleManager from '../../ModuleManager.ts';
import PluginManager from '../../PluginManager.ts';
import ShareManager from '../../ShareManager.ts';
import { webLog } from '../../../Logging.ts';

export function ShareRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.get('/list', async (req: Request, res: Response) => {
    let chatCommands = {} as KeyedObject;

    const events = EventManager.getEvents();
    const activePlugins = PluginManager.getActivePlugins();
    const shares = ShareManager.getShares();

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
    const activeShares = ShareManager.getActiveShares();
    res.send(activeShares);
  });

  router.get('/verify_share_target', async (req: Request, res: Response) => {
    const shareUser = req.query.shareuser;
    const sharePlatform = req.query.shareplatform as string;
    const streamModules = ModuleManager.getStreamModules();
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
    ShareManager.saveShares(newShares);
    res.send({ status: 'ok' });
    webLog('SAVED THE SHARES');
  });

  router.post('/set_share', (req: Request, res: Response) => {
    const shareUser = req.body.shareId;
    const isEnabled = req.body.enabled;
    const message = req.body.message;

    ShareManager.setShare(shareUser, isEnabled, message);

    res.send({ status: 'ok' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
