import fsPromises from 'fs/promises';
import path from 'path';
import chmodr from 'chmodr';
import fs from 'fs-extra';
import { KeyedObject, userDir } from '../../Types';
import OSCService from './OSCService';
import { webLog } from '../Logging';
import childProcess from 'child_process';
import Plugin from '../../Plugin';
import { createRequire } from 'module';
import ModuleService from './ModuleService';
import ShareService from './ShareService';

interface PluginMap {
  [key: string]: Plugin;
}

export default class PluginService {
  private static instance: PluginService;
  public static isReady: boolean = false;

  constructor() {
    if (PluginService.instance) {
      return PluginService.instance;
    }

    PluginService.instance = this;

    try {
      const pluginFilePath = userDir + '/settings/plugins.json';
      if (!fs.existsSync(pluginFilePath)) {
        PluginService.instance.saveGlobalPluginSettings();
      } else {
        const pluginFile = fs.readFileSync(pluginFilePath, {
          encoding: 'utf8',
        });
        PluginService.instance.settings = JSON.parse(pluginFile);
      }
    } catch (e: any) {
      console.log('Plugin settings file error', e);
    }

    PluginService.refreshAllPlugins();
  }

  private saveGlobalPluginSettings() {
    fs.writeFileSync(
      userDir + '/settings/plugins.json',
      JSON.stringify(PluginService.instance.settings),
    );
  }

  static getPluginSettings(pluginName: string): KeyedObject {
    const settings = path.join(userDir, 'plugins', pluginName, 'settings.json');
    const thisPluginForm =
      fs.existsSync(settings) == true
        ? JSON.parse(fs.readFileSync(settings, { encoding: 'utf8' }))
        : {};
    return thisPluginForm;
  }

  static getPluginSettingsForm(pluginName: string): KeyedObject {
    const settingsForm = path.join(userDir, 'plugins', pluginName, 'settings-form.json');
    const thisPluginForm =
      fs.existsSync(settingsForm) == true
        ? JSON.parse(fs.readFileSync(settingsForm, { encoding: 'utf8' }))
        : null;
    return thisPluginForm;
  }

  static getSharePluginSettings(shareKey: string, pluginName: string): KeyedObject {
    const shareUser = ShareService.getShareByKey(shareKey);
    if (!shareUser) {
      console.error('Share not found for key:', shareKey);
      return {};
    }

    const settings = path.join(
      userDir,
      'plugins',
      pluginName,
      '_share',
      `${shareUser.shareId}.json`,
    );
    const thisPluginForm = fs.existsSync(settings)
      ? JSON.parse(fs.readFileSync(settings, { encoding: 'utf8' }))
      : {};
    return thisPluginForm;
  }

  static getSharePluginSettingsForm(shareKey: string, pluginName: string): KeyedObject {
    const shareUser = ShareService.getShareByKey(shareKey);
    if (!shareUser) {
      console.error('Share not found for key:', shareKey);
      return {};
    }

    const settingsForm = PluginService.getPluginSettingsForm(pluginName);
    const shareSettingsForm = {} as KeyedObject;
    for (let s in settingsForm) {
      if (settingsForm[s].exclude_share) {
        continue;
      }
      shareSettingsForm[s] = settingsForm[s];
    }
    return shareSettingsForm;
  }

  static savePluginSettings(pluginName: string, settings: KeyedObject) {
    try {
      fs.writeFileSync(
        path.join(userDir, 'plugins', pluginName, 'settings.json'),
        JSON.stringify(settings),
      );
      return true;
    } catch (e) {
      console.error('Error saving plugin settings', e);
      return false;
    }
  }

  static saveSharePluginSettings(shareKey: string, pluginName: string, settings: KeyedObject) {
    const shareUser = ShareService.getShareByKey(shareKey);
    if (!shareUser) {
      console.error('Share not found for key:', shareKey);
      return false;
    }

    if (!fs.existsSync(path.join(userDir, 'plugins', pluginName, '_share'))) {
      fs.mkdirSync(path.join(userDir, 'plugins', pluginName, '_share'), { recursive: true });
    }

    try {
      fs.writeFileSync(
        path.join(userDir, 'plugins', pluginName, '_share', `${shareUser.shareId}.json`),
        JSON.stringify(settings),
      );
      return true;
    } catch (e) {
      console.error('Error saving plugin settings', e);
      return false;
    }
  }

  private settings = {} as KeyedObject;
  private activePlugins = {} as PluginMap;

