import { sayInChat, EventService } from 'src/core/service/EventService';
import { ModerationService } from 'src/core/service/ModerationService';
import ModuleService from 'src/core/service/ModuleService';
import ShareService from 'src/core/service/ShareService';
import Discord from '../discord/main';
import Twitch, { twitchLog } from './main';
import { KeyedObject } from 'src/Types';
import { triggerExistsAndEnabled } from 'src/core/util/EventTriggerUtil';

export default async function OnEventSubReceived(data: KeyedObject) {
  const twitchModule = ModuleService.getStreamModule('twitch') as Twitch;
  const messageType = data.metadata.message_type;
  twitchLog('RECEIVE EVENTSUB', messageType, data.payload.subscription.type, data.payload.event);

  const type = data.payload.subscription.type;
  const event = { ...data.payload.event };

  twitchLog(`Receiving ${type} request`, event);

  event.eventsubType = type;

  event.message = '';
  event.platform = 'twitch';
  event.respond = (responseTxt: string) => {
    sayInChat(responseTxt, 'twitch', twitchModule.api.homeChannel);
  };

  if (event.broadcaster_user_id != twitchModule.api.broadcasterUserID && type != 'channel.raid') {
    if (type == 'stream.online') {
      await twitchModule.api.validateChatbot();
      ShareService.setShare(event.broadcaster_user_login, true);
      const discord = ModuleService.getCommunityModule('discord') as Discord;
      if (!discord) {
        return;
      }
      if (discord.loggedIn == true && discord.config.sharenotif == true) {
        discord.findUser(discord.config.master).then((user) => {
          let watchButton = discord.makeLinkButton(
            'Watch',
            'https://twitch.tv/' + event.broadcaster_user_login,
          );
          user.send({
            content: event.broadcaster_user_name + " is live. I'm going in!",
            components: [watchButton],
          });
        });
      }
    } else if (type == 'stream.offline') {
      ShareService.setShare(event.broadcaster_user_login, false);
    }
    return;
  }

  if (type == 'channel.raid') {
    await twitchModule.api.getBroadcasterId();
    if (event.to_broadcaster_user_id == twitchModule.api.broadcasterUserID) {
      event.raidType = 'receive';
      event.username = event.from_broadcaster_user_login;
      event.displayName = event.from_broadcaster_user_name;
    } else if (event.from_broadcaster_user_id == twitchModule.api.broadcasterUserID) {
      event.raidType = 'send';
      event.username = event.to_broadcaster_user_login;
      event.displayName = event.to_broadcaster_user_name;
    }
  }

  if (type == 'channel.channel_points_custom_reward_redemption.add') {
    const modlocks = ModerationService.getModlocks();
    event.userId = event.user_id;
    event.username = event.user_login;
    event.displayName = event.user_name;
    event.message = event.user_input;
    const events = EventService.getEvents();
    for (let e in events) {
      if (events[e].triggers.twitch == null) {
        return;
      }
      if (
        events[e].triggers.twitch.enabled &&
        events[e].triggers.twitch.reward.id == event.reward.id
      ) {
        if (event.status == 'fulfilled' || events[e].triggers.twitch.reward.override == true) {
          if (modlocks.events[e] != 1) {
            event.eventType = 'twitch-redeem';
            EventService.runCommands(event, e, 'event');
          } else {
            //rejectChannelPointReward(event.reward.id, event.id);
            twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
            return;
          }
        } else if (events[e].triggers.twitch.reward.override == false && modlocks.events[e] == 1) {
          twitchModule.chat.sayInChat(
            "MODS! This event is locked on my end. I can't reject it myself because I didn't create it :( please either lift the lock on " +
              e +
              ' or reject it.',
          );
        }
      }
    }
  } else if (type == 'channel.channel_points_custom_reward_redemption.update') {
    const events = EventService.getEvents();
    const modlocks = ModerationService.getModlocks();
    event.userId = event.user_id;
    event.username = event.user_login;
    event.displayName = event.user_name;
    event.message = event.user_input;
    for (let e in events) {
      if (events[e].triggers.twitch == null) {
        return;
      }
      if (
        events[e].triggers.twitch.enabled &&
        events[e].triggers.twitch.reward.id == event.reward.id &&
        events[e].triggers.twitch.reward.override == false
      ) {
        if (event.status == 'fulfilled') {
          if (modlocks.events[e] != 1) {
            event.eventType = 'twitch-redeem';
            EventService.runCommands(event, e, 'event');
          } else {
            twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
            return;
          }
        } else {
          twitchModule.chat.sayInChat(
            event.user_name + ' Sorry, the ' + event.reward.title + ' is a no go.',
          );
        }
      }
    }
  } else {
    const events = EventService.getEvents();
    if (type != 'channel.raid') {
      event.userId = event.user_id ?? event.broadcaster_user_id;
      event.username = event.user_login ?? event.broadcaster_user_login;
      event.displayName = event.user_name ?? event.broadcaster_user_name;
    }
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e].triggers, 'twitch')) {
        return;
      }
      if (events[e].triggers.twitch.type == type) {
        EventService.runCommands(event, e, 'event');
      }
    }
  }
}
