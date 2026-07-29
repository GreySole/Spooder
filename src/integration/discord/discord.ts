import {
  ApplicationCommandOptionType,
  ChannelType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from 'discord.js';
import fs from 'fs';
import { logEffects, spooderLog } from '../../core/Logging';
import PluginService from '../../core/service/PluginService';
import { runResponseScript } from '../../core/util/ResponseUtil';
import { CommunityModuleInterface } from '../../interface/CommunityModuleInterface';
import {
  ActionExecutionContext,
  ActionNodeDef,
  KeyedObject,
  TriggerNodeDef,
  userDir,
} from '../../Types';
import DiscordApi from './DiscordApi';
import DiscordButtons from './DiscordButtons';
import DiscordChat from './DiscordChat';
import getDiscordRouters from './DiscordRouter';
import DiscordVoice from './DiscordVoice';

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

  getTriggerNodes = (): TriggerNodeDef[] => {
    return [
      {
        id: 'message_received',
        label: 'Message Received',
        description: 'Fires when a message is posted in a server channel or DM.',
        form: {
          guildId: { label: 'Guild ID (optional filter)', type: 'text' },
          channelId: { label: 'Channel ID (optional filter)', type: 'text' },
          requireMention: { label: 'Require Bot Mention', type: 'boolean' },
        },
        defaults: { guildId: '', channelId: '', requireMention: false },
        outputs: [
          { id: 'username', label: 'Username', dataType: 'string' },
          { id: 'message', label: 'Message Content', dataType: 'string' },
          { id: 'guildId', label: 'Guild ID', dataType: 'string' },
          { id: 'channelId', label: 'Channel ID', dataType: 'string' },
        ],
      },
      {
        id: 'button_clicked',
        label: 'Button Clicked',
        description: 'Fires when a user clicks a message button.',
        form: {
          customIdPrefix: { label: 'Custom ID Prefix (optional filter)', type: 'text' },
        },
        defaults: { customIdPrefix: '' },
        outputs: [
          { id: 'customId', label: 'Custom ID', dataType: 'string' },
          { id: 'userId', label: 'User ID', dataType: 'string' },
          { id: 'guildId', label: 'Guild ID', dataType: 'string' },
          { id: 'channelId', label: 'Channel ID', dataType: 'string' },
        ],
      },
    ];
  };

  getActionNodes = (): ActionNodeDef[] => {
    return [
      {
        id: 'send_dm',
        label: 'Send Direct Message',
        form: {
          userId: { label: 'User ID', type: 'text', portType: 'string' },
          message: { label: 'Message', type: 'code', options: { use_response_processor: true }, portType: 'string' },
        },
        defaults: { userId: '', message: '' },
      },
      {
        id: 'message',
        label: 'Send To Channel',
        form: {
          guild: { label: 'Guild ID', type: 'text', portType: 'string' },
          channel: { label: 'Channel ID', type: 'text', portType: 'string' },
          message: { label: 'Message', type: 'code', options: { use_response_processor: true }, portType: 'string' },
          role: { label: 'Role To Tag', type: 'text', portType: 'string' },
          use_link_button: { label: 'Include Link Button', type: 'boolean' },
          link_url: {
            label: 'Link URL',
            type: 'text',
            portType: 'string',
            showif: { variable: 'use_link_button', condition: 'equals', value: true },
          },
          link_label: {
            label: 'Link Button Label',
            type: 'text',
            portType: 'string',
            showif: { variable: 'use_link_button', condition: 'equals', value: true },
          },
        },
        defaults: {
          guild: '',
          channel: '',
          message: '',
          role: '',
          use_link_button: false,
          link_url: '',
          link_label: '',
        },
      },
      {
        id: 'voice_join',
        label: 'Join Voice Channel',
        form: {
          guildId: { label: 'Guild ID', type: 'text', portType: 'string' },
          channelId: { label: 'Channel ID', type: 'text', portType: 'string' },
        },
        defaults: { guildId: '', channelId: '' },
      },
      {
        id: 'voice_leave',
        label: 'Leave Voice Channel',
        form: {},
        defaults: {},
      },
      {
        id: 'voice_play_sound',
        label: 'Play Sound In Voice Channel',
        form: {
          sound: { label: 'Sound', type: 'asset', options: { assetType: 'sound', folder: 'sound', required: true } },
        },
        defaults: { sound: '' },
      },
    ];
  };

  executeActionNode = (nodeId: string, values: KeyedObject, ctx: ActionExecutionContext) => {
    return async () => {
      try {
        switch (nodeId) {
          case 'send_dm': {
            const response = await runResponseScript(
              ctx.eventName,
              ctx.streamMessage,
              ctx.extra,
              values.message,
              false,
            );
            this.chat.sendDM(values.userId, response.response);
            break;
          }
          case 'message': {
            const response = await runResponseScript(
              ctx.eventName,
              ctx.streamMessage,
              ctx.extra,
              values.message,
              false,
            );

            const components = [];
            if (values.use_link_button) {
              components.push(this.buttons.makeLinkButton(values.link_label || 'Button', values.link_url));
            }

            const roleTag = values.role ? this.chat.makeRoleTag(values.role) : null;

            this.chat.sendToChannel(
              values.guild,
              values.channel,
              `${roleTag ? roleTag + ' ' : ''}${response.response}`,
              components,
            );
            break;
          }
          case 'voice_join':
            this.voice.joinVoiceChannel(values.guildId, values.channelId);
            break;
          case 'voice_leave':
            this.voice.leaveVoiceChannel();
            break;
          case 'voice_play_sound':
            this.voice.playAudio(values.sound);
            break;
          default:
            spooderLog(`Unknown discord action node '${nodeId}' for event ${ctx.eventName}`);
        }
      } catch (e) {
        spooderLog(
          `Failed to execute discord action '${nodeId}' for ${ctx.eventName}. Check the event settings to verify it.`,
          e,
        );
      }
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