  static getActivePlugins() {
    if (!PluginService.instance) {
      return {};
    }
    return PluginService.instance.activePlugins;
  }

  static setEnablePlugin(pluginName: string, isEnabled: boolean) {
    if (PluginService.instance.settings[pluginName]) {
      PluginService.instance.settings[pluginName].enabled = isEnabled;
    } else {
      PluginService.instance.settings[pluginName] = { enabled: isEnabled };
    }
    PluginService.instance.saveGlobalPluginSettings();
    PluginService.refreshPlugin(pluginName);
  }

  static isPluginEnabled(pluginName: string) {
    if (!PluginService.instance.settings[pluginName]) {
      return true;
    }
    return PluginService.instance.settings[pluginName].enabled;
  }

  static setDevMode(pluginName: string, isEnabled: boolean) {
    if (PluginService.instance.settings[pluginName]) {
      PluginService.instance.settings[pluginName].dev_mode = isEnabled;
    } else {
      PluginService.instance.settings[pluginName] = { dev_mode: isEnabled };
    }
    PluginService.instance.saveGlobalPluginSettings();
    PluginService.refreshPlugin(pluginName);
  }

  static isPluginInDevMode(pluginName: string) {
    if (!PluginService.instance.settings[pluginName]) {
      return false;
    }
    return PluginService.instance.settings[pluginName].dev_mode ?? false;
  }

  static refreshPlugin(pluginName: string) {
    PluginService.stopPlugin(pluginName);

    const pluginPath = path.resolve(userDir, 'plugins', pluginName);
    const newPlugin = new Plugin(pluginName, pluginPath);

    PluginService.instance.activePlugins[pluginName] = newPlugin;
  }

  static stopPlugin(pluginName: string) {
    PluginService.instance.activePlugins[pluginName]?.destroy();
    delete PluginService.instance.activePlugins[pluginName];
  }

  static refreshAllPlugins() {
    try {
      PluginService.stopAllPlugins();
      const dirents = fs.readdirSync(userDir + '/plugins', { withFileTypes: true });

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          console.log('Loading plugin', dirent.name);
          const pluginPath = path.resolve(userDir, 'plugins', dirent.name);
          const newPlugin = new Plugin(dirent.name, pluginPath);
          PluginService.instance.activePlugins[dirent.name] = newPlugin;
        }
      }

