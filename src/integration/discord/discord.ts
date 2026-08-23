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
  NodeForm,
  NodePortDef,
  TriggerNodeDef,
  userDir,
} from '../../Types';
import DiscordApi from './DiscordApi';
import DiscordButtons, { MAX_BUTTONS } from './DiscordButtons';
import DiscordChat from './DiscordChat';
import getDiscordRouters from './DiscordRouter';
import DiscordVoice from './DiscordVoice';

export function discordLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgCyan'), ...content, logEffects('Reset'));
}

// How many buttons an interaction node offers is a count on the node, the way the OSC trigger
// declares how many args its address carries - the label fields and the execution branches are
// both grown from it. `button0`..`buttonN-1` are the field names, the interaction customIds and
// the exec port ids all at once, which is what lets a click name its own branch.
//
// The editor grows the same slots from the same count (see buildInteractionForm in
// nodeDefLookup.ts); keep the two in step.
function interactionButtons(values: KeyedObject) {
  const declared = Number(values.buttonCount);
  const count = Number.isFinite(declared)
    ? Math.min(Math.max(Math.floor(declared), 0), MAX_BUTTONS)
    : 0;
  return Array.from({ length: count }, (_unused, i) => ({
    id: `button${i}`,
    // Discord rejects a button with no label, and a slot the user has counted but not named
    // still has to exist or the branches would stop matching the buttons.
    label: String(values[`button${i}`] ?? '').trim() || `Button ${i + 1}`,
    style: String(values[`button${i}Style`] ?? ''),
  }));
}

// Used when the node's own wait is missing or nonsensical. Discord's collectors have no
// implicit ceiling, and a prompt nobody answers would otherwise hold its branch forever.
const DEFAULT_INTERACTION_WAIT = 60;

// Everything both interaction nodes share: the message, how many buttons, how long to wait,
// and what comes back. Only where the prompt is posted differs.
const INTERACTION_FORM: NodeForm = {
  message: {
    label: 'Message',
    type: 'code',
    options: { use_response_processor: true },
    portType: 'string',
  },
  buttonCount: { label: 'Button Count', type: 'number' },
  timeout: { label: 'Wait (seconds)', type: 'number', portType: 'number' },
};

// The style slots for the buttons a new node starts with, so those two read 'Primary' rather
// than 'None' on a freshly placed card. Slots grown past the starting count aren't seeded -
// defaults are only applied when a node is created - and fall back to Primary when sent.
const INTERACTION_DEFAULTS = {
  message: '',
  buttonCount: 2,
  button0Style: 'primary',
  button1Style: 'primary',
  timeout: DEFAULT_INTERACTION_WAIT,
};

const INTERACTION_OUTPUTS: NodePortDef[] = [
  { id: 'buttonId', label: 'Button ID', dataType: 'string' },
  { id: 'buttonLabel', label: 'Button Label', dataType: 'string' },
  { id: 'userId', label: 'User ID', dataType: 'string' },
  { id: 'username', label: 'Username', dataType: 'string' },
  { id: 'messageId', label: 'Message ID', dataType: 'string' },
];

