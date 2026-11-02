import crypto from 'crypto';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 } from 'uuid';
import { StreamModuleInterface } from '../../interface/StreamModuleInterface';
import { KeyedObject, userDir } from '../../Types';
import { spooderLog, webLog } from '../Logging';
import ConfigService from './ConfigService';
import ModuleService from './ModuleService';
import OSCService from './OSCService';
import PluginService from './PluginService';
import { WebService } from './WebService';

interface ShareUser {
  name: string;
  joinMessage: string;
  leaveMessage: string;
  plugins: { [pluginName: string]: boolean };
  commands: { [commandName: string]: boolean };
  streamPlatforms: KeyedObject;
  notificationPlatforms: KeyedObject;
  autoShare?: boolean;
  shareKey?: string;
}

interface ShareUserList {
  [x: string]: ShareUser;
}

// Cookie that carries an overlay layout's key, one per layout so several can be open at once.
const LAYOUT_COOKIE_PREFIX = 'layout_key_';
const LAYOUT_COOKIE_MAX_AGE_MS = 30 * 86400 * 1000;

interface LayoutPublicEntry {
  enabled: boolean;
  key: string;
}
type LayoutPublicMap = { [layoutName: string]: LayoutPublicEntry };

export default class ShareService {
  private static instance: ShareService;

  constructor() {
    if (ShareService.instance) {
      return ShareService.instance;
    }

    ShareService.instance = this;

    try {
      const shareFilePath = userDir + '/settings/shares.json';
      if (!fs.existsSync(shareFilePath)) {
        ShareService.instance.saveShares();
      } else {
        const shareFile = fs.readFileSync(shareFilePath, {
          encoding: 'utf8',
        });

        const loadedShareFile = JSON.parse(shareFile);

        let loadedShares = {} as KeyedObject;

        if (loadedShareFile.layout_public) {
          ShareService.instance.layoutPublic = loadedShareFile.layout_public as LayoutPublicMap;
        }
        if (loadedShareFile.plugin_public) {
          ShareService.instance.pluginPublic = loadedShareFile.plugin_public as KeyedObject;
        }
        if (loadedShareFile.plugin_keys) {
          ShareService.instance.pluginKeys = loadedShareFile.plugin_keys as KeyedObject;
          loadedShares = loadedShareFile.shares as KeyedObject;
        } else {
          loadedShares = loadedShareFile as KeyedObject;
        }
        if (Object.keys(loadedShares).length > 0) {
          if (Array.isArray(loadedShares[Object.keys(loadedShares)[0]].commands)) {
            for (const l in loadedShares) {
              if (Array.isArray(loadedShares[l].commands)) {
                let newCommands = {} as KeyedObject;
                loadedShares[l].commands.forEach((command: string) => {
                  newCommands[command] = true;
                });
                loadedShares[l].commands = newCommands;
              }

              if (Array.isArray(loadedShares[l].plugins)) {
                let newPlugins = {} as KeyedObject;
                loadedShares[l].plugins.forEach((plugin: string) => {
                  newPlugins[plugin] = true;
                });
                loadedShares[l].plugins = newPlugins;
              }
            }
          }

          // Convert old share format to new format
          if (!loadedShares[Object.keys(loadedShares)[0]].streamPlatforms) {
            spooderLog('Upgrading shares file');
            for (const l in loadedShares) {
              const newStreamPlatforms = loadedShares[l].twitchid
                ? {
                    twitch: {
                      username: l,
                      userId: loadedShares[l].twitchid,
                      displayName: loadedShares[l].displayName,
                      profilePic: loadedShares[l].profilepic,
                    },
                  }
                : {};

              const newNotificationPlatforms = loadedShares[l].discordId
                ? {
                    discord: {
                      userId: loadedShares[l].discordId,
                      userName: loadedShares[l].discordName,
                      displayName: loadedShares[l].discordName,
                      profilePic: '',
                    },
                  }
                : {};

              loadedShares[l] = {
                name: loadedShares[l].displayName,
                joinMessage: loadedShares[l].joinMessage,
                leaveMessage: loadedShares[l].leaveMessage,
                plugins: loadedShares[l].plugins,
                commands: loadedShares[l].commands,
                streamPlatforms: newStreamPlatforms,
                notificationPlatforms: newNotificationPlatforms,
              } as ShareUser;
            }
          }
        }

        ShareService.instance.shares = loadedShares as ShareUserList;
      }
    } catch (e: any) {
      console.log('Share file error', e);
    }
  }

