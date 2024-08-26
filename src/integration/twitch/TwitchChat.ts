import fs from 'fs';
import tmi from 'tmi.js';
import STwitch, { twitchLog } from './main.ts';
import ConfigManager from '../../core/manager/ConfigManager.ts';
import { EventManager, checkResponseTrigger } from '../../core/manager/EventManager.ts';
import { ModerationManager } from '../../core/manager/ModerationManager.ts';
import ModuleManager from '../../core/manager/ModuleManager.ts';
import PluginManager from '../../core/manager/PluginManager.ts';
import ShareManager from '../../core/manager/ShareManager.ts';
import { CoreModule, KeyedObject, StreamMessage, backendDir } from '../../Types.ts';
import UserManager from '../../core/manager/UserManager.ts';
import OSCManager from '../../core/manager/OSCManager.ts';

function stringifyArray(a: string[]) {
  return a.join(', ');
}

export default class TwitchChat {
  lastMessage: KeyedObject = {};
  chat: tmi.Client | undefined = undefined;

  getModule = () => {
    return ModuleManager.getStreamModule('twitch') as STwitch;
  };

  twitchjsify = (channel: string, tags: KeyedObject, txt: string): StreamMessage => {
    const botUsername = this.getModule().api.botUsername;
    let emotes = tags.emotes;
    let newEmotes = [];
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

    let message = {
      channel: channel.replace('#', ''),
      respond: ((responseTxt: string) => {
        this.sayInChat(responseTxt, channel.replace('#', ''));
      }).bind(this),
      username: tags.username,
      botUsername: botUsername,
      displayName: tags['display-name'],
      tags: tags,
      message: txt,
      userId: tags['user-id'],
      platform: 'twitch',
      emotes: newEmotes,
      event: undefined,
      isFirstMessage: tags['first-msg'] == true,
      isReturningChatter: tags['returning-chatter'] == true,
      isBroadcaster: tags.badges?.broadcaster == true,
      isMod: tags.mod == true,
      isSubscriber: tags.subscriber == true,
      isVIP: tags.badges?.vip == true,
    } as StreamMessage;

    return message;
  };

  processDeletedMessage = (
    channel: string,
    username: string,
    deletedMessage: string,
    userstate: KeyedObject,
  ) => {
    const activePlugins = PluginManager.getActivePlugins();
    const homeChannel = this.getModule().api.homeChannel;
    const shares = ShareManager.getShares();
    let message = {
      channel: channel.replace('#', ''),
      platform: 'twitch',
      username: username,
      deletedMessage: deletedMessage,
      userstate: userstate,
    };

    for (let p in activePlugins) {
      try {
        if (message.channel != homeChannel) {
          if (shares[message.channel]?.plugins.includes(p)) {
            if (activePlugins[p].onEvent != null) {
              activePlugins[p].onEvent('messagedeleted', message);
            }
          }
        } else {
          if (activePlugins[p].onEvent != null) {
            activePlugins[p].onEvent('messagedeleted', message);
          }
        }
      } catch (e) {
        twitchLog(e);
      }
    }
  };

