import { Client, TextChannel, User } from 'discord.js';
import Module from 'module';
import ModuleService from '../../core/service/ModuleService';
import Discord from './main';
import PluginService from '../../core/service/PluginService';
import { KeyedObject } from '../../Types';

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

  getServerByName(servername: string) {
    if (!this.module.loggedIn) {
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
    if (!this.module.loggedIn) {
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
    if (!this.module.loggedIn) {
      return undefined;
    }
    return this.getGuild(serverId)?.name;
  }

  getChannelName(serverId: string, channelId: string) {
    if (!this.module.loggedIn) {
      return undefined;
    }
    return this.getGuild(serverId)?.channels.cache.get(channelId);
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

  getChannel(channelId: string, guildId: string) {
    return this.client?.guilds.cache.get(guildId)?.channels.cache.get(channelId);
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
        return {
          id: g.id,
          name: g.name,
          channels: convertArrayToObject(channels, 'id'),
          roles: convertArrayToObject(roles, 'id'),
        };
      }) || 'None',
      'id',
    );
    return guilds;
  }
}
