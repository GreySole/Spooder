import { Request, Response, Router } from 'express';
import {
  Collection,
  REST,
  Routes,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  ChannelType,
  Message,
  User,
  TextChannel,
} from 'discord.js';
import {
  AudioPlayer,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { CommunityModuleInterface } from '../interface/CommunityModuleInterface.ts';
import { logEffects } from '../../core/Logging.ts';
import PluginService from '../../core/service/PluginService.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import UserService from '../../core/service/UserService.ts';
import fs from 'fs';

export function discordLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgCyan'), ...content, logEffects('Reset'));
}

export default class Discord implements CommunityModuleInterface {
  constructor() {}
  getRouters() {
    const router = Router();
    const publicRouter = Router();
    router.post('/saveDiscordConfig', async (req: Request, res: Response) => {
      Object.assign(this.config, req.body);
      fs.writeFile(userDir + '/settings/discord.json', JSON.stringify(this.config), 'utf-8', () => {
        if (this.loggedIn == false && req.body.token != null && req.body.token != '') {
          this.autoLogin();
          res.send({ status: 'SAVED! Logging into Discord...' });
        } else {
          res.send({ status: 'SAVE SUCCESS' });
        }
      });
    });

    router.get('/get_channels', async (req: Request, res: Response) => {
      if (this.loggedIn === false) {
        res.send({ error: 'nologin' });
        return;
      }
      let guilds = this.getGuilds();
      res.send(guilds);
    });

    router.get('/config', async (req: Request, res: Response) => {
      let guilds = this.getGuilds();
      res.send({ config: this.config, guilds: guilds });
    });

    router.get('/user', async (req: Request, res: Response) => {
      let user = await this.client?.users.fetch(req.query.userid as string);
      if (user != null) {
        res.send({ userInfo: user });
      }
    });

    return {
      baseUrl: '/discord',
      router,
      publicRouter,
    };
  }

  onExternalNetworkChanged() {}

  config = fs.existsSync(userDir + '/settings/discord.json')
    ? JSON.parse(fs.readFileSync(userDir + '/settings/discord.json', { encoding: 'utf-8' }))
    : {
        master: '',
        token: '',
        clientId: '',
        autosendngrok: {
          enabled: false,
          destguild: '',
          destchannel: '',
        },
        handlers: {},
        commands: [],
        sharenotif: false,
        crashreport: false,
      };
  client: Client<boolean> | undefined;
  guilds = null;
  loggedIn = false;
  voiceChannel: VoiceConnection | undefined = undefined;
  audioPlayer: AudioPlayer | undefined = undefined;
  audioReceiver = null;
  commands = new Collection();
  lastMessage = {} as KeyedObject;

  autoLogin() {
    return new Promise(async (res, rej) => {
      let discordInfo = this.config;

      if (discordInfo.token != '' && discordInfo.token != null) {
        discordLog('STARTING DISCORD CLIENT');
        await this.startClient(discordInfo.token).catch((e) => {
          rej(e);
        });
        res('success');
      } else {
        discordLog('No Discord token. You can set this in the Config tab.');
      }
    });
  }

  async userVerify(username: string) {
    const users = UserService.getUsers();
    if (Object.keys(users['trusted_users'].discord).includes(username)) {
      let sUsername = username;

      UserService.setPendingUser('discord', sUsername.toLowerCase());

      const response = (await this.sendInteraction(users.trusted_users.verify.discord[username], {
        content: "Hi, it looks like you're creating a login for me. If this is you, click confirm.",
        components: [this.makeConfirmCancelButtons('Yes :D', 'No D:')],
        fetchReply: true,
      })) as any;

      const collectorFilter = (i: any) => i.user.id === users['trusted_users'].discord[username];

      try {
        const confirmation = await response.awaitMessageComponent({
          filter: collectorFilter,
          time: 60000,
        });
        if (confirmation.customId === 'confirm') {
          UserService.verifyUser(username);
          await confirmation.update({ content: 'Verified!', components: [] });
        } else if (confirmation.customId === 'cancel') {
          UserService.cancelPendingUser(username);
          await confirmation.update({ content: 'Declined!', components: [] });
        }
      } catch (e) {
        console.log(e);
        UserService.cancelPendingUser(username);
      }
      return { status: 'found' };
    } else {
      return { status: 'notfound' };
    }
  }