  static async refreshShareUsers() {
    const shares = ShareService.instance.shares;
    for (const l in shares) {
      for (const s in shares[l].streamPlatforms) {
        const streamModule = ModuleService.findModule(s) as StreamModuleInterface;
        if (streamModule) {
          console.log('Refreshing share user info for', shares[l].streamPlatforms[s].userId);
          const newInfo = await streamModule.refreshShareUserInfo(
            shares[l].streamPlatforms[s].userId,
          );
          if (newInfo) {
            shares[l].streamPlatforms[s].username = newInfo.username;
            shares[l].streamPlatforms[s].displayName = newInfo.displayName;
            shares[l].streamPlatforms[s].profilePic = newInfo.profilePic;
          }
        }
      }
    }

    const streamModules = ModuleService.getStreamModules();
    for (let s in streamModules) {
      console.log('EMITTING SHARES CHANGED FOR', s);
      streamModules[s].onSharesChanged();
    }

    ShareService.instance.saveShares();
  }

  shares: ShareUserList = {};
  pluginKeys: KeyedObject = {};
  // Whether a plugin's overlay/utility may be opened from the public internet with its key.
  // Only plugins the owner has switched on (or that already had a key before this setting
  // existed) are present; see isPluginPublic.
  pluginPublic: { [pluginName: string]: boolean } = {};
  // Overlay layouts (/overlays/<name>) the owner has switched public, with each one's own key.
  // Kept here rather than in overlay_container.json because the layout editor rewrites that
  // file wholesale from what it holds, which would drop anything extra.
  layoutPublic: LayoutPublicMap = {};
  activeShares: any[] = [];

  private saveShares() {
    fs.writeFileSync(
      userDir + '/settings/shares.json',
      JSON.stringify({
        shares: this.shares,
        plugin_keys: this.pluginKeys,
        plugin_public: this.pluginPublic,
        layout_public: this.layoutPublic,
      }),
    );
  }

  static saveShares(newShares: KeyedObject) {
    ShareService.instance.shares = newShares;
    ShareService.instance.saveShares();
  }

  static saveShare(shareId: string, newShare: ShareUser) {
    ShareService.instance.shares[shareId] = newShare;
    ShareService.instance.saveShares();
  }

  static createShare(streamingPlatforms: KeyedObject) {
    const firstStreamKey = Object.keys(streamingPlatforms)[0];
    if (Object.keys(streamingPlatforms).length === 0) {
      console.log('No streaming platforms provided');
      return;
    }
    const newName = streamingPlatforms[firstStreamKey].displayName;
    const newShare: ShareUser = {
      name: newName,
      joinMessage: '',
      leaveMessage: '',
      plugins: {},
      commands: {},
      streamPlatforms: streamingPlatforms,
      notificationPlatforms: {},
    };
    const shareId = v4();
    ShareService.instance.shares[shareId] = newShare;
    ShareService.instance.saveShares();
  }

