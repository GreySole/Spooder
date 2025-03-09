import fsPromises from 'fs/promises';
import path from 'path';
import chmodr from 'chmodr';
import fs from 'fs-extra';
import { KeyedObject, userDir } from '../../Types.ts';
import OSCService from './OSCService.ts';
import { webLog } from '../Logging.ts';
import childProcess from 'child_process';
import Plugin from 'src/Plugin.ts';
import { createRequire } from 'module';

interface PluginMap {
  [key: string]: Plugin;
}

export default class PluginService {
  private static instance: PluginService;
  private require = createRequire(import.meta.url);

  constructor() {
    if (PluginService.instance) {
      return PluginService.instance;
    }

    PluginService.instance = this;

    try {
      const pluginFilePath = userDir + '/settings/plugins.json';
      if (!fs.existsSync(pluginFilePath)) {
        PluginService.instance.savePluginSettings();
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

  private savePluginSettings() {
    fs.writeFileSync(
      userDir + '/settings/plugins.json',
      JSON.stringify(PluginService.instance.settings),
    );
  }

  private settings = {
    disabled: {},
  };

  private activePlugins = {} as PluginMap;

  static getActivePlugins() {
    return PluginService.instance.activePlugins;
  }

  static async refreshPlugin(pluginName: string) {
    PluginService.instance.activePlugins[pluginName]?.destroy();
    delete PluginService.instance.activePlugins[pluginName];

    const pluginPath = path.resolve(userDir, 'plugins', pluginName);
    PluginService.instance.activePlugins[pluginName] = new Plugin(
      PluginService.instance.require,
      pluginName,
      pluginPath,
    );
  }

  static refreshAllPlugins(onPluginsLoaded?: () => void) {
    try {
      const dirents = fs.readdirSync(userDir + '/plugins', { withFileTypes: true });
      console.log('Directory read for refreshing plugins');

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          console.log('Processing directory entry:', dirent.name);
          PluginService.instance.activePlugins[dirent.name]?.destroy();
          delete PluginService.instance.activePlugins[dirent.name];

          const pluginPath = path.resolve(userDir, 'plugins', dirent.name);
          const newPlugin = new Plugin(PluginService.instance.require, dirent.name, pluginPath);
          PluginService.instance.activePlugins[dirent.name] = newPlugin;
        }
      }

      if (onPluginsLoaded != null) {
        onPluginsLoaded();
      }
    } catch (err) {
      console.error('Error during refreshAllPlugins:', err);
    }
  }

  static async stopAllPlugins() {
    try {
      const dirents = fs.readdirSync(userDir + '/plugins', { withFileTypes: true });

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          console.log('Processing directory entry:', dirent.name);
          PluginService.instance.activePlugins[dirent.name]?.destroy();
          delete PluginService.instance.activePlugins[dirent.name];

          const pluginPath = path.resolve(userDir, 'plugins', dirent.name);
          const newPlugin = new Plugin(PluginService.instance.require, dirent.name, pluginPath);
          PluginService.instance.activePlugins[dirent.name] = newPlugin;
        }
      }
      webLog('Plugins STOPPED!');
    } catch (err) {
      console.error(err);
    }
  }

  static async installPluginFromTemp(pluginDirName: string, options?: KeyedObject) {
    if (options == null) {
      options = {
        createInfo: null,
        overlay: true,
        utility: true,
      };
    }
    OSCService.sendToTCP('/frontend/plugin/install/progress', {
      pluginName: pluginDirName,
      status: 'progress',
      message: 'Copying folders...',
    });
    let tempDir = path.join(userDir, 'tmp', pluginDirName);
    let pluginDir = path.join(userDir, 'plugins', pluginDirName);
    let overlayDir = path.join(userDir, 'web', 'overlay', pluginDirName);
    let utilityDir = path.join(userDir, 'web', 'utility', pluginDirName);
    let publicDir = path.join(userDir, 'web', 'public', pluginDirName);
    let settingsDir = path.join(userDir, 'web', 'settings', pluginDirName);
    let assetsDir = path.join(userDir, 'web', 'assets', pluginDirName);
    let iconDir = path.join(userDir, 'web', 'icons', pluginDirName + '.png');

    if (!fs.existsSync(tempDir + '/command')) {
      return {
        status: false,
        message: 'No command folder',
      };
    } else {
      if (options.createInfo != null) {
        if (fs.existsSync(tempDir + '/command/package.json')) {
          try {
            let thisPackage = JSON.parse(
              fs.readFileSync(tempDir + '/command/package.json', { encoding: 'utf-8' }),
            );
            thisPackage.name = options.createInfo.name;
            thisPackage.author = options.createInfo.author;
            thisPackage.description = options.createInfo.description;
            fs.writeFileSync(tempDir + '/command/package.json', JSON.stringify(thisPackage));
          } catch (e) {
            webLog(
              "Something went wrong with applying create info to the plugin's package.json",
              e,
            );
          }
        }
      }

      if (fs.existsSync(path.join(tempDir + '/command', 'node_modules'))) {
        fs.rmSync(path.join(tempDir + '/command', 'node_modules'), { recursive: true });
      }

      if (fs.existsSync(pluginDir)) {
        mergeDirectories(tempDir + '/command', pluginDir);
      } else {
        await fs.move(tempDir + '/command', pluginDir, { overwrite: true });
      }

      chmodr(pluginDir, 0o777, (err) => {
        if (err) throw err;
      });
    }

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
    await PluginService.installPluginDependencies(pluginDirName, pluginDir);
    PluginService.refreshAllPlugins();
    OSCService.sendToTCP('/frontend/plugin/install/complete', {
      pluginName: pluginDirName,
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
    OSCService.sendToTCP('/frontend/plugin/install/progress', {
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
      OSCService.sendToTCP('/frontend/plugin/install/complete', {
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