  async getCommands() {
    const activePlugins = PluginService.getActivePlugins();
    let discordInfo = this.config;
    if (discordInfo.commands) {
      discordLog('FOUND COMMANDS');
      let dCommands = discordInfo.commands;
      for (let d in dCommands) {
        this.commands.set(dCommands[d].name, dCommands[d]);
      }
    }
    for (let p in activePlugins) {
      if (activePlugins[p].dSlashCommands != null) {
        for (let d in activePlugins[p].dSlashCommands) {
          console.log('FOUND COMMAND', activePlugins[p].dSlashCommands[d].name);
          this.commands.set(
            activePlugins[p].dSlashCommands[d].name,
            activePlugins[p].dSlashCommands[d],
          );
        }
      }
    }
    if (this.commands.size > 0) {
      console.log(`Started refreshing ${this.commands.size} application (/) commands.`);
      const rest = new REST({ version: '10' }).setToken(discordInfo.token);
      const data: any = await rest.put(Routes.applicationCommands(discordInfo.clientId), {
        body: this.commands,
      });

      discordLog(`Successfully reloaded ${data.length} application (/) commands.`);
    }
  }

  startClient(token: string) {
    return new Promise((res, rej) => {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildIntegrations,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildModeration,
        ],
        partials: [Partials.Channel],
      });

      let client = this.client;
      client.once(Events.ClientReady, (c) => {
        this.loggedIn = true;
        discordLog('Discord Ready! Logged in as ' + c.user.tag, c.user);

        res('success');
      });

