import Axios, { AxiosError, AxiosResponse } from 'axios';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import ConfigService from '../../core/service/ConfigService';
import ModuleService from '../../core/service/ModuleService';
import UserService from '../../core/service/UserService';
import { userDir } from '../../Types';
import OnEventSubReceived from './OnEventSubReceived';
import Twitch, { twitchLog } from './twitch';
import { eventsubs, scopes } from './TwitchConstants';

export default function getTwitchRouters() {
  const sconfig = ConfigService.getConfig();
  const twitchModule = ModuleService.getStreamModule('twitch') as Twitch;
  const oauth = twitchModule.oauth;
  const autoLogin = twitchModule.autoLogin.bind(twitchModule);

  const router = Router();
  const publicRouter = Router();
  let expressPort = sconfig.network.host_port;

  async function authorizeTwitch(req: Request, res: Response, isBroadcaster?: boolean) {
    twitchLog('Got code');
    let code = req.query.code;
    const twitchParams =
      '?client_id=' +
      oauth['client-id'] +
      '&client_secret=' +
      oauth['client-secret'] +
      '&grant_type=authorization_code' +
      '&code=' +
      code +
      '&redirect_uri=http://localhost:' +
      expressPort +
      `/twitch/authorize${isBroadcaster ? '/broadcaster' : '/bot'}` +
      '&response_type=code';

    twitchLog(twitchParams, isBroadcaster);

    Axios.post('https://id.twitch.tv/oauth2/token' + twitchParams)
      .then((response: AxiosResponse) => {
        twitchLog('Got token');
        if (typeof response.data.access_token != 'undefined') {
          let token = response.data.access_token;
          let refreshToken = response.data.refresh_token;

          if (isBroadcaster) {
            oauth['broadcaster_token'] = token;
            oauth['broadcaster_refreshToken'] = refreshToken;
            if (!oauth.token) {
              oauth.token = token;
              oauth.refreshToken = refreshToken;
              twitchLog('Setting bot token to broadcaster token');
            }
          } else {
            oauth.token = token;
            oauth.refreshToken = refreshToken;
          }

          fs.writeFile(
            userDir + '/settings/twitch.json',
            JSON.stringify(oauth),
            'utf-8',
            async () => {
              twitchLog('oauth saved!');
              await autoLogin();
              res.redirect('http://localhost:' + expressPort + '?tab=twitch');
            },
          );
        }
      })
      .catch((error: AxiosError) => {
        twitchLog('Twitch auth error: ', error.message);
        res.send({ status: 'error', error: error });
        return;
      });
  }
  router.get('/authorize/bot', (req: Request, res: Response) => authorizeTwitch(req, res, false));
  router.get('/authorize/broadcaster', (req: Request, res: Response) =>
    authorizeTwitch(req, res, true),
  );

  router.get('/revoke', async (req, res) => {
    const account = req.query.account as string;
    const cid = oauth['client-id'];

    if (account == 'bot') {
      await Axios({
        url: 'https://id.twitch.tv/oauth2/revoke?client_id=' + cid + '&token=' + oauth.token,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
        .then((response: AxiosResponse) => {})
        .catch((error: AxiosError) => {
          twitchLog('Twitch revoke error: ', error.message);
          return;
        });
      oauth.token = '';
      oauth.refreshToken = '';
      twitchLog('Both oauth revoked');
    } else {
      await Axios({
        url:
          'https://id.twitch.tv/oauth2/revoke?client_id=' +
          cid +
          '&token=' +
          oauth.broadcaster_token,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
        .then((response: AxiosResponse) => {})
        .catch((error: AxiosError) => {
          twitchLog('Twitch revoke error: ', error.message);
          return;
        });
      oauth.broadcaster_token = '';
      oauth.broadcaster_refreshToken = '';
      twitchLog('Broadcaster oauth revoked');
    }

    res.send({ status: 'ok' });

    fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
      twitchLog('oauth saved!');
    });
  });

  router.post('/saveConfig', async (req, res) => {
    oauth['client-id'] = req.body['client-id'];
    oauth['client-secret'] = req.body['client-secret'];
    fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
      res.send({ status: 'SAVE SUCCESS' });
    });
  });

  router.get('/get_config', async (req, res) => {
    res.send({
      'client-id': oauth['client-id'],
      'client-secret': oauth['client-secret'],
    });
  });

  router.get('/get_available_eventsubs', (req: Request, res: Response) => {
    res.send(eventsubs);
  });

  router.get('/get_available_scopes', (req: Request, res: Response) => {
    res.send(scopes);
  });

  router.get('/get_linked_accounts', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const twitchBotUser = await twitchModule.api.getUserInfo(twitchModule.api.botUsername);
    const twitchBroadcasterUser = await twitchModule.api.getUserInfo(twitchModule.api.homeChannel);

    res.send({ botUser: twitchBotUser, broadcasterUser: twitchBroadcasterUser });
  });

  router.get('/get_eventsubs', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const currentSubs = await twitchModule.eventsub.getEventSubs();
    res.send(currentSubs);
  });

  router.get('/get_channelpoint_rewards', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    if (oauth.broadcaster_token == '' || oauth.broadcaster_token == null) {
      res.send({ status: 'NO BROADCASTER TOKEN' });
      return;
    }

    console.log('Getting channel point rewards');
    await twitchModule.api.validateBroadcaster();
    await twitchModule.api.getBroadcasterId();

    if (twitchModule.api.broadcasterUserID == '') {
      res.send({ status: 'NO BROADCASTER USER ID' });
      return;
    }

    await Axios({
      url:
        'https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=' +
        twitchModule.api.broadcasterUserID,
      method: 'GET',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + oauth.broadcaster_token,
        'Content-Type': 'application/json',
      },
    })
      .then((response: AxiosResponse) => {
        res.send(JSON.stringify(response.data));
      })
      .catch((error: AxiosError) => {
        twitchLog('Channel point get error: ', error.message);
        res.send(JSON.stringify({ error: error.message }));
        return;
      });
  });

  router.get('/delete_eventsub', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }

    await twitchModule.eventsub.deleteEventSub(req.query.id as string);
  });

  router.get('/refresh_eventsubs', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    await twitchModule.eventsub.refreshEventSubs(true);
    res.send({ status: 'SUCCESS' });
  });

  router.get('/init_eventsub', async (req, res) => {
    let subStatus = await twitchModule.eventsub.initEventSub(
      req.query.type as string,
      req.query.user_id as string,
    );

    res.send(JSON.stringify({ status: subStatus }));
  });

  router.get('/get_test_eventsub_status', (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const { status, url } = twitchModule.eventsub.getTestModeStatus();

    res.send({ status: 'ok', testMode: status, websocketUrl: url });
  });

  router.get('/get_eventsub_use_webhook', (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const useWebhookTransport = twitchModule.oauth.useWebhookTransport;
    res.send({ status: 'ok', useWebhookTransport });
  });

  router.post('/set_eventsub_use_webhook', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const useWebhook = req.body.useWebhookTransport;
    twitchModule.oauth.useWebhookTransport = useWebhook;

    fs.writeFileSync(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8');

    twitchModule.eventsub.switchTransportMethod(useWebhook);
    res.send({ status: 'ok', useWebhookTransport: useWebhook });
  });

  router.get('/enable_test_eventsub', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }

    const { host, port } = req.query;

    const enabled = await twitchModule.eventsub.enableTestMode(
      host as string,
      parseInt(port as string),
    );
    res.send({ status: enabled ? 'ok' : 'error' });
  });

  router.get('/disable_test_eventsub', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }

    twitchModule.eventsub.disableTestMode();
    res.send({ status: 'ok' });
  });

  router.get('/is_cli_installed', async (req, res) => {
    const isInstalled = twitchModule.cli.isInstalled();
    res.send({ installed: isInstalled });
  });

  router.get('/install_cli', async (req, res) => {
    const installResult = await twitchModule.cli.downloadTwitchCLI();
    res.send({ installed: installResult });
  });

  router.post('/test_eventsub', async (req, res) => {
    const { type, args } = req.body;
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    twitchModule.eventsub.testEventSub(type, args);
  });

  router.get('/get_eventsubs_by_user', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const broadcasterToken = oauth.broadcaster_token;
    let twitchid = req.query.twitchid;

    if (twitchid == null) {
      twitchid = twitchModule.api.broadcasterUserID;
    }

    await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions?user_id=' + twitchid,
      method: 'GET',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + broadcasterToken,
        'Content-Type': 'application/json',
      },
    })
      .then((response: AxiosResponse) => {
        res.send(JSON.stringify(response.data));
      })
      .catch((error: AxiosError) => {
        twitchLog('Eventsub get error: ', error.message);

        return;
      });
  });

  router.get('/chat_restart', async (req, res) => {
    twitchModule.chat.restartChat('restart');
    res.send(JSON.stringify({ status: 'SUCCESS' }));
  });

  router.get('/mod/currentviewers', async (req, res) => {
    await Axios({
      url:
        'https://tmi.twitch.tv/group/user/' + twitchModule.api.homeChannel.substr(1) + '/chatters',
      method: 'get',
    })
      .then((response: AxiosResponse) => {
        res.send(JSON.stringify(response.data));
      })
      .catch((error: AxiosError) => {
        twitchLog('Chat restart error: ', error.message);
      });
  });

  async function registerViewer(token: string, req: Request, res: Response) {
    const response = await twitchModule.api.validateViewer(token);
    if (response.status === 'ok') {
      console.log('Viewer registered', response.data);
      twitchModule.activeViewers[token] = response.data;
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      res.cookie('public_module', 'twitch', {
        expires: expirationTime,
        httpOnly: true,
        secure: true,
      });
      res.cookie('access_token', token, { expires: expirationTime, httpOnly: true, secure: true });
      UserService.registerActiveViewer(
        { username: response.data.login, userId: response.data.user_id },
        'twitch',
        token,
        expirationTime.getTime(),
      );
      const userInfo = await twitchModule.api.getUserInfo(response.data.username);
      if (userInfo.error) {
        res.send({ status: 'error', message: userInfo.error });
        return;
      }
      res.send({ status: 'ok', data: userInfo });
    } else {
      res.send({ status: 'error', message: response.message });
    }
  }

  publicRouter.post('/viewer/validate', async (req: Request, res: Response) => {
    if (req.cookies.access_token && req.cookies.public_module) {
      const token = req.cookies.access_token;
      const platform = req.cookies.public_module;
      const userIdentity = UserService.getActiveViewerFromCookie(platform, token);

      if (userIdentity) {
        const userInfo = await twitchModule.api.getUserInfo(userIdentity.username);
        res.send({ status: 'ok', data: userInfo });
        return;
      } else {
        registerViewer(token, req, res);
        return;
      }
    }

    if (!req.body.access_token) {
      res.send({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const token = req.body.access_token;
    registerViewer(token, req, res);
  });

  router.get('/eventsub_types', (req: Request, res: Response) => {
    res.send(eventsubs);
  });

  //Resurrected in case of using Spooder as a public server
  publicRouter.post('/webhooks/eventsub', async (req, res) => {
    const messageType = req.header('Twitch-Eventsub-Message-Type');
    if (messageType === 'webhook_callback_verification') {
      twitchLog('Verifying Webhook', req.body.subscription.type);
      return res.status(200).send(req.body.challenge);
    }

    const { type } = req.body.subscription;
    const { event } = req.body;

    res.status(200).end();

    OnEventSubReceived(type, event);
  });

  return {
    router,
    publicRouter,
  };
}
