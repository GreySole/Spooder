import {
  userDir,
  KeyedObject,
  StreamMessage,
  PluginConfigInfo,
  PluginMode,
  PluginModule,
  PluginOscInfo,
  PluginPublicInfo,
  PluginSpooderModules,
  PluginThemeInfo,
} from './Types';
import path, { resolve } from 'path';
import fs from 'fs';
import ModuleService from './core/service/ModuleService';
import OSC from '@spooder/osc-js';
import { createRequire } from 'module';
import PluginService from './core/service/PluginService';
import OSCService from './core/service/OSCService';
import { WebService } from './core/service/WebService';
import { registerPluginApi } from './core/routes/PluginRoutes';
import { Request, Response } from 'express';
import UserService from './core/service/UserService';
import ConfigService from './core/service/ConfigService';
import childProcess from 'child_process';
import chmodr from 'chmodr';
import { sayInChat } from './core/service/EventService';
import { pluginLog } from './core/Logging';
import ShareService from './core/service/ShareService';
import { webJoin } from './core/util/PathUtil';

export default class Plugin {
  name: string = '';
  main: string = '';
  dirname: string = '';
  author: string = '';
  version: string = '';
  description: string = '';
  dependencies: string = '';
  hasOverlay: boolean = false;
  hasUtility: boolean = false;
  hasPublic: boolean = false;
  pluginMode: PluginMode = PluginMode.none;
  devMode: boolean = false;
  status: string = '';
  extra: KeyedObject = {};

  private pluginModule: PluginModule | undefined = undefined;
  private modulePath: string | undefined = undefined;
  private pluginPath: string | undefined = undefined;
  private require: NodeJS.Require | undefined = undefined;

  private moduleEventSubscriptions: PluginSpooderModules = {
    stream: {
      dummy: {
        subscribeToModuleEvent: (eventName: string, callback: Function) => {},
      },
    },
    community: {
      dummy: {
        subscribeToModuleEvent: (eventName: string, callback: Function) => {},
      },
    },
    control: {
      dummy: {
        subscribeToModuleEvent: (eventName: string, callback: Function) => {},
      },
    },
  };

