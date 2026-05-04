import { ChannelType, Client, Events, Message, TextChannel } from 'discord.js';
import fs from 'fs';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject, userDir } from '../../Types';
import Discord, { discordLog } from './discord';
import DiscordApi from './DiscordApi';
import DiscordVoice from './DiscordVoice';

export default class DiscordChat {
  private discordModule: Discord;
  private client: Client | undefined;
  private voice: DiscordVoice;
  private api: DiscordApi;

  constructor() {
    this.discordModule = ModuleService.getCommunityModule('discord') as Discord;
    this.voice = this.discordModule.voice;
    this.api = this.discordModule.api;
  }

  init() {
    console.log('DiscordChat init');
    this.client = this.discordModule.client;
    this.client?.on(Events.InteractionCreate, async (interaction) => {
      //discordLog("DISCORD INTERACTION", interaction);
      if (!interaction.isChatInputCommand()) {
        return;
      }

      let command = this.discordModule.commands.get(interaction.commandName);

      if (!command) {
        console.error('Not a valid command', interaction.commandName, this.discordModule.commands);
        return;
      }

      try {
        this.api.callPlugins('interaction', interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      }
    });
    this.client?.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.id == this.client?.user?.id) {
        return;
      }
      this.discordModule.lastMessage = {
        author: {
          username: message.author.username,
          id: message.author.id,
          guild: message.guildId != null ? this.api.getGuild(message.guildId)?.name : 'DM',
          channel:
            message.guildId != null
              ? this.api.getChannel(message.channelId, message.guildId)?.name
              : 'DM',
        },
        content: message.content,
      };

      if (message.guildId == null) {
        discordLog('Discord PM', message.author.username, message.content, message.attachments);
        if (
          message.mentions.users.first()?.id != this.discordModule.client?.user?.id &&
          message.mentions.roles.first()?.tags?.botId != this.discordModule.client?.user?.id
        ) {
          message.content = 'DM ' + message.content;
        }
        this.processTagCommand(message);
        this.api.callPlugins('direct-message', message);
        return;
      } else {
        discordLog(
          'Discord',
          this.api.getGuild(message.guildId)?.name,
          this.api.getChannel(message.channelId, message.guildId)?.name,
          message.author.username,
          message.content,
        );

        if (message.content.startsWith('<@' + this.client?.user?.id + '>')) {
          this.processTagCommand(message);
          this.api.callPlugins('mentioned-message', message);
          return;
        }

        if (message.content.toLowerCase() == '!join') {
          if (message.channel.type == ChannelType.GuildVoice) {
            this.voice?.joinVoiceChannel(message.guildId, message.channelId);
            return;
          }
        }

        if (message.content.toLowerCase() == '!leave') {
          this.voice?.leaveVoiceChannel();
          return;
        }
      }

      this.api.callPlugins('message', message);
    });
  }

  sendToChannel(server: string, channel: string, message: string, components?: any[]) {
    const client = this.client;
    const targetServer = client?.guilds.cache.get(server);
    const targetChannel = targetServer?.channels.cache.get(channel);
    if (targetChannel?.isTextBased) {
      (targetChannel as TextChannel).send({ content: message, components: components });
    } else {
      discordLog('Tried to send message to a non-text channel', targetChannel?.name);
    }
  }

  makeUserMentionString(id: string) {
    return '<@' + id + '> ';
  }

  makeRoleTag(roleId: string) {
    return `<@&${roleId}>`;
  }

  chopMessage(message: string) {
    let returnArray = [];
    if (message.length >= 2000) {
      let limit = 2000;
      let totalMessages = Math.ceil(message.length / limit);

      for (let stringpos = 0; stringpos < message.length; stringpos += limit) {
        if (stringpos + limit > message.length) {
          returnArray.push(
            '[' +
              totalMessages +
              '/' +
              totalMessages +
              '] ' +
              message.substring(stringpos, message.length),
          );
        } else {
          returnArray.push(
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
      returnArray.push(message);
    }
    return returnArray;
  }

  sendDM(userId: string, message: string) {
    if (!this.discordModule.loggedIn) {
      return null;
    }
    let msgs = this.chopMessage(message);
    return new Promise((res, rej) => {
      this.api
        .findUser(userId)
        .then((user) => {
          for (let m in msgs) {
            user.send(msgs[m]);
          }
          res('OK');
        })
        .catch((e) => {
          rej(e);
        });
    });
  }

  sendInteraction(userId: string, message: KeyedObject): Promise<Message> {
    return new Promise((res, rej) => {
      this.api
        .findUser(userId)
        .then((user) => {
          res(user.send(message));
        })
        .catch((e) => rej(e));
    });
  }

  async processTagCommand(message: Message) {
    const discordModule = this.discordModule;
    let command = message.content.toLowerCase().split(' ');
    if (command.length >= 2) {
      if (command[1] == 'trust') {
        if (message.author.id == discordModule.config.master) {
          console.log(message.mentions.users.at(1));
          let trustUser = message.mentions.users.at(1);
          if (trustUser == null) {
            message.reply("No target specified. Mention a user after 'trust'.");
            return;
          }
          if (discordModule.config.handlers == null) {
            discordModule.config.handlers = {};
          }
          discordModule.config.handlers[trustUser.id] = { id: trustUser.id };
          fs.writeFileSync(
            userDir + '/settings/discord.json',
            JSON.stringify(discordModule.config),
            'utf-8',
          );
          message.react('👍');
          this.sendDM(
            trustUser.id,
            "My master has entrusted you to handle me. That means you can use my moderation commands in any server I'm in!",
          );
        } else {
          let masterUser = await this.api.findUser(discordModule.config.master);
          message.reply('Only my master ' + masterUser!.username + ' can assign trusted handlers');
        }
      } else if (command[1] == 'tell') {
        if (message.author.id == discordModule.config.master) {
          /*let channels = await twitch.getChannels();
    
              if (shares[command?.[2]] != null) {
                if (channels.includes('#' + command[2])) {
                  sayInChat(
                    message.content.substring(
                      (command[0] + ' ' + command[1] + ' ' + command[2] + ' ').length,
                    ),
                    'twitch',
                    command[2],
                  );
                } else {
                  message.reply(command[2] + "'s share isn't active.");
                }
              } else {
                message.reply(command[2] + ' is not a shared Twitch user.');
              }*/
        }
      } else if (command[1] == 'share') {
        if (message.author.id == discordModule.config.master) {
          /*let channels = await twitch.getChannels();
              if (shares[command?.[2]] != null) {
                let isSharing = channels.includes('#' + command[2]);
                if (command?.[3] == 'start') {
                  if (isSharing == true) {
                    message.reply('Share is already running.');
                    return;
                  }
                  webUI.setShare(command[2], true);
                  message.reply('Share started for ' + command[2] + '!');
                } else if (command?.[3] == 'stop') {
                  if (isSharing == false) {
                    message.reply('Share is not running.');
                    return;
                  }
                  webUI.setShare(command[2], false);
                  message.reply('Share stopped for ' + command[2] + '!');
                } else {
                  message.reply(
                    command[2] + "'s share is " + (isSharing == true ? 'running' : 'not running') + '.',
                  );
                }
              } else {
                message.reply(command[2] + ' is not a shared Twitch user.');
              }*/
        }
      } else if (command[1] == 'leave' && command[2] == 'this') {
        if (this.api.isMaster(message.author.id)) {
          message.react('👍');
          message.guild?.leave();
        }
      }
    }
  }
}
