import { ChannelType, Client, ComponentType, Events, Message, TextChannel } from 'discord.js';
import fs from 'fs';
import { EventService } from '../../core/service/EventService';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject, StreamMessage, userDir } from '../../Types';
import Discord, { discordLog } from './discord';
import DiscordApi from './DiscordApi';
import { DiscordButtonDef } from './DiscordButtons';
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
      if (interaction.isButton()) {
        // A button posted by a Send Interaction node is owned by that node's collector, which
        // acknowledges it. Anything else is a leftover - a button from a previous run of the
        // bot, or one whose node already timed out - and Discord shows the clicker "This
        // interaction failed" if nobody answers within three seconds, so it is deferred here.
        if (!this.pendingInteractionMessages.has(interaction.message.id)) {
          interaction.deferUpdate().catch(() => {});
        }
        return;
      }

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
    this.client?.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.id === this.client?.user?.id) {
        return;
      }
      try {
        // Both arrive partial for any message the bot didn't watch being posted, which is
        // everything from before this session - fetching fills in the message content, the
        // channel and the reaction count the node hands downstream.
        const full = reaction.partial ? await reaction.fetch() : reaction;
        const message = full.message.partial ? await full.message.fetch() : full.message;
        const reactor = user.partial ? await user.fetch() : user;

        const emojiId = full.emoji.id ?? '';
        const emojiName = full.emoji.name ?? '';
        // One string that identifies either kind of emoji and reads as itself on a node: a
        // custom emoji is 'name:id' (unique - two guilds can both have a :pepe:), a standard
        // one is the character. matchesTriggerValues compares the node's picker value against
        // this, so the picker has to store exactly the same shape.
        const emoji = emojiId ? `${emojiName}:${emojiId}` : emojiName;

        const streamMessage = this.buildDiscordStreamMessage(
          reactor.id,
          reactor.username,
          message.guildId,
          message.channelId,
          message.content ?? '',
          {
            platformEventData: {
              emoji,
              emojiName,
              emojiId,
              emojiMarkup: emojiId
                ? `<${full.emoji.animated ? 'a' : ''}:${emojiName}:${emojiId}>`
                : emojiName,
              isCustom: emojiId !== '',
              count: full.count ?? 0,
              messageId: message.id,
              messageContent: message.content ?? '',
            },
          },
        );

        EventService.emitTrigger(
          'discord',
          'reaction_added',
          {
            guildId: message.guildId ?? '',
            channelId: message.channelId,
            emoji,
          },
          streamMessage,
        );
      } catch (error) {
        discordLog('Could not read an added reaction', error);
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

      const wasMentioned =
        message.mentions.users.has(this.client?.user?.id ?? '') ||
        message.mentions.roles.some((role) => role.tags?.botId === this.client?.user?.id);

      const messageStreamMessage = this.buildDiscordStreamMessage(
        message.author.id,
        message.author.username,
        message.guildId,
        message.channelId,
        message.content,
        {
          respond: (txt: string) => message.reply(txt),
          platformEventData: { messageId: message.id },
        },
      );

      EventService.emitTrigger(
        'discord',
        'message_received',
        {
          guildId: message.guildId ?? '',
          channelId: message.channelId,
          requireMention: wasMentioned,
        },
        messageStreamMessage,
      );

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
    if (targetChannel?.isTextBased()) {
      (targetChannel as TextChannel).send({ content: message, components: components });
    } else {
      discordLog('Tried to send message to a non-text channel', targetChannel?.name);
    }
  }

  // Message ids with a Send Interaction node currently collecting on them. The global
  // InteractionCreate listener above fires for every click, including ones a node's own
  // collector is about to handle; this is how it tells those apart.
  private pendingInteractionMessages = new Set<string>();

  // Posts a message with buttons in a channel and resolves when one is clicked, or when the
  // wait runs out.
  async sendButtonPrompt(
    channelId: string,
    content: string,
    buttons: DiscordButtonDef[],
    timeoutSeconds: number,
  ): Promise<KeyedObject> {
    if (!channelId) {
      discordLog('Send Server Interaction has no channel to post in');
      return { error: 'No channel' };
    }
    const channel = await this.client?.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      discordLog('Tried to send an interaction to a non-text channel', channelId);
      return { error: 'Not a text channel' };
    }
    return this.promptOnChannel(channel as TextChannel, content, buttons, timeoutSeconds);
  }

  // The same prompt, in a DM. Discord has no "message a user" endpoint - a DM is a channel like
  // any other, it just has to be opened first, and createDM is idempotent for one that already
  // exists.
  async sendDirectButtonPrompt(
    userId: string,
    content: string,
    buttons: DiscordButtonDef[],
    timeoutSeconds: number,
  ): Promise<KeyedObject> {
    if (!userId) {
      discordLog('Send Direct Interaction has no user to message');
      return { error: 'No user' };
    }
    try {
      const user = await this.api.findUser(userId);
      const channel = await user.createDM();
      return await this.promptOnChannel(
        channel as unknown as TextChannel,
        content,
        buttons,
        timeoutSeconds,
      );
    } catch (error) {
      // Overwhelmingly this is the user having DMs from server members turned off, which is a
      // setting rather than a fault - the graph gets an error output and its Timed Out branch.
      discordLog('Could not open a DM with ' + userId, error);
      return { error: 'Could not DM that user' };
    }
  }

  // The interaction has to be answered within three seconds or Discord marks it failed, so the
  // click is acknowledged with an update that strips the buttons off - which doubles as making
  // the prompt one-shot. A prompt left clickable after its graph moved on is the sharper edge
  // of the two: the second click has nothing collecting it.
  private async promptOnChannel(
    channel: TextChannel,
    content: string,
    buttons: DiscordButtonDef[],
    timeoutSeconds: number,
  ): Promise<KeyedObject> {
    if (buttons.length === 0) {
      discordLog('An interaction node has no buttons to offer');
      return { error: 'No buttons' };
    }

    const rows = this.discordModule.buttons.makeButtons(buttons);
    const message = await channel.send({ content, components: rows as any[] });
    this.pendingInteractionMessages.add(message.id);

    try {
      const interaction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: Math.max(1, timeoutSeconds) * 1000,
      });
      await interaction.update({ components: [] });
      return {
        messageId: message.id,
        buttonId: interaction.customId,
        buttonLabel: buttons.find((b) => b.id === interaction.customId)?.label ?? '',
        userId: interaction.user.id,
        username: interaction.user.username,
      };
    } catch {
      // awaitMessageComponent rejects on expiry rather than resolving with nothing, so this is
      // the timeout path and not an error worth logging as one.
      await message.edit({ components: [] }).catch(() => {});
      return { messageId: message.id, timedOut: true };
    } finally {
      this.pendingInteractionMessages.delete(message.id);
    }
  }

  makeUserMentionString(id: string) {
    return '<@' + id + '> ';
  }

  buildDiscordStreamMessage(
    userId: string,
    username: string,
    guildId: string | null,
    channelId: string,
    content: string,
    overrides: Partial<StreamMessage> = {},
  ): StreamMessage {
    // platformEventData is merged rather than overwritten by `overrides`. A trigger node's
    // outputs are resolved out of this object (see resolveNodeValues), so a caller adding one
    // field to it used to silently drop guild/channel/user - which is why Button Clicked's
    // declared Guild ID and Channel ID outputs never resolved to anything.
    const { platformEventData, ...rest } = overrides;
    return {
      userId,
      username,
      displayName: username,
      platform: 'discord',
      channel: channelId,
      message: content,
      messageType: 'discord-message',
      respond: () => {},
      emotes: [],
      tags: {},
      isBroadcaster: false,
      isMod: false,
      isSubscriber: false,
      isVIP: false,
      isFirstMessage: false,
      isReturningChatter: false,
      ...rest,
      platformEventData: { guildId, channelId, userId, ...platformEventData },
    };
  }

  // Replying needs the message itself, and a message can only be fetched through the channel
  // that holds it - there is no lookup by id alone. Fetched rather than read from cache so a
  // reply still lands on a message the bot didn't see posted (an older one, or one from before
  // the last reconnect).
  async replyToMessage(
    channelId: string,
    messageId: string,
    content: string,
    mentionAuthor = true,
  ): Promise<Message | undefined> {
    if (!channelId || !messageId) {
      discordLog('Reply needs both a channel ID and a message ID', { channelId, messageId });
      return undefined;
    }
    try {
      const channel = await this.client?.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        discordLog('Tried to reply in a non-text channel', channelId);
        return undefined;
      }
      const target = await (channel as TextChannel).messages.fetch(messageId);
      return await target.reply({
        content,
        // Discord pings the author of the replied-to message by default. An automation
        // answering every message in a channel is exactly where that gets unwelcome, so it is
        // the graph's choice rather than Discord's.
        allowedMentions: { repliedUser: mentionAuthor },
      });
    } catch (error) {
      discordLog('Failed to reply to message ' + messageId, error);
      return undefined;
    }
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
