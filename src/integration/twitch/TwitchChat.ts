import tmi from 'tmi.js';
import { EventService } from '../../core/service/EventService';
import ModuleService from '../../core/service/ModuleService';
import ShareService from '../../core/service/ShareService';
import { processStreamMessage } from '../../core/util/ChatUtil';
import { triggerExistsAndEnabled } from '../../core/util/EventTriggerUtil';
import { KeyedObject, StreamMessage } from '../../Types';
import { processTwitchEvent, twitchEvents } from './functions/processTwitchMessage';
import Twitch, { twitchLog } from './twitch';

function stringifyArray(a: string[]) {
  return a.join(', ');
}

export default class TwitchChat {
  lastMessage: KeyedObject = {};
  chat: tmi.Client | undefined = undefined;
  activeChannels: string[] = [];
  reconnecting: boolean = false;
  intentionalDisconnect: boolean = false;

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  twitchjsify = (channel: string, tags: KeyedObject, txt: string): StreamMessage => {
    const emotes = tags.emotes;
    const newEmotes = [];
    for (let e in emotes) {
      for (let ei in emotes[e]) {
        newEmotes.push({
          id: e,
          start: parseInt(emotes[e][ei].split('-')[0]),
          end: parseInt(emotes[e][ei].split('-')[1]),
        });
      }
    }
    if (tags.badges == null) {
      tags.badges = {};
    }

    tags.emotes = newEmotes;

    const channelName = channel.replace('#', '');

    const message = {
      channel: channelName,
      respond: ((responseTxt: string) => {
        this.sayInChat(responseTxt, channelName);
      }).bind(this),
      username: tags.username,
      displayName: tags['display-name'],
      tags: tags,
      message: txt,
      messageType: 'twitch-chat',
      userId: tags['user-id'],
      platform: 'twitch',
      emotes: newEmotes,
      isFirstMessage: tags['first-msg'] == true,
      isReturningChatter: tags['returning-chatter'] == true,
      isBroadcaster: tags.badges?.broadcaster == true,
      isMod: tags.mod == true,
      isSubscriber: tags.subscriber == true,
      isVIP: tags.badges?.vip == true,
    } as StreamMessage;

    return message;
  };

  processMessage = (channel: string, tags: KeyedObject, txt: string, self: boolean) => {
    const streamMessage = this.twitchjsify(channel, tags, txt);

    if (self) {
      processTwitchEvent.call(this, 'botmessage', streamMessage);
      return;
    }

    let shareId = undefined;

    const channelName = streamMessage.channel.replace('#', '');

    if (channelName !== this.getModule().api.homeChannel) {
      shareId = this.getModule().shareUsers[streamMessage.channel];
      streamMessage.shareId = shareId;
    }

    processStreamMessage(streamMessage);

    this.lastMessage = {
      username: streamMessage.username,
      channel: streamMessage.channel,
      message: streamMessage.message,
    };
  };

  runChat = async (startCase?: string) => {
    const shares = ShareService.getShares();
    const botUsername = this.getModule().api.botUsername;
    const oauth = this.getModule().oauth;
    const onAuthenticationFailure = this.getModule().api.onAuthenticationFailure;
    const homeChannel = this.getModule().api.homeChannel;
    const broadcasterUserID = this.getModule().api.broadcasterUserID;
    const getEventSubs = this.getModule().eventsub.getEventSubs;
    const isStreamerLive = this.getModule().api.isStreamerLive;

    twitchLog('Running chat...');
    this.intentionalDisconnect = false;
    this.reconnecting = false;
    if (this.chat != null) {
      if (this.chat.readyState() == 'OPEN' || this.chat.readyState() == 'CONNECTING') {
        this.intentionalDisconnect = true;
        await this.chat.disconnect();
      }
      this.chat.removeAllListeners();
    }

    this.chat = new tmi.Client({
      options: { debug: true },
      connection: { reconnect: true, maxReconnectAttempts: 5 },
      identity: {
        username: botUsername,
        password: oauth.token,
      },
    });

    await this.chat.connect().catch((error) => {
      onAuthenticationFailure();
    });
    
    this.chat
      .join(homeChannel)
      .then(async () => {
        if (startCase == 'restart') {
          this.sayInChat("chat restarted, I'm back :D");
        } else if (startCase == 'reconnect') {
          this.sayInChat("Stream reconnected. I'm okay :)");
        } else if (startCase == 'disconnected') {
          this.sayInChat('Stream disconnected. Hold on a sec...');
        } else if (startCase != null) {
          this.sayInChat(startCase);
        }

        // Auto join shares
        let subs = await getEventSubs();
        let subtype = '';

        for (let s in subs.data) {
          subtype = subs.data[s].type;
          let bid = subs.data[s].condition.broadcaster_user_id;

          if (subtype == 'stream.online' && bid != broadcasterUserID) {
            for (let s in shares) {
              if (shares[s].streamPlatforms.twitch?.userId == bid) {
                isStreamerLive(s).then((isLive) => {
                  if (isLive == true) {
                    ShareService.setShare(s, true);
                  }
                });
              }
            }
          }
        }
      })
      .catch((error) => {
        twitchLog('Chat join error: ', error);
      });

    this.chat.on('message', this.processMessage.bind(this));

    // Register all other Twitch events except 'chat' and 'message'

    twitchEvents.forEach((event) => {
      this.chat?.on(event as any, (...args: any[]) => {
        processTwitchEvent.call(this, event, ...args);
      });
    });

    this.chat.on('disconnected', async (reason: string) => {
      twitchLog('Chat disconnected:', reason);
      if (this.intentionalDisconnect || this.reconnecting) {
        return;
      }
      this.reconnecting = true;
      twitchLog('Unexpected disconnect — reconnecting in 5s...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (!this.intentionalDisconnect) {
        this.reconnecting = false;
        this.runChat('reconnect');
      }
    });
  };