  constructor(pluginDirName: string, pluginPath: string) {
    const tsConfigPath = resolve(pluginPath, 'tsconfig.json');
    this.pluginPath = pluginPath;
    try {
      let pluginMeta = undefined;

      let devMode = PluginService.isPluginInDevMode(pluginDirName);
      if (devMode && !fs.existsSync(path.resolve(pluginPath, 'package.json'))) {
        console.log(
          'No package.json found for plugin in dev mode, switching to build:',
          pluginDirName,
        );
        PluginService.setDevMode(pluginDirName, false);
        devMode = false;
      }
      if (!devMode && fs.existsSync(path.resolve(pluginPath, 'build', 'manifest.json'))) {
        pluginMeta = JSON.parse(
          fs.readFileSync(path.resolve(pluginPath, 'build', 'manifest.json'), {
            encoding: 'utf8',
          }),
        );
        this.pluginMode = PluginMode.ncc;
      } else if (fs.existsSync(path.resolve(pluginPath, 'package.json'))) {
        pluginMeta = JSON.parse(
          fs.readFileSync(path.resolve(pluginPath, 'package.json'), {
            encoding: 'utf8',
          }),
        );
        this.pluginMode = fs.existsSync(tsConfigPath) ? PluginMode.ts : PluginMode.js;
        devMode = true;
      }

      console.log('Plugin Mode:', this.pluginMode);

      if (!pluginMeta) {
        throw new Error('Plugin package.json or build/manifest.json not found');
      }

      if (!PluginService.isPluginEnabled(pluginDirName)) {
        this.name = pluginMeta.name;
        this.author = pluginMeta.author;
        this.dirname = pluginDirName;
        this.status = 'disabled';
        this.description = pluginMeta.description;
        this.dependencies = pluginMeta.dependencies;
        return;
      }

      let modulePath = undefined;
      if (this.pluginMode === PluginMode.ncc) {
        modulePath = path.resolve(pluginPath, 'build', 'index.js');
      } else {
        modulePath = path.resolve(pluginPath, pluginMeta.main);
      }

      if (!modulePath) {
        throw new Error('Plugin main file not found');
      }

      this.modulePath = modulePath;

      this.name = pluginMeta.display_name ?? pluginMeta.name;
      this.main = pluginMeta.main = pluginMeta.main ?? 'index.js';
      this.dirname = pluginDirName;
      this.author = pluginMeta.author;
      this.version = pluginMeta.version;
      this.description = pluginMeta.description;
      this.dependencies = pluginMeta.dependencies;
      const overlayDir = path.join(userDir, 'web', 'overlay', pluginDirName);
      const utilityDir = path.join(userDir, 'web', 'utility', pluginDirName);
      const publicDir = path.join(userDir, 'web', 'public', pluginDirName);
      this.hasOverlay = fs.existsSync(overlayDir);
      this.hasUtility = fs.existsSync(utilityDir);
      this.hasPublic = fs.existsSync(publicDir);
      this.status = 'ok';
      this.devMode = devMode;
      this.extra = {} as KeyedObject;

      //console.log('Using tsconfig:', tsConfigPath);

      let requiredModule: any;

      this.require = createRequire(resolve(pluginPath)); // Adjust to the plugin's entry point

      if (fs.existsSync(tsConfigPath) && devMode) {
        this.require('ts-node').register({
          project: resolve(userDir, 'plugins', pluginDirName, 'tsconfig.json'),
          skipProject: false,
          transpileOnly: true,
        });
        requiredModule = this.require(modulePath);
      } else if (this.pluginMode === PluginMode.ncc) {
        requiredModule = this.require(modulePath);
      } else {
        requiredModule = this.require(modulePath);
      }

      const module = requiredModule.default || requiredModule;

      if (!module) {
        throw new Error('Plugin module not found');
      }

      this.pluginModule = new module() as PluginModule;

      if (!this.pluginModule) {
        throw new Error('Plugin not found');
      }

      this.pluginModule.dirname = pluginDirName;

      const functions = ModuleService.getModulePluginFunctions();

      const streamModuleNames = Object.keys(functions.stream);
      const communityModuleNames = Object.keys(functions.community);
      const controlModuleNames = Object.keys(functions.control);

      this.moduleEventSubscriptions = {
        stream: streamModuleNames.reduce((acc, name) => ({ ...acc, [name]: {} }), {}),
        community: communityModuleNames.reduce((acc, name) => ({ ...acc, [name]: {} }), {}),
        control: controlModuleNames.reduce((acc, name) => ({ ...acc, [name]: {} }), {}),
      };

      const subscribeToModuleEvent = (
        moduleType: 'stream' | 'community' | 'control',
        moduleName: string,
        eventName: string,
        callback: Function,
      ) => {
        const moduleEvents = this.moduleEventSubscriptions[moduleType][moduleName];
        if (moduleEvents) {
          moduleEvents[eventName] = callback;
        }
      };

      // Add subscribeToModuleEvent to each individual module
      const enhancedStreamFunctions = {} as KeyedObject;
      for (const [moduleName, moduleFunction] of Object.entries(functions.stream)) {
        enhancedStreamFunctions[moduleName] = {
          ...moduleFunction,
          subscribeToModuleEvent: (eventName: string, callback: Function) => {
            subscribeToModuleEvent('stream', moduleName, eventName, callback);
          },
        };
      }

      const enhancedCommunityFunctions = {} as KeyedObject;
      for (const [moduleName, moduleFunction] of Object.entries(functions.community)) {
        enhancedCommunityFunctions[moduleName] = {
          ...moduleFunction,
          subscribeToModuleEvent: (eventName: string, callback: Function) => {
            subscribeToModuleEvent('community', moduleName, eventName, callback);
          },
        };
      }

      const enhancedControlFunctions = {} as KeyedObject;
      for (const [moduleName, moduleFunction] of Object.entries(functions.control)) {
        enhancedControlFunctions[moduleName] = {
          ...moduleFunction,
          subscribeToModuleEvent: (eventName: string, callback: Function) => {
            subscribeToModuleEvent('control', moduleName, eventName, callback);
          },
        };
      }

      this.pluginModule.modules = {
        stream: enhancedStreamFunctions,
        community: enhancedCommunityFunctions,
        control: enhancedControlFunctions,
      } as PluginSpooderModules;
      this.pluginModule.osc = {
        sendToTCP: OSCService.sendToTCP,
        sendToUDP: OSCService.sendToUDP,
        udpServers: OSCService.getUdpServers(),
      } as PluginOscInfo;
      this.pluginModule.public = {
        publicHostUrl: WebService.getPublicHTTPUrl(),
        publicOscUrl: WebService.getPublicOSCUrl(),
      } as PluginPublicInfo;

      this.pluginModule.getModule = (name: string) => {
        if (Object.keys(this.pluginModule!.modules.stream).includes(name)) {
          return this.pluginModule!.modules.stream[name];
        }
        if (Object.keys(this.pluginModule!.modules.community).includes(name)) {
          return this.pluginModule!.modules.community[name];
        }
        if (Object.keys(this.pluginModule!.modules.control).includes(name)) {
          return this.pluginModule!.modules.control[name];
        }
        return undefined;
      };

      this.pluginModule.chat = {
        sayInChat: sayInChat,
      };

      this.pluginModule.getAssetPath = (assetPath: string) => {
        const realAssetPath = assetPath.startsWith('/') ? assetPath.substring(1) : assetPath;
        return path.resolve(userDir, 'web', 'assets', this.dirname, realAssetPath);
      };

      const getLocalFilePath = (filePath: string) => {
        return path.resolve(userDir, 'plugins', this.dirname, filePath);
      };

      this.pluginModule.getLocalFilePath = getLocalFilePath;
      this.pluginModule.getSettings = () => {
        const settingsPath = getLocalFilePath('settings.json');
        if (!fs.existsSync(settingsPath)) {
          return undefined;
        }
        return JSON.parse(fs.readFileSync(settingsPath, { encoding: 'utf8' }));
      };

      this.pluginModule.setSettings = (settings: KeyedObject) => {
        const settingsPath = getLocalFilePath('settings.json');
        this.pluginModule!.settings = settings;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { encoding: 'utf8' });
      };

      this.pluginModule.getShareSettings = (shareId: string) => {
        const settingsPath = getLocalFilePath(path.join('_share', `${shareId}.json`));
        if (!fs.existsSync(settingsPath)) {
          return undefined;
        }
        return JSON.parse(fs.readFileSync(settingsPath, { encoding: 'utf8' }));
      };

      this.pluginModule.setShareSettings = (shareId: string, settings: KeyedObject) => {
        const settingsPath = getLocalFilePath(path.join('_share', `${shareId}.json`));
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { encoding: 'utf8' });
      };

