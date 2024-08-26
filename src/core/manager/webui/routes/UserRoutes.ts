import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import PluginManager from '../../PluginManager.ts';
import ConfigManager from '../../ConfigManager.ts';
import { ModerationManager } from '../../ModerationManager.ts';
import { backendDir, PermissionType, KeyedObject } from '../../../../Types.ts';
import { EventManager } from '../../EventManager.ts';
import ModuleManager from '../../ModuleManager.ts';
import { isLocal } from './PluginRoutes.ts';
import UserManager from '../../UserManager.ts';
import { webLog } from '../../../Logging.ts';

export function UserRoutes() {
  const router = Router();
  const publicRouter = Router();
  router.get('/users', (req: Request, res: Response) => {
    res.send(UserManager.getUsers());
  });

  router.get('/users/resetPassword', (req: Request, res: Response) => {
    const username = req.query.username;
    if (!username) {
      res.send({ error: 'No username' });
      return;
    }
    UserManager.deletePassword(username as string);
    res.send({ status: 'SUCCESS' });
  });

  router.post('/saveUsers', async (req: Request, res: Response) => {
    const users = UserManager.getUsers();
    let newList = req.body.users;
    let nameChanges = req.body.nameChanges;

    for (let n in nameChanges) {
      if (nameChanges[n] == n) {
        continue;
      }
      if (nameChanges[n] != null) {
        newList.permissions[nameChanges[n]] = newList.permissions[n].slice();
        newList.discord[nameChanges[n]] = newList.discord[n].slice();
        newList.twitch[nameChanges[n]] = newList.twitch[n].slice();
      }
      delete newList.permissions[n];
      delete newList.discord[n];
      delete newList.twitch[n];

      if (users.trusted_users_pw[n] != null) {
        if (nameChanges[n] != null) {
          users.trusted_users_pw[nameChanges[n]] = Object.assign({}, users.trusted_users_pw[n]);
        }

        delete users.trusted_users_pw[n];
      }
    }
    Object.assign(users.trusted_users, newList);
    fs.writeFileSync(backendDir + '/settings/users.json', JSON.stringify(users));
    console.log('USERS', users);
    res.send({ status: 'SUCCESS' });
  });

  async function userVerify(req: Request, res: Response) {
    let vType = req.body.vtype;
    let username = req.body.username;

    const verifyingModule = ModuleManager.findModule(vType);
    if (!verifyingModule) {
      res.send({ error: `Cannot find module named '${vType}'` });
      return;
    }
    verifyingModule.verifyUser(username);
  }

  router.post('/user/verify', userVerify);
  publicRouter.post('/user/verify', userVerify);

  function verifyCheck(req: Request, res: Response) {
    const pendingUser = UserManager.getPendingUser(req.query.username as string);
    if (pendingUser == null) {
      console.log('NULL PENDING');
      res.send('verify-cancelled');
      return;
    }
    if (pendingUser.verified == true) {
      res.send('verify-complete');
    } else {
      res.send('verify-waiting');
    }
  }
  router.get('/user/verifycheck', verifyCheck);
  publicRouter.get('/user/verifycheck', verifyCheck);

  async function userLogin(req: Request, res: Response) {
    let username = req.body.username.toLowerCase();
    let password = req.body.password;
    if (username == 'local') {
      res.send({ status: 'nolocal' });
      return;
    }
    if (!UserManager.hasPassword(username)) {
      let vusername = req.body.vusername;
      if (vusername == null) {
        res.send({ status: 'nologin' });
        return;
      }
      if (UserManager.isVerified(vusername)) {
        if (vusername !== UserManager.getPendingUser(vusername).sUsername) {
          UserManager.changeUsername(UserManager.getPendingUser(vusername).sUsername, vusername);
        }

        UserManager.setPassword(vusername, password);

        let browserToken = crypto.randomBytes(48).toString('hex');
        UserManager.setActiveUser(vusername, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: true,
        });
        res.send({ status: 'active' });
      }
    } else {
      if (UserManager.matchPassword(username, password)) {
        webLog('Welcome back, ' + username + '!');
        let browserToken = crypto.randomBytes(48).toString('hex');
        UserManager.setActiveUser(username, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: true,
        });
        res.send({ status: 'active' });
      } else {
        res.send({ status: 'badpassword' });
      }
    }
  }

  router.post('/user/authentication', (req: Request, res: Response) => {
    let browserToken = crypto.randomBytes(48).toString('hex');
    UserManager.setActiveUser('local', browserToken);
    res.cookie('access', browserToken, {
      maxAge: 86400 * 1000,
      httpOnly: true,
      secure: true,
    });
    res.send({ status: 'active' });
  });
  publicRouter.post('/user/authentication', userLogin);

  async function modUtil(req: Request, res: Response) {
    let isLocalHost = isLocal(req);
    let accessCookie = req.cookies['access'];
    let moduser = null;
    if (!isLocalHost) {
      if (!UserManager.isActive(accessCookie)) {
        res.send({ status: 'notactive' });
        return;
      } else {
        moduser = UserManager.getActiveUserFromToken(accessCookie);
        if (!UserManager.checkPermission(moduser, [PermissionType.admin, PermissionType.mod])) {
          res.send({ status: 'nopermission' });
          return;
        }
      }
    } else {
      if (UserManager.isActive(accessCookie)) {
        moduser = 'local';
        let browserToken = crypto.randomBytes(48).toString('hex');
        UserManager.setActiveUser(moduser, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: false,
        });
      } else {
        moduser = UserManager.getActiveUserFromToken(accessCookie);
      }
    }

    const events = EventManager.getEvents();

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

    const activePlugins = PluginManager.getActivePlugins();
    let modplugins = {} as KeyedObject;
    for (let p in activePlugins) {
      let hasUtility = fs.existsSync(path.join(backendDir, 'web', 'utility', p));
      modplugins[p] = {
        name: p,
        modmap: activePlugins[p].modmap,
        utility: hasUtility,
      };
    }

    const themes = ConfigManager.getThemes();
    let modTheme = null;
    if (themes.modui[req.query.moduser as string] != null) {
      modTheme = themes.modui[req.query.moduser as string];
    }

    let oscURL = null;
    let oscPort = null;
    const sconfig = ConfigManager.getConfig();

    if (isLocalHost) {
      oscURL = sconfig.network.host;
      oscPort = sconfig.network.osc_tcp_port;
    } else {
      oscURL = sconfig.network.external_tcp_url;
    }

    const modlocks = ModerationManager.getModlocks();

    res.send(
      JSON.stringify({
        status: 'ok',
        oscURL: oscURL,
        oscPort: oscPort,
        moduser: moduser,
        token: req.cookies['access'],
        modmap: {
          events: modevents,
          plugins: modplugins,
          modlocks: modlocks,
        },
        theme: modTheme,
      }),
    );
  }

  router.get('/mod/utilities', modUtil);
  publicRouter.get('/mod/utilities', modUtil);

  return {
    local: router,
    public: publicRouter,
  };
}
