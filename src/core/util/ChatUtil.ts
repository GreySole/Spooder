import { twitchLog } from '../../integration/twitch/main';
import { userDir, KeyedObject, StreamMessage } from '../../Types';
import ConfigService from '../service/ConfigService';
import { EventService, sayInChat } from '../service/EventService';
import { ModerationService } from '../service/ModerationService';
import OSCService from '../service/OSCService';
import PluginService from '../service/PluginService';
import ShareService from '../service/ShareService';
import UserService from '../service/UserService';
import { checkResponseTrigger } from './ResponseUtil';
import { spooderLog } from '../Logging';
import fs from 'fs';
import { triggerExistsAndEnabled } from './EventTriggerUtil';

export function convertToStreamMessage(
  userId: string,
  username: string,
  displayName: string,
  platform: string,
  channel: string,
  message: string,
  messageType: string,
  respond: (response: string) => void,
  emotes: any[],
  tags: KeyedObject,
  isBroadcaster: boolean,
  isMod: boolean,
  isSubscriber: boolean,
  isVIP: boolean,
  isFirstMessage: boolean,
  isReturningChatter: boolean,
): StreamMessage {
  return {
    userId: userId ?? '',
    username: username ?? '',
    displayName: displayName ?? '',
    platform: platform ?? '',
    channel: channel ?? '',
    message: message ?? '',
    messageType: messageType ?? 'chat',
    respond: (response: string) => {},
    emotes: emotes ?? [],
    tags: tags ?? {},
    isBroadcaster: isBroadcaster ?? false,
    isMod: isMod ?? false,
    isSubscriber: isSubscriber ?? false,
    isVIP: isVIP ?? false,
    isFirstMessage: isFirstMessage ?? false,
    isReturningChatter: isReturningChatter ?? false,
  };
}

function checkForSpamming(viewername: string) {
  const modlocks = ModerationService.getModlocks();
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
    sayInChat('Hey, cut that out ' + viewername + ", you're on cooldown for a minute.");
    ModerationService.blacklistUser(true, viewername, 60);
    return true;
  }

  return false;
}

