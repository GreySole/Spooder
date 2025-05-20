import { StreamModuleInterface } from '../interface/StreamModuleInterface.ts';
import TwitchApi from './TwitchApi.ts';
import TwitchChat from './TwitchChat.ts';
import TwitchEventSub from './TwitchEventSub.ts';
import { logEffects } from '../../core/Logging.ts';
import { EventService } from '../../core/service/EventService.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import UserService from '../../core/service/UserService.ts';
import fs from 'fs';
import getTwitchRouters from './TwitchRouter.ts';
import ShareService from 'src/core/service/ShareService.ts';
import getResponseHandlers from './TwitchResponseHandlers.ts';

export function twitchLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgMagenta'), ...content, logEffects('Reset'));
}

export default class Twitch implements StreamModuleInterface {
  constructor() {
    if (fs.existsSync(userDir + '/settings/eventsub.json')) {
      twitchLog(
        "Obsolete Eventsub.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!",
      );
    }
    if (fs.existsSync(userDir + '/settings/twitch.json')) {
      try {
        this.oauth = JSON.parse(
          fs.readFileSync(userDir + '/settings/twitch.json', { encoding: 'utf-8' }),
        );
        if (this.oauth.events != null) {
          twitchLog(
            "Obsolete events property in twitch.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!",
          );
        }
      } catch (e) {
        if (fs.existsSync(userDir + '/settings/oauth.json')) {
          try {
            this.oauth = JSON.parse(
              fs.readFileSync(userDir + '/settings/oauth.json', { encoding: 'utf-8' }),
            );
            fs.writeFileSync(
              userDir + '/settings/twitch.json',
              JSON.stringify(this.oauth),
              'utf-8',
            );
            fs.rmSync(userDir + '/settings/oauth.json');
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

  shareUsers = {} as KeyedObject;

  onSharesChanged() {
    const shares = ShareService.getShares();
    this.shareUsers = {};
    console.log('ON SHARES CHANGED');
    for (const s in shares) {
      if (!shares[s].streamPlatforms.twitch) {
        continue;
      }
      console.log('ON SHARES CHANGED', shares[s].streamPlatforms.twitch.username, s);
      this.shareUsers[shares[s].streamPlatforms.twitch.username] = s;
    }

    console.log('TWITCH SHARE USERS', this.shareUsers);
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
    //this.eventsub.refreshEventSubs();
  }

  oauth = {} as KeyedObject;
  api = new TwitchApi();
  eventsub = new TwitchEventSub();
  chat = new TwitchChat();
  activeViewers = {} as KeyedObject;

  getPluginFunctions = () => ({
    getUserInfo: this.api.getUserInfo.bind(this.api),
    getUserInfoById: this.api.getUserInfoById.bind(this.api),
    callBroadcasterApi: this.api.callBroadcasterApi.bind(this.api),
    callBotApi: this.api.callBotApi.bind(this.api),
    getBroadcasterId: this.api.getBroadcasterId.bind(this.api),
    getBotId: this.api.getBotId.bind(this.api),
    isStreamerLive: this.api.isStreamerLive.bind(this.api),
    getStreamInfo: this.api.getStreamInfo.bind(this.api),
    getChannelInfo: this.api.getChannelInfo.bind(this.api),
    broadcasterUsername: this.api.homeChannel,
    botUsername: this.api.botUsername,
  });

  getChannelInfo = this.api.getChannelInfo;
  getUserInfo = this.api.getUserInfo;
  getActiveShares = async () => {
    const shares = ShareService.getShares();
    const channels = await this.api.getSharedChannels();
    console.log('GET ACTIVE SHARES', this.shareUsers);
    const activeShares = {} as KeyedObject;
    for (let c in channels) {
      const channel = channels[c];
      const shareId = this.shareUsers[channel];
      if (shareId == null) {
        continue;
      }
      activeShares[shareId] = {
        platform: 'twitch',
        username: shares[shareId].streamPlatforms.twitch.username,
        displayName: shares[shareId].streamPlatforms.twitch.displayName,
        userId: shares[shareId].streamPlatforms.twitch.userId,
      };
    }
    console.log('TWITCH ACTIVE SHARES', activeShares, channels);
    return activeShares;
  };
  joinChannel = this.chat.joinChannel;
  leaveChannel = this.chat.leaveChannel;
  refreshEventSubs = this.eventsub.refreshEventSubs;
  getResponseHandlers = getResponseHandlers;
  refreshShareUserInfo(id: string): Promise<KeyedObject> {
    return new Promise((res, rej) => {
      this.api
        .getUserInfoById(id)
        .then((data) => {
          //twitchLog('Got user info', data);
          res({
            username: data.login,
            displayName: data.display_name,
            profilePic: data.profile_image_url,
          });
        })
        .catch((e) => {
          twitchLog('Failed to get user info', e.message);
          rej(e);
        });
    });
  }
  lastMessage = this.chat.lastMessage;
  homeChannel = this.api.homeChannel;
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

      this.chat.runChat();
      this.eventsub.refreshEventSubs();
      this.loggedIn = true;
      res('success');
    });
  }

  sayInChat = this.chat.sayInChat;

  getStreamOnlineEvent() {
    const events = EventService.getEvents();
    for (let e in events) {
      if (events[e].triggers.twitch.type == 'stream.online') {
        return events[e];
      }
    }
  }

  async onEventFileSaved() {
    this.eventsub.refreshEventSubs();
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