      client.on(Events.InteractionCreate, async (interaction) => {
        //discordLog("DISCORD INTERACTION", interaction);
        if (!interaction.isChatInputCommand()) {
          return;
        }

        let command = this.commands.get(interaction.commandName);

        if (!command) {
          console.error('Not a valid command');
          return;
        }

        try {
          this.callPlugins('interaction', interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true,
          });
        }
      });
      client.on(Events.MessageCreate, async (message: Message) => {
        if (message.author.id == client.user?.id) {
          return;
        }
        this.lastMessage = {
          author: {
            username: message.author.username,
            id: message.author.id,
            guild: message.guildId != null ? this.getGuild(message.guildId)?.name : 'DM',
            channel:
              message.guildId != null
                ? this.getChannel(message.channelId, message.guildId)?.name
                : 'DM',
          },
          content: message.content,
        };

        if (message.guildId == null) {
          discordLog('Discord PM', message.author.username, message.content, message.attachments);
          if (
            message.mentions.users.first()?.id != this.client?.user?.id &&
            message.mentions.roles.first()?.tags?.botId != this.client?.user?.id
          ) {
            message.content = 'DM ' + message.content;
          }
          this.processTagCommand(message);
          this.callPlugins('direct-message', message);
          return;
        } else {
          discordLog(
            'Discord',
            this.getGuild(message.guildId)?.name,
            this.getChannel(message.channelId, message.guildId)?.name,
            message.author.username,
            message.content,
          );

          if (message.content.startsWith('<@' + this.client?.user?.id + '>')) {
            this.processTagCommand(message);
            this.callPlugins('mentioned-message', message);
            return;
          }

          if (message.content.toLowerCase() == '!join') {
            if (message.channel.type == ChannelType.GuildVoice) {
              this.joinVoiceChannel(message.guildId, message.channelId);
              return;
            }
          }

          if (message.content.toLowerCase() == '!leave') {
            this.leaveVoiceChannel();
            return;
          }
        }

        this.callPlugins('message', message);
      });
      client.login(token);
    });
  }

  async processTagCommand(message: Message) {
    let command = message.content.toLowerCase().split(' ');
    if (command.length >= 2) {
      if (command[1] == 'trust') {
        if (message.author.id == this.config.master) {
          console.log(message.mentions.users.at(1));
          let trustUser = message.mentions.users.at(1);
          if (trustUser == null) {
            message.reply("No target specified. Mention a user after 'trust'.");
            return;
          }
          if (this.config.handlers == null) {
            this.config.handlers = {};
          }
          this.config.handlers[trustUser.id] = { id: trustUser.id };
          fs.writeFileSync(
            userDir + '/settings/discord.json',
            JSON.stringify(this.config),
            'utf-8',
          );
          message.react('👍');
          this.sendDM(
            trustUser.id,
            "My master has entrusted you to handle me. That means you can use my moderation commands in any server I'm in!",
          );
        } else {
          let masterUser = await this.findUser(this.config.master);
          message.reply('Only my master ' + masterUser!.username + ' can assign trusted handlers');
        }
      } else if (command[1] == 'tell') {
        if (message.author.id == this.config.master) {
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
        if (message.author.id == this.config.master) {
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
        if (this.isMaster(message.author.id)) {
          message.react('👍');
          message.guild?.leave();
        }
      }
    }
  }

  callPlugins(type: string, data: KeyedObject) {
    const activePlugins = PluginService.getActivePlugins();
    for (let a in activePlugins) {
      if (typeof activePlugins[a].onDiscord != 'undefined') {
        try {
          activePlugins[a].onDiscord(type, data);
        } catch (e) {
          discordLog(e);
        }
      }
    }
  }

  isSelf(userid: string) {
    if (this.client?.user?.id == userid) {
      return true;
    }
    return false;
  }

  isMaster(userid: string) {
    if (this.config.master == userid) {
      return true;
    }
    return false;
  }

  isHandler(userid: string) {
    if (this.config.master == userid) {
      return true;
    }
    if (this.config.handlers != null) {
      if (this.config.handlers[userid] != null) {
        return true;
      }
    }
    return false;
  }

  joinVoiceChannel(guildId: string, channelId: string) {
    let targetServer = this.client?.guilds.cache.get(guildId);
    if (!targetServer?.voiceAdapterCreator) {
      return;
    }
    this.voiceChannel = joinVoiceChannel({
      channelId: channelId, //the id of the channel to join (we're using the author voice channel)
      guildId: guildId, //guild id (using the guild where the message has been sent)
      adapterCreator: targetServer.voiceAdapterCreator, //voice adapter creator
    });

    this.callPlugins('voice', {
      event: 'join',
      guildId: guildId,
      channelId: channelId,
      members: this.getChannel(channelId, guildId)?.members,
    });

    this.voiceChannel.receiver.speaking.on('start', (userId) => {
      //actions here
      //onDiscord(type, data);
      this.callPlugins('voice', { event: 'speaking-start', userId: userId });
      //discordLog("Speaking", userId);
    });

    this.voiceChannel.receiver.speaking.on('end', (userId) => {
      this.callPlugins('voice', { event: 'speaking-end', userId: userId });
      //discordLog("Stopped", userId);
    });

    this.voiceChannel.on('stateChange', (oldstate, newstate) => {
      //discordLog('join', 'Connection state change from', oldstate.status, 'to', newstate.status)
      if (
        oldstate.status === VoiceConnectionStatus.Ready &&
        newstate.status === VoiceConnectionStatus.Connecting
      ) {
        this.voiceChannel?.configureNetworking();
      }
    });

    /*this.voiceChannel.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Seems to be reconnecting to a new channel - ignore disconnect
      } catch (error) {
        // Seems to be a real disconnect which SHOULDN'T be recovered from
        connection.destroy();
      }
    });*/

    this.voiceChannel.on('error', (e) => {
      console.log(e);
    });

    this.client?.on('voiceStateUpdate', (oldstate, newstate) => {
      this.callPlugins('voice', { event: 'state-update', oldstate: oldstate, newstate: newstate });
    });

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });
  }

  playAudio(url: string) {
    if (this.audioPlayer != null) {
      let resource = createAudioResource(url);
      this.audioPlayer.play(resource);
      this.callPlugins('audio', { event: 'play', resource: resource });
    }
  }

  pauseAudio() {
    if (this.audioPlayer != null) {
      this.audioPlayer.pause();
      this.callPlugins('audio', { event: 'pause' });
    }
  }

  leaveVoiceChannel() {
    if (this.voiceChannel == null) {
      discordLog("the bot isn't in a voice channel");
      return;
    }
    this.callPlugins('voice', { event: 'leave' });
    this.client?.removeAllListeners('voiceStateUpdate');
    //leave
    this.audioPlayer?.stop();
    this.audioPlayer = undefined;
    this.voiceChannel.destroy();
    this.voiceChannel = undefined;
  }

  getServerByName(servername: string) {
    if (!this.loggedIn) {
      return null;
    }
    let guilds = this.getGuilds();
    //discordLog("GUILDS", servername, guilds);
    for (let g in guilds) {
      if (guilds[g].name == servername) {
        //discordLog("SERVER FOUND", guilds[g].id, guilds[g].name);
        return guilds[g].id;
      }
    }
  }

  getChannelByName(servername: string, channelname: string) {
    if (!this.loggedIn) {
      return null;
    }
    let serverId = this.getServerByName(servername);
    let channels =
      (this.getGuild(serverId)?.channels.cache.toJSON() as KeyedObject) ?? ({} as KeyedObject);
    //discordLog("CHANNELS", channels);
    for (let c in channels) {
      //discordLog("CHANNEL SEARCH",channels[c].name, channelname);
      if (channels[c].name == channelname) {
        return { server: serverId, channel: channels[c].id };
      }
    }
  }

  getServerName(serverId: string) {
    if (!this.loggedIn) {
      return undefined;
    }
    return this.getGuild(serverId)?.name;
  }

  getChannelName(serverId: string, channelId: string) {
    if (!this.loggedIn) {
      return undefined;
    }
    return this.getGuild(serverId)?.channels.cache.get(channelId);
  }

  getUser(userId: string) {
    if (!this.loggedIn) {
      return undefined;
    }
    return this.client?.users.cache.get(userId);
  }

  findUser(userId: string): Promise<User> {
    return new Promise((res, rej) => {
      if (!this.loggedIn) {
        rej(undefined);
        return;
      }
      this.client?.users
        .fetch(userId)
        .then((user) => {
          res(user);
        })
        .catch((reason) => {
          rej(reason);
        });
    });
  }

  getMember(guildId: string, userId: string) {
    let guild = this.client?.guilds.cache.get(guildId);
    if (guild) {
      const member = guild.members.cache.get(userId);
      return member;
    } else {
      return undefined;
    }
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
    if (!this.loggedIn) {
      return null;
    }
    let msgs = this.chopMessage(message);
    return new Promise((res, rej) => {
      this.findUser(userId)
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
      this.findUser(userId)
        .then((user) => {
          res(user.send(message));
        })
        .catch((e) => rej(e));
    });
  }

  getUserName(userId: string) {
    if (!this.loggedIn) {
      return null;
    }
    return this.client?.users.cache.get(userId)?.username;
  }

  getGuilds() {
    if (!this.loggedIn) {
      return null;
    }
    const convertArrayToObject = (array: any, key: any) => {
      const initialValue = {};
      return array.reduce((obj: any, item: any) => {
        return {
          ...obj,
          [item[key]]: item,
        };
      }, initialValue);
    };
    let guildCache = this.client?.guilds.cache;
    let guilds = convertArrayToObject(
      guildCache?.map((g) => {
        let channels = g.channels.cache.map((c) => {
          return {
            id: c.id,
            name: c.name,
            type: c.type,
          };
        });
        return {
          id: g.id,
          name: g.name,
          channels: convertArrayToObject(channels, 'id'),
        };
      }) || 'None',
      'id',
    );
    return guilds;
  }

  getGuild(guildId: string) {
    return this.client?.guilds.cache.get(guildId);
  }

  getChannels(guildId: string) {
    return this.client?.guilds.cache.get(guildId)?.channels.cache;
  }

  getChannel(channelId: string, guildId: string) {
    return this.client?.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  }

  getAvatar(userId: string, avatarId: string) {
    fetch('https://cdn.discordapp.com/avatars/' + userId + '/' + avatarId + '.png');
  }

  sendToChannel(server: string, channel: string, message: KeyedObject) {
    let client = this.client;
    let targetServer = client?.guilds.cache.get(server);
    let targetChannel = targetServer?.channels.cache.get(channel);
    if (targetChannel?.isTextBased) {
      (targetChannel as TextChannel).send(message);
    }
  }

  makeUserMentionString(id: string) {
    return '<@' + id + '> ';
  }

  makeLinkButton(label: string, url: string) {
    const { ButtonStyle, ButtonBuilder, ActionRowBuilder } = require('discord.js');
    const button = new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
    const row = new ActionRowBuilder().addComponents(button);
    return row;
  }

  makeConfirmCancelButtons(confirmLabel: string, cancelLabel: string) {
    const { ButtonStyle, ButtonBuilder, ActionRowBuilder } = require('discord.js');
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Primary);
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    return row;
  }
}
