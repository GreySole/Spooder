import { logToFile } from '../../core/Logging';
import ModuleService from '../../core/service/ModuleService';
import { websocketTest } from '../../core/util/NetUtil';
import Twitch, { twitchLog } from './main';
import OnEventSubReceived from './OnEventSubReceived';
import { groupIsDisabled, triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';
import Axios from 'axios';
import { KeyedObject } from '../../Types';
import WebSocket from 'ws';

const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 60000;

export default class TwitchEventSubWebsocket {
  websocket: WebSocket | undefined = undefined;
  // Holds the new socket opened for a Twitch-initiated `session_reconnect` handoff. Twitch's
  // protocol requires keeping the old connection alive until this one sends `session_welcome`,
  // so it's tracked separately from `websocket` until the handoff completes.
  private pendingReconnectSocket: WebSocket | undefined = undefined;
  wsSessionId: string | undefined = undefined;
  wsKeepAliveInterval: NodeJS.Timeout | undefined = undefined;
  private keepAliveTimeoutMs: number = 15000;
  private reconnectTimer: NodeJS.Timeout | undefined = undefined;
  private reconnectAttempts: number = 0;
  private shuttingDown: boolean = false;
  testMode: boolean = false;
  websocketUrl = 'wss://eventsub.wss.twitch.tv/ws';

  initialize() {
    const eventSub = this.getModule().eventsub;
    const twitchTriggeredEvents = eventSub.getTwitchTriggeredEvents();
    if (Object.keys(twitchTriggeredEvents).length === 0) {
      twitchLog('No Twitch triggered events found, skipping EventSub initialization');
      return;
    }
    this.shuttingDown = false;
    //this.enableTestMode('localhost', 8080);
    this.connect(this.websocketUrl);
  }

  // Every reconnect path (initial connect, error/close recovery, test mode) funnels through
  // here so there's exactly one place that owns `this.websocket` and clears stale timers/sockets.
  private connect(url: string) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.pendingReconnectSocket) {
      this.pendingReconnectSocket.removeAllListeners();
      if (
        this.pendingReconnectSocket.readyState === WebSocket.OPEN ||
        this.pendingReconnectSocket.readyState === WebSocket.CONNECTING
      ) {
        this.pendingReconnectSocket.close();
      }
      this.pendingReconnectSocket = undefined;
    }
    this.clearKeepAliveWatchdog();
    const socket = new WebSocket(url);
    this.websocket = socket;
    this.setupWebSocketHandlers(socket);
  }

  private clearKeepAliveWatchdog() {
    if (this.wsKeepAliveInterval) {
      clearTimeout(this.wsKeepAliveInterval);
      this.wsKeepAliveInterval = undefined;
    }
  }

  // Twitch sends a keepalive (or an actual notification) at least every keepalive_timeout_seconds.
  // If nothing arrives in time the connection is dead in a way `close`/`error` won't always catch.
  private resetKeepAliveWatchdog(socket: WebSocket) {
    this.clearKeepAliveWatchdog();
    this.wsKeepAliveInterval = setTimeout(() => {
      if (this.websocket !== socket) return;
      twitchLog('Eventsub keepalive timeout, reconnecting...');
      socket.removeAllListeners();
      socket.terminate();
      this.reconnect(socket);
    }, this.keepAliveTimeoutMs);
  }

  private reconnect(socket: WebSocket) {
    if (this.shuttingDown || this.websocket !== socket || this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY,
    );
    twitchLog(`Eventsub reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(this.websocketUrl);
    }, delay);
  }

  cleanup = async () => {
    this.shuttingDown = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearKeepAliveWatchdog();
    [this.websocket, this.pendingReconnectSocket].forEach((socket) => {
      if (!socket) return;
      socket.removeAllListeners();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    });
    this.websocket = undefined;
    this.pendingReconnectSocket = undefined;

    const subs = await this.getEventSubs();
    for (let s in subs.data) {
      twitchLog('Deleting ' + subs.data[s].type, subs.data[s].condition.broadcaster_user_id);
      await this.deleteEventSub(subs.data[s].id);
    }
  };

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
      twitchLog('Eventsub delete error: id -', id, error.message, error.response?.data?.message);
      return;
    });
  };

  refreshEventSubs = async (forceDeleteAll?: boolean) => {
    await this.getModule().api.validateBroadcaster();
    const eventSub = this.getModule().eventsub;
    const events = eventSub.getTwitchTriggeredEvents();
    const api = this.getModule().api;
    const broadcasterId = await api.getBroadcasterId();
    const botId = await api.getBotId();
    const subs = await this.getEventSubs();

    console.log('CURRENT SUBS', subs);

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
      await eventSub.deleteEventSub(subs.data[s].id);
    }

    if (this.testMode) {
      return;
    }

    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e], 'twitch')) {
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

  // `socket` is the specific instance these handlers belong to. Every handler re-checks that
  // `socket` is still the one `this.websocket` (or `this.pendingReconnectSocket`) points at
  // before acting, so a stale/replaced socket's trailing events can't stomp on the live one.
  setupWebSocketHandlers(socket: WebSocket) {
    socket.onopen = () => {
      if (this.websocket !== socket && this.pendingReconnectSocket !== socket) return;
      twitchLog('Eventsub connection opened');
      this.reconnectAttempts = 0;
    };

    socket.onmessage = (event) => {
      if (!event.data) {
        twitchLog('Eventsub received empty message', event);
        return;
      }
      const data = JSON.parse(event.data.toString());

      if (data.metadata.message_type === 'session_welcome') {
        if (this.pendingReconnectSocket === socket) {
          // Handoff: this socket has taken over from `this.websocket`. Twitch's protocol says
          // to keep the old connection open until this point, then close it now that the new
          // one is confirmed.
          const oldSocket = this.websocket;
          this.websocket = socket;
          this.pendingReconnectSocket = undefined;
          if (oldSocket && oldSocket !== socket) {
            oldSocket.removeAllListeners();
            if (oldSocket.readyState === WebSocket.OPEN || oldSocket.readyState === WebSocket.CONNECTING) {
              oldSocket.close();
            }
          }
        }
        if (this.websocket !== socket) return;
        this.wsSessionId = data.payload.session.id;
        const keepAliveSeconds = data.payload.session.keepalive_timeout_seconds;
        if (keepAliveSeconds) {
          this.keepAliveTimeoutMs = (keepAliveSeconds + 10) * 1000;
        }
        this.resetKeepAliveWatchdog(socket);
        twitchLog('Eventsub session id:', this.wsSessionId);
        this.refreshEventSubs();
        return;
      }

      if (this.websocket !== socket) return;
      this.resetKeepAliveWatchdog(socket);

      if (data.metadata.message_type === 'session_keepalive') {
        // Do nothing further, watchdog already reset above
      } else if (data.metadata.message_type === 'session_reconnect') {
        twitchLog('Eventsub reconnect requested', data.payload);
        const reconnectSocket = new WebSocket(data.payload.session.reconnect_url);
        this.pendingReconnectSocket = reconnectSocket;
        this.setupWebSocketHandlers(reconnectSocket);
      } else {
        const type = data.payload.subscription.type;
        const eventPayload = { ...data.payload.event };
        OnEventSubReceived(type, eventPayload);
      }
    };

    socket.on('ping', () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.pong(); // Respond to ping with pong
      }
    });

    socket.onerror = (error) => {
      if (this.websocket !== socket && this.pendingReconnectSocket !== socket) return;
      twitchLog('Eventsub error:', error);
      logToFile('twitch-eventsub-error', 'Eventsub error: ' + error.message, 100);
      // `close` always follows `error` for this same socket - let onclose own reconnection
      // so a single failure doesn't spawn two competing replacement sockets.
    };

    socket.onclose = (event) => {
      logToFile(
        'twitch-eventsub-close',
        'Eventsub connection closed: ' + event.code + ' ' + event.reason,
        100,
      );
      twitchLog('Eventsub connection closed:', event.code, event.reason);

      if (this.pendingReconnectSocket === socket) {
        this.pendingReconnectSocket = undefined;
        // The old (still-primary) connection is untouched, so it keeps running - nothing else to do.
        return;
      }

      if (this.shuttingDown || this.websocket !== socket) {
        return;
      }

      this.clearKeepAliveWatchdog();
      this.reconnect(socket);
    };
  }

  enableTestMode = (host: string, port: number) => {
    return new Promise<boolean>((res, rej) => {
      websocketTest(host, port)
        .then((isAlive) => {
          if (isAlive) {
            this.testMode = true;
            this.websocketUrl = `ws://${host}:${port}/ws`;
            this.connect(this.websocketUrl);
            res(true);
          } else {
            twitchLog(`Test mode failed: ${host}:${port} is not reachable`);
            res(false);
          }
        })
        .catch((e) => {
          twitchLog(`Test mode error: ${e.message}`);
          rej(false);
        });
    });
  };

  disableTestMode = () => {
    this.testMode = false;
    this.websocketUrl = 'wss://eventsub.wss.twitch.tv/ws';
    this.connect(this.websocketUrl);
  };
}