      ModuleService.onPluginsLoaded();
    } catch (err) {
      console.error('Error during refreshAllPlugins:', err);
    }
  }

  static stopAllPlugins() {
    try {
      const dirents = fs.readdirSync(userDir + '/plugins', { withFileTypes: true });

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          PluginService.instance.activePlugins[dirent.name]?.destroy();
          delete PluginService.instance.activePlugins[dirent.name];
        }
      }
      webLog('Plugins STOPPED!', Object.keys(PluginService.instance.activePlugins));
    } catch (err) {
      console.error(err);
    }
  }

  static buildPlugin(pluginName: string) {
    return this.getActivePlugins()[pluginName].buildPlugin();
  }

  static async installPluginFromTemp(pluginDirName: string, options?: KeyedObject) {
    if (options == null) {
      options = {
        createInfo: null,
        overlay: true,
      };
    }
    console.log('Installing plugin from temp', options);
    OSCService.sendToTCP('/spooder/plugin/install/progress', {
      pluginName: pluginDirName,
      status: 'progress',
      message: 'Copying folders...',
    });
    const tempDir = path.join(userDir, 'tmp', pluginDirName);

    const tempPluginDir = fs.existsSync(tempDir + '/plugin') ? 'plugin' : 'command';

    if (!fs.existsSync(tempDir + `/${tempPluginDir}`)) {
      return {
        status: false,
        message: 'No plugin folder in temp directory',
      };
    }

    // Extract the plugin name from package.json
    let finalPluginName = pluginDirName; // Default fallback
    if (fs.existsSync(tempDir + `/${tempPluginDir}/package.json`)) {
      try {
        let thisPackage = JSON.parse(
          fs.readFileSync(tempDir + `/${tempPluginDir}/package.json`, { encoding: 'utf-8' }),
        );

        if (options.createInfo != null) {
          thisPackage.name = options.createInfo.name;
          thisPackage.author = options.createInfo.author;
          thisPackage.description = options.createInfo.description;
          fs.writeFileSync(tempDir + `/${tempPluginDir}/package.json`, JSON.stringify(thisPackage));
        }

        // Use the name from package.json as the final plugin directory name
        if (thisPackage.name) {
          finalPluginName = thisPackage.name;
        }
      } catch (e) {
        webLog("Something went wrong with applying create info to the plugin's package.json", e);
      }
    }

    // Define directories using the final plugin name
    const pluginDir = path.join(userDir, 'plugins', finalPluginName);
    const overlayDir = path.join(userDir, 'web', 'overlay', finalPluginName);
    const utilityDir = path.join(userDir, 'web', 'utility', finalPluginName);
    const publicDir = path.join(userDir, 'web', 'public', finalPluginName);
    const settingsDir = path.join(userDir, 'web', 'settings', finalPluginName);
    const assetsDir = path.join(userDir, 'web', 'assets', finalPluginName);
    const iconDir = path.join(userDir, 'web', 'icons', finalPluginName + '.png');

    if (fs.existsSync(path.join(tempDir + `/${tempPluginDir}`, 'node_modules'))) {
      fs.rmSync(path.join(tempDir + `/${tempPluginDir}`, 'node_modules'), { recursive: true });
    }

    if (fs.existsSync(pluginDir)) {
      mergeDirectories(tempDir + `/${tempPluginDir}`, pluginDir);
    } else {
      await fs.move(tempDir + `/${tempPluginDir}`, pluginDir, { overwrite: true });
    }

    chmodr(pluginDir, 0o777, (err) => {
      if (err) throw err;
    });

    if (fs.existsSync(tempDir + '/overlay') && options.overlay == true) {
      await fs.move(tempDir + '/overlay', overlayDir, { overwrite: true });

      chmodr(overlayDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

    if (fs.existsSync(tempDir + '/utility') && options.utility == true) {
      await fs.move(tempDir + '/utility', utilityDir, { overwrite: true });

      chmodr(utilityDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

    if (fs.existsSync(tempDir + '/public') && options.public == true) {
      await fs.move(tempDir + '/public', publicDir, { overwrite: true });

      chmodr(publicDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

    if (fs.existsSync(tempDir + '/settings')) {
      await fs.move(tempDir + '/settings', settingsDir, { overwrite: true });

      chmodr(settingsDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

    if (fs.existsSync(tempDir + '/assets')) {
      if (fs.existsSync(assetsDir)) {
        mergeDirectories(tempDir + '/assets', assetsDir);
      } else {
        await fs.move(tempDir + '/assets', assetsDir, { overwrite: true });
      }

      chmodr(assetsDir, 0o777, (err) => {
        if (err) throw err;
      });
    } else {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    if (fs.existsSync(tempDir + '/icon.png')) {
      await fs.move(tempDir + '/icon.png', iconDir, { overwrite: true });

      chmodr(iconDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

    webLog('Plugin added successfully!');
    fs.rm(tempDir, { recursive: true });
    await PluginService.installPluginDependencies(finalPluginName, pluginDir);
    PluginService.refreshAllPlugins();
    OSCService.sendToTCP('/spooder/plugin/install/complete', {
      pluginName: finalPluginName,
      status: 'complete',
      message: 'Complete!',
    });
    return {
      status: 'OK',
      message: '',
    };
  }

  static installPluginDependencies(pluginDirName: string, pluginPath: string, packagename = '') {
    if (packagename != '') {
      packagename = ' ' + packagename;
    } else if (fs.existsSync(path.join(pluginPath, 'node_modules'))) {
      fs.rmSync(path.join(pluginPath, 'node_modules'), { recursive: true });
    }
    webLog('Installing dependencies on ' + pluginPath);
    OSCService.sendToTCP('/spooder/plugin/install/progress', {
      pluginName: pluginDirName,
      status: 'progress',
      message: 'Installing dependencies...',
    });
    return new Promise((res, rej) => {
      childProcess.exec(
        'npm install' + packagename,
        {
          cwd: pluginPath,
        },
        (error: any, out: any, err: any) => {
          if (error) {
            rej(error);
            return;
          }
          res('OK');
        },
      );
    }).catch((error) => {
      console.log('INSTALL DEPS FAILED');
      OSCService.sendToTCP('/spooder/plugin/install/complete', {
        pluginName: pluginDirName,
        status: 'failed',
        message: error.message,
      });
    });
  }
}

//Contribution by ChatGPT :3
function mergeDirectories(sourceDir: string, destDir: string) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }

  const files = fs.readdirSync(sourceDir);

  files.forEach((file: string) => {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);

    const stats = fs.statSync(srcPath);

    if (stats.isDirectory()) {
      mergeDirectories(srcPath, destPath);
    } else {
      fs.moveSync(srcPath, destPath, { overwrite: true });
    }
  });
}