export function processStreamMessage(streamMessage: StreamMessage) {
  // Do something with the message
  const modlocks = ModerationService.getModlocks();
  const modEvents = EventService.getModCommandsAsEvents();
  const spooderEvents = EventService.getEvents();
  const sendToTCP = OSCService.sendToTCP;
  const activePlugins = PluginService.getActivePlugins();
  const sconfig = ConfigService.getConfig();
  const events = { ...modEvents, ...spooderEvents };

  streamMessage.tags.displayName = streamMessage.displayName;
  if (typeof streamMessage.message == 'undefined') {
    return;
  }

  if (streamMessage.message.startsWith('!')) {
    if (modlocks.spamguard == 1) {
      if (checkForSpamming(streamMessage.username) == true) {
        return;
      }
    }

    const command = streamMessage.message.substr(1).split(' ');

    if (command[0] == 'stop' && (streamMessage.isMod || streamMessage.isBroadcaster)) {
      let cEvent = command[1];
      let status = ModerationService.stopEvent(cEvent);
      sayInChat(status);
      return;
    }

    if (command[0] == 'mod' && (streamMessage.isMod || streamMessage.isBroadcaster)) {
      let modCommand = command[1];
      if (modCommand == 'spamguard') {
        let response = ModerationService.setSpamGuard(command[2]);
        sayInChat(response);
      } else if (modCommand == 'lock' || modCommand == 'unlock') {
        let eventtarget = command[2];
        let plugin = command[2];
        let target = command.length >= 4 ? command[3] : undefined;
        if (ModerationService.lockEvent(modCommand, eventtarget) == true && eventtarget != 'all') {
          return;
        }
        if (ModerationService.lockPlugin(modCommand, plugin, target) == true && plugin != 'all') {
          return;
        }
        if (command[2] == 'all') {
          ModerationService.lockEvent(modCommand, eventtarget);
          ModerationService.lockPlugin(modCommand, plugin, target);
          sayInChat(
            streamMessage.username +
              ' ' +
              (modCommand == 'lock' ? 'locked' : 'unlocked') +
              ' all chat commands',
          );
        }
      } else if (modCommand == 'blacklist') {
        let modAction = command[2];
        let viewer = command[3];
        if (modAction == 'add') {
          ModerationService.blacklistUser(true, viewer);
          sayInChat(streamMessage.username + ' blacklisted ' + viewer);
          sendToTCP('/mod/' + streamMessage.username + '/blacklist' + viewer, 1);
        } else if (modAction == 'remove') {
          ModerationService.blacklistUser(false, viewer);
          sayInChat(streamMessage.username + ' unblacklisted ' + viewer);
          sendToTCP('/mod/' + streamMessage.username + '/blacklist' + viewer, 0);
        }
      }
    }

    if (command[0] == 'commands') {
      let commandsArray =
        EventService.getStreamChatCommands(true, streamMessage.platform, streamMessage.channel) ??
        [];
      sayInChat(
        "Here's the chat command list: " + commandsArray.join(', '),
        streamMessage.platform,
        streamMessage.channel,
      );
      return;
    }

    if (command[0] == 'plugins') {
      if (command.length == 1) {
        let pluginList = Object.keys(activePlugins);
        sayInChat(
          'Use this command like !plugins [plugin-name] [plugin-command] to get info on an active plugin. Plugin names are: ' +
            pluginList.join(', '),
        );
        return;
      } else {
        for (let p in activePlugins) {
          if (command[1] == p && command.length == 2) {
            if (activePlugins[p].getExtra('commandList') == null) {
              sayInChat('No commands for ' + p);
              return;
            }
            const commandList = Object.keys(activePlugins[p].getExtra('commandList'));
            sayInChat('Commands for ' + p + ' are: ' + commandList.join(', '));
            return;
          } else if (command[1] == p) {
            if (activePlugins[p].getExtra('commandList') == null) {
              sayInChat('No commands for ' + p);
              return;
            }
            const commandList = activePlugins[p].getExtra('commandList');
            if (commandList[command[2]] != null) {
              sayInChat(commandList[command[2]]);
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
          sayInChat(
            "Pass a command type like '!" +
              sconfig.bot.help_command +
              " event' to show the commands for that type. You can also pass a command like '!" +
              sconfig.bot.help_command +
              " event command' to get a description of what that command does. Active plugins are: [" +
              Object.keys(activePlugins).join(', ') +
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
                sayInChat(
                  events[e].name +
                    ' | chat command: ' +
                    (events[e].triggers.chat
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
                if (activePlugins[p].getExtra('commandList') == null) {
                  sayInChat('No commands for ' + p);
                  return;
                }
                commands = Object.keys(activePlugins[p].getExtra('commandList'));
              } else if (command[2] == p) {
                if (activePlugins[p].getExtra('commandList') == null) {
                  sayInChat('No commands for ' + p);
                  return;
                }
                const commandList = activePlugins[p].getExtra('commandList');
                if (commandList[command[3]] != null) {
                  sayInChat(commandList[command[3]]);
                  done = true;
                }
              }
            }
          }
        }
        if (commands.length == 0 && done == false) {
          sayInChat("I'm not sure what " + command[1] + ' is (^_^;)');
        } else if (done == false) {
          sayInChat(command[1] + ' are: ' + commands.join(', '));
        }
      } else {
        sayInChat("Hi, I'm " + sconfig.bot.bot_name + '. ' + sconfig.bot.introduction);
      }
    }
  }

  for (let e in events) {
    if (modlocks.events[e] == 1) {
      continue;
    }

    if (streamMessage.shareId) {
      if (!ShareService.hasCommandEnabled(streamMessage.shareId, e)) {
        continue;
      }
    }

    if (triggerExistsAndEnabled(events[e].triggers, 'chat')) {
      if (
        events[e].triggers.chat.broadcaster == true ||
        events[e].triggers.chat.mod == true ||
        events[e].triggers.chat.sub == true ||
        events[e].triggers.chat.vip == true
      ) {
        let pass = false;
        if (events[e].triggers.chat.broadcaster == true && streamMessage.isBroadcaster) {
          pass = true;
        }
        if (events[e].triggers.chat.mod == true && streamMessage.isMod) {
          pass = true;
        }
        if (events[e].triggers.chat.sub == true && streamMessage.isSubscriber) {
          pass = true;
        }
        if (events[e].triggers.chat.vip == true && streamMessage.isVIP) {
          pass = true;
        }
        if (pass == false) {
          continue;
        }
      }

      let check = checkResponseTrigger(events[e], streamMessage);
      if (check != null) {
        EventService.runCommands(check.message as StreamMessage, e, 'chat', check.extra);
      }
    }
  }

  for (let p in activePlugins) {
    if (modlocks.plugins[p] != 1) {
      try {
        if (streamMessage.shareId) {
          if (ShareService.hasPluginEnabled(streamMessage.shareId, p)) {
            if (activePlugins[p].onChat != null) {
              activePlugins[p].onChat(streamMessage);
            }
          }
        } else {
          if (activePlugins[p].onChat != null) {
            activePlugins[p].onChat(streamMessage);
          }
        }
      } catch (e) {
        spooderLog(e);
      }
    }
  }
}
