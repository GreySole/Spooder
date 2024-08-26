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

  router.get('s', async (req: Request, res: Response) => {
    let chatCommands = {} as KeyedObject;

    const events = EventManager.getEvents();
    const activePlugins = PluginManager.getActivePlugins();
    const shares = ShareManager.getShares();
    const activeShares = ShareManager.getActiveShares();

    for (let e in events) {
      if (events[e].triggers.chat.enabled) {
        chatCommands[e] = events[e].triggers.chat.command;
      }
    }
    let plugins = {} as KeyedObject;
    for (let p in activePlugins) {
      plugins[p] = activePlugins[p].name;
    }

    res.send({
      shareData: shares,
      activeShares: activeShares,
      commandData: chatCommands,
      activePlugins: plugins,
    });
  });

  router.get('/verify_share_target', async (req: Request, res: Response) => {
    let shareUser = req.query.shareuser;
    const sharePlatform = req.query.shareplatform as string;
    const streamModules = ModuleManager.getStreamModules();
    if (!streamModules[sharePlatform]) {
      return;
    }
    let userInfo = await streamModules[sharePlatform].getUserInfo(shareUser);

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

  router.post('/saveShares', async (req: Request, res: Response) => {
    let newShares = req.body;
    ShareManager.saveShares(newShares);
    res.send({ status: 'ok' });
    webLog('SAVED THE SHARES');
  });

  router.post('/setShare', (req: Request, res: Response) => {
    let shareUser = req.body.shareuser;
    let isEnabled = req.body.enabled;
    let message = req.body.message;

    ShareManager.setShare(shareUser, isEnabled, message);

    res.send({ status: 'ok' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
