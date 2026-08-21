import { EventService } from '../../core/service/EventService';
import ModuleService from '../../core/service/ModuleService';
import { triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';
import { KeyedObject } from '../../Types';
import Twitch, { twitchLog } from './twitch';
import TwitchEventSubWebhook from './TwitchEventSubWebhook';
import TwitchEventSubWebsocket from './TwitchEventSubWebsocket';

export default class TwitchEventSub {
  eventSubModule?: TwitchEventSubWebsocket | TwitchEventSubWebhook;

  constructor() {}

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

  switchTransportMethod = async (useWebhook: boolean) => {
    twitchLog('Cleaning up existing module...');
    await this.eventSubModule?.cleanup();
    if (useWebhook) {
      this.eventSubModule = new TwitchEventSubWebhook();
      //Refreshing on initialize won't work because public hosting isn't ready when Spooder starts.
      //Webhook refreshing is done in onExternalNetworkChange, so we'll have to do it manually here.
      this.eventSubModule.refreshEventSubs();
    } else {
      this.eventSubModule = new TwitchEventSubWebsocket();
    }
    twitchLog(`Initializing ${useWebhook ? 'Webhook' : 'WebSocket'} module...`);
    this.eventSubModule.initialize();
  };

  getEventSubs = async () => {
    return await this.eventSubModule!.getEventSubs();
  };

  getTwitchTriggeredEvents = () => {
    const events = EventService.getEvents();
    let twitchTriggeredEvents = {} as KeyedObject;
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e], 'twitch')) {
        continue;
      }
      twitchTriggeredEvents[e] = events[e];
    }
    return twitchTriggeredEvents;
  };

  deleteEventSub = async (id: string) => {
    twitchLog('Deleting EventSub ID:', id);
    await this.eventSubModule!.deleteEventSub(id);
  };

  initEventSub = async (type: string, broadcasterId: string, botId?: string) => {
    await this.eventSubModule!.initEventSub(type, broadcasterId, botId);
  };

  refreshEventSubs = async (forceDeleteAll?: boolean) => {
    await this.eventSubModule!.refreshEventSubs(forceDeleteAll);
  };

  testEventSub = async (eventType: string, extraArgs: string[] = []) => {
    const twitch = this.getModule();
    return await twitch.cli.testEventCommand(eventType, extraArgs);
  };

  // Test mode is a WebSocket-transport concept: the socket is pointed at the CLI's local
  // EventSub server instead of Twitch's. Webhook transport keeps taking real deliveries while
  // the CLI forwards mock ones to the same public URL, so it has no mode to be in.
  getTestModeStatus = () => {
    const twitch = this.getModule();
    if (twitch.oauth.useWebhookTransport) {
      return { status: false, url: '' };
    }
    const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
    return { status: eSubModule?.testMode ?? false, url: eSubModule?.websocketUrl ?? '' };
  };

  enableTestMode = async (host: string, port: number) => {
    const twitch = this.getModule();
    if (!twitch.oauth.useWebhookTransport) {
      const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
      return await eSubModule.enableTestMode(host, port);
    } else {
      return { status: false, url: '' };
    }
  };

  disableTestMode = () => {
    const twitch = this.getModule();
    if (!twitch.oauth.useWebhookTransport) {
      const eSubModule = this.eventSubModule as TwitchEventSubWebsocket;
      return eSubModule.disableTestMode();
    } else {
      return { status: false, url: '' };
    }
  };
}