  static deleteShare(shareId: string) {
    if (ShareService.instance.shares[shareId]) {
      delete ShareService.instance.shares[shareId];
      ShareService.instance.saveShares();
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  static saveShareSettings(
    shareKey: string,
    name: string,
    joinMessage: string,
    leaveMessage: string,
  ) {
    const userShare = ShareService.getShareByKey(shareKey);
    if (!userShare) {
      console.log('Share key not found:', shareKey);
      return;
    }
    const shareId = userShare.shareId;
    if (ShareService.instance.shares[shareId]) {
      ShareService.instance.shares[shareId].name = name;
      ShareService.instance.shares[shareId].joinMessage = joinMessage;
      ShareService.instance.shares[shareId].leaveMessage = leaveMessage;
      ShareService.instance.saveShares();
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  static saveSharedCommands(shareKey: string, commands: KeyedObject) {
    const userShare = ShareService.getShareByKey(shareKey);
    if (!userShare) {
      console.log('Share key not found:', shareKey);
      return;
    }
    const shareId = userShare.shareId;
    if (ShareService.instance.shares[shareId]) {
      ShareService.instance.shares[shareId].commands = commands;
      ShareService.instance.saveShares();
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  static toggleSharedPlugin(shareKey: string, pluginName: string, enabled: boolean) {
    const userShare = ShareService.getShareByKey(shareKey);
    if (!userShare) {
      console.log('Share key not found:', shareKey);
      return;
    }
    const shareId = userShare.shareId;
    if (ShareService.instance.shares[shareId]) {
      console.log(`Toggling plugin ${pluginName} for share ${shareId} to ${enabled}`);
      ShareService.instance.shares[shareId].plugins[pluginName] = enabled;
      ShareService.instance.saveShares();
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  static hasCommandEnabled(shareId: string, command: string) {
    if (ShareService.instance.shares[shareId] && ShareService.instance.shares[shareId].commands) {
      return ShareService.instance.shares[shareId].commands[command] === true;
    }
    return false;
  }

  static hasPluginEnabled(shareId: string, pluginName: string) {
    if (ShareService.instance.shares[shareId] && ShareService.instance.shares[shareId].plugins) {
      return ShareService.instance.shares[shareId].plugins[pluginName] === true;
    }
    return false;
  }

  static getShares(): ShareUserList {
    return ShareService.instance.shares;
  }

  static getPluginKeys() {
    return ShareService.instance.pluginKeys;
  }

  static deletePluginKey(pluginName: string) {
    if (ShareService.instance.pluginKeys[pluginName]) {
      delete ShareService.instance.pluginKeys[pluginName];
      ShareService.instance.saveShares();
    } else {
      console.log('Plugin key not found:', pluginName);
    }
  }

  static async getActiveShares() {
    const streamModules = ModuleService.getStreamModules();
    let activeShares = {} as KeyedObject;
    for (let s in streamModules) {
      const moduleActiveShares = await streamModules[s].getActiveShares();
      activeShares = {
        ...activeShares,
        ...moduleActiveShares,
      };
    }
    return activeShares;
  }

  static setShare(shareUser: string, isEnabled: boolean, message?: string) {
    const config = ConfigService.getConfig();
    const streamModules = ModuleService.getStreamModules();
    const communityModules = ModuleService.getCommunityModules();
    const sendToTCP = OSCService.sendToTCP;
    const activePlugins = PluginService.getActivePlugins();
    const ownerName = config.bot.owner_name;
    const externalHttpUrl = WebService.getPublicHTTPUrl();

    const userShare = ShareService.instance.shares[shareUser];
    const sharePlatforms = userShare.streamPlatforms;
    const notificationPlatforms = userShare.notificationPlatforms;

    console.log('MESSAGE', message);

    if (typeof message === 'undefined') {
      if (isEnabled) {
        message = userShare.joinMessage;
      } else {
        message = userShare.leaveMessage;
      }
    }

    if (isEnabled) {
      try {
        for (let p in sharePlatforms) {
          if (streamModules[p] != null) {
            streamModules[p].joinChannel(sharePlatforms[p].username, message);
          }
        }
      } catch (e) {
        console.log('Error joining channel', e);
      }

      if (Object.keys(notificationPlatforms).length > 0) {
        if (externalHttpUrl) {
          for (let n in notificationPlatforms) {
            if (communityModules[n] != null) {
              let sharedPlugins = userShare.plugins;
              let sharedPluginMessage = [];
              for (let p in sharedPlugins) {
                if (activePlugins[p].hasOverlay) {
                  sharedPluginMessage.push(
                    activePlugins[p].name +
                      ': ' +
                      path.join(externalHttpUrl, 'overlay', p) +
                      '?channel=' +
                      shareUser,
                  );
                }
              }
              if (sharedPluginMessage.length > 0) {
                communityModules[n].sendDM(
                  notificationPlatforms.userId,
                  ownerName +
                    ' shared a plugin with you! \n\n Add these overlay links to your streaming software. On OBS, make sure the two checkboxes at the bottom of the Browser Source settings are selected. This will ensure the overlay resets when visibility is toggled off and back on.\n' +
                    sharedPluginMessage.join('\n'),
                );
              }
            }
          }
        } else {
          webLog('Public hosting URLs not available. Cannot send plugin links to shared users.');
        }
      }
    } else {
      try {
        for (let p in sharePlatforms) {
          if (streamModules[p] != null) {
            // The leave function for tmi.js can error because of "No response from Twitch" despite the channel being left successfully.
            // We'll need an empty catch so it doesn't kill Spooder.
            streamModules[p].leaveChannel(sharePlatforms[p].username, message).catch((e) => {});
          }
        }
      } catch (e) {
        console.log('Error leaving channel', e);
      }
    }

    if (isEnabled) {
      sendToTCP('/spooder/share/activate', shareUser);
    } else {
      sendToTCP('/spooder/share/deactivate', shareUser);
    }
  }

  static setAutoShare(shareId: string, isEnabled: boolean) {
    if (ShareService.instance.shares[shareId]) {
      ShareService.instance.shares[shareId].autoShare = isEnabled;
      ShareService.instance.saveShares();
      ModuleService.onSharesChanged();
      console.log(`Auto share for ${shareId} set to ${isEnabled}`);
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  static generateShareKey(shareId: string, temporary: boolean): string {
    // Generate a random key using crypto
    const randomKey = crypto.randomBytes(16).toString('hex');

    // Save the key to the shares object for the given shareId
    if (!ShareService.instance.shares[shareId] && !temporary) {
      throw new Error(`Share ID ${shareId} does not exist.`);
    }

    if (!temporary) {
      ShareService.instance.shares[shareId].shareKey = randomKey;
      ShareService.instance.saveShares();
    }

    // Return the generated key
    return randomKey;
  }

  static deleteShareKey(shareId: string) {
    if (ShareService.instance.shares[shareId]) {
      if (ShareService.instance.shares[shareId].shareKey) {
        delete ShareService.instance.shares[shareId].shareKey;
        ShareService.instance.saveShares();
      }
    } else {
      console.log('Share ID not found:', shareId);
    }
  }

  /**
   * Whether this plugin's pages may be served through public hosting. An explicit choice wins;
   * with none, a plugin that already holds a key is treated as public, so setups from before
   * this setting existed keep working instead of going dark on update.
   */
  static isPluginPublic(pluginName: string): boolean {
    const explicit = ShareService.instance.pluginPublic[pluginName];
    if (typeof explicit === 'boolean') {
      return explicit;
    }
    return !!ShareService.instance.pluginKeys[pluginName];
  }

  /**
   * Turn public serving on or off for one plugin. Turning it on is what creates the access
   * key. Turning it off keeps the key, so the same URL works again when it is switched back
   * on; delete the key to rotate it.
   */
  static setPluginPublic(pluginName: string, enabled: boolean) {
    ShareService.instance.pluginPublic[pluginName] = enabled;
    if (enabled) {
      ShareService.getPluginShareKey(pluginName);
    }
    ShareService.instance.saveShares();
  }

  /** What a layout's public state is, or undefined if the owner has never set it either way. */
  static getLayoutPublic(layoutName: string): LayoutPublicEntry | undefined {
    return ShareService.instance.layoutPublic[layoutName];
  }

  /**
   * Turn public serving on or off for an overlay layout. Turning it on creates the layout's
   * key; turning it off keeps the key, so the same URL works again when it is switched back on.
   */
  static setLayoutPublic(layoutName: string, enabled: boolean) {
    const existing = ShareService.instance.layoutPublic[layoutName];
    ShareService.instance.layoutPublic[layoutName] = {
      enabled,
      key: existing?.key || crypto.randomBytes(16).toString('hex'),
    };
    ShareService.instance.saveShares();
  }

  static renameLayoutPublic(from: string, to: string) {
    const entry = ShareService.instance.layoutPublic[from];
    if (entry) {
      ShareService.instance.layoutPublic[to] = entry;
      delete ShareService.instance.layoutPublic[from];
      ShareService.instance.saveShares();
    }
  }

  static deleteLayoutPublic(layoutName: string) {
    if (ShareService.instance.layoutPublic[layoutName]) {
      delete ShareService.instance.layoutPublic[layoutName];
      ShareService.instance.saveShares();
    }
  }

  /**
   * May this request open the layout page and read its config? 'legacy' is a layout the owner
   * never configured: it keeps the behaviour it had before layouts had a public setting (the
   * page and config open, its plugin pages still behind their own keys), so a layout that
   * was already being used publicly does not break on update. Anything the owner has touched
   * is strict: it needs the layout's key, from the URL or from the cookie it sets.
   */
  static validateLayoutKey(
    req: Request,
    res: Response,
    layoutName: string,
  ): 'ok' | 'legacy' | 'not_public' | 'invalid_key' {
    const entry = ShareService.instance.layoutPublic[layoutName];
    if (!entry) {
      return 'legacy';
    }
    if (!entry.enabled) {
      return 'not_public';
    }

    const cookieName = LAYOUT_COOKIE_PREFIX + layoutName;
    const fromUrl = typeof req.query.key === 'string' ? req.query.key : '';
    const fromCookie = typeof req.cookies?.[cookieName] === 'string' ? req.cookies[cookieName] : '';

    if (fromUrl && fromUrl === entry.key) {
      res.cookie(cookieName, entry.key, {
        maxAge: LAYOUT_COOKIE_MAX_AGE_MS,
        httpOnly: true,
        sameSite: 'lax',
      });
      return 'ok';
    }
    return fromCookie && fromCookie === entry.key ? 'ok' : 'invalid_key';
  }

  /**
   * Does this request carry the key of an enabled layout that has `pluginName` placed on it?
   * That is what lets a layout's plugin pages load inside the layout (they are iframes, so
   * they bring the cookie the layout page set) without each plugin needing its own key.
   */
  static hasLayoutAccessToPlugin(req: Request, pluginName: string): boolean {
    const layouts = ConfigService.getOverlayLayouts().layouts;
    for (const [cookieName, value] of Object.entries(req.cookies ?? {})) {
      if (!cookieName.startsWith(LAYOUT_COOKIE_PREFIX) || typeof value !== 'string') {
        continue;
      }
      const layoutName = cookieName.substring(LAYOUT_COOKIE_PREFIX.length);
      const entry = ShareService.instance.layoutPublic[layoutName];
      if (!entry?.enabled || entry.key !== value) {
        continue;
      }
      const placed = (layouts[layoutName]?.layers ?? []).some(
        (layer) => layer.type === 'plugin' && layer.pluginName === pluginName,
      );
      if (placed) {
        return true;
      }
    }
    return false;
  }

  static getPluginShareKey(pluginName: string) {
    if (!ShareService.instance.pluginKeys[pluginName]) {
      const randomKey = crypto.randomBytes(16).toString('hex');
      ShareService.instance.pluginKeys[pluginName] = randomKey;
      ShareService.instance.saveShares();
    }

    return ShareService.instance.pluginKeys[pluginName];
  }

  static getShareByKey(key: string) {
    const shares = ShareService.getShares();
    if (!key) {
      return null;
    }
    for (const shareId in shares) {
      const share = shares[shareId];
      if (share.shareKey === key) {
        return {
          shareId: shareId,
          share: share,
        };
      }
    }
  }

  static validateShareKey(req: Request, res: Response) {
    const key = (req.query.key || req.cookies?.share_key) as string;

    const pathSegments = req.path.split('/');
    const directory = pathSegments[1];

    console.log(req.path, pathSegments, directory);

    if (directory && ShareService.hasLayoutAccessToPlugin(req, directory)) {
      return 'ok';
    }

    if (!key) {
      return 'invalid_key';
    }

    if (!directory) {
      return 'invalid_directory';
    }
    const pluginKeys = ShareService.instance.pluginKeys;
    if (pluginKeys[directory] && pluginKeys[directory] === key) {
      if (!ShareService.isPluginPublic(directory)) {
        return 'not_public';
      }
      if (!req.cookies?.share_key) {
        console.log('Writing share key to cookie');
        res.cookie('share_key', key, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: false,
        });
      }
      return 'ok';
    }
    const shares = ShareService.getShares();
    for (const shareId in shares) {
      const share = shares[shareId];
      if (share.shareKey === key) {
        if (Object.keys(share.plugins).includes(directory)) {
          if (!req.cookies?.share_key) {
            console.log('Writing share key to cookie');
            res.cookie('share_key', key, {
              maxAge: 86400 * 1000,
              httpOnly: true,
              secure: false,
            });
          }
          return 'ok';
        } else {
          return 'not_shared';
        }
      }
    }
    return 'invalid_key';
  }
}