  processMessage = (channel: string, tags: KeyedObject, txt: string, self: boolean) => {
    const modlocks = ModerationManager.getModlocks();
    const events = EventManager.getEvents();
    const sendToTCP = OSCManager.sendToTCP;
    const activePlugins = PluginManager.getActivePlugins();
    const shares = ShareManager.getShares();
    const sconfig = ConfigManager.getConfig();
    const homeChannel = this.getModule().api.homeChannel;

    let message = this.twitchjsify(channel, tags, txt);
    message.tags.displayName = message.displayName;
    if (typeof message.message == 'undefined') {
      return;
    }
    this.lastMessage = {
      username: message.username,
      channel: message.channel,
      message: message.message,
    };

    if (message.message.startsWith('!')) {
      if (modlocks.spamguard == 1) {
        if (this.checkForSpamming(message.username) == true) {
          return;
        }
      }

      let command = message.message.substr(1).split(' ');

      if (command[0] == 'stop' && (message.isMod || message.isBroadcaster)) {
        let cEvent = command[1];
        let status = ModerationManager.stopEvent(cEvent);
        this.sayInChat(status);
        return;
      }

      if (command[0] == 'mod' && (message.isMod || message.isBroadcaster)) {
        let modCommand = command[1];
        if (modCommand == 'spamguard') {
          let response = ModerationManager.setSpamGuard(command[2]);
          this.sayInChat(response);
        } else if (modCommand == 'lock' || modCommand == 'unlock') {
          let eventtarget = command[2];
          let plugin = command[2];
          let target = command.length >= 4 ? command[3] : undefined;
          if (
            ModerationManager.lockEvent(modCommand, eventtarget) == true &&
            eventtarget != 'all'
          ) {
            return;
          }
          if (ModerationManager.lockPlugin(modCommand, plugin, target) == true && plugin != 'all') {
            return;
          }
          if (command[2] == 'all') {
            ModerationManager.lockEvent(modCommand, eventtarget);
            ModerationManager.lockPlugin(modCommand, plugin, target);
            this.sayInChat(
              message.username +
                ' ' +
                (modCommand == 'lock' ? 'locked' : 'unlocked') +
                ' all chat commands',
            );
          }
        } else if (modCommand == 'blacklist') {
          let modAction = command[2];
          let viewer = command[3];
          if (modAction == 'add') {
            modlocks.blacklist[viewer] == 1;
            this.sayInChat(message.username + ' blacklisted ' + viewer);
            sendToTCP('/mod/' + message.username + '/blacklist' + viewer, 1);
          } else if (modAction == 'remove') {
            modlocks.blacklist[viewer] == 0;
            this.sayInChat(message.username + ' unblacklisted ' + viewer);
            sendToTCP('/mod/' + message.username + '/blacklist' + viewer, 0);
          }
          fs.writeFile(
            backendDir + '/settings/mod-blacklist.json',
            JSON.stringify(modlocks.blacklist),
            'utf-8',
            () => {
              twitchLog('Mod file saved!');
            },
          );
        } else if (modCommand == 'trust' && message.isBroadcaster) {
          if (command.length > 2) {
            let trustedUser = command[2].startsWith('@')
              ? command[2].substring(1).trim()
              : command[2].trim();

            const modData = UserManager.getUsers();
            modData['trusted_users'].permissions[trustedUser] = 'm';
            modData['trusted_users'].twitch[trustedUser] = trustedUser;
            fs.writeFile(
              backendDir + '/settings/mod.json',
              JSON.stringify(modData),
              'utf-8',
              () => {
                twitchLog('Mod file saved!');
                this.sayInChat(
                  trustedUser + ' has been added as a trustworthy user for the Mod UI!',
                );
              },
            );
          } else {
            this.sayInChat('Trust a user to interact with the Mod UI');
          }
        }
      }

      if (command[0] == 'verify') {
        const pendingUser = UserManager.getPendingUser(message.username);
        if (pendingUser.vtype == 'twitch' && pendingUser.verified == false) {
          pendingUser.verified = true;
          this.sayInChat(
            message.username + " You're verified! Now set a username and password for my records.",
          );
        }
      }

      if (command[0] == 'commands') {
        let commandsArray = this.getChatCommands(message.channel) ?? [];
        this.sayInChat(
          "Here's the chat command list: " + commandsArray.join(', '),
          message.channel,
        );
        return;
      }

      if (command[0] == 'plugins') {
        if (command.length == 1) {
          let pluginList = Object.keys(activePlugins);
          this.sayInChat(
            'Use this command like !plugins [plugin-name] [plugin-command] to get info on an active plugin. Plugin names are: ' +
              pluginList.join(', '),
          );
          return;
        } else {
          for (let p in activePlugins) {
            if (command[1] == p && command.length == 2) {
              let commandList = Object.keys(activePlugins[p].commandList);
              this.sayInChat('Commands for ' + p + ' are: ' + commandList.join(', '));
              return;
            } else if (command[1] == p) {
              if (activePlugins[p].commandList[command[2]] != null) {
                this.sayInChat(activePlugins[p].commandList[command[2]]);
                return;
              }
            }
          }
        }
      }

      if (command[0] == sconfig.bot.help_command) {
        if (command.length > 1) {
          let commands = [];
          let done = false;

          if (command[1] == 'help') {
            this.sayInChat(
              "Pass a command type like '!" +
                sconfig.bot.help_command +
                " event' to show the commands for that type. You can also pass a command like '!" +
                sconfig.bot.help_command +
                " event command' to get a description of what that command does. Active plugins are: [" +
                stringifyArray(Object.keys(activePlugins)) +
                ']',
            );
            return;
          }

          if (command[1] == 'event' || command[1] == 'events') {
            for (let e in events) {
              if (command.length == 2) {
                commands.push(e);
              } else {
                if (command[2] == e) {
                  this.sayInChat(
                    events[e].name +
                      ' | chat command: ' +
                      (events[e].triggers.chat.enabled
                        ? events[e].triggers.chat.command
                        : ' No chat command') +
                      ' | Reward: ' +
                      (events[e].triggers.redemption.enabled
                        ? 'It has a channel point reward'
                        : 'No channel point reward') +
                      ' | OSC: ' +
                      (events[e].triggers.osc.enabled ? 'Triggered by OSC' : 'No OSC Trigger') +
                      ' | Description: ' +
                      events[e].description,
                  );
                  done = true;
                }
              }
            }
          }

          if (command[1] == 'plugin' || command[1] == 'plugins') {
            for (let p in activePlugins) {
              if (command.length == 2) {
                commands.push(p);
              } else {
                if (command[2] == p && command.length == 3) {
                  commands = Object.keys(activePlugins[p].commandList);
                } else if (command[2] == p) {
                  if (activePlugins[p].commandList[command[3]] != null) {
                    this.sayInChat(activePlugins[p].commandList[command[3]]);
                    done = true;
                  }
                }
              }
            }
          }
          if (commands.length == 0 && done == false) {
            this.sayInChat("I'm not sure what " + command[1] + ' is (^_^;)');
          } else if (done == false) {
            this.sayInChat(command[1] + ' are: ' + stringifyArray(commands));
          }
        } else {
          this.sayInChat("Hi, I'm " + sconfig.bot.bot_name + '. ' + sconfig.bot.introduction);
        }
      }
    }

    for (let e in events) {
      if (message.channel != homeChannel) {
        if (!shares[message.channel]?.commands.includes(e)) {
          continue;
        }
      }

      if (modlocks.events[e] == 1) {
        continue;
      }
      if (events[e].triggers.chat.enabled && self == false) {
        if (
          events[e].triggers.chat.broadcaster == true ||
          events[e].triggers.chat.mod == true ||
          events[e].triggers.chat.sub == true ||
          events[e].triggers.chat.vip == true
        ) {
          let pass = false;
          if (events[e].triggers.chat.broadcaster == true && message.isBroadcaster) {
            pass = true;
          }
          if (events[e].triggers.chat.mod == true && message.isMod) {
            pass = true;
          }
          if (events[e].triggers.chat.sub == true && message.isSubscriber) {
            pass = true;
          }
          if (events[e].triggers.chat.vip == true && message.isVIP) {
            pass = true;
          }
          if (pass == false) {
            continue;
          }
        }

        let check = checkResponseTrigger(events[e], message);
        if (check != null) {
          EventManager.runCommands(check.message as StreamMessage, e, 'chat', check.extra);
        }
      }
    }

    for (let p in activePlugins) {
      if (modlocks.plugins[p] != 1) {
        try {
          if (message.channel != homeChannel) {
            if (shares[message.channel]?.plugins.includes(p)) {
              if (activePlugins[p].onChat != null) {
                activePlugins[p].onChat(message);
              }
            }
          } else {
            if (activePlugins[p].onChat != null) {
              activePlugins[p].onChat(message);
            }
          }
        } catch (e) {
          twitchLog(e);
        }
      }
    }
  };

