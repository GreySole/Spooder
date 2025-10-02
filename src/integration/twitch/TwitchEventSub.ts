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
import { websocketTest } from '../../core/util/NetUtil';
import TwitchEventSubWebsocket from './TwitchEventSubWebsocket';
import TwitchEventSubWebhook from './TwitchEventSubWebhook';

export default class TwitchEventSub {
  eventSubModule: TwitchEventSubWebsocket | TwitchEventSubWebhook;

  constructor() {
    this.eventSubModule = new TwitchEventSubWebsocket();
  }

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  initialize = async () => {
    const twitch = this.getModule();
    if (twitch.oauth.useWebhookTransport) {
      this.eventSubModule = new TwitchEventSubWebhook();
    } else {
      this.eventSubModule = new TwitchEventSubWebsocket();
    }
    this.eventSubModule.initialize();
  };

  getEventSubs = async () => {
    return await this.eventSubModule.getEventSubs();
  };

  getTwitchTriggeredEvents = () => {
    const events = EventService.getEvents();
    let twitchTriggeredEvents = {} as KeyedObject;
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e].triggers, 'twitch')) {
        continue;
      }
      twitchTriggeredEvents[e] = events[e];
    }
    return twitchTriggeredEvents;
  };

  deleteEventSub = async (id: string) => {
    twitchLog('Deleting EventSub ID:', id);
    await this.eventSubModule.deleteEventSub(id);
  };

  initEventSub = async (type: string, broadcasterId: string, botId?: string) => {
    await this.eventSubModule.initEventSub(type, broadcasterId, botId);
  };

  refreshEventSubs = async (forceDeleteAll?: boolean) => {
    await this.eventSubModule.refreshEventSubs(forceDeleteAll);
  };

  getTestModeStatus = () => {
    const twitch = this.getModule();
    if (twitch.oauth.useWebhookTransport) {
      const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
      return { status: eSubModule.testMode, url: eSubModule.websocketUrl };
    } else {
      return { status: false, url: '' };
    }
  };

  enableTestMode = async (host: string, port: number) => {
    const twitch = this.getModule();
    if (twitch.oauth.useWebhookTransport) {
      const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
      return await eSubModule.enableTestMode(host, port);
    } else {
      return { status: false, url: '' };
    }
  };

  disableTestMode = () => {
    const twitch = this.getModule();
    if (twitch.oauth.useWebhookTransport) {
      const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
      return eSubModule.disableTestMode();
    } else {
      return { status: false, url: '' };
    }
  };
}