// The button branches are added to this by the editor, which is the only side that knows the
// labels the user typed. Declaring the timeout branch here keeps the node branching even
// before a button is named.
const INTERACTION_EXEC_OUTPUTS = [{ id: 'timeout', label: 'Timed Out' }];

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
          // Reactions, and the emoji list the Reaction Added node picks from. Neither is a
          // privileged intent, so both are on by default rather than needing anything enabled
          // in the Discord developer portal - unlike MessageContent above.
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.DirectMessageReactions,
          GatewayIntentBits.GuildExpressions,
        ],
        // A reaction on a message the bot didn't watch arrive - anything older than the current
        // session, which is most messages - is delivered with the message, the reaction and the
        // user all uncached. Without these partials discord.js drops that event entirely rather
        // than handing over a stub to fetch from.
        partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
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
          { id: 'userId', label: 'User ID', dataType: 'string' },
          { id: 'message', label: 'Message Content', dataType: 'string' },
          { id: 'messageId', label: 'Message ID', dataType: 'string' },
          { id: 'guildId', label: 'Guild ID', dataType: 'string' },
          { id: 'channelId', label: 'Channel ID', dataType: 'string' },
        ],
      },
      {
        id: 'reaction_added',
        label: 'Reaction Added',
        description:
          'Fires when someone reacts to a message. Leave a filter empty to fire for any guild, channel or emoji.',
        form: {
          guildId: {
            label: 'Guild (optional filter)',
            type: 'custom',
            options: { component: 'guildSelect' },
          },
          channelId: {
            label: 'Channel (optional filter)',
            type: 'custom',
            options: {
              component: 'channelIdSelect',
              guildField: 'guildId',
              channelTypes: ['text'],
            },
          },
          emoji: {
            label: 'Emoji (optional filter)',
            type: 'custom',
            options: { component: 'emojiSelect' },
          },
        },
        defaults: { guildId: '', channelId: '', emoji: '' },
        outputs: [
          // The same composite the emoji picker stores and matchesTriggerValues compares on:
          // 'name:id' for a custom emoji, the character itself for a standard one.
          { id: 'emoji', label: 'Emoji', dataType: 'string' },
          { id: 'emojiName', label: 'Emoji Name', dataType: 'string' },
          { id: 'emojiId', label: 'Emoji ID', dataType: 'string' },
          // Ready to paste into a message or reply - '<:name:id>' for a custom emoji, and the
          // character for a standard one, which needs no markup.
          { id: 'emojiMarkup', label: 'Emoji Markup', dataType: 'string' },
          { id: 'isCustom', label: 'Is Custom Emoji', dataType: 'boolean' },
          { id: 'count', label: 'Reaction Count', dataType: 'number' },
          { id: 'messageId', label: 'Message ID', dataType: 'string' },
          { id: 'messageContent', label: 'Message Content', dataType: 'string' },
          { id: 'username', label: 'Username', dataType: 'string' },
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
          message: {
            label: 'Message',
            type: 'code',
            options: { use_response_processor: true },
            portType: 'string',
          },
        },
        defaults: { userId: '', message: '' },
      },
      {
        id: 'message',
        label: 'Send To Channel',
        form: {
          destination: {
            label: 'Send To',
            type: 'custom',
            options: { component: 'channelSelect', channelTypes: ['text'] },
          },
          message: {
            label: 'Message',
            type: 'code',
            options: { use_response_processor: true },
            portType: 'string',
          },
          // Scoped to the guild the destination points at - a role id from another guild is
          // meaningless here. Still a string port: a graph can wire one in instead.
          role: {
            label: 'Role To Tag',
            type: 'custom',
            options: { component: 'roleSelect', guildField: 'destination.destguild' },
            portType: 'string',
          },
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
          destination: { destguild: '', destchannel: '' },
          message: '',
          role: '',
          use_link_button: false,
          link_url: '',
          link_label: '',
        },
      },
      {
        id: 'interaction_send',
        label: 'Send Server Interaction',
        description:
          'Posts a message with buttons in a server channel and waits for someone to click one. The clicked button has its own execution branch; Timed Out runs if nobody clicks before the wait is up. The buttons are removed from the message either way, so a prompt is answered once.',
        form: {
          destination: {
            label: 'Send To',
            type: 'custom',
            options: { component: 'channelSelect', channelTypes: ['text'] },
          },
          ...INTERACTION_FORM,
        },
        defaults: {
          destination: { destguild: '', destchannel: '' },
          ...INTERACTION_DEFAULTS,
        },
        outputs: INTERACTION_OUTPUTS,
        execOutputs: INTERACTION_EXEC_OUTPUTS,
      },
      {
        id: 'interaction_send_dm',
        label: 'Send Direct Interaction',
        description:
          "Sends a user a direct message with buttons and waits for them to click one. Behaves like Send Server Interaction otherwise. A user who has direct messages from server members turned off can't be reached, and that takes the Timed Out branch.",
        form: {
          userId: { label: 'User ID', type: 'text', portType: 'string' },
          ...INTERACTION_FORM,
        },
        defaults: { userId: '', ...INTERACTION_DEFAULTS },
        outputs: INTERACTION_OUTPUTS,
        execOutputs: INTERACTION_EXEC_OUTPUTS,
      },
      {
        id: 'reply',
        label: 'Reply To Message',
        description:
          'Replies to an existing Discord message, quoting it the way the client does. Left blank, the message and channel are the ones that triggered this event - so a Reply wired straight to Message Received answers that message.',
        form: {
          messageId: { label: 'Message ID', type: 'text', portType: 'string' },
          channelId: { label: 'Channel ID', type: 'text', portType: 'string' },
          message: {
            label: 'Message',
            type: 'code',
            options: { use_response_processor: true },
            portType: 'string',
          },
          mentionAuthor: { label: 'Ping Author', type: 'boolean' },
        },
        defaults: { messageId: '', channelId: '', message: '', mentionAuthor: true },
        outputs: [{ id: 'replyMessageId', label: 'Reply Message ID', dataType: 'string' }],
      },
      {
        id: 'voice_join',
        label: 'Join Voice Channel',
        form: {
          guildId: {
            label: 'Guild',
            type: 'custom',
            options: { component: 'guildSelect' },
            portType: 'string',
          },
          // Voice and stage only: joining a text channel is not a thing the voice client can do.
          channelId: {
            label: 'Channel',
            type: 'custom',
            options: {
              component: 'channelIdSelect',
              guildField: 'guildId',
              channelTypes: ['voice'],
            },
            portType: 'string',
          },
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
          sound: {
            label: 'Sound',
            type: 'asset',
            options: { assetType: 'sound', folder: 'sound', required: true },
          },
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
              components.push(
                this.buttons.makeLinkButton(values.link_label || 'Button', values.link_url),
              );
            }

            const roleTag = values.role ? this.chat.makeRoleTag(values.role) : null;

            this.chat.sendToChannel(
              values.destination?.destguild ?? values.guild,
              values.destination?.destchannel ?? '',
              `${roleTag ? roleTag + ' ' : ''}${response.response}`,
              components,
            );
            break;
          }
          case 'interaction_send':
          case 'interaction_send_dm': {
            const response = await runResponseScript(
              ctx.eventName,
              ctx.streamMessage,
              ctx.extra,
              values.message,
              false,
            );
            const buttons = interactionButtons(values);
            const timeout = Number(values.timeout);
            const wait =
              Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_INTERACTION_WAIT;

            const result =
              nodeId === 'interaction_send_dm'
                ? await this.chat.sendDirectButtonPrompt(
                    values.userId,
                    response.response,
                    buttons,
                    wait,
                  )
                : await this.chat.sendButtonPrompt(
                    values.destination?.destchannel ?? '',
                    response.response,
                    buttons,
                    wait,
                  );
            return {
              ...result,
              // The branch this node takes. A click follows the slot that was clicked - the
              // customId and the exec port id are the same string by construction - and
              // anything else, a timeout or a prompt that never sent, ends up on Timed Out
              // rather than leaving the graph with nowhere to go.
              execPort: result.buttonId ?? 'timeout',
            };
          }
          case 'reply': {
            const response = await runResponseScript(
              ctx.eventName,
              ctx.streamMessage,
              ctx.extra,
              values.message,
              false,
            );
            // Both ids fall back to the message this event fired for. That is the common
            // shape of a reply graph, and it keeps the node usable with nothing wired into it.
            const eventData = ctx.streamMessage.platformEventData ?? {};
            const messageId = values.messageId || eventData.messageId || '';
            const channelId =
              values.channelId || eventData.channelId || ctx.streamMessage.channel || '';
            const sent = await this.chat.replyToMessage(
              channelId,
              messageId,
              response.response,
              // Compared against false rather than read as truthy: an untouched switch comes
              // through undefined, and that should mean Discord's own default (ping), not off.
              values.mentionAuthor !== false,
            );
            return { replyMessageId: sent?.id ?? '' };
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
