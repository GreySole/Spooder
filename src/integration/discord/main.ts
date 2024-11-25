import { Request, Response, Router } from 'express';
import {
  Collection,
  REST,
  Routes,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Message,
  User,
  TextChannel,
} from 'discord.js';
import { CommunityModuleInterface } from '../interface/CommunityModuleInterface.ts';
import { logEffects } from '../../core/Logging.ts';
import PluginService from '../../core/service/PluginService.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import UserService from '../../core/service/UserService.ts';
import fs from 'fs';
import getDiscordRouters from './DiscordRouter.ts';
import DiscordVoice from './DiscordVoice.ts';
import DiscordChat from './DiscordChat.ts';

export function discordLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgCyan'), ...content, logEffects('Reset'));
}

export default class Discord implements CommunityModuleInterface {
  constructor() {}
  getRouters = getDiscordRouters;

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
  chat: DiscordChat | undefined;
  voice: DiscordVoice | undefined;
  guilds = null;
  loggedIn = false;
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
      const slashCommands = activePlugins[p].getExtra('dSlashCommands');
      if (slashCommands != null) {
        for (let d in slashCommands) {
          this.commands.set(slashCommands[d].name, slashCommands[d]);
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

      this.voice = new DiscordVoice();
      this.chat = new DiscordChat();

      client.login(token);
    });
  }

  callPlugins(type: string, data: KeyedObject) {
    const activePlugins = PluginService.getActivePlugins();
    for (let a in activePlugins) {
      activePlugins[a].onEvent(`discord-${type}`, data);
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
