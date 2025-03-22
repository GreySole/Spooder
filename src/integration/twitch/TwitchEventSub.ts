import ConfigService from '../../core/service/ConfigService.ts';
import ModuleService from '../../core/service/ModuleService.ts';
import { KeyedObject } from '../../Types.ts';
import Twitch, { twitchLog } from './main.ts';
import Axios from 'axios';
import { eventsubs } from './TwitchConstants.ts';
import { EventService } from 'src/core/service/EventService.ts';
import OnEventSubReceived from './OnEventSubReceived.ts';
import { triggerExistsAndEnabled } from 'src/core/util/EventTriggerUtil.ts';

export default class TwitchEventSub {
  websocket: WebSocket | undefined = undefined;
  wsSessionId: string | undefined = undefined;
  wsKeepAliveInterval: NodeJS.Timeout | undefined = undefined;

  constructor() {
    this.websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    if (!this.websocket) return;

    this.websocket.onopen = () => {
      twitchLog('Eventsub connection opened');
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.metadata.message_type === 'session_welcome') {
        this.wsSessionId = data.payload.session.id;
      } else if (data.metadata.message_type === 'session_keepalive') {
        // Do nothing
      } else if (data.metadata.message_type === 'session_reconnect') {
        twitchLog('Eventsub reconnect requested');
        this.websocket?.close();
        this.websocket = new WebSocket(data.payload.session.reconnect_url);
        this.setupWebSocketHandlers();
      } else {
        OnEventSubReceived(data);
      }
    };

    this.websocket.onerror = (error) => {
      twitchLog('Eventsub error:', error);
    };

    this.websocket.onclose = (event) => {
      twitchLog('Eventsub connection closed:', event.code, event.reason);
    };
  }

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  getEventSubs = async () => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    if (loggedIn == false) {
      return;
    }
    let response = await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
      method: 'GET',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + broadcasterToken,
        'Content-Type': 'application/json',
      },
    }).catch((error: any) => {
      twitchLog('Eventsub get error: ', error.message, error.response?.data?.message);
      return;
    });
    return response?.data;
  };

  refreshEventSubs = async () => {
    const events = EventService.getEvents();
    const api = this.getModule().api;
    const broadcasterId = await api.getBroadcasterID();
    const botId = await api.getBotID();
    const subs = await this.getEventSubs();

    twitchLog(subs);

    let redeemSet = false;

    const shareSubs = [] as string[];

    for (let s in subs.data) {
      twitchLog('Deleting ' + subs.data[s].type, subs.data[s].condition.broadcaster_user_id);
      if (
        (subs.data[s].type == 'stream.online' || subs.data[s].type == 'stream.offline') &&
        subs.data[s].condition.broadcaster_user_id != broadcasterId &&
        !shareSubs.includes(subs.data[s].condition.broadcaster_user_id)
      ) {
        shareSubs.push(subs.data[s].condition.broadcaster_user_id);
      }
      await this.deleteEventSub(subs.data[s].id);
    }

    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e].triggers, 'twitch')) {
        continue;
      }

      let subtype = events[e].triggers.twitch.type;

      if (subtype == 'redeem') {
        if (redeemSet == false) {
          twitchLog('Setting up redeems');
          await this.initEventSub(
            'channel.channel_points_custom_reward_redemption.add',
            broadcasterId,
            botId,
          );
          await this.initEventSub(
            'channel.channel_points_custom_reward_redemption.update',
            broadcasterId,
            botId,
          );
          redeemSet = true;
        }
      } else {
        twitchLog('Refreshing ' + subtype);
        if (subtype == 'channel.raid') {
          await this.initEventSub(subtype + '-send', broadcasterId, botId);
          await this.initEventSub(subtype + '-receive', broadcasterId, botId);
        } else {
          await this.initEventSub(subtype, broadcasterId, botId);
        }
      }
    }

    shareSubs.forEach(async (shareTwitchId) => {
      twitchLog('Refreshing share subs for ' + shareTwitchId);
      await this.initEventSub('stream.online', shareTwitchId, botId);
      await this.initEventSub('stream.offline', shareTwitchId, botId);
    });
  };

  deleteEventSub = async (id: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    if (loggedIn == false) {
      return;
    }
    await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
      method: 'DELETE',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + broadcasterToken,
        'Content-Type': 'application/json',
      },
    }).catch((error: any) => {
      twitchLog('Eventsub delete error: ', error.message, error.response?.data?.message);
      return;
    });
  };

  initEventSub = async (eventType: string, broadcasterId?: string, botId?: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    const broadcasterUserID = broadcasterId ?? (await this.getModule().api.getBroadcasterID());
    if (loggedIn == false) {
      return;
    }

    let condition = {} as KeyedObject;
    let accessToken = broadcasterToken;

    if (!eventType.startsWith('channel.raid')) {
      condition = { broadcaster_user_id: broadcasterUserID };
      if (
        eventType == 'channel.follow' ||
        eventType.startsWith('channel.guest_star') ||
        eventType.startsWith('channel.shield_mode') ||
        eventType.startsWith('channel.shoutout') ||
        eventType.startsWith('automod') ||
        eventType.startsWith('channel.moderate') ||
        eventType.startsWith('channel.suspicious_user') ||
        eventType.startsWith('channel.unban_request')
      ) {
        condition.moderator_user_id = broadcasterUserID;
      }
    } else {
      if (eventType.split('-')[1] == 'receive') {
        condition = { to_broadcaster_user_id: broadcasterUserID };
      } else {
        condition = { from_broadcaster_user_id: broadcasterUserID };
      }
      eventType = eventType.split('-')[0];
    }

    let version = '1';
    if (eventType == 'channel.follow' || eventType == 'channel.update') {
      version = '2';
    } else if (eventType.startsWith('channel.guest_star')) {
      version = 'beta';
    }

    return new Promise((res, rej) => {
      Axios({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        method: 'post',
        headers: {
          'Client-ID': oauth['client-id'],
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        data: {
          type: eventType,
          version: version,
          condition: condition,
          transport: {
            method: 'websocket',
            session_id: this.wsSessionId,
          },
        },
      })
        .then((response: any) => {
          twitchLog('Initialized Eventsub', eventType);
          res('SUCCESS');
        })
        .catch((error: any) => {
          twitchLog('Eventsub init error: ', error.message, error.response?.data?.message);
          twitchLog({
            type: eventType,
            version: version,
            condition: condition,
            transport: {
              method: 'websocket',
              session_id: this.wsSessionId,
            },
          });
          res(error.response.data.message);
        });
    });
  };
}