  checkForSpamming = (viewername: string) => {
    const modlocks = ModerationManager.getModlocks();
    if (modlocks.blacklist[viewername] == null) {
      modlocks.blacklist[viewername] = {
        active: 0,
        timeout: null,
        commandCount: 1,
        lastCommand: Date.now(),
      };
      return false;
    }

    if (modlocks.blacklist[viewername].active == 1) {
      if (Date.now() >= modlocks.blacklist[viewername].timeout) {
        modlocks.blacklist[viewername].active = 0;
        modlocks.blacklist[viewername].commandCount = 1;
      } else {
        return true;
      }
    }

    if (Date.now() - modlocks.blacklist[viewername].lastCommand <= 2000) {
      modlocks.blacklist[viewername].commandCount++;
    } else {
      modlocks.blacklist[viewername].commandCount = 1;
    }
    modlocks.blacklist[viewername].lastCommand = Date.now();
    if (modlocks.blacklist[viewername].commandCount >= 6) {
      this.sayInChat('Hey, cut that out ' + viewername + ", you're on cooldown for a minute.");
      modlocks.blacklist[viewername].active = 1;
      modlocks.blacklist[viewername].timeout = Date.now() + 60000;
      return true;
    }

    return false;
  };

  processCheer = (channel: string, userstate: KeyedObject, message: string) => {
    twitchLog('CHEER', userstate);
  };