      this.pluginModule.getSettingsForm = () => {
        const formPath = getLocalFilePath('settings-form.json');
        if (!fs.existsSync(formPath)) {
          return undefined;
        }
        return JSON.parse(fs.readFileSync(formPath, { encoding: 'utf8' }));
      };

      this.pluginModule.setSettingsForm = (form: KeyedObject) => {
        const formPath = getLocalFilePath('settings-form.json');
        fs.writeFileSync(formPath, JSON.stringify(form, null, 2), { encoding: 'utf8' });
      };

      this.pluginModule.getEventsForm = () => {
        const formPath = getLocalFilePath('events-form.json');
        if (!fs.existsSync(formPath)) {
          return undefined;
        }
        return JSON.parse(fs.readFileSync(formPath, { encoding: 'utf8' }));
      };

      this.pluginModule.setEventsForm = (form: KeyedObject) => {
        const formPath = getLocalFilePath('events-form.json');
        fs.writeFileSync(formPath, JSON.stringify(form, null, 2), { encoding: 'utf8' });
      };

      this.pluginModule.getAssetUrl = (assetPath: string) => {
        const publicHTTPUrl = WebService.getPublicHTTPUrl();
        if (!publicHTTPUrl) {
          return '';
        }
        return webJoin(publicHTTPUrl, 'assets', this.dirname, assetPath);
      };

      this.pluginModule.getOverlayUrl = () => {
        if (this.hasOverlay) {
          const shareKey = ShareService.getPluginShareKey(this.dirname);
          const publicHTTPUrl = WebService.getPublicHTTPUrl();
          if (!publicHTTPUrl) {
            return '';
          }
          return webJoin(publicHTTPUrl, 'overlay', this.dirname) + `?key=${shareKey}`;
        }
        return '';
      };

      this.pluginModule.getUtilityUrl = () => {
        if (this.hasUtility) {
          const shareKey = ShareService.getPluginShareKey(this.dirname);
          const publicHTTPUrl = WebService.getPublicHTTPUrl();
          if (!publicHTTPUrl) {
            return '';
          }
          return webJoin(publicHTTPUrl, 'utility', this.dirname) + `?key=${shareKey}`;
        }
        return '';
      };

