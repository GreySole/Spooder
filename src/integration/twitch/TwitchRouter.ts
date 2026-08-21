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
import {
  buildGenericTestArgs,
  buildRedeemTestArgs,
  getTestSpecForNodeId,
} from './TwitchEventSubTriggers';

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

  // Shared by every channel point reward route below: they all need a validated broadcaster
  // token and a broadcaster id, and all report the same three ways of not having them. Returns
  // false once it has answered the request itself.
  async function requireBroadcaster(res: Response): Promise<boolean> {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return false;
    }
    if (oauth.broadcaster_token == '' || oauth.broadcaster_token == null) {
      res.send({ error: 'NO BROADCASTER TOKEN' });
      return false;
    }

    await twitchModule.api.validateBroadcaster();
    await twitchModule.api.getBroadcasterId();

    if (twitchModule.api.broadcasterUserID == '') {
      res.send({ error: 'NO BROADCASTER USER ID' });
      return false;
    }
    return true;
  }

  // Twitch only reports a failure's real cause in the response body ('CUSTOM_REWARD_TITLE
  // DUPLICATE', 'must be at least 1'), so it's forwarded rather than flattened to the status
  // text - the reward editor shows it verbatim and the user can act on it.
  function rewardError(error: any): string {
    return error?.response?.data?.message ?? error?.message ?? String(error);
  }

  router.get('/get_channelpoint_rewards', async (req, res) => {
    if (!(await requireBroadcaster(res))) {
      return;
    }

    try {
      // Both populations in one response: `data` is every reward on the channel (what a redeem
      // node may trigger off), `manageable` the ids Spooder created and is therefore allowed to
      // edit or delete. The editor needs the distinction to know whether to offer its controls.
      const all = await twitchModule.api.getCustomRewards(false);
      const manageable = await twitchModule.api.getCustomRewards(true);
      res.send({ data: all, manageable: manageable.map((reward) => reward.id) });
    } catch (error: any) {
      twitchLog('Channel point get error: ', rewardError(error));
      res.send({ error: rewardError(error) });
    }
  });

  router.post('/create_channelpoint_reward', async (req, res) => {
    if (!(await requireBroadcaster(res))) {
      return;
    }

    try {
      const reward = await twitchModule.api.createCustomReward(req.body);
      res.send({ status: 'ok', reward });
    } catch (error: any) {
      twitchLog('Channel point create error: ', rewardError(error));
      res.send({ error: rewardError(error) });
    }
  });

  router.post('/update_channelpoint_reward', async (req, res) => {
    if (!(await requireBroadcaster(res))) {
      return;
    }
    const { id, ...reward } = req.body;
    if (!id) {
      res.send({ error: 'No reward id given' });
      return;
    }

    try {
      const updated = await twitchModule.api.updateCustomReward(id, reward);
      res.send({ status: 'ok', reward: updated });
    } catch (error: any) {
      twitchLog('Channel point update error: ', rewardError(error));
      res.send({ error: rewardError(error) });
    }
  });

  router.post('/delete_channelpoint_reward', async (req, res) => {
    if (!(await requireBroadcaster(res))) {
      return;
    }
    if (!req.body.id) {
      res.send({ error: 'No reward id given' });
      return;
    }

    try {
      await twitchModule.api.deleteCustomReward(req.body.id);
      res.send({ status: 'ok' });
    } catch (error: any) {
      twitchLog('Channel point delete error: ', rewardError(error));
      res.send({ error: rewardError(error) });
    }
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
    // Everything the node test panel needs to describe its own state before the user presses
    // anything: whether the CLI exists, whether the local test server currently owns the
    // EventSub connection, and which transport a test would go out over.
    res.send({
      installed: twitchModule.cli.isInstalled(),
      testServerRunning: twitchModule.cli.isTestServerRunning(),
      useWebhookTransport: twitchModule.oauth.useWebhookTransport === true,
      loggedIn: twitchModule.loggedIn,
    });
  });

  router.get('/install_cli', async (req, res) => {
    try {
      await twitchModule.cli.downloadTwitchCLI();
      res.send({ installed: twitchModule.cli.isInstalled() });
    } catch (error: any) {
      twitchLog('Twitch CLI install error: ', error.message);
      res.send({ installed: false, error: error.message });
    }
  });

  router.get('/stop_test_server', (req, res) => {
    twitchModule.cli.stopTestServer();
    res.send({ status: 'ok', testServerRunning: twitchModule.cli.isTestServerRunning() });
  });

  // Fire one node's trigger through the Twitch CLI.
  //
  // The client sends the node it wants tested, never a command: `nodeTypeId` selects the
  // EventSub type and the set of flags that node declared, and `values` are matched against
  // that set. Anything else in the body is ignored, so the panel can't reach a flag - or a
  // shell - the node didn't offer.
  router.post('/test_trigger_node', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    if (!twitchModule.cli.isInstalled()) {
      res.send({ error: 'Twitch CLI is not installed.' });
      return;
    }

    const { nodeTypeId, values, nodeValues } = req.body ?? {};
    let subscriptionType: string | undefined;
    let args: string[] = [];

    if (nodeTypeId === 'channel_point_redeem') {
      subscriptionType = 'channel.channel_points_custom_reward_redemption.add';
      // The reward id comes off the node, not the panel: a redemption of any other reward
      // wouldn't match the node's filter, and the CLI invents one when it isn't told, so
      // testing without a reward picked would send a perfectly valid event that silently
      // matches nothing.
      if (!nodeValues?.rewardId) {
        res.send({ error: 'Pick a reward on this node before testing it.' });
        return;
      }
      args = buildRedeemTestArgs({ ...values, itemId: nodeValues.rewardId });
    } else if (nodeTypeId === 'eventsub_event') {
      subscriptionType = String(nodeValues?.type ?? '').trim();
      if (!/^[a-z0-9_.]+$/i.test(subscriptionType)) {
        res.send({ error: "Set this node's Subscription Type before testing it." });
        return;
      }
      args = buildGenericTestArgs(values);
    } else {
      const testSpec = getTestSpecForNodeId(nodeTypeId);
      if (!testSpec) {
        res.send({ error: `'${nodeTypeId}' is not a testable Twitch trigger.` });
        return;
      }
      subscriptionType = testSpec.subscriptionType;
      args = testSpec.buildArgs(values);
    }

    try {
      const result = await twitchModule.eventsub.testEventSub(subscriptionType, args);
      res.send({
        status: 'ok',
        subscriptionType,
        output: (result?.stdout ?? '').trim(),
        testServerRunning: twitchModule.cli.isTestServerRunning(),
      });
    } catch (error: any) {
      const message = error?.message ?? String(error);
      twitchLog('Twitch CLI test error: ', message);
      res.send({ error: message });
    }
  });

  // Kept for the older Twitch-tab test UI, which triggers a bare subscription type with no
  // node behind it. Same CLI path, minus the per-node flag whitelist.
  router.post('/test_eventsub', async (req, res) => {
    if (twitchModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const type = String(req.body?.type ?? '').trim();
    if (!/^[a-z0-9_.]+$/i.test(type)) {
      res.send({ error: 'Invalid subscription type.' });
      return;
    }
    try {
      await twitchModule.eventsub.testEventSub(type);
      res.send({ status: 'ok' });
    } catch (error: any) {
      res.send({ error: error?.message ?? String(error) });
    }
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