  getChatCommands = (shareChannel: string) => {
    const loggedIn = this.getModule().loggedIn;
    const homeChannel = this.getModule().api.homeChannel;
    const shares = ShareService.getShares();
    const events = EventService.getEvents();
    if (loggedIn == false) {
      return;
    }
    let commandsArray = [];

    for (let e in events) {
      if (triggerExistsAndEnabled(events[e], 'chat')) {
        if (shareChannel != null && shareChannel != homeChannel) {
          if (!Object.keys(shares[shareChannel].commands).includes(e)) {
            continue;
          }
        }

        if (events[e].triggers.chat.command.startsWith('!')) {
          commandsArray.push(events[e].triggers.chat.command);
        }
      }
    }
    return commandsArray;
  };

  sayInChat = async (message?: string, chatChannel?: string) => {
    const loggedIn = this.getModule().loggedIn;
    const homeChannel = this.getModule().api.homeChannel;
    if (loggedIn == false) {
      return;
    }
    if (chatChannel == null) {
      chatChannel = homeChannel;
    }
    if (!message || message == null || message == '') {
      twitchLog('EMPTY MESSAGE');
      return;
    }
    if (message.length >= 490) {
      let limit = 490;
      let totalMessages = Math.ceil(message.length / limit);

      for (let stringpos = 0; stringpos < message.length; stringpos += limit) {
        if (stringpos + limit > message.length) {
          await this.chat?.say(
            chatChannel,
            '[' +
              totalMessages +
              '/' +
              totalMessages +
              '] ' +
              message.substring(stringpos, message.length),
          );
        } else {
          await this.chat?.say(
            chatChannel,
            '[' +
              (Math.round((stringpos + limit) / limit) +
                '/' +
                totalMessages +
                '] ' +
                message.substring(stringpos, stringpos + limit)),
          );
        }
      }
    } else {
      await this.chat?.say(chatChannel, message).catch((e) => {
        twitchLog('chat ERROR', e);
        this.restartChat(message);
      });
    }
  };

  disconnectChat = () => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    this.intentionalDisconnect = true;
    this.chat?.disconnect();
  };

  joinChannel = async (channelname: string, joinmsg: string | undefined) => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    this.chat
      ?.join(channelname)
      .then(() => {
        this.sayInChat(joinmsg, channelname);
        this.activeChannels.push(channelname);
      })
      .catch((e) => {
        twitchLog('Twitch chat join fail', e);
      });
  };

  leaveChannel = async (channelname: string, partmsg: string | undefined) => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    this.sayInChat(partmsg, channelname);

    //part() is a promise, but it keeps catching "No response from Twitch" despite leaving successfully.
    //We'll just say they left successfully.
    this.chat?.part(channelname);

    const index = this.activeChannels.indexOf(channelname);
    if (index > -1) {
      this.activeChannels.splice(index, 1);
    }
  };

  restartChat = async (message: string) => {
    const loggedIn = this.getModule().loggedIn;
    const validateChatbot = this.getModule().api.validateChatbot;
    if (loggedIn == false) {
      return;
    }
    twitchLog('Restarting chat');
    await validateChatbot();
    this.runChat(message);
  };

  getChatters = async (type: string) => {
    const loggedIn = this.getModule().loggedIn;
    const homeChannel = this.getModule().api.homeChannel;
    if (loggedIn == false) {
      return;
    }
    const axios = require('axios');
    let response = await axios.get(
      'https://tmi.twitch.tv/group/user/' + homeChannel.substr(1) + '/chatters',
    );
    let chArray = [] as string[];
    if (type == 'all') {
      for (let c in response.data.chatters) {
        chArray = chArray.concat(response.data.chatters[c]);
      }
    } else {
      if (response.data.chatters[type] != null) {
        chArray = response.data.chatters[type];
      }
    }
    return chArray;
  };
}
