import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import UserService from '../service/UserService';
import { webLog } from '../Logging';
import { PermissionType } from '../../Types';

export function UserRoutes() {
  const router = Router();
  const publicRouter = Router();
  router.get('/data', (req: Request, res: Response) => {
    res.send(UserService.getUsers());
  });

  router.get('/reset_password', (req: Request, res: Response) => {
    const userId = req.query.id as string;
    if (!userId) {
      res.send({ error: 'No user ID' });
      return;
    }
    const newTempPassword = UserService.resetPassword(userId);
    res.send({ status: 'ok', temp_password: newTempPassword });
  });

  router.post('/save_users', async (req: Request, res: Response) => {
    const users = UserService.getUsers();
    const receivedTrustedUsers = req.body.users;

    const newTrustedUsers = { ...users.trusted_users, ...receivedTrustedUsers };

    UserService.setTrustedUsers(newTrustedUsers);
    res.send({ status: 'ok' });
  });

  router.post('/edit_user', (req: Request, res: Response) => {
    const { id, username, display_name, permissions } = req.body;

    UserService.editUser(id, { username, display_name, permissions });
    res.send({ status: 'ok' });
  });

  router.post('/create_user', (req: Request, res: Response) => {
    const inviteCode = UserService.createUser([PermissionType.mod]);
    res.send({ status: 'ok', invite_code: inviteCode });
  });

  router.delete('/delete_user', (req: Request, res: Response) => {
    const id = req.query.id as string;

    UserService.deleteUser(id);
    res.send({ status: 'ok' });
  });

  router.delete('/cancel_pending_user', (req: Request, res: Response) => {
    const id = req.query.id as string;

    UserService.cancelPendingUser(id);
    res.send({ status: 'ok' });
  });

  async function userRegister(req: Request, res: Response) {
    const { code, username, display_name, password } = req.body;

    const isVerified = UserService.verifyUserInviteCode(code, { username, display_name, password });

    if (isVerified) {
      res.send({ status: 'verified' });
    } else {
      res.send({ status: 'invalid' });
    }
  }

  router.post('/register', userRegister);
  publicRouter.post('/register', userRegister);

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
        console.log(
          'Temporary password detected for user:',
          username,
          UserService.isPendingPassword(username),
        );
        if (!UserService.isPendingPassword(username)) {
          UserService.setPendingPassword(username);
          res.send({ status: 'temporary' });
          return;
        }
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
  //router.post('/login', userLogin);
  publicRouter.post('/login', userLogin);

  return {
    local: router,
    public: publicRouter,
  };
}
