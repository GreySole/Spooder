import { Request, Response, Router } from 'express';
import ConfigService from '../../core/service/ConfigService';
import ModuleService from '../../core/service/ModuleService';
import { twitchLog } from '../twitch/main';
import JoystickApi, { JoystickOAuthConfig } from './JoystickApi';
import Joystick from './main';

export default function getJoystickRouters() {
  const router = Router();
  const sconfig = ConfigService.getConfig();
  const joystick = ModuleService.getStreamModule('joystick') as Joystick;
  const oauth = joystick.oauth;
  const joystickApi = new JoystickApi(joystick);

  let expressPort = sconfig.network.host_port;

  async function authorizeJoystick(req: Request, res: Response) {
    try {
      twitchLog('Got code');
      const code = req.query.code as string;
      const redirectUri = 'http://localhost:' + expressPort + `/joystick/authorize`;

      if (!code) {
        res.send({ status: 'error', error: 'No authorization code provided' });
        return;
      }

      const tokenData = await joystickApi.getAccessToken(
        code,
        redirectUri,
        oauth as JoystickOAuthConfig,
      );

      await joystick.autoLogin();
      res.redirect('http://localhost:' + expressPort + '?tab=joystick');
    } catch (error: any) {
      twitchLog('Joystick auth error: ', error.message);
      res.send({ status: 'error', error: error.message });
    }
  }
  router.get('/authorize', (req: Request, res: Response) => authorizeJoystick(req, res));

  async function testJoystick(req: Request, res: Response) {
    try {
      const event = req.query.event as string;
      const data = req.query.data as string;

      if (!event || !data) {
        res.send({ status: 'error', error: 'Event and data parameters are required' });
        return;
      }

      await joystickApi.testApiCall(event, data);
      res.send({ status: 'success' });
    } catch (error: any) {
      twitchLog('Joystick test API call error: ', error.message);
      res.send({ status: 'error', error: error.message });
    }
  }

  router.get('/test', (req: Request, res: Response) => testJoystick(req, res));

  return { router };
}
