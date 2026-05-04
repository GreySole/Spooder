import express, { Request, Response } from 'express';
import { KeyedObject } from '../../../Types';
import { webLog } from '../../Logging';
import { EventService } from '../../service/EventService';
import ModuleService from '../../service/ModuleService';
import PluginService from '../../service/PluginService';
import ShareService from '../../service/ShareService';
import { triggerExistsAndEnabled } from '../../util/EventTriggerUtil';

export function registerInternalRoutes(router: express.Router) {
  router.get('/list', async (req: Request, res: Response) => {
    let chatCommands = {} as KeyedObject;

    const events = EventService.getEvents();
    const activePlugins = PluginService.getActivePlugins();
    const shares = ShareService.getShares();

    for (let e in events) {
      if (triggerExistsAndEnabled(events[e], 'chat')) {
        chatCommands[e] = events[e].triggers.chat.command;
      }
    }
    let plugins = {} as KeyedObject;
    for (let p in activePlugins) {
      plugins[p] = activePlugins[p].name;
    }

    res.send(shares);
  });

  router.get('/plugin_keys', async (req: Request, res: Response) => {
    const pluginKeys = ShareService.getShares().pluginKeys;
    res.send(pluginKeys);
  });

  router.post('/delete_plugin_key', async (req: Request, res: Response) => {
    const pluginKey = req.body.plugin_key as string;
    const pluginKeys = ShareService.getShares().pluginKeys;
    res.send(pluginKeys);
  });

  router.get('/active_shares', async (req: Request, res: Response) => {
    const activeShares = await ShareService.getActiveShares();
    res.send(activeShares);
  });

  router.get('/verify_share_target', async (req: Request, res: Response) => {
    const shareUser = req.query.shareuser as string;
    const sharePlatform = req.query.shareplatform as string;
    const streamModules = ModuleService.getStreamModules();
    if (!streamModules[sharePlatform]) {
      return;
    }
    streamModules[sharePlatform]
      .verifyShareTarget(shareUser)
      .then((userInfo) => {
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
      })
      .catch((e) => {
        console.log('Error verifying share target', e);
        res.send({
          status: 'error',
          message: 'Error verifying share target',
        });
      });
  });

  router.post('/save_share', async (req: Request, res: Response) => {
    const { shareId, shareData } = req.body;
    ShareService.saveShare(shareId, shareData);
    res.send({ status: 'ok' });
    webLog('SAVED THE SHARES');
  });

  router.post('/create_share', async (req: Request, res: Response) => {
    const { streamingPlatforms } = req.body;
    ShareService.createShare(streamingPlatforms);
    res.send({ status: 'ok' });
  });

  router.post('/delete_share', async (req: Request, res: Response) => {
    const { shareId } = req.body;
    ShareService.deleteShare(shareId);
    res.send({ status: 'ok' });
  });

  router.post('/set_share', (req: Request, res: Response) => {
    const shareUser = req.body.shareId;
    const isEnabled = req.body.enabled;
    const joinMessage = req.body.joinMessage;
    const leaveMessage = req.body.leaveMessage;

    ShareService.setShare(shareUser, isEnabled, isEnabled ? joinMessage : leaveMessage);

    res.send({ status: 'ok' });
  });

  router.post('/set_auto_share', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    const isEnabled = req.body.enabled as boolean;
    ShareService.setAutoShare(shareId, isEnabled);
    res.send({ status: 'ok' });
  });

  router.post('/create_share_key', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    const shareKey = ShareService.generateShareKey(shareId, false);
    res.send({
      status: 'ok',
      shareKey: shareKey,
    });
  });

  router.post('/delete_share_key', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    ShareService.deleteShareKey(shareId);
    res.send({ status: 'ok' });
  });
}
