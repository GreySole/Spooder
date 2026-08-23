import { ChannelType, Client, TextChannel, User } from 'discord.js';
import ModuleService from '../../core/service/ModuleService';
import PluginService from '../../core/service/PluginService';
import { KeyedObject } from '../../Types';
import Discord from './discord';

export default class DiscordApi {
  private module = ModuleService.getCommunityModule('discord') as Discord;
  private client?: Client = this.module.client;
  callPlugins(type: string, data: KeyedObject) {
    const activePlugins = PluginService.getActivePlugins();
    for (let a in activePlugins) {
      // Legacy support
      // @ts-ignore
      if (activePlugins[a].onDiscord) {
        // @ts-ignore
        activePlugins[a].onDiscord(type, data);
        return;
      }

      activePlugins[a].onCommunityChat(type, data);
    }
  }

  isSelf(userid: string) {
    if (this.client?.user?.id == userid) {
      return true;
    }
    return false;
  }

  isMaster(userid: string) {
    if (this.module.config.master == userid) {
      return true;
    }
    return false;
  }

  isHandler(userid: string) {
    if (this.module.config.master == userid) {
      return true;
    }
    if (this.module.config.handlers != null) {
      if (this.module.config.handlers[userid] != null) {
        return true;
      }
    }
    return false;
  }

  getRoles(guildId: string) {
    if (!this.module.loggedIn) {
      return null;
    }

    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild) {
      return null;
    }

    return guild.roles.cache.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
    }));
  }

  getMessageRange(serverId: string, channelId: string, amount: number) {
    if (!this.module.loggedIn) {
      return null;
    }
    if (channelId == null) {
      return null;
    }
    let channel = this.getGuild(serverId)?.channels.cache.get(channelId);
    if (channel == null) {
      return null;
    }
    if (channel.isTextBased()) {
      return (channel as TextChannel).messages.fetch({ limit: amount });
    }
  }

  getUser(userId: string) {
    if (!this.module.loggedIn) {
      return undefined;
    }
    return this.client?.users.cache.get(userId);
  }

  findUser(userId: string): Promise<User> {
    return new Promise((res, rej) => {
      if (!this.module.loggedIn) {
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

  getGuild(guildId: string) {
    return this.client?.guilds.cache.get(guildId);
  }

  getChannels(guildId: string) {
    return this.client?.guilds.cache.get(guildId)?.channels.cache;
  }

  /**
   * Gets a Discord channel with enhanced voice state information for voice channels.
   * For voice channels, each member will include a voiceState object with mute/deaf status.
   * @param channelId The ID of the channel to retrieve
   * @param guildId The ID of the guild the channel belongs to
   * @returns Channel object with enhanced voice state information, or null if not found
   */
  getChannel(channelId: string, guildId: string) {
    const guild = this.client?.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);

    if (!channel) {
      return null;
    }

    // If it's a voice channel, enhance with voice state information
    if (channel.type === ChannelType.GuildVoice) {
      const membersObject: KeyedObject = {};

      channel.members?.forEach((member) => {
        const voiceState = member.voice;
        membersObject[member.id] = {
          ...member,
          voiceState: {
            muted: voiceState.mute || voiceState.selfMute,
            deafened: voiceState.deaf || voiceState.selfDeaf,
            serverMuted: voiceState.mute,
            serverDeafened: voiceState.deaf,
            selfMuted: voiceState.selfMute,
            selfDeafened: voiceState.selfDeaf,
            streaming: voiceState.streaming,
            suppressed: voiceState.suppress,
            channelId: voiceState.channelId,
            sessionId: voiceState.sessionId,
          },
        };
      });

      return {
        ...channel,
        members: membersObject,
      };
    }

    return channel;
  }

  getAvatar(userId: string, avatarId: string) {
    fetch('https://cdn.discordapp.com/avatars/' + userId + '/' + avatarId + '.png');
  }

  getUserName(userId: string) {
    if (!this.module.loggedIn) {
      return null;
    }
    return this.client?.users.cache.get(userId)?.username;
  }

  getGuilds() {
    if (!this.module.loggedIn) {
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
    const guildCache = this.client?.guilds.cache;
    const guilds = convertArrayToObject(
      guildCache?.map((g) => {
        const roles = g.roles.cache.map((r) => {
          return {
            id: r.id,
            name: r.name,
            color: r.color,
            position: r.position,
          };
        });
        const channels = g.channels.cache.map((c) => {
          return {
            id: c.id,
            name: c.name,
            type: c.type,
          };
        });
        // Custom emoji, for the reaction trigger's picker. `animated` decides the CDN
        // extension the editor asks for - a .png of an animated emoji is a still frame, and a
        // .gif of a static one 404s.
        const emojis = g.emojis.cache.map((e) => {
          return {
            id: e.id,
            name: e.name,
            animated: e.animated === true,
          };
        });
        return {
          id: g.id,
          name: g.name,
          channels: convertArrayToObject(channels, 'id'),
          roles: convertArrayToObject(roles, 'id'),
          emojis: convertArrayToObject(emojis, 'id'),
        };
      }) || 'None',
      'id',
    );
    return guilds;
  }
}
