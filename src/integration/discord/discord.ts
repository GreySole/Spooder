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
  ApplicationCommandOptionType,
  ChannelType,
} from 'discord.js';
import { CommunityModuleInterface } from '../../interface/CommunityModuleInterface';
import { logEffects } from '../../core/Logging';
import PluginService from '../../core/service/PluginService';
import { userDir, KeyedObject } from '../../Types';
import UserService from '../../core/service/UserService';
import fs from 'fs';
import getDiscordRouters from './DiscordRouter';
import DiscordVoice from './DiscordVoice';
import DiscordChat from './DiscordChat';
import DiscordApi from './DiscordApi';
import DiscordButtons from './DiscordButtons';

export function discordLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgCyan'), ...content, logEffects('Reset'));
}

export default class Discord implements CommunityModuleInterface {
  client: Client<boolean> | undefined;

  voice!: DiscordVoice;
  api!: DiscordApi;
  chat!: DiscordChat;
  buttons = DiscordButtons();
  guilds = null;
  loggedIn = false;
  commands = new Collection();
  lastMessage = {} as KeyedObject;

  constructor() {}

  getRouters = getDiscordRouters;

  onExternalNetworkChanged() {}
  getResponseHandlers() {
    return { descriptions: [], functions: {} };
  }

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

  sendDM = (userId: string, message: string) => {};
  sendToChannel = (server: string, channel: string, message: string, components?: any[]) => {};

  autoLogin() {
    return new Promise<boolean>(async (res, rej) => {
      let discordInfo = this.config;

      if (discordInfo.token != '' && discordInfo.token != null) {
        discordLog('STARTING DISCORD CLIENT');
        await this.startClient(discordInfo.token).catch((e) => {
          console.error('Discord login failed:', e);
          res(false);
        });
        res(true);
      } else {
        discordLog('No Discord token.');
        res(false);
      }
    });
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

      this.api = new DiscordApi();
      this.voice = new DiscordVoice();
      this.chat = new DiscordChat();

      client.login(token).then(() => {
        this.chat.init();
        this.sendDM = this.chat.sendDM.bind(this.chat);
        this.sendToChannel = this.chat.sendToChannel.bind(this.chat);
      });
    });
  }

  getPluginFunctions = () => {
    if (this.loggedIn === false) {
      return {};
    }
    return {
      isSelf: this.api.isSelf.bind(this.api),
      isMaster: this.api.isMaster.bind(this.api),
      isHandler: this.api.isHandler.bind(this.api),
      getChannel: this.api.getChannel.bind(this.api),
      getMessageRange: this.api.getMessageRange.bind(this.api),
      getRoles: this.api.getRoles.bind(this.api),
      getUser: this.api.getUser.bind(this.api),
      findUser: this.api.findUser.bind(this.api),
      sendDM: this.chat.sendDM.bind(this.chat),
      voice: {
        join: this.voice.joinVoiceChannel.bind(this.voice),
        leave: this.voice.leaveVoiceChannel.bind(this.voice),
        playSound: this.voice.playAudio.bind(this.voice),
        startListening: this.voice.startListening.bind(this.voice),
        stopListening: this.voice.stopListening.bind(this.voice),
      },
    };
  };

  convertSlashCommandOptionType(type: string) {
    ChannelType.GuildText;
    ChannelType.GuildVoice;
    switch (type) {
      case 'string':
        return ApplicationCommandOptionType.String;
      case 'integer':
        return ApplicationCommandOptionType.Integer;
      case 'number':
        return ApplicationCommandOptionType.Number;
      case 'boolean':
        return ApplicationCommandOptionType.Boolean;
      case 'user':
        return ApplicationCommandOptionType.User;
      case 'attachment':
        return ApplicationCommandOptionType.Attachment;
      case 'channel':
        return ApplicationCommandOptionType.Channel;
      case 'role':
        return ApplicationCommandOptionType.Role;
      case 'mentionable':
        return ApplicationCommandOptionType.Mentionable;
      case 'sub_command':
        return ApplicationCommandOptionType.Subcommand;
      case 'sub_command_group':
        return ApplicationCommandOptionType.SubcommandGroup;
      default:
        return ApplicationCommandOptionType.String; // Default to STRING
    }
  }

  async onPluginsLoaded() {
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
      if (slashCommands) {
        for (let d in slashCommands) {
          console.log('ADDING SLASH COMMAND', slashCommands[d]);
          for (let o in slashCommands[d].options) {
            if (!isNaN(slashCommands[d].options[o].type)) {
              continue;
            }
            slashCommands[d].options[o].type = this.convertSlashCommandOptionType(
              slashCommands[d].options[o].type,
            );
          }
          this.commands.set(slashCommands[d].name, slashCommands[d]);
        }
      }
    }
    if (this.commands.size > 0) {
      //console.log(`Started refreshing ${this.commands.size} application (/) commands.`);
      const rest = new REST({ version: '10' }).setToken(discordInfo.token);
      const data: any = await rest.put(Routes.applicationCommands(discordInfo.clientId), {
        body: this.commands,
      });
      console.log(this.commands);
      discordLog(`Successfully reloaded ${data.length} application (/) commands.`);
    }
  }
}
