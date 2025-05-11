import { Request, Response, Router } from 'express';
import Axios, { AxiosError, AxiosResponse } from 'axios';
import path from 'path';
import fs from 'fs';
import Twitch, { twitchLog } from './main.ts';
import { eventsubs, scopes } from './TwitchConstants.ts';
import ConfigService from '../../core/service/ConfigService.ts';
import { EventService, sayInChat } from '../../core/service/EventService.ts';
import { ModerationService } from '../../core/service/ModerationService.ts';
import ModuleService from '../../core/service/ModuleService.ts';
import ShareService from '../../core/service/ShareService.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import Discord from '../discord/main.ts';
import UserService from 'src/core/service/UserService.ts';

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
    var twitchParams =
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
              res.redirect('http://localhost:' + expressPort + '?twitchauthsuccess=true');
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
  router.get('/authorize/bot', (req, res) => authorizeTwitch(req, res, false));
  router.get('/authorize/broadcaster', (req, res) => authorizeTwitch(req, res, true));

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

  router.get('/get_available_eventsubs', (req, res) => {
    res.send(eventsubs);
  });

  router.get('/get_available_scopes', (req, res) => {
    res.send(scopes);
  });

  router.get('/get_linked_accounts', async (req, res) => {
    const twitchBotUser = await twitchModule.api.getUserInfo(twitchModule.api.botUsername);
    const twitchBroadcasterUser = await twitchModule.api.getUserInfo(twitchModule.api.homeChannel);

    res.send({ botUser: twitchBotUser, broadcasterUser: twitchBroadcasterUser });
  });

  router.get('/get_eventsubs', async (req, res) => {
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

    await twitchModule.api.getBroadcasterId();
    await twitchModule.api.validateBroadcaster();

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
    await twitchModule.eventsub.refreshEventSubs();
    res.send({ status: 'SUCCESS' });
  });

  router.get('/init_eventsub', async (req, res) => {
    let subStatus = await twitchModule.eventsub.initEventSub(
      req.query.type as string,
      req.query.user_id as string,
    );

    res.send(JSON.stringify({ status: subStatus }));
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

  async function validateViewer(token: string, req: Request, res: Response) {
    const response = await twitchModule.api.validateViewer(token);
    if (response.status === 'ok') {
      twitchModule.activeViewers[token] = response.data;
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      res.cookie('public_module', 'twitch', {
        expires: expirationTime,
        httpOnly: true,
        secure: true,
      });
      res.cookie('access_token', token, { expires: expirationTime, httpOnly: true, secure: true });
      UserService.registerActiveViewer(
        { username: response.data.username, userId: response.data.user_id },
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
        validateViewer(token, req, res);
        return;
      }
    }

    if (!req.body.access_token) {
      res.send({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const token = req.body.access_token;
    validateViewer(token, req, res);
  });

  router.get('/eventsub_types', (req, res) => {
    res.send(eventsubs);
  });

  //Obsolete, but keeping for now
  publicRouter.post('/webhooks/eventsub', async (req, res) => {
    const messageType = req.header('Twitch-Eventsub-Message-Type');
    if (messageType === 'webhook_callback_verification') {
      twitchLog('Verifying Webhook', req.body.subscription.type);
      return res.status(200).send(req.body.challenge);
    }

    const { type } = req.body.subscription;
    const { event } = req.body;

    twitchLog(`Receiving ${type} request`, event);

    res.status(200).end();

    event.eventsubType = type;

    event.message = '';
    event.platform = 'twitch';
    event.respond = (responseTxt: string) => {
      sayInChat(responseTxt, 'twitch', twitchModule.api.homeChannel);
    };

    if (event.broadcaster_user_id != twitchModule.api.broadcasterUserID && type != 'channel.raid') {
      if (type == 'stream.online') {
        await twitchModule.api.validateChatbot();
        ShareService.setShare(event.broadcaster_user_login, true);
        const discord = ModuleService.getCommunityModule('discord') as Discord;
        if (!discord) {
          return;
        }
        if (discord.loggedIn == true && discord.config.sharenotif == true) {
          discord.findUser(discord.config.master).then((user) => {
            let watchButton = discord.makeLinkButton(
              'Watch',
              'https://twitch.tv/' + event.broadcaster_user_login,
            );
            user.send({
              content: event.broadcaster_user_name + " is live. I'm going in!",
              components: [watchButton],
            });
          });
        }
      } else if (type == 'stream.offline') {
        ShareService.setShare(event.broadcaster_user_login, false);
      }
      res.status(200).end();
      return;
    }

    if (type == 'channel.raid') {
      await twitchModule.api.getBroadcasterId();
      if (event.to_broadcaster_user_id == twitchModule.api.broadcasterUserID) {
        event.raidType = 'receive';
        event.username = event.from_broadcaster_user_login;
        event.displayName = event.from_broadcaster_user_name;
      } else if (event.from_broadcaster_user_id == twitchModule.api.broadcasterUserID) {
        event.raidType = 'send';
        event.username = event.to_broadcaster_user_login;
        event.displayName = event.to_broadcaster_user_name;
      }
    }

    if (type == 'stream.online') {
      twitchModule.startReoccuringMessage();
      let onlineEvent = twitchModule.getStreamOnlineEvent();
      const discord = ModuleService.getCommunityModule('discord') as Discord;
      if (!discord) {
        return;
      }
      if (onlineEvent != null) {
        if (onlineEvent.special?.discord?.enabled == true) {
          if (discord.loggedIn == true) {
            let channelInfo: any = await twitchModule.api.getChannelInfo(
              twitchModule.api.broadcasterUserID,
            );
            let onlineMessage =
              '@everyone ' +
              channelInfo[0].broadcaster_name +
              ' is live: ' +
              channelInfo[0].title +
              '!';
            let watchButton = discord.makeLinkButton(
              'Watch',
              'https://twitch.tv/' + twitchModule.api.homeChannel,
            );
            discord.sendToChannel(
              onlineEvent.special.discord.guild,
              onlineEvent.special.discord.channel,
              { content: onlineMessage, components: [watchButton] },
            );
          }
        }
      }
    }

    if (type == 'stream.offline') {
      if (twitchModule.streamChatInterval != null) {
        clearInterval(twitchModule.streamChatInterval);
      }
    }

    if (type == 'channel.channel_points_custom_reward_redemption.add') {
      const modlocks = ModerationService.getModlocks();
      event.userId = event.user_id;
      event.username = event.user_login;
      event.displayName = event.user_name;
      event.message = event.user_input;
      const events = EventService.getEvents();
      for (let e in events) {
        if (events[e].triggers.twitch == null) {
          return;
        }
        if (
          events[e].triggers.twitch.enabled &&
          events[e].triggers.twitch.reward.id == event.reward.id
        ) {
          if (event.status == 'fulfilled' || events[e].triggers.twitch.reward.override == true) {
            if (modlocks.events[e] != 1) {
              event.eventType = 'twitch-redeem';
              EventService.runCommands(event, e, 'event');
            } else {
              //rejectChannelPointReward(event.reward.id, event.id);
              twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
              return;
            }
          } else if (
            events[e].triggers.twitch.reward.override == false &&
            modlocks.events[e] == 1
          ) {
            twitchModule.chat.sayInChat(
              "MODS! This event is locked on my end. I can't reject it myself because I didn't create it :( please either lift the lock on " +
                e +
                ' or reject it.',
            );
          }
        }
      }
    } else if (type == 'channel.channel_points_custom_reward_redemption.update') {
      const events = EventService.getEvents();
      const modlocks = ModerationService.getModlocks();
      event.userId = event.user_id;
      event.username = event.user_login;
      event.displayName = event.user_name;
      event.message = event.user_input;
      for (let e in events) {
        if (events[e].triggers.twitch == null) {
          return;
        }
        if (
          events[e].triggers.twitch.enabled &&
          events[e].triggers.twitch.reward.id == event.reward.id &&
          events[e].triggers.twitch.reward.override == false
        ) {
          if (event.status == 'fulfilled') {
            if (modlocks.events[e] != 1) {
              event.eventType = 'twitch-redeem';
              EventService.runCommands(event, e, 'event');
            } else {
              //rejectChannelPointReward(event.reward.id, event.id);
              twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
              return;
            }
          } else {
            twitchModule.chat.sayInChat(
              event.user_name + ' Sorry, the ' + event.reward.title + ' is a no go.',
            );
          }
        }
      }
    } else {
      const events = EventService.getEvents();
      if (type != 'channel.raid') {
        event.userId = event.user_id ?? event.broadcaster_user_id;
        event.username = event.user_login ?? event.broadcaster_user_login;
        event.displayName = event.user_name ?? event.broadcaster_user_name;
      }
      for (let e in events) {
        if (events[e].triggers.twitch == null) {
          return;
        }
        if (events[e].triggers.twitch?.enabled == true) {
          if (events[e].triggers.twitch.type == type) {
            EventService.runCommands(event, e, 'event');
          }
        }
      }
    }
  });

  return {
    router,
    publicRouter,
  };
}