  runChat = async (startCase?: string) => {
    const shares = ShareManager.getShares();
    const botUsername = this.getModule().api.botUsername;
    const oauth = this.getModule().oauth;
    const onAuthenticationFailure = this.getModule().api.onAuthenticationFailure;
    const homeChannel = this.getModule().api.homeChannel;
    const broadcasterUserID = this.getModule().api.broadcasterUserID;
    const getEventSubs = this.getModule().eventsub.getEventSubs;
    const isStreamerLive = this.getModule().api.isStreamerLive;

    twitchLog('Running chat...');
    if (this.chat != null) {
      if (this.chat.readyState() == 'OPEN' || this.chat.readyState() == 'CONNECTING') {
        await this.chat.disconnect();
      }
      this.chat.removeListener('message', this.processMessage.bind(this));
      this.chat.removeListener('cheer', this.processCheer.bind(this));
    }
    console.log('STARTING CHAT', {
      username: botUsername,
      password: oauth.token,
    });
    this.chat = new tmi.Client({
      options: { debug: true },
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

        let subs = await getEventSubs();
        console.log('SUBS', subs);
        let subtype = '';

        for (let s in subs.data) {
          subtype = subs.data[s].type;
          let bid = subs.data[s].condition.broadcaster_user_id;

          if (subtype == 'stream.online' && bid != broadcasterUserID) {
            for (let s in shares) {
              if (shares[s].twitchid == bid) {
                isStreamerLive(s).then((isLive) => {
                  if (isLive == true) {
                    ShareManager.setShare(s, true);
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
    this.chat.on('messagedeleted', this.processDeletedMessage.bind(this));
    this.chat.on('cheer', this.processCheer.bind(this));
  };

  getChatCommands = (shareChannel: string) => {
    const loggedIn = this.getModule().loggedIn;
    const homeChannel = this.getModule().api.homeChannel;
    const shares = ShareManager.getShares();
    const events = EventManager.getEvents();
    if (loggedIn == false) {
      return;
    }
    let commandsArray = [];

    for (let e in events) {
      //console.log("CHECKING ", e);
      if (shareChannel != null && shareChannel != homeChannel) {
        if (!shares[shareChannel].commands.includes(e)) {
          //console.log("Command skipped", e, shareChannel);
          continue;
        }
      }
      if (events[e].triggers.chat.enabled == true) {
        if (events[e].triggers.chat.command.startsWith('!')) {
          commandsArray.push(events[e].triggers.chat.command);
        }
      }
    }
    return commandsArray;
  };

  sayInChat = async (message: string, chatChannel?: string) => {
    const loggedIn = this.getModule().loggedIn;
    const homeChannel = this.getModule().api.homeChannel;
    if (loggedIn == false) {
      return;
    }
    if (chatChannel == null) {
      chatChannel = homeChannel;
    }
    if (message == null || message == '') {
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
    this.chat?.disconnect();
  };

  joinChannel = async (channelname: string, joinmsg: string) => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    await this.chat?.join(channelname).catch((e) => {
      twitchLog('Twitch chat join fail', e.message);
    });
    this.sayInChat(joinmsg, channelname);
  };

  leaveChannel = async (channelname: string, partmsg: string) => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    this.sayInChat(partmsg, channelname);
    await this.chat?.part(channelname).catch((e) => {
      twitchLog('Twitch chat leave fail', e.message);
    });
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
