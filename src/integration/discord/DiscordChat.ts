import { ChannelType, Events, Message } from 'discord.js';
import ModuleService from 'src/core/service/ModuleService.ts';
import { userDir } from 'src/Types.ts';
import Discord, { discordLog } from './main.ts';
import fs from 'fs';

export default class DiscordChat {
  constructor() {
    const discordModule = this.getModule();
    const client = discordModule.client;
    client?.on(Events.InteractionCreate, async (interaction) => {
      //discordLog("DISCORD INTERACTION", interaction);
      if (!interaction.isChatInputCommand()) {
        return;
      }

      let command = discordModule.commands.get(interaction.commandName);

      if (!command) {
        console.error('Not a valid command');
        return;
      }

      try {
        discordModule.callPlugins('interaction', interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      }
    });
    client?.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.id == client.user?.id) {
        return;
      }
      discordModule.lastMessage = {
        author: {
          username: message.author.username,
          id: message.author.id,
          guild: message.guildId != null ? discordModule.getGuild(message.guildId)?.name : 'DM',
          channel:
            message.guildId != null
              ? discordModule.getChannel(message.channelId, message.guildId)?.name
              : 'DM',
        },
        content: message.content,
      };

      if (message.guildId == null) {
        discordLog('Discord PM', message.author.username, message.content, message.attachments);
        if (
          message.mentions.users.first()?.id != discordModule.client?.user?.id &&
          message.mentions.roles.first()?.tags?.botId != discordModule.client?.user?.id
        ) {
          message.content = 'DM ' + message.content;
        }
        this.processTagCommand(message);
        discordModule.callPlugins('direct-message', message);
        return;
      } else {
        discordLog(
          'Discord',
          discordModule.getGuild(message.guildId)?.name,
          discordModule.getChannel(message.channelId, message.guildId)?.name,
          message.author.username,
          message.content,
        );

        if (message.content.startsWith('<@' + discordModule.client?.user?.id + '>')) {
          this.processTagCommand(message);
          discordModule.callPlugins('mentioned-message', message);
          return;
        }

        if (message.content.toLowerCase() == '!join') {
          if (message.channel.type == ChannelType.GuildVoice) {
            discordModule.voice?.joinVoiceChannel(message.guildId, message.channelId);
            return;
          }
        }

        if (message.content.toLowerCase() == '!leave') {
          discordModule.voice?.leaveVoiceChannel();
          return;
        }
      }

      discordModule.callPlugins('message', message);
    });
  }

  getModule = () => {
    return ModuleService.getCommunityModule('discord') as Discord;
  };

  async processTagCommand(message: Message) {
    const discordModule = this.getModule();
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
          discordModule.sendDM(
            trustUser.id,
            "My master has entrusted you to handle me. That means you can use my moderation commands in any server I'm in!",
          );
        } else {
          let masterUser = await discordModule.findUser(discordModule.config.master);
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
        if (discordModule.isMaster(message.author.id)) {
          message.react('👍');
          message.guild?.leave();
        }
      }
    }
  }
}
