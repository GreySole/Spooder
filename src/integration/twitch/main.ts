import { Router } from 'express';
import { StreamModuleInterface } from '../interface/StreamModuleInterface.ts';
import TwitchApi from './TwitchApi.ts';
import TwitchChat from './TwitchChat.ts';
import { eventsubs } from './TwitchConstants.ts';
import TwitchEventSub from './TwitchEventSub.ts';
import { logEffects } from '../../core/Logging.ts';
import ConfigManager from '../../core/manager/ConfigManager.ts';
import { EventManager } from '../../core/manager/EventManager.ts';
import { backendDir, KeyedObject } from '../../Types.ts';
import UserManager from '../../core/manager/UserManager.ts';
import fs from 'fs';
import getTwitchRouters from './TwitchRouter.ts';

export function twitchLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgMagenta'), ...content, logEffects('Reset'));
}

export default class STwitch implements StreamModuleInterface {
  constructor() {
    if (fs.existsSync(backendDir + '/settings/eventsub.json')) {
      twitchLog(
        "Obsolete Eventsub.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!",
      );
    }
    if (fs.existsSync(backendDir + '/settings/twitch.json')) {
      try {
        this.oauth = JSON.parse(
          fs.readFileSync(backendDir + '/settings/twitch.json', { encoding: 'utf-8' }),
        );
        if (this.oauth.events != null) {
          twitchLog(
            "Obsolete events property in twitch.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!",
          );
        }
      } catch (e) {
        if (fs.existsSync(backendDir + '/settings/oauth.json')) {
          try {
            this.oauth = JSON.parse(
              fs.readFileSync(backendDir + '/settings/oauth.json', { encoding: 'utf-8' }),
            );
            fs.writeFileSync(
              backendDir + '/settings/twitch.json',
              JSON.stringify(this.oauth),
              'utf-8',
            );
            fs.rmSync(backendDir + '/settings/oauth.json');
            twitchLog('Obsolete oauth.json is now twitch.json!');
          } catch (e) {
            twitchLog('FAILED TO READ OAUTH FILE');
            this.oauth = {};
          }
        } else {
          twitchLog('FAILED TO READ TWITCH FILE');
          this.oauth = {};
        }
      }
    }
  }

  getRouters() {
    const { router, publicRouter } = getTwitchRouters();
    return {
      baseUrl: '/twitch',
      router,
      publicRouter,
    };
  }

  onExternalNetworkChanged() {
    this.eventsub.refreshEventSubs();
  }

  oauth = {} as KeyedObject;
  api = new TwitchApi();
  eventsub = new TwitchEventSub();
  chat = new TwitchChat();

  getChannelInfo = this.api.getChannelInfo;
  getUserInfo = this.api.getUserInfo;
  getChannels = this.api.getChannels;
  refreshEventSubs = this.eventsub.refreshEventSubs;
  lastMessage = this.chat.lastMessage;

  loggedIn = false;

  autoLogin(startChat = true) {
    return new Promise(async (res, rej) => {
      if (
        this.oauth.token == '' ||
        this.oauth.token == null ||
        this.oauth['client-id'] == '' ||
        this.oauth['client-id'] == null ||
        this.oauth['client-secret'] == '' ||
        this.oauth['client-secret'] == null
      ) {
        twitchLog(
          "No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens.",
        );
        rej('notoken');
        return;
      }

      let botStatus = await this.api.validateChatbot();

      if (botStatus.status == 'newtoken') {
        this.oauth['token'] = botStatus.newtoken;
      } else if (botStatus.status == 'error') {
        twitchLog('CHATBOT ERROR', botStatus.error);
        return;
      }

      if (
        this.oauth.broadcaster_refreshToken != '' &&
        this.oauth.broadcaster_refreshToken != null
      ) {
        let broadcasterStatus = await this.api.validateBroadcaster();
        if (broadcasterStatus.status == 'newtoken') {
          this.oauth['broadcaster_token'] = broadcasterStatus.newtoken;
        } else if (broadcasterStatus.status == 'error') {
          twitchLog('BROADCASTER ERROR', broadcasterStatus.error);
          return;
        }
      }

      await this.api.getBotID();
      await this.api.getBroadcasterID();
      await this.api.getAppToken();
      this.chat.runChat();
      this.loggedIn = true;
      res('success');
    });
  }

  sayInChat = this.chat.sayInChat;

  getStreamOnlineEvent() {
    const events = EventManager.getEvents();
    for (let e in events) {
      if (events[e].triggers.twitch.type == 'stream.online') {
        return events[e];
      }
    }
  }

  onExternalNetworkChange() {
    this.eventsub.refreshEventSubs();
  }

