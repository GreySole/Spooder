import PluginService from '../../../core/service/PluginService';
import ShareService from '../../../core/service/ShareService';
import { KeyedObject } from '../../../Types';
import { twitchLog } from '../twitch';
import TwitchChat from '../TwitchChat';

export const twitchEvents = [
  'messagedeleted',
  'action',
  'anongiftpaidupgrade',
  'ban',
  'cheer',
  'clearchat',
  'connected',
  'connecting',
  'disconnected',
  'emoteonly',
  'emotesets',
  'followersonly',
  'giftpaidupgrade',
  'hosted',
  'hosting',
  'join',
  'logon',
  'mod',
  'mods',
  'part',
  'r9kbeta',
  'raided',
  'raw_message',
  'reconnect',
  'resub',
  'roomstate',
  'slowmode',
  'subgift',
  'submysterygift',
  'subscribers',
  'subscription',
  'timeout',
  'unhost',
  'unmod',
  'vips',
  'whisper',
];

export function processTwitchEvent(this: TwitchChat, eventType: string, ...args: any[]) {
  const activePlugins = PluginService.getActivePlugins();
  const homeChannel = this.getModule().api.homeChannel;
  const botUsername = this.getModule().api.botUsername;

  // Extract channel from first argument for most events, handle special cases
  let channel = '';
  if (eventType === 'connected' || eventType === 'connecting') {
    channel = homeChannel; // These events don't have channel parameter
  } else if (
    eventType === 'disconnected' ||
    eventType === 'logon' ||
    eventType === 'ping' ||
    eventType === 'reconnect'
  ) {
    channel = homeChannel; // These events don't have channel parameter
  } else if (eventType === 'pong') {
    channel = homeChannel; // This event only has latency parameter
  } else if (eventType === 'emotesets') {
    channel = homeChannel; // This event has sets and obj parameters
  } else if (eventType === 'raw_message') {
    channel = homeChannel; // This event has messageCloned and message parameters
  } else if (eventType === 'whisper') {
    channel = homeChannel; // Whispers don't have a channel, use homeChannel
  } else if (eventType === 'botmessage') {
    channel = args[0].channel;
  } else {
    channel = args[0] || homeChannel; // Most events have channel as first parameter
  }

  const channelName = channel.replace('#', '');

  let shareId = undefined;
  if (channelName !== homeChannel.replace('#', '')) {
    shareId = this.getModule().shareUsers[channelName];
  }

  // Build comprehensive message object based on event type
  let message: KeyedObject = {
    channel: channelName,
    platform: 'twitch',
    eventType: eventType,
    botUsername: botUsername,
    respond: ((responseTxt: string) => {
      this.sayInChat(responseTxt, channelName);
    }).bind(this),
  };

  // Map event-specific parameters to message object
  switch (eventType) {
    case 'botmessage':
      message = args[0];
      break;
    case 'action':
      message.username = args[1]?.username;
      message.displayName = args[1]?.['display-name'];
      message.userId = args[1]?.['user-id'];
      message.tags = args[1];
      message.message = args[2];
      message.self = args[3];
      message.isBroadcaster = args[1]?.badges?.broadcaster == '1';
      message.isMod = args[1]?.mod == true;
      message.isSubscriber = args[1]?.subscriber == true;
      message.isVIP = args[1]?.badges?.vip == '1';
      break;

    case 'anongiftpaidupgrade':
      message.username = args[1];
      message.userstate = args[2];
      break;

    case 'ban':
      message.username = args[1];
      message.reason = args[2];
      message.userstate = args[3];
      message.targetUserId = args[3]?.['target-user-id'];
      message.roomId = args[3]?.['room-id'];
      break;

    case 'cheer':
      message.username = args[1]?.username;
      message.displayName = args[1]?.['display-name'];
      message.userId = args[1]?.['user-id'];
      message.tags = args[1];
      message.message = args[2];
      message.bits = args[1]?.bits;
      message.isBroadcaster = args[1]?.badges?.broadcaster == '1';
      message.isMod = args[1]?.mod == true;
      message.isSubscriber = args[1]?.subscriber == true;
      message.isVIP = args[1]?.badges?.vip == '1';
      break;

    case 'clearchat':
      // Only has channel parameter
      break;

    case 'connected':
    case 'connecting':
      message.address = args[0];
      message.port = args[1];
      break;

    case 'disconnected':
      message.reason = args[0];
      break;

    case 'emoteonly':
    case 'r9kbeta':
    case 'subscribers':
      message.enabled = args[1];
      break;

    case 'emotesets':
      message.sets = args[0];
      message.obj = args[1];
      break;

    case 'followersonly':
    case 'slowmode':
      message.enabled = args[1];
      message.length = args[2];
      break;

    case 'giftpaidupgrade':
      message.username = args[1];
      message.sender = args[2];
      message.userstate = args[3];
      break;

    case 'hosted':
      message.username = args[1];
      message.viewers = args[2];
      message.autohost = args[3];
      break;

    case 'hosting':
      message.target = args[1];
      message.viewers = args[2];
      break;

    case 'join':
    case 'part':
      message.username = args[1];
      message.self = args[2];
      break;

    case 'messagedeleted':
      message.username = args[1];
      message.deletedMessage = args[2];
      message.userstate = args[3];
      message.targetMsgId = args[3]?.['target-msg-id'];
      break;

    case 'mod':
    case 'unmod':
      message.username = args[1];
      break;

    case 'mods':
    case 'vips':
      message.list = args[1];
      break;

    case 'raided':
      message.username = args[1];
      message.viewers = args[2];
      break;

    case 'resub':
      message.username = args[1];
      message.streakMonths = args[2];
      message.message = args[3];
      message.userstate = args[4];
      message.methods = args[5];
      message.cumulativeMonths = args[4]?.['msg-param-cumulative-months'];
      message.shouldShareStreak = args[4]?.['msg-param-should-share-streak'];
      break;

    case 'roomstate':
      message.state = args[1];
      break;

    case 'subgift':
      message.username = args[1];
      message.streakMonths = args[2];
      message.recipient = args[3];
      message.methods = args[4];
      message.userstate = args[5];
      message.recipientDisplayName = args[5]?.['msg-param-recipient-display-name'];
      message.recipientId = args[5]?.['msg-param-recipient-id'];
      message.recipientUserName = args[5]?.['msg-param-recipient-user-name'];
      message.senderCount = args[5]?.['msg-param-sender-count'];
      break;

    case 'submysterygift':
      message.username = args[1];
      message.numbOfSubs = args[2];
      message.methods = args[3];
      message.userstate = args[4];
      message.senderCount = args[4]?.['msg-param-sender-count'];
      break;

    case 'subscription':
      message.username = args[1];
      message.methods = args[2];
      message.message = args[3];
      message.userstate = args[4];
      break;

    case 'timeout':
      message.username = args[1];
      message.reason = args[2];
      message.duration = args[3];
      message.userstate = args[4];
      message.targetUserId = args[4]?.['target-user-id'];
      message.roomId = args[4]?.['room-id'];
      break;

    case 'unhost':
      message.viewers = args[1];
      break;

    case 'whisper':
      message.from = args[0];
      message.username = args[1]?.username;
      message.displayName = args[1]?.['display-name'];
      message.userId = args[1]?.['user-id'];
      message.tags = args[1];
      message.message = args[2];
      message.self = args[3];
      message.threadId = args[1]?.['thread-id'];
      message.messageId = args[1]?.['message-id'];
      break;

    default:
      // For any unhandled events, just attach all args
      message.args = args;
      break;
  }

  // Call onEvent for all active plugins
  for (let p in activePlugins) {
    try {
      if (channelName != homeChannel.replace('#', '')) {
        if (ShareService.hasPluginEnabled(shareId, p)) {
          if (activePlugins[p].onStreamModuleEvent != null) {
            activePlugins[p].onStreamModuleEvent('twitch', eventType, message);
          }
        }
      } else {
        if (activePlugins[p].onStreamModuleEvent != null) {
          activePlugins[p].onStreamModuleEvent('twitch', eventType, message);
        }
      }
    } catch (e) {
      twitchLog(e);
    }
  }
}
