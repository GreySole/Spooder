import ConfigService from '../../core/service/ConfigService';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject } from '../../Types';
import Twitch, { twitchLog } from './main';
import Axios from 'axios';
import { eventsubs } from './TwitchConstants';
import { EventService } from '../../core/service/EventService';
import OnEventSubReceived from './OnEventSubReceived';
import { triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';
import WebSocket from 'ws';
import { logToFile } from '../../core/Logging';

export default class TwitchEventSub {
  websocket: WebSocket | undefined = undefined;
  wsSessionId: string | undefined = undefined;
  wsKeepAliveInterval: NodeJS.Timeout | undefined = undefined;

  constructor() {}

  initialize() {
    this.websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    if (!this.websocket) return;

    this.websocket.onopen = () => {
      twitchLog('Eventsub connection opened');
    };

    this.websocket.onmessage = (event) => {
      if (!event.data) {
        twitchLog('Eventsub received empty message', event);
        return;
      }
      const data = JSON.parse(event.data.toString());

      if (data.metadata.message_type === 'session_welcome') {
        this.wsSessionId = data.payload.session.id;
        twitchLog('Eventsub session id:', this.wsSessionId);
      } else if (data.metadata.message_type === 'session_keepalive') {
        // Do nothing
      } else if (data.metadata.message_type === 'session_reconnect') {
        twitchLog('Eventsub reconnect requested', data.payload);
        this.websocket?.close();
        this.websocket = new WebSocket(data.payload.session.reconnect_url);
        this.setupWebSocketHandlers();
      } else {
        OnEventSubReceived(data);
      }
    };

    this.websocket.on('ping', () => {
      this.websocket?.pong(); // Respond to ping with pong
    });

    this.websocket.onerror = (error) => {
      twitchLog('Eventsub error:', error);
      logToFile('twitch-eventsub-error', 'Eventsub error: ' + error.message, 100);
      this.websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
      this.setupWebSocketHandlers();
    };

    this.websocket.onclose = (event) => {
      logToFile(
        'twitch-eventsub-close',
        'Eventsub connection closed: ' + event.code + ' ' + event.reason,
        100,
      );
      twitchLog('Eventsub connection closed:', event.code, event.reason);
      this.websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
      this.setupWebSocketHandlers();
    };

    this.refreshEventSubs();
  }

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  getEventSubs = async () => {
    await this.getModule().api.validateBroadcaster();
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
    await this.getModule().api.validateBroadcaster();
    const events = EventService.getEvents();
    const api = this.getModule().api;
    const broadcasterId = await api.getBroadcasterId();
    const botId = await api.getBotId();
    const subs = await this.getEventSubs();

    let redeemSet = false;

    const shareSubs = [] as string[];

    const usedSubs = [] as string[];

    for (let s in subs.data) {
      if (
        subs.data[s].status === 'enabled' &&
        this.wsSessionId === subs.data[s].transport.session_id
      ) {
        usedSubs.push(subs.data[s].type);
        twitchLog(
          'Skipping delete ' + subs.data[s].type,
          subs.data[s].condition.broadcaster_user_id,
        );
        continue;
      }
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
        if (
          usedSubs.includes('channel.channel_points_custom_reward_redemption.add') &&
          usedSubs.includes('channel.channel_points_custom_reward_redemption.update')
        ) {
          twitchLog('Redeem already set up');
          redeemSet = true;
          continue;
        }
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
        if (usedSubs.includes(subtype)) {
          twitchLog('Already set up ' + subtype);
          continue;
        }
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
    const broadcasterUserID = broadcasterId ?? (await this.getModule().api.getBroadcasterId());
    if (loggedIn == false) {
      return;
    }

    let condition = {} as KeyedObject;

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
          Authorization: 'Bearer ' + broadcasterToken,
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
          if (error.status === 409) {
            twitchLog('Eventsub already exists for', broadcasterId, eventType);
            res('ALREADY_EXISTS');
            return;
          }
          twitchLog('Eventsub init error: ', error, error.message, error.response?.data?.message);
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