  async onEventFileSaved() {
    const events = EventManager.getEvents();
    const sconfig = ConfigManager.getConfig();
    let subs = await this.eventsub.getEventSubs();

    let usedEventsubs = [];
    let redeemSet = false;
    for (let e in events) {
      if (
        eventsubs[events[e].triggers.twitch.type] != null ||
        events[e].triggers.twitch.type == 'redeem'
      ) {
        let subtype = events[e].triggers.twitch.type;
        let bid = this.api.broadcasterUserID;
        if (subtype == 'redeem') {
          usedEventsubs.push('channel.channel_points_custom_reward_redemption.add');
          usedEventsubs.push('channel.channel_points_custom_reward_redemption.update');
        } else {
          usedEventsubs.push(subtype);
        }

        let needsRefresh = true;

        if (subtype == 'redeem') {
          for (let s in subs.data) {
            if (
              subs.data[s].type == 'channel.channel_points_custom_reward_redemption.add' ||
              subs.data[s].type == 'channel.channel_points_custom_reward_redemption.update'
            ) {
              if (
                subs.data[s].transport.callback ==
                sconfig.network.external_http_url + '/webhooks/eventsub'
              ) {
                needsRefresh = false;
              } else {
                twitchLog('Refreshing ' + subs.data[s].type);
                await this.eventsub.deleteEventSub(subs.data[s].id);
              }
            }
          }

          if (needsRefresh == true && redeemSet == false) {
            twitchLog('Setting up redeems');
            await this.eventsub.initEventSub(
              'channel.channel_points_custom_reward_redemption.add',
              bid,
            );
            await this.eventsub.initEventSub(
              'channel.channel_points_custom_reward_redemption.update',
              bid,
            );
            redeemSet = true;
          }
        } else {
          for (let s in subs.data) {
            if (subs.data[s].type == subtype) {
              if (
                subs.data[s].transport.callback ==
                sconfig.network.external_http_url + '/webhooks/eventsub'
              ) {
                needsRefresh = false;
              } else {
                twitchLog('Refreshing ' + subs.data[s].type);
                await this.eventsub.deleteEventSub(subs.data[s].id);
              }
            }
          }

          if (needsRefresh == true) {
            if (subtype == 'channel.raid') {
              await this.eventsub.initEventSub(subtype + '-send', bid);
              await this.eventsub.initEventSub(subtype + '-receive', bid);
            } else {
              await this.eventsub.initEventSub(subtype, bid);
            }
          }
        }
      }
    }

    for (let s in subs.data) {
      if (
        subs.data[s].condition.broadcaster_user_id == this.api.broadcasterUserID ||
        subs.data[s].condition.to_broadcaster_user_id == this.api.broadcasterUserID ||
        subs.data[s].condition.from_broadcaster_user_id == this.api.broadcasterUserID
      ) {
        if (!usedEventsubs.includes(subs.data[s].type)) {
          twitchLog('Deleting sub no longer used: ' + subs.data[s].type);
          await this.eventsub.deleteEventSub(subs.data[s].id);
        }
      }
    }
  }

  userVerify(username: string) {
    const users = UserManager.getUsers();
    if (Object.values(users.trusted_users.verify.twitch).includes(username)) {
      let sUsername = Object.keys(users.trusted_users.verify.twitch)[
        Object.values(users.trusted_users.verify.twitch).indexOf(username)
      ];

      UserManager.setPendingUser('twitch', username.toLowerCase());
      this.sayInChat(
        username +
          " it looks like you're trying to set a login for me. If this is you, please call '!verify'",
        'twitch',
      );
      return { status: 'found' };
    } else {
      return { status: 'notfound' };
    }
  }

  startReoccuringMessage() {
    if (this.loggedIn == false) {
      return;
    }
    let onlineEvent = this.getStreamOnlineEvent();
    if (onlineEvent == null) {
      twitchLog('No stream.online event for reoccuring mesage found.');
      return;
    }
    if (onlineEvent.special.reoccuringmessage.message != '') {
      let reoccuringInterval = async () => {
        try {
          let responseFunct = eval(
            '() => {let count = ' +
              JSON.stringify(this.reoccuringMessageCount) +
              '; ' +
              onlineEvent.special.reoccuringmessage.message.replace(/\n/g, '') +
              '}',
          );
          let response = await responseFunct();
          this.chat.sayInChat(response);
          this.reoccuringMessageCount++;
        } catch (e) {
          this.chat.sayInChat(
            'The reoccuring message failed to send :( Check my logs to see what went wrong!',
          );
          clearInterval(this.streamChatInterval);
        }
      };
      let reoccurTime = onlineEvent.special.reoccuringmessage.interval;
      if (reoccurTime == null) {
        reoccurTime = 15;
      }

      this.streamChatInterval = setInterval(reoccuringInterval.bind(this), reoccurTime * 60 * 1000);
    }
  }

  streamChatInterval: NodeJS.Timeout | undefined = undefined;
  reoccuringMessageCount = Math.round(Math.random() * 10);
}
