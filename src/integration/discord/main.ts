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
import DiscordApi from './DiscordApi.ts';
import DiscordButtons from './DiscordButtons.ts';

export function discordLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgCyan'), ...content, logEffects('Reset'));
}

export default class Discord implements CommunityModuleInterface {
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
  client: Client<boolean> | undefined;

  voice!: DiscordVoice;
  api!: DiscordApi;
  chat!: DiscordChat;
  buttons = DiscordButtons();
  guilds = null;
  loggedIn = false;
  commands = new Collection();
  lastMessage = {} as KeyedObject;

  sendDM = this.chat?.sendDM.bind(this.chat);
  sendToChannel = this.chat?.sendToChannel.bind(this.chat);

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

  getPluginFunctions = () => {
    return {
      isSelf: this.api.isSelf.bind(this),
      isMaster: this.api.isMaster.bind(this),
      isHandler: this.api.isHandler.bind(this),
      getServerByName: this.api.getServerByName.bind(this),
      getChannelByName: this.api.getChannelByName.bind(this),
      getMessageRange: this.api.getMessageRange.bind(this),
      getRoles: this.api.getRoles.bind(this),
      getUser: this.api.getUser.bind(this),
      findUser: this.api.findUser.bind(this),
    };
  };

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
      //console.log(`Started refreshing ${this.commands.size} application (/) commands.`);
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

      this.api = new DiscordApi();
      this.voice = new DiscordVoice();
      this.chat = new DiscordChat();

      client.login(token).then(() => {
        this.chat.init();
      });
    });
  }
}
