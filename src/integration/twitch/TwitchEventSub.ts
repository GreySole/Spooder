import ConfigManager from '../../core/manager/ConfigManager.ts';
import ModuleManager from '../../core/manager/ModuleManager.ts';
import { KeyedObject } from '../../Types.ts';
import STwitch, { twitchLog } from './main.ts';
import Axios from 'axios';

export default class TwitchEventSub {
  getModule = () => {
    return ModuleManager.getStreamModule('twitch') as STwitch;
  };

  getEventSubs = async () => {
    console.log('MODULES', ModuleManager.getStreamModules(), this);
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const appToken = this.getModule().api.appToken;
    const getAppToken = this.getModule().api.getAppToken;
    console.log('APP TOKEN', appToken);
    if (loggedIn == false) {
      return;
    }
    await getAppToken();
    if (appToken == '') {
      twitchLog('No app token found');
      return;
    }
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
    console.log('GOT EVENTSUBS', response);
    return response?.data;
  };

  refreshEventSubs = async () => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    let subs = await this.getEventSubs();
    for (let s in subs.data) {
      await this.deleteEventSub(subs.data[s].id);
    }
  };

  deleteEventSub = async (id: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const appToken = this.getModule().api.appToken;
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
      twitchLog('Eventsub delete error: ', error.message, error.response?.data?.message);
      return;
    });
  };

  initEventSub = async (eventType: string, bid: string) => {
    const sconfig = ConfigManager.getConfig();
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const appToken = this.getModule().api.appToken;
    const getAppToken = this.getModule().api.getAppToken;
    const getBroadcasterID = this.getModule().api.getBroadcasterID;
    const broadcasterUserID = this.getModule().api.broadcasterUserID;
    const botUserID = this.getModule().api.botUserID;
    if (loggedIn == false) {
      return;
    }

    await getAppToken();

    if (bid == null) {
      await getBroadcasterID();
      bid = broadcasterUserID;
    }

    var condition = {} as KeyedObject;

    if (!eventType.startsWith('channel.raid')) {
      condition = { broadcaster_user_id: bid };
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
        condition.moderator_user_id = botUserID;
      }
    } else {
      if (eventType.split('-')[1] == 'receive') {
        condition = { to_broadcaster_user_id: bid };
      } else {
        condition = { from_broadcaster_user_id: bid };
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
            callback: sconfig.network.external_http_url + '/webhooks/eventsub',
            secret: 'imasecretboi',
          },
        },
      })
        .then((response: any) => res('SUCCESS'))
        .catch((error: any) => {
          twitchLog('Eventsub init error: ', error.message, error.response?.data?.message);
          res(error.response.data.message);
        });
    });
  };
}
