import { twitchLog } from 'src/integration/twitch/main.ts';
import { userDir, KeyedObject, StreamMessage } from 'src/Types.ts';
import ConfigService from '../service/ConfigService.ts';
import { EventService, sayInChat } from '../service/EventService.ts';
import { ModerationService } from '../service/ModerationService.ts';
import OSCService from '../service/OSCService.ts';
import PluginService from '../service/PluginService.ts';
import ShareService from '../service/ShareService.ts';
import UserService from '../service/UserService.ts';
import { checkResponseTrigger } from './ResponseUtil.ts';
import { spooderLog } from '../Logging.ts';
import fs from 'fs';
import { triggerExistsAndEnabled } from './EventTriggerUtil.ts';

export function convertToStreamMessage(
  userId: string,
  username: string,
  displayName: string,
  platform: string,
  channel: string,
  message: string,
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

export function processStreamMessage(message: StreamMessage, shareId?: string) {
  // Do something with the message
  const modlocks = ModerationService.getModlocks();
  const events = EventService.getEvents();
  const sendToTCP = OSCService.sendToTCP;
  const activePlugins = PluginService.getActivePlugins();
  const shares = ShareService.getShares();
  const sconfig = ConfigService.getConfig();

  message.tags.displayName = message.displayName;
  if (typeof message.message == 'undefined') {
    return;
  }

  if (message.message.startsWith('!')) {
    if (modlocks.spamguard == 1) {
      if (checkForSpamming(message.username) == true) {
        return;
      }
    }

    let command = message.message.substr(1).split(' ');

    if (command[0] == 'stop' && (message.isMod || message.isBroadcaster)) {
      let cEvent = command[1];
      let status = ModerationService.stopEvent(cEvent);
      sayInChat(status);
      return;
    }

    if (command[0] == 'mod' && (message.isMod || message.isBroadcaster)) {
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
          ModerationService.blacklistUser(true, viewer);
          sayInChat(message.username + ' blacklisted ' + viewer);
          sendToTCP('/mod/' + message.username + '/blacklist' + viewer, 1);
        } else if (modAction == 'remove') {
          ModerationService.blacklistUser(false, viewer);
          sayInChat(message.username + ' unblacklisted ' + viewer);
          sendToTCP('/mod/' + message.username + '/blacklist' + viewer, 0);
        }
      } else if (modCommand == 'trust' && message.isBroadcaster) {
        if (command.length > 2) {
          let trustedUser = command[2].startsWith('@')
            ? command[2].substring(1).trim()
            : command[2].trim();

          const modData = UserService.getUsers();
          modData['trusted_users'].permissions[trustedUser] = 'm';
          modData['trusted_users'].twitch[trustedUser] = trustedUser;
          fs.writeFile(userDir + '/settings/mod.json', JSON.stringify(modData), 'utf-8', () => {
            twitchLog('Mod file saved!');
            sayInChat(trustedUser + ' has been added as a trustworthy user for the Mod UI!');
          });
        } else {
          sayInChat('Trust a user to interact with the Mod UI');
        }
      }
    }

    if (command[0] == 'commands') {
      let commandsArray =
        EventService.getStreamChatCommands(true, message.platform, message.channel) ?? [];
      sayInChat("Here's the chat command list: " + commandsArray.join(', '), message.channel);
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

    if (shareId) {
      if (shares[shareId]?.commands.includes(e) == false) {
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
        EventService.runCommands(check.message as StreamMessage, e, 'chat', check.extra);
      }
    }
  }

  for (let p in activePlugins) {
    if (modlocks.plugins[p] != 1) {
      try {
        if (shareId) {
          if (shares[shareId]?.plugins.includes(p)) {
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
        spooderLog(e);
      }
    }
  }
}
