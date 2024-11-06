import express, { Request, Response } from 'express';
import { PermissionType, KeyedObject, userDir } from 'src/Types.ts';
import ConfigService from '../service/ConfigService.ts';
import { EventService, sayInChat } from '../service/EventService.ts';
import { ModerationService } from '../service/ModerationService.ts';
import PluginService from '../service/PluginService.ts';
import UserService from '../service/UserService.ts';
import { isLocal } from './PluginRoutes.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function ModerationRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  async function modUtil(req: Request, res: Response) {
    let isLocalHost = isLocal(req);
    let accessCookie = req.cookies['access'];
    let moduser = null;
    if (!isLocalHost) {
      if (!UserService.isActive(accessCookie)) {
        res.send({ status: 'notactive' });
        return;
      } else {
        moduser = UserService.getActiveUserFromCookie(accessCookie);
        if (!UserService.checkPermission(moduser, [PermissionType.admin, PermissionType.mod])) {
          res.send({ status: 'nopermission' });
          return;
        }
      }
    } else {
      if (UserService.isActive(accessCookie)) {
        moduser = 'local';
        let browserToken = crypto.randomBytes(48).toString('hex');
        UserService.setActiveUser(moduser, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: false,
        });
      } else {
        moduser = UserService.getActiveUserFromCookie(accessCookie);
      }
    }

    const events = EventService.getEvents();

    let modevents = {} as KeyedObject;
    for (let e in events) {
      if (events[e].triggers.chat.enabled) {
        modevents[e] = {
          name: events[e].name,
          group: events[e].group,
          description: events[e].description,
        };
      }
    }

    const activePlugins = PluginService.getActivePlugins();
    let modplugins = {} as KeyedObject;
    for (let p in activePlugins) {
      let hasUtility = fs.existsSync(path.join(userDir, 'web', 'utility', p));
      modplugins[p] = {
        name: p,
        modmap: activePlugins[p].modmap,
        utility: hasUtility,
      };
    }

    const themes = ConfigService.getThemes();
    let modTheme = null;
    if (themes.modui[req.query.moduser as string] != null) {
      modTheme = themes.modui[req.query.moduser as string];
    }

    let oscURL = null;
    let oscPort = null;
    const sconfig = ConfigService.getConfig();

    if (isLocalHost) {
      oscURL = sconfig.network.host;
      oscPort = sconfig.network.osc_tcp_port;
    } else {
      oscURL = sconfig.network.external_tcp_url;
    }

    const modlocks = ModerationService.getModlocks();

    res.send({
      status: 'ok',
      oscURL: oscURL,
      oscPort: oscPort,
      moduser: moduser,
      modmap: {
        events: modevents,
        plugins: modplugins,
        modlocks: modlocks,
      },
      theme: modTheme,
    });
  }

  router.get('/api/utilities', modUtil);
  publicRouter.get('/api/utilities', modUtil);

  function modLock(req: Request, res: Response) {
    const isLocked = req.body.lock == true;
    const target = req.body.target;
    const pluginTarget = req.body.pluginTarget;
    const type = req.body.type;
    const accessCookie = req.cookies['access'];
    if (!UserService.isActive(accessCookie)) {
      res.send({ status: 'notactive' });
      return;
    }
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    let lockString = isLocked === true ? 'locked' : 'unlocked';
    if (type == 'event') {
      ModerationService.lockEvent(isLocked, target);
      sayInChat(`${modUser} ${lockString} ${target}`);
    } else if (type == 'plugin') {
      let pluginName = PluginService.getActivePlugins()[target]?.name;

      if (pluginTarget == null) {
        ModerationService.lockPlugin(isLocked, target);
        sayInChat(`${modUser} ${lockString} ${pluginName}`);
      } else {
        ModerationService.lockPlugin(isLocked, target, pluginTarget);
        sayInChat(`${modUser} ${lockString} ${pluginTarget} in ${pluginName}`);
      }
    }
    res.send({ status: 'ok' });
  }

  router.get('/api/lock', modLock);
  publicRouter.get('/api/lock', modLock);

  function modBlacklist(req: Request, res: Response) {
    const accessCookie = req.cookies['access'];
    if (!UserService.isActive(accessCookie)) {
      res.send({ status: 'notactive' });
      return;
    }
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    const isBlacklisted = req.body.blacklist == true;
    const blackListUser = req.body.user;

    ModerationService.blacklistUser(isBlacklisted, blackListUser, -1);

    sayInChat(`${modUser} ${isBlacklisted ? ' blacklisted ' : ' unblacklisted '} ${blackListUser}`);
    res.send({ status: 'ok' });
  }

  router.get('/api/blacklist', modBlacklist);
  publicRouter.get('/api/blacklist', modBlacklist);

  function modSpamGuard(req: Request, res: Response) {
    const isSpamGuarded = req.body.spamguard == true;
    const accessCookie = req.cookies['access'];
    if (!UserService.isActive(accessCookie)) {
      res.send({ status: 'notactive' });
      return;
    }
    ModerationService.setSpamGuard(isSpamGuarded);
    sayInChat(`Spam Guard is now ${isSpamGuarded ? 'enabled' : 'disabled'}`);
    res.send({ status: 'ok' });
  }

  router.get('/api/spamguard', modSpamGuard);
  publicRouter.get('/api/spamguard', modSpamGuard);

  function modSaveTheme(req: Request, res: Response) {
    const newTheme = req.body.theme;
    const accessCookie = req.cookies['access'];
    if (!UserService.isActive(accessCookie)) {
      res.send({ status: 'notactive' });
      return;
    }
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    const themes = ConfigService.getThemes();
    if (themes.modui[modUser] == null) {
      themes.modui[modUser] = {};
    }
    themes.modui[modUser] = JSON.parse(newTheme);
    ConfigService.saveThemes(themes);
    res.send({ status: 'ok' });
  }

  router.get('/api/spamguard', modSaveTheme);
  publicRouter.get('/api/spamguard', modSaveTheme);

  return { local: router, public: publicRouter };
}
