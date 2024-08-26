import fsPromises from 'fs/promises';
import path from 'path';
import chmodr from 'chmodr';
import fs from 'fs-extra';
import { KeyedObject, backendDir } from '../../Types.ts';
import OSCManager from './OSCManager.ts';
import { webLog } from '../Logging.ts';
import childProcess from 'child_process';
import ModuleManager from './ModuleManager.ts';

export default class PluginManager {
  private static instance: PluginManager;

  constructor() {
    if (PluginManager.instance) {
      return PluginManager.instance;
    }

    PluginManager.instance = this;

    try {
      const pluginFilePath = backendDir + '/settings/plugins.json';
      if (!fs.existsSync(pluginFilePath)) {
        PluginManager.instance.savePluginSettings();
      } else {
        const pluginFile = fs.readFileSync(pluginFilePath, {
          encoding: 'utf8',
        });
        PluginManager.instance.settings = JSON.parse(pluginFile);
      }
    } catch (e: any) {
      console.log('Plugin settings file error', e);
    }

    PluginManager.refreshAllPlugins();
  }

  private savePluginSettings() {
    fs.writeFileSync(
      backendDir + '/settings/plugins.json',
      JSON.stringify(PluginManager.instance.settings),
    );
  }

  private settings = {
    disabled: {},
  };

  private activePlugins = {} as KeyedObject;

  static getActivePlugins() {
    return PluginManager.instance.activePlugins;
  }

  static async refreshPlugin(pluginName: string) {
    try {
      if (PluginManager.instance.activePlugins[pluginName].onClose != null) {
        await PluginManager.instance.activePlugins[pluginName].onClose();
      }

      //delete require.cache[require.resolve(backendDir + '/plugins/' + pluginName)];
      delete PluginManager.instance.activePlugins[pluginName];
      try {
        PluginManager.instance.activePlugins[pluginName] = import(
          path.resolve(backendDir, 'plugins', pluginName)
        );
        if (fs.existsSync(backendDir + '/plugins/' + pluginName + '/package.json')) {
          let pluginMeta = JSON.parse(
            fs.readFileSync(backendDir + '/plugins/' + pluginName + '/package.json', {
              encoding: 'utf8',
            }),
          );
          PluginManager.instance.activePlugins[pluginName].name = pluginMeta.name;
          PluginManager.instance.activePlugins[pluginName].dirname = pluginName;
          PluginManager.instance.activePlugins[pluginName].author = pluginMeta.author;
          PluginManager.instance.activePlugins[pluginName].version = pluginMeta.version;
          PluginManager.instance.activePlugins[pluginName].description = pluginMeta.description;
          PluginManager.instance.activePlugins[pluginName].dependencies = pluginMeta.dependencies;
          let overlayDir = path.join(backendDir, 'web', 'overlay', pluginName);
          let utilityDir = path.join(backendDir, 'web', 'utility', pluginName);
          let publicDir = path.join(backendDir, 'web', 'public', pluginName);
          PluginManager.instance.activePlugins[pluginName].hasOverlay = fs.existsSync(overlayDir);
          PluginManager.instance.activePlugins[pluginName].hasUtility = fs.existsSync(utilityDir);
          PluginManager.instance.activePlugins[pluginName].hasPublic = fs.existsSync(publicDir);
          PluginManager.instance.activePlugins[pluginName].status = 'ok';
        }
        if (fs.existsSync(backendDir + '/plugins/' + pluginName + '/settings.json')) {
          PluginManager.instance.activePlugins[pluginName].settings = JSON.parse(
            fs.readFileSync(backendDir + '/plugins/' + pluginName + '/settings.json', {
              encoding: 'utf8',
            }),
          );

          if (PluginManager.instance.activePlugins[pluginName].onSettings != null) {
            PluginManager.instance.activePlugins[pluginName].onSettings(
              PluginManager.instance.activePlugins[pluginName].settings,
            );
          }
        }
      } catch (e: any) {
        let pluginMeta = JSON.parse(
          fs.readFileSync(backendDir + '/plugins/' + pluginName + '/package.json', {
            encoding: 'utf8',
          }),
        );
        PluginManager.instance.activePlugins[pluginName] = {};
        PluginManager.instance.activePlugins[pluginName].name = pluginName;
        PluginManager.instance.activePlugins[pluginName].dirname = pluginName;
        PluginManager.instance.activePlugins[pluginName].status = 'failed';
        PluginManager.instance.activePlugins[pluginName].description = e.code + ' - ' + e.message;
        PluginManager.instance.activePlugins[pluginName].dependencies = pluginMeta.dependencies;
        console.log('Refresh Failed', e);
      }
    } catch (e) {
      console.error(e);
    }
  }

