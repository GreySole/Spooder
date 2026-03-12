import { KeyedObject, StreamMessage } from '../../Types';
import { EventService, sayInChat } from '../../core/service/EventService';
import { ModerationService } from '../../core/service/ModerationService';
import ModuleService from '../../core/service/ModuleService';
import ShareService from '../../core/service/ShareService';
import { triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';
import Discord from '../discord/discord';
import Twitch, { twitchLog } from './twitch';

export default async function OnEventSubReceived(type: string, event: KeyedObject) {
  const twitchModule = ModuleService.getStreamModule('twitch') as Twitch;

  try {
    if (
      event.broadcaster_user_name === 'testBroadcaster' ||
      event.to_broadcaster_user_name === 'testBroadcaster'
    ) {
      const broadcasterUserId = event.broadcaster_user_id ?? event.to_broadcaster_user_id;
      const userInfo = await twitchModule.api.getUserInfoById(broadcasterUserId);
      if (event.broadcaster_user_id) {
        event.broadcaster_user_id = broadcasterUserId;
        event.broadcaster_user_name = userInfo?.display_name ?? 'unknown';
        event.broadcaster_user_login = userInfo?.login ?? 'unknown';
      } else if (event.to_broadcaster_user_id) {
        event.to_broadcaster_user_id = broadcasterUserId;
        event.to_broadcaster_user_name = userInfo?.display_name ?? 'unknown';
        event.to_broadcaster_user_login = userInfo?.login ?? 'unknown';
      }
    }

    /*if (event.user_name === 'testFromUser' || event.from_broadcaster_user_name === 'testFromUser') {
      const userId = event.user_id ?? event.from_broadcaster_user_id;
      const userInfo = await twitchModule.api.getUserInfoById(userId);
      if (event.user_id) {
        event.user_id = userId;
        event.user_name = userInfo?.display_name ?? 'unknown';
        event.user_login = userInfo?.login ?? 'unknown';
      } else if (event.from_broadcaster_user_id) {
        event.from_broadcaster_user_id = userId;
        event.from_broadcaster_user_name = userInfo?.display_name ?? 'unknown';
        event.from_broadcaster_user_login = userInfo?.login ?? 'unknown';
      }
    }*/
  } catch (e) {
    console.error('Error fetching user info for test event:', e);
  }

  const streamMessage = {
    userId: event.user_id ?? event.from_broadcaster_user_id,
    username: event.user_login ?? event.from_broadcaster_user_login,
    displayName: event.user_name ?? event.from_broadcaster_user_name,
    platform: 'twitch',
    channel: event.broadcaster_user_login ?? event.from_broadcaster_user_login,
    message: event.user_input ?? '',
    messageType: `twitch-event`,
    respond: (responseTxt: string) => {
      sayInChat(responseTxt, 'twitch', twitchModule.api.homeChannel);
    },
    emotes: [],
    tags: {},
    isBroadcaster: event.broadcaster_user_id == twitchModule.api.broadcasterUserID,
    isMod: false,
    isSubscriber: false,
    isVIP: false,
    isFirstMessage: false,
    isReturningChatter: false,
    platformEventData: {
      type,
      ...event,
    },
  } as StreamMessage;

  twitchLog(`Receiving ${type} request`, event);

  if (event.broadcaster_user_id != twitchModule.api.broadcasterUserID && type != 'channel.raid') {
    if (type == 'stream.online') {
      await twitchModule.api.validateChatbot();
      ShareService.setShare(event.broadcaster_user_login, true);
      const discord = ModuleService.getCommunityModule('discord') as Discord;
      if (!discord) {
        return;
      }
      if (discord.loggedIn == true && discord.config.sharenotif == true) {
        discord.api.findUser(discord.config.master).then((user) => {
          let watchButton = discord.buttons.makeLinkButton(
            'Watch',
            'https://twitch.tv/' + event.broadcaster_user_login,
          );
          user.send({
            content: event.broadcaster_user_name + " is live. I'm going in!",
            components: [watchButton.toJSON()],
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
      streamMessage.platformEventData!.raidType = 'receive';
    } else if (event.from_broadcaster_user_id == twitchModule.api.broadcasterUserID) {
      streamMessage.platformEventData!.raidType = 'send';
    }
  }

  if (type == 'channel.channel_points_custom_reward_redemption.add') {
    const modlocks = ModerationService.getModlocks();
    const events = EventService.getEvents();
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e], 'twitch')) {
        continue;
      }
      if (events[e].triggers.twitch.reward.id == event.reward.id) {
        if (event.status == 'fulfilled' || events[e].triggers.twitch.reward.override == true) {
          if (modlocks.events[e] != 1) {
            streamMessage.messageType = 'twitch-redeem';
            EventService.runCommands(streamMessage, e, 'twitch-event');
          } else {
            //rejectChannelPointReward(event.reward.id, event.id);
            twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
            continue;
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
    for (let e in events) {
      if (
        triggerExistsAndEnabled(events[e], 'twitch') &&
        events[e].triggers.twitch.reward.id == event.reward.id &&
        events[e].triggers.twitch.reward.override == false
      ) {
        if (event.status == 'fulfilled') {
          if (modlocks.events[e] != 1) {
            streamMessage.messageType = 'twitch-redeem';
            EventService.runCommands(streamMessage, e, 'event');
          } else {
            twitchModule.chat.sayInChat(event.reward.title + ' is locked on my end. Sorry.');
            continue;
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
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e], 'twitch')) {
        continue;
      }

      if (events[e].triggers.twitch.type == type) {
        EventService.runCommands(streamMessage, e, 'event');
      }
    }
  }
}