      this.pluginModule.pluginLog = (content: any[]) => {
        pluginLog(this.dirname, ...content);
      };

      const spooderConfig = ConfigService.getConfig();
      this.pluginModule.spooderConfig = {
        ownerName: spooderConfig.bot.owner_name,
        botName: spooderConfig.bot.bot_name,
        host: spooderConfig.network.host,
        hostPort: spooderConfig.network.host_port,
        oscTcpPort: spooderConfig.network.osc.osc_tcp_port,
        oscUdpPort: spooderConfig.network.osc.osc_udp_port,
        externalHandle: spooderConfig.network.externalhandle,
      } as PluginConfigInfo;

      const spooderThemes = ConfigService.getThemes();
      this.pluginModule.spooderTheme = {
        webui: spooderThemes.webui,
        spooderPet: spooderThemes.spooderpet,
      } as PluginThemeInfo;

      this.pluginModule.activePlugins = PluginService.getActivePlugins();
      this.pluginModule.registerExtra = (key: string, value: any) => {
        this.extra[key] = value;
      };

      this.pluginModule.registerPluginApi = (
        router,
        method,
        address,
        funct: (req: Request, res: Response) => void,
      ) => registerPluginApi(this.pluginModule, router, method, address, funct);

      this.pluginModule.getActiveViewer = (req) => UserService.getActiveViewer(req as Request);

