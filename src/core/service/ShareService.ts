import path from 'path';
import fs from 'fs';
import { CoreModule, KeyedObject, userDir } from '../../Types.ts';
import ConfigService from './ConfigService.ts';
import ModuleService from './ModuleService.ts';
import PluginService from './PluginService.ts';
import OSCService from './OSCService.ts';
import { StreamModuleInterface } from 'src/integration/interface/StreamModuleInterface.ts';
import { spooderLog } from '../Logging.ts';

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

        const loadedShares = JSON.parse(shareFile);

        // Convert old share format to new format
        if (!loadedShares[Object.keys(loadedShares)[0]].streamPlatforms) {
          spooderLog('Upgrading shares file');
          for (const l in loadedShares) {
            const newStreamPlatforms = {
              twitch: {
                username: l,
                userId: loadedShares[l].twitchid,
                displayName: loadedShares[l].displayName,
                profilePic: loadedShares[l].profilepic,
              },
            };

            const newNotificationPlatforms = {
              discord: {
                userId: loadedShares[l].discordId,
                userName: loadedShares[l].discordName,
                profilePic: '',
              },
            };

            loadedShares[l] = {
              name: loadedShares[l].displayName,
              joinMessage: loadedShares[l].joinMessage,
              leaveMessage: loadedShares[l].leaveMessage,
              plugins: loadedShares[l].plugins,
              commands: loadedShares[l].commands,
              streamPlatforms: newStreamPlatforms,
              notificationPlatforms: newNotificationPlatforms,
            };
          }
        }

        ShareService.instance.shares = loadedShares;
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

    ShareService.instance.saveShares();
  }

  shares: KeyedObject = {};
  activeShares: any[] = [];

  private saveShares() {
    fs.writeFileSync(
      userDir + '/settings/shares.json',
      JSON.stringify(ShareService.instance.shares),
    );
  }

  static getShares() {
    return ShareService.instance.shares;
  }

  static getActiveShares() {
    return ShareService.instance.activeShares;
  }

  static setShare(shareUser: string, isEnabled: boolean, message?: string) {
    const config = ConfigService.getConfig();
    const streamModules = ModuleService.getStreamModules();
    const communityModules = ModuleService.getCommunityModules();
    const sendToTCP = OSCService.sendToTCP;
    const activePlugins = PluginService.getActivePlugins();
    const ownerName = config.bot.owner_name;
    const externalHttpUrl = config.network.external_http_url;

    const userShare = ShareService.instance.shares[shareUser];
    const sharePlatforms = userShare.streamPlatforms;
    const notificationPlatforms = userShare.notificationPlatforms;

    if (message == null) {
      if (isEnabled) {
        message = userShare.joinMessage;
      } else {
        message = userShare.leaveMessage;
      }
    }

    //shares[shareUser].enabled = isEnabled;
    if (isEnabled) {
      for (let p in sharePlatforms) {
        if (streamModules[p] != null) {
          streamModules[p].joinChannel(sharePlatforms[p].userId, message);
        }
      }

      for (let n in notificationPlatforms) {
        if (communityModules[n] != null) {
          let sharedPlugins = ShareService.instance.shares[shareUser].plugins;
          let sharedPluginMessage = [];
          for (let p in sharedPlugins) {
            if (activePlugins[sharedPlugins[p]].hasOverlay) {
              sharedPluginMessage.push(
                activePlugins[sharedPlugins[p]].name +
                  ': ' +
                  path.join(externalHttpUrl, 'overlay', sharedPlugins[p]) +
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
      sendToTCP('/share/activate', shareUser);
    } else {
      for (let p in sharePlatforms) {
        if (streamModules[p] != null) {
          streamModules[p].leaveChannel(sharePlatforms[p].userId, message);
        }
      }
      sendToTCP('/share/deactivate', shareUser);
    }
  }

  static saveShares(newShares: KeyedObject) {
    fs.writeFileSync(userDir + '/settings/shares.json', JSON.stringify(newShares), 'utf-8');
    ShareService.instance.shares = newShares;
  }
}