  static async refreshAllPlugins(onPluginsLoaded?: () => void) {
    try {
      const dir = await fsPromises.opendir(backendDir + '/plugins');
      for (let p in PluginManager.instance.activePlugins) {
        if (PluginManager.instance.activePlugins[p].onStop != null) {
          await PluginManager.instance.activePlugins[p].onStop();
        }
      }
      PluginManager.instance.activePlugins = {};
      for await (const dirent of dir) {
        //delete require.cache[require.resolve(backendDir + '/plugins/' + dirent.name)];
        delete PluginManager.instance.activePlugins[dirent.name];

        if (fs.existsSync(`${backendDir}/plugins/${dirent.name}/package.json`)) {
          let pluginMeta = JSON.parse(
            fs.readFileSync(backendDir + '/plugins/' + dirent.name + '/package.json', {
              encoding: 'utf8',
            }),
          );
          try {
            const newPlugin = await import(
              `../../../${backendDir}/plugins/${dirent.name}/${pluginMeta.main}`
            );

            console.log('PLUGIN', newPlugin);
            const newPluginInstance = new newPlugin.default();

            newPluginInstance.name = pluginMeta.name;
            newPluginInstance.dirname = dirent.name;
            newPluginInstance.author = pluginMeta.author;
            newPluginInstance.version = pluginMeta.version;
            newPluginInstance.description = pluginMeta.description;
            newPluginInstance.dependencies = pluginMeta.dependencies;
            let overlayDir = path.join(backendDir, 'web', 'overlay', dirent.name);
            let utilityDir = path.join(backendDir, 'web', 'utility', dirent.name);
            let publicDir = path.join(backendDir, 'web', 'public', dirent.name);
            newPluginInstance.hasOverlay = fs.existsSync(overlayDir);
            newPluginInstance.hasUtility = fs.existsSync(utilityDir);
            newPluginInstance.hasPublic = fs.existsSync(publicDir);
            newPluginInstance.status = 'ok';
            newPluginInstance.streamModules = ModuleManager.getStreamModules();
            newPluginInstance.communityModules = ModuleManager.getCommunityModules();

            PluginManager.instance.activePlugins[dirent.name] = newPluginInstance;

            if (fs.existsSync(backendDir + '/plugins/' + dirent.name + '/settings.json')) {
              PluginManager.instance.activePlugins[dirent.name].settings = JSON.parse(
                fs.readFileSync(backendDir + '/plugins/' + dirent.name + '/settings.json', {
                  encoding: 'utf8',
                }),
              );

              if (PluginManager.instance.activePlugins[dirent.name].onSettings != null) {
                PluginManager.instance.activePlugins[dirent.name].onSettings(
                  PluginManager.instance.activePlugins[dirent.name].settings,
                );
              }
            }
          } catch (e: any) {
            PluginManager.instance.activePlugins[dirent.name] = {};
            PluginManager.instance.activePlugins[dirent.name].name = dirent.name;
            PluginManager.instance.activePlugins[dirent.name].dirname = dirent.name;
            PluginManager.instance.activePlugins[dirent.name].status = 'failed';
            PluginManager.instance.activePlugins[dirent.name].description =
              e.code + ' - ' + e.message;
            PluginManager.instance.activePlugins[dirent.name].dependencies =
              pluginMeta.dependencies;
            console.log('PLUGIN FAILED TO LOAD', e);
            continue;
          }
        }
      }
      webLog('Plugins Refreshed!');
      if (onPluginsLoaded != null) {
        onPluginsLoaded();
      }
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
    OSCManager.sendToTCP('/frontend/plugin/install/progress', {
      pluginName: pluginDirName,
      status: 'progress',
      message: 'Copying folders...',
    });
    let tempDir = path.join(backendDir, 'tmp', pluginDirName);
    let pluginDir = path.join(backendDir, 'plugins', pluginDirName);
    let overlayDir = path.join(backendDir, 'web', 'overlay', pluginDirName);
    let utilityDir = path.join(backendDir, 'web', 'utility', pluginDirName);
    let publicDir = path.join(backendDir, 'web', 'public', pluginDirName);
    let settingsDir = path.join(backendDir, 'web', 'settings', pluginDirName);
    let assetsDir = path.join(backendDir, 'web', 'assets', pluginDirName);
    let iconDir = path.join(backendDir, 'web', 'icons', pluginDirName + '.png');

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
    await PluginManager.installPluginDependencies(pluginDirName, pluginDir);
    PluginManager.refreshAllPlugins();
    OSCManager.sendToTCP('/frontend/plugin/install/complete', {
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
    OSCManager.sendToTCP('/frontend/plugin/install/progress', {
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
      OSCManager.sendToTCP('/frontend/plugin/install/complete', {
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
