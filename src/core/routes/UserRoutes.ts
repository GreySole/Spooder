import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import UserService from '../service/UserService.ts';
import { webLog } from '../Logging.ts';

export function UserRoutes() {
  const router = Router();
  const publicRouter = Router();
  router.get('/data', (req: Request, res: Response) => {
    console.log('User data requested');
    res.send(UserService.getUsers());
  });

  router.get('/reset_password', (req: Request, res: Response) => {
    const username = req.query.username as string;
    if (!username) {
      res.send({ error: 'No username' });
      return;
    }
    const newTempPassword = UserService.resetPassword(username);
    res.send({ status: 'ok', temp_password: newTempPassword });
  });

  router.post('/save_users', async (req: Request, res: Response) => {
    const users = UserService.getUsers();
    const receivedTrustedUsers = req.body.users;

    const newTrustedUsers = { ...users.trusted_users, ...receivedTrustedUsers };

    UserService.setTrustedUsers(newTrustedUsers);
    res.send({ status: 'ok' });
  });

  router.post('/create_user', (req, res) => {
    const permissions = req.body.permissions;
    UserService.createUser(permissions);
    res.send({ status: 'ok' });
  });

  async function userVerify(req: Request, res: Response) {
    const username = req.body.username;
    const code = req.body.code;

    const isVerified = UserService.verifyUserInviteCode(username, code);

    if (isVerified) {
      res.send({ status: 'verified' });
    } else {
      res.send({ status: 'invalid' });
    }
  }

  router.post('/verify', userVerify);
  publicRouter.post('/verify', userVerify);

  async function userLogin(req: Request, res: Response) {
    let username = req.body.username.toLowerCase();
    let password = req.body.password;
    if (username == 'local') {
      res.send({ status: 'nolocal' });
      return;
    }

    if (!UserService.hasPassword(username)) {
      res.send({ status: 'nologin' });
      return;
    }

    if (UserService.matchPassword(username, password)) {
      if (UserService.isPasswordTemporary(username)) {
        res.send({ status: 'temporary' });
        return;
      }
      webLog('Welcome back, ' + username + '!');
      const browserToken = crypto.randomBytes(48).toString('hex');
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

  router.post('/login', (req: Request, res: Response) => {
    let browserToken = crypto.randomBytes(48).toString('hex');
    UserService.setActiveUser('local', browserToken);
    res.cookie('access', browserToken, {
      maxAge: 86400 * 1000,
      httpOnly: true,
      secure: true,
    });
    res.send({ status: 'active' });
  });
  publicRouter.post('/login', userLogin);

  return {
    local: router,
    public: publicRouter,
  };
}
