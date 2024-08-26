import path from 'path';
import fs from 'fs';
import { CoreModule, KeyedObject, backendDir } from '../../Types.ts';
import ConfigManager from './ConfigManager.ts';
import ModuleManager from './ModuleManager.ts';
import PluginManager from './PluginManager.ts';
import OSCManager from './OSCManager.ts';

export default class ShareManager {
  private static instance: ShareManager;

  constructor() {
    if (ShareManager.instance) {
      return ShareManager.instance;
    }

    ShareManager.instance = this;

    try {
      const shareFilePath = backendDir + '/settings/shares.json';
      if (!fs.existsSync(shareFilePath)) {
        ShareManager.instance.saveShares();
      } else {
        const shareFile = fs.readFileSync(shareFilePath, {
          encoding: 'utf8',
        });
        ShareManager.instance.shares = JSON.parse(shareFile);
      }
    } catch (e: any) {
      console.log('Share file error', e);
    }
  }

  shares: KeyedObject = {};
  activeShares: any[] = [];

  private saveShares() {
    fs.writeFileSync(
      backendDir + '/settings/shares.json',
      JSON.stringify(ShareManager.instance.shares),
    );
  }

  static getShares() {
    return ShareManager.instance.shares;
  }

  static getActiveShares() {
    return ShareManager.instance.activeShares;
  }

  static setShare(shareUser: string, isEnabled: boolean, message?: string) {
    const config = ConfigManager.getConfig();
    const streamModules = ModuleManager.getStreamModules();
    const communityModules = ModuleManager.getCommunityModules();
    const sendToTCP = OSCManager.sendToTCP;
    const activePlugins = PluginManager.getActivePlugins();
    const ownerName = config.bot.owner_name;
    const externalHttpUrl = config.network.external_http_url;

    const userShare = ShareManager.instance.shares[shareUser];
    const sharePlatforms = userShare.streamPlatforms;
    const messagePlatform = userShare.messagePlatform;
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

      if (communityModules[messagePlatform.name]) {
        communityModules[messagePlatform.name].sendDM(messagePlatform.userId);
      }
      sendToTCP('/share/activate', shareUser);

      if (communityModules[messagePlatform.name]) {
        let sharedPlugins = ShareManager.instance.shares[shareUser].plugins;
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
          communityModules[messagePlatform.name].sendDM(
            messagePlatform.userId,
            ownerName + ' shared a plugin with you! \n' + sharedPluginMessage.join('\n'),
          );
        }
      }
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
    fs.writeFileSync(backendDir + '/settings/shares.json', JSON.stringify(newShares), 'utf-8');
    ShareManager.instance.shares = newShares;
  }
}
