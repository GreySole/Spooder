import Axios from 'axios';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject } from '../../Types';
import Twitch, { twitchLog } from './main';
import { WebService } from '../../core/service/WebService';
import { triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';

export default class TwitchEventSubWebhook {
  initialize = async () => {
    //this.refreshEventSubs();
  };

  cleanup = async () => {
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
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    await this.getModule().api.validateBroadcaster();
    const oauth = this.getModule().oauth;

    const appToken = await this.getModule().api.getAppToken();

    let response = await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
      method: 'GET',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + appToken,
        'Content-Type': 'application/json',
      },
    }).catch((error: any) => {
      twitchLog('Eventsub get error: ', error.message, error.response?.data?.message);
      return;
    });
    return response?.data;
  };

  initEventSub = async (eventType: string, broadcasterId: string, botId?: string) => {
    const publicUrl = WebService.getPublicHTTPUrl();
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const appToken = await this.getModule().api.getAppToken();
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
          Authorization: 'Bearer ' + appToken,
          'Content-Type': 'application/json',
        },
        data: {
          type: eventType,
          version: version,
          condition: condition,
          transport: {
            method: 'webhook',
            callback: publicUrl + '/twitch/webhooks/eventsub',
            secret: 'imasecretboi',
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
          res(error.response.data.message);
        });
    });
  };

  deleteEventSub = async (id: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const appToken = await this.getModule().api.getAppToken();
    if (loggedIn == false) {
      return;
    }
    await Axios({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
      method: 'DELETE',
      headers: {
        'Client-Id': oauth['client-id'],
        Authorization: ' Bearer ' + appToken,
        'Content-Type': 'application/json',
      },
    }).catch((error: any) => {
      twitchLog('Eventsub delete error: id -', id, error.message, error.response?.data?.message);
      return;
    });
  };

  refreshEventSubs = async (forceRefreshAll?: boolean) => {
    await this.getModule().api.validateBroadcaster();
    const eventSub = this.getModule().eventsub;
    const events = eventSub.getTwitchTriggeredEvents();
    const api = this.getModule().api;
    const broadcasterId = await api.getBroadcasterId();
    const botId = await api.getBotId();
    const subs = await this.getEventSubs();
    const publicUrl = WebService.getPublicHTTPUrl();

    let redeemSet = false;

    const shareSubs = [] as string[];

    const usedSubs = [] as string[];

    for (let s in subs.data) {
      console.log('Existing sub: ', subs.data[s].transport);
      if (
        subs.data[s].status === 'enabled' &&
        subs.data[s].transport.method === 'webhook' &&
        subs.data[s].transport.callback === publicUrl + '/twitch/webhooks/eventsub' &&
        !forceRefreshAll
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
}
