import fs from 'fs';
import { logEffects, spooderLog } from '../../core/Logging';
import { EventService } from '../../core/service/EventService';
import ShareService from '../../core/service/ShareService';
import { StreamModuleInterface } from '../../interface/StreamModuleInterface';
import {
  ActionExecutionContext,
  ActionNodeDef,
  KeyedObject,
  TriggerNodeDef,
  userDir,
} from '../../Types';
import TwitchApi from './TwitchApi';
import TwitchChat from './TwitchChat';
import TwitchCLI from './TwitchCLI';
import TwitchEventSub from './TwitchEventSub';
import { getTwitchEventSubTriggerNodes } from './TwitchEventSubTriggers';
import getResponseHandlers from './TwitchResponseHandlers';
import getTwitchRouters from './TwitchRouter';

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

  onPluginsLoaded() {}

  onSharesChanged() {
    if (!this.loggedIn) {
      return;
    }
    const shares = ShareService.getShares();
    this.shareUsers = {};
    for (const s in shares) {
      if (!shares[s].streamPlatforms.twitch) {
        continue;
      }
      this.shareUsers[shares[s].streamPlatforms.twitch.username] = s;
    }

    this.eventsub.getEventSubs().then(async (eventSubs) => {
      if (!eventSubs) {
        return;
      }
      for (let u in this.shareUsers) {
        const shareId = this.shareUsers[u];
        if (shares[shareId].autoShare) {
          const twitchId = shares[shareId].streamPlatforms.twitch.userId;
          let userAutoShareSet = [] as string[];
          for (let e in eventSubs) {
            if (eventSubs[e].type != 'stream.online' && eventSubs[e].type != 'stream.offline') {
              continue;
            }
            const eventSub = eventSubs[e];
            if (
              eventSub.condition.broadcaster_user_id == twitchId &&
              eventSub.status === 'enabled'
            ) {
              userAutoShareSet.push(eventSub.type);
              continue;
            } else if (
              eventSub.condition.broadcaster_user_id == twitchId &&
              eventSub.status !== 'enabled'
            ) {
              await this.eventsub.deleteEventSub(eventSub.id);
              continue;
            }
          }

          if (!userAutoShareSet.includes('stream.online')) {
            await this.eventsub.initEventSub('stream.online', twitchId);
          }

          if (!userAutoShareSet.includes('stream.offline')) {
            await this.eventsub.initEventSub('stream.offline', twitchId);
          }
        }
      }
    });
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
    if (!this.loggedIn) {
      return;
    }
    if (this.oauth.useWebhookTransport) {
      this.eventsub.refreshEventSubs();
    }
  }

  oauth = {} as KeyedObject;
  api = new TwitchApi();
  eventsub = new TwitchEventSub();
  chat = new TwitchChat();
  cli = new TwitchCLI();
  activeViewers = {} as KeyedObject;

  getPluginFunctions = () => {
    if (this.loggedIn === false) {
      return {};
    }
    return {
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
    };
  };

  getTriggerNodes = (): TriggerNodeDef[] => {
    return [
      {
        id: 'channel_point_redeem',
        label: 'Channel Point Redeem',
        description: 'Fires when a channel point reward is redeemed.',
        form: {
          rewardId: { label: 'Reward ID', type: 'text' },
          overrideAutoFulfill: { label: 'Override Auto-Fulfill', type: 'boolean' },
        },
        defaults: { rewardId: '', overrideAutoFulfill: false },
        outputs: [
          { id: 'rewardTitle', label: 'Reward Title', dataType: 'string' },
          { id: 'status', label: 'Status', dataType: 'string' },
          { id: 'username', label: 'Username', dataType: 'string' },
          { id: 'displayName', label: 'Display Name', dataType: 'string' },
          { id: 'userId', label: 'User ID', dataType: 'string' },
        ],
      },
      {
        id: 'eventsub_event',
        label: 'EventSub Event (Other)',
        description:
          "Fires on any Twitch EventSub notification by its raw subscription type string - an escape hatch for event types that don't have a dedicated node above yet. See Twitch's EventSub docs for valid type strings (e.g. 'channel.chat.notification').",
        form: {
          type: { label: 'Subscription Type', type: 'text' },
        },
        defaults: { type: '' },
        outputs: [
          { id: 'type', label: 'Event Type', dataType: 'string' },
          { id: 'username', label: 'Username', dataType: 'string' },
          { id: 'displayName', label: 'Display Name', dataType: 'string' },
          { id: 'userId', label: 'User ID', dataType: 'string' },
        ],
      },
      ...getTwitchEventSubTriggerNodes(),
    ];
  };

  getActionNodes = (): ActionNodeDef[] => {
    return [];
  };

  executeActionNode = (nodeId: string, _values: KeyedObject, ctx: ActionExecutionContext) => {
    return () => {
      spooderLog(`Unknown twitch action node '${nodeId}' for event ${ctx.eventName}`);
    };
  };

  getChannelInfo = this.api.getChannelInfo;
  getUserInfo = this.api.getUserInfo;
  verifyShareTarget = this.api.verifyShareTarget.bind(this.api);
  getActiveShares = async () => {
    const shares = ShareService.getShares();
    const channels = await this.api.getSharedChannels();
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

  get lastMessage() {
    return this.chat.lastMessage;
  }
  get homeChannel() {
    return this.api.homeChannel;
  }
  loggedIn = false;

  autoLogin(startChat = true) {
    return new Promise<boolean>(async (res, rej) => {
      if (
        this.oauth.token == '' ||
        this.oauth.token == null ||
        this.oauth['client-id'] == '' ||
        this.oauth['client-id'] == null ||
        this.oauth['client-secret'] == '' ||
        this.oauth['client-secret'] == null
      ) {
        twitchLog('No Twitch tokens.');
        res(false);
        return;
      }

      let botStatus = await this.api.validateChatbot();

      if (botStatus.status == 'newtoken') {
        this.oauth['token'] = botStatus.newtoken;
      } else if (botStatus.status == 'error') {
        twitchLog('CHATBOT ERROR', botStatus.error);
        res(false);
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
          res(false);
          return;
        }
      }

      this.chat.runChat();
      this.eventsub.initialize();
      this.loggedIn = true;
      // Warm the cheermote cache so the first cheer of a stream renders its art rather than
      // plain text - the chat path reads the cache synchronously and can't fetch on demand.
      // Deliberately not awaited: login must not wait on, or fail over, a decoration.
      this.api
        .getBroadcasterId()
        .then((broadcasterId) => this.api.getCheermotes(broadcasterId))
        .catch(() => {});
      res(true);
    });
  }

  get sayInChat() {
    return this.chat.sayInChat.bind(this.chat);
  }

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
}
