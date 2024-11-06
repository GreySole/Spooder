import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import PluginService from '../service/PluginService.ts';
import ConfigService from '../service/ConfigService.ts';
import { ModerationService } from '../service/ModerationService.ts';
import { userDir, PermissionType, KeyedObject } from '../../Types.ts';
import { EventService } from '../service/EventService.ts';
import ModuleService from '../service/ModuleService.ts';
import { isLocal } from './PluginRoutes.ts';
import UserService from '../service/UserService.ts';
import { webLog } from '../Logging.ts';

export function UserRoutes() {
  const router = Router();
  const publicRouter = Router();
  router.get('/data', (req: Request, res: Response) => {
    res.send(UserService.getUsers());
  });

  router.get('/reset_password', (req: Request, res: Response) => {
    const username = req.query.username;
    if (!username) {
      res.send({ error: 'No username' });
      return;
    }
    UserService.deletePassword(username as string);
    res.send({ status: 'SUCCESS' });
  });

  router.post('/save_users', async (req: Request, res: Response) => {
    const users = UserService.getUsers();
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
    fs.writeFileSync(userDir + '/settings/users.json', JSON.stringify(users));
    console.log('USERS', users);
    res.send({ status: 'SUCCESS' });
  });

  async function userVerify(req: Request, res: Response) {
    let vType = req.body.vtype;
    let username = req.body.username;

    const verifyingModule = ModuleService.findModule(vType);
    if (!verifyingModule) {
      res.send({ error: `Cannot find module named '${vType}'` });
      return;
    }
    verifyingModule.verifyUser(username);
  }

  router.post('/verify', userVerify);
  publicRouter.post('/verify', userVerify);

  function verifyCheck(req: Request, res: Response) {
    const pendingUser = UserService.getPendingUser(req.query.username as string);
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
  router.get('/verifycheck', verifyCheck);
  publicRouter.get('/verifycheck', verifyCheck);

  async function userLogin(req: Request, res: Response) {
    let username = req.body.username.toLowerCase();
    let password = req.body.password;
    if (username == 'local') {
      res.send({ status: 'nolocal' });
      return;
    }
    if (!UserService.hasPassword(username)) {
      let vusername = req.body.vusername;
      if (vusername == null) {
        res.send({ status: 'nologin' });
        return;
      }
      if (UserService.isVerified(vusername)) {
        if (vusername !== UserService.getPendingUser(vusername).sUsername) {
          UserService.changeUsername(UserService.getPendingUser(vusername).sUsername, vusername);
        }

        UserService.setPassword(vusername, password);

        let browserToken = crypto.randomBytes(48).toString('hex');
        UserService.setActiveUser(vusername, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: true,
        });
        res.send({ status: 'active' });
      }
    } else {
      if (UserService.matchPassword(username, password)) {
        webLog('Welcome back, ' + username + '!');
        let browserToken = crypto.randomBytes(48).toString('hex');
        UserService.setActiveUser(username, browserToken);
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

  router.post('/authentication', (req: Request, res: Response) => {
    let browserToken = crypto.randomBytes(48).toString('hex');
    UserService.setActiveUser('local', browserToken);
    res.cookie('access', browserToken, {
      maxAge: 86400 * 1000,
      httpOnly: true,
      secure: true,
    });
    res.send({ status: 'active' });
  });
  publicRouter.post('/authentication', userLogin);

  return {
    local: router,
    public: publicRouter,
  };
}
