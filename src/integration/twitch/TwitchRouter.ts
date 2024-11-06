import { Request, Response, Router } from 'express';
import Axios, { AxiosError, AxiosResponse } from 'axios';
import path from 'path';
import fs from 'fs';
import STwitch, { twitchLog } from './main.ts';
import { eventsubs, scopes } from './TwitchConstants.ts';
import ConfigService from '../../core/service/ConfigService.ts';
import { EventService, sayInChat } from '../../core/service/EventService.ts';
import { ModerationService } from '../../core/service/ModerationService.ts';
import ModuleService from '../../core/service/ModuleService.ts';
import ShareService from '../../core/service/ShareService.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import Discord from '../discord/main.ts';

export default function getTwitchRouters() {
  const sconfig = ConfigService.getConfig();
  const twitchModule = ModuleService.getStreamModule('twitch') as STwitch;
  const oauth = twitchModule.oauth;
  const autoLogin = twitchModule.autoLogin;

  const router = Router();
  const publicRouter = Router();
  let expressPort = sconfig.network.host_port;
  router.get('/authorize', async (req: Request, res: Response) => {
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
      '/twitch/authorize' +
      '&response_type=code';

    Axios.post('https://id.twitch.tv/oauth2/token' + twitchParams)
      .then((response: AxiosResponse) => {
        twitchLog('Got token');
        if (typeof response.data.access_token != 'undefined') {
          let token = response.data.access_token;
          let refreshToken = response.data.refresh_token;
          oauth.token = token;
          oauth.refreshToken = refreshToken;
          if (oauth['broadcaster_token'] == null) {
            oauth['broadcaster_token'] = oauth.token;
            oauth['broadcaster_refreshToken'] = oauth.refreshToken;
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
  });

  router.get('/revoke', async (req, res) => {
    let cid = oauth['client-id'];

    await Axios({
      url:
        'https://id.twitch.tv/oauth2/revoke?client_id=' + cid + '&token=' + oauth.broadcaster_token,
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

    twitchLog('Revoking: ' + cid);
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

    oauth.broadcaster_token = '';
    oauth.broadcaster_refreshToken = '';
    oauth.token = '';
    oauth.refreshToken = '';
    twitchLog('Both oauth revoked');
    res.send({ status: 'Both oauth revoked' });

    fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
      twitchLog('oauth saved!');
    });
  });

  router.get('/save_auth_to_broadcaster', async (req, res) => {
    oauth['broadcaster_token'] = oauth.token;
    oauth['broadcaster_refreshToken'] = oauth.refreshToken;
    fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
      twitchLog('oauth saved!');
      res.send({ status: 'SUCCESS' });
    });
  });

  router.post('/saveConfig', async (req, res) => {
    oauth['client-id'] = req.body['client-id'];
    oauth['client-secret'] = req.body['client-secret'];
    fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
      res.send({ status: 'SAVE SUCCESS' });
    });
  });

  router.get('/convertEventsubToSpooder', (req, res) => {
    const eventGroups = EventService.getGroups();
    const events = EventService.getEvents();
    let oldEvents = null;
    if (oauth.events != null) {
      oldEvents = oauth.events;
    } else if (fs.existsSync(userDir + '/settings/eventsub.json')) {
      oldEvents = JSON.parse(
        fs.readFileSync(userDir + '/settings/eventsub.json', { encoding: 'utf-8' }),
      ).events;
    }

    if (oldEvents == null) {
      res.send({ status: 'No legacy eventsub events found.' });
      return;
    }

    eventGroups.push('Twitch Events');
    for (let e in oldEvents) {
      let newEventName = e.replaceAll('.', '_');
      events[newEventName] = {
        name: newEventName,
        description: '',
        group: 'Twitch Events',
        cooldown: 0,
        chatnotification: false,
        cooldownnotification: false,
        triggers: {
          chat: { enabled: false, command: '!' },
          twitch: { enabled: true, type: e, reward: { id: '', override: false } },
          osc: {
            enabled: false,
            address: '/',
            type: 'single',
            condition: '==',
            value: 0,
            condition2: '==',
            value2: 0,
          },
        },
        commands: [],
      };
      if (oldEvents[e].chat.enabled == true) {
        if (e == 'stream.online') {
          events[newEventName].commands.push({
            type: 'response',
            search: false,
            message: oldEvents[e].chat.message,
            delay: 0,
          });
          events[newEventName].special = {
            discord: Object.assign({}, oldEvents[e].chat.discord),
            reoccuringmessage: {
              message: oldEvents[e].chat.reoccuringmessage,
              interval: oldEvents[e].chat.interval,
            },
          };
        } else {
          events[newEventName].commands.push({
            type: 'response',
            message: oldEvents[e].chat.message,
            search: false,
            delay: 0,
          });
        }
      }

      if (oldEvents[e].plugin.enabled == true) {
        events[newEventName].commands.push({
          type: 'plugin',
          pluginname: oldEvents[e].plugin.pluginname,
          eventname: oldEvents[e].plugin.eventname,
          etype: 'oneshot',
          stop_eventname: '',
          duration: 60,
          delay: 0,
        });
      }

      if (oldEvents[e].udp.enabled == true) {
        events[newEventName].commands.push({
          type: 'software',
          etype: 'timed',
          dest_udp: oldEvents[e].udp.dest,
          address: oldEvents[e].udp.address,
          valueOn: oldEvents[e].udp.value,
          valueOff: oldEvents[e].udp.valueoff,
          duration: parseInt(oldEvents[e].udp.duration) / 1000,
          delay: 0,
          priority: 0,
        });
      }
    }
    fs.writeFileSync(
      userDir + '/settings/commands.json',
      JSON.stringify({ events: events, groups: eventGroups }),
      'utf-8',
    );
    res.send({ status: 'ok' });
  });

  router.get('/cleanupOldEventsubs', (req, res) => {
    if (fs.existsSync(userDir + '/settings/oauth.json')) {
      fs.rmSync(userDir + '/settings/oauth.json');
    }
    if (fs.existsSync(userDir + '/settings/eventsub.json')) {
      fs.rmSync(userDir + '/settings/eventsub.json');
    }

    res.send({ status: 'ok' });
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

    res.send({ botUser: twitchBotUser.data[0], broadcasterUser: twitchBroadcasterUser.data[0] });
  });

  router.get('/get_eventsubs', async (req, res) => {
    res.send(twitchModule.eventsub.getEventSubs());
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

    await twitchModule.api.getBroadcasterID();
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
    await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + req.query.id,
      method: 'DELETE',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + twitchModule.api.appToken,
        'Content-Type': 'application/json',
      },
    })
      .then((response: AxiosResponse) => {
        res.send(JSON.stringify({ status: 'SUCCESS' }));
      })
      .catch((error: AxiosError) => {
        twitchLog('Eventsub delete error: ', error.message);
        return;
      });
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
    let twitchid = req.query.twitchid;

    if (twitchid == null) {
      twitchid = twitchModule.api.broadcasterUserID;
    }

    await twitchModule.api.getAppToken();
    if (twitchModule.api.appToken == '') {
      twitchLog('NO APP TOKEN');
      return;
    }
    await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions?user_id=' + twitchid,
      method: 'GET',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + twitchModule.api.appToken,
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

  router.get('/eventsub_types', (req, res) => {
    res.send(twitchModule.eventsub.getEventSubs());
  });

  //HTTPS ROUTER
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
      await twitchModule.api.getBroadcasterID();
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