      if (fs.existsSync(path.resolve(userDir, 'plugins', pluginDirName, 'settings.json'))) {
        this.pluginModule.settings = JSON.parse(
          fs.readFileSync(path.resolve(userDir, 'plugins', pluginDirName, 'settings.json'), {
            encoding: 'utf8',
          }),
        );
        //console.log('Settings Loaded', this.pluginModule.settings);
        if (this.pluginModule.onSettings != null) {
          try {
            this.pluginModule.onSettings(this.pluginModule.settings ?? {});
          } catch (e) {
            pluginLog(this.dirname, 'onSettings failed:', e instanceof Error ? e.message : e);
          }
        }
      }
      console.log('Checking for onLoad for ' + pluginMeta.name, this.pluginModule.onLoad);
      if (this.pluginModule.onLoad != null) {
        try {
          this.pluginModule.onLoad();
        } catch (e) {
          pluginLog(this.dirname, 'onLoad failed:', e);
        }
      }
    } catch (e: any) {
      let pluginMetaPath = '';
      if (fs.existsSync(path.resolve(userDir, 'plugins', pluginDirName, 'package.json'))) {
        pluginMetaPath = path.resolve(userDir, 'plugins', pluginDirName, 'package.json');
      } else if (
        fs.existsSync(path.resolve(userDir, 'plugins', pluginDirName, 'build', 'manifest.json'))
      ) {
        pluginMetaPath = path.resolve(userDir, 'plugins', pluginDirName, 'build', 'manifest.json');
      }
      const pluginMeta = JSON.parse(
        fs.readFileSync(pluginMetaPath, {
          encoding: 'utf8',
        }),
      );

      this.name = pluginMeta.name;
      this.main = '';
      this.author = pluginMeta.author;
      this.dirname = pluginDirName;
      this.status = 'failed';
      this.description = e.code + ' - ' + e.message;
      this.dependencies = pluginMeta.dependencies;
      console.log('Refresh Failed', e);
    }
  }

  async buildPlugin() {
    return new Promise(async (res, rej) => {
      try {
        if (this.pluginMode === PluginMode.ts) {
          await new Promise((tsRes, tsRej) => {
            console.log('Transpiling plugin', this.dirname);
            childProcess.exec(
              `"${path.join(process.cwd(), 'node_modules', '.bin', 'tsc')}" --outDir ./js`,
              {
                cwd: path.resolve('user', 'plugins', this.dirname),
              },
              (error: any, out: any, err: any) => {
                console.log('Transpiled plugin', this.dirname, out);
                if (error) {
                  console.log('Build error', error);
                  tsRej(error);
                  return;
                }
                tsRes('OK');
                chmodr('./js', 0o755, (err: any) => {});
              },
            );
          });
        }

        console.log('IS DEV MODE', this.devMode);
        if (this.devMode) {
          const mainFile =
            this.pluginMode === PluginMode.ts
              ? `js/${this.main.substring(this.main.lastIndexOf('/') + 1).replace('.ts', '.js')}`
              : this.main;
          console.log('Building plugin', this.dirname, mainFile);

          childProcess.exec(
            `"${path.join(process.cwd(), 'node_modules', '.bin', 'ncc')}" build ${mainFile} -o build --source-map --minify`,
            {
              cwd: path.resolve('user', 'plugins', this.dirname),
            },
            (error: any, out: any, err: any) => {
              if (error) {
                console.log('Build error', error);
                rej(error);
                return;
              }
              console.log('Build complete!');
              const pluginMeta = JSON.parse(
                fs.readFileSync(path.resolve(this.pluginPath!, 'package.json'), {
                  encoding: 'utf8',
                }),
              );
              const manifest = {
                name: pluginMeta.name,
                display_name: pluginMeta.display_name ?? pluginMeta.name,
                main: mainFile,
                author: pluginMeta.author,
                version: pluginMeta.version,
                description: pluginMeta.description,
              };
              try {
                fs.writeFileSync(
                  path.resolve('user', 'plugins', this.dirname, 'build', 'manifest.json'),
                  JSON.stringify(manifest, null, 2),
                  { encoding: 'utf8' },
                );
                const jsPath = path.resolve('user', 'plugins', this.dirname, 'js');
                if (fs.existsSync(jsPath)) {
                  fs.rmSync(jsPath, { recursive: true });
                }
              } catch (e) {
                console.log('Failed to write manifest', e);
              }
              PluginService.setDevMode(this.dirname, false);
              PluginService.refreshPlugin(this.dirname);
              res('OK');
            },
          );
        } else {
          res('OK');
        }
      } catch (error) {
        rej(error);
      }
    });
  }

  onChat(message: StreamMessage) {
    try {
      this.pluginModule?.onChat?.(message);
    } catch (e) {
      pluginLog(this.dirname, this.dirname + ' onChat failed:', e);
    }
  }

  onCommunityChat(type: string, data: any) {
    try {
      this.pluginModule?.onCommunityChat?.(type, data);
    } catch (e) {
      pluginLog(this.dirname, this.dirname + ' onCommunityChat failed:', e);
    }
  }

  onOSC(message: OSC.Message) {
    try {
      this.pluginModule?.onOSC?.(message);
    } catch (e) {
      pluginLog(this.dirname, this.dirname + ' onOSC failed:', e);
    }
  }

  onEvent(event: string, data: KeyedObject) {
    try {
      this.pluginModule?.onEvent?.(event, data);
    } catch (e) {
      pluginLog(this.dirname, this.dirname + ' onEvent failed:', e);
    }
  }

  onStreamModuleEvent(moduleName: string, eventName: string, data: KeyedObject) {
    if (
      this.moduleEventSubscriptions.stream[moduleName] &&
      this.moduleEventSubscriptions.stream[moduleName][eventName]
    ) {
      this.moduleEventSubscriptions.stream[moduleName][eventName](data);
    }
  }

  onCommunityModuleEvent(moduleName: string, eventName: string, data: KeyedObject) {
    if (
      this.moduleEventSubscriptions.community[moduleName] &&
      this.moduleEventSubscriptions.community[moduleName][eventName]
    ) {
      this.moduleEventSubscriptions.community[moduleName][eventName](data);
    }
  }

  onControlModuleEvent(moduleName: string, eventName: string, data: KeyedObject) {
    if (
      this.moduleEventSubscriptions.control[moduleName] &&
      this.moduleEventSubscriptions.control[moduleName][eventName]
    ) {
      this.moduleEventSubscriptions.control[moduleName][eventName](data);
    }
  }

  getExtra(key: string) {
    return this.extra[key];
  }

  async destroy() {
    await this.pluginModule?.onDestroy?.();
    this.pluginModule = undefined;

    if (this.require) {
      if (this.modulePath) {
        const resolvedPath = this.require.resolve(this.modulePath);
        const module = this.require.cache[resolvedPath];

        if (module) {
          // Remove children from cache
          module.children.forEach((child: any) => {
            delete this.require!.cache[child.id];
          });
          // Remove the module itself from cache
          delete this.require.cache[resolvedPath];
        }
      }
    }

    this.modulePath = undefined;
  }
}
