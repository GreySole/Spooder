import { userDir, KeyedObject, StreamMessage } from './Types.ts';
import path, { resolve } from 'path';
import fs from 'fs';
import ModuleService from './core/service/ModuleService.ts';
import os from 'os';
import OSC from '@greysole/osc-js';
import { createRequire } from 'module';
import PluginService from './core/service/PluginService.ts';
import OSCService from './core/service/OSCService.ts';
import { WebService } from './core/service/WebService.ts';
import { registerPluginApi } from './core/routes/PluginRoutes.ts';
import { Request, Response } from 'express';
import UserService from './core/service/UserService.ts';
import ConfigService from './core/service/ConfigService.ts';
import childProcess from 'child_process';
import chmodr from 'chmodr';
import { sayInChat } from './core/service/EventService.ts';
import { pluginLog } from './core/Logging.ts';
import ShareService from './core/service/ShareService.ts';
import { webJoin } from './core/util/PathUtil.ts';

interface PluginSpooderModules {
  stream: KeyedObject;
  community: KeyedObject;
  control: KeyedObject;
}

interface PluginPublicInfo {
  publicHostUrl: string;
  publicOscUrl: string;
}

interface PluginOscInfo {
  sendToTCP: (address: string, oscValue: any, log?: boolean) => void;
  sendToUDP: (address: string, oscValue: any, log?: boolean) => void;
  udpServers: KeyedObject;
}

interface PluginConfigInfo {
  ownerName: string;
  botName: string;
  host: string;
  hostPort: number;
  oscTcpPort: number;
  oscUdpPort: number;
  externalHandle: string;
}

interface PluginThemeInfo {
  webui: KeyedObject;
  spooderPet: KeyedObject;
}

interface PluginChatInfo {
  sayInChat: (message: string, platform: string, channel: string) => void;
}

interface PluginModule {
  dirname: string;
  modules: PluginSpooderModules;
  activePlugins: KeyedObject;
  spooderConfig: PluginConfigInfo;
  spooderTheme: PluginThemeInfo;
  osc: PluginOscInfo;
  public: PluginPublicInfo;
  chat: PluginChatInfo;
  registerPluginApi: (
    router: 'local' | 'public',
    method: 'get' | 'post' | 'put' | 'delete',
    address: string,
    funct: (req: Request, res: Response) => void,
  ) => void;
  getActiveViewer: (req: Request) => KeyedObject | undefined;
  getAssetPath: (assetPath: string) => string;
  getLocalFilePath: (filePath: string) => string;
  getOverlayUrl: () => string;
  getUtilityUrl: () => string;
  settings?: KeyedObject;
  onSettings?: (settings: KeyedObject) => void;
  onLoad?: () => void;
  onDestroy?: () => void;
  onChat?: (message: StreamMessage) => void;
  onCommunityChat?: (type: string, data: any) => void;
  onOSC?: (message: OSC.Message) => void;
  onEvent?: (event: string, data: KeyedObject) => void;
  registerExtra: (key: string, value: any) => void;
}

enum PluginMode {
  ncc = 'ncc',
  js = 'js',
  ts = 'ts',
  legacy = 'legacy',
  none = 'none',
}

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
  private require: NodeJS.Require | undefined = undefined;

  constructor(pluginDirName: string, pluginPath: string) {
    const tsConfigPath = resolve(pluginPath, 'tsconfig.json');

    try {
      let pluginMeta = undefined;
      let devMode = PluginService.isPluginInDevMode(pluginDirName);
      if (!devMode && fs.existsSync(path.resolve(pluginPath, 'build', 'manifest.json'))) {
        pluginMeta = JSON.parse(
          fs.readFileSync(pluginPath + '/build/manifest.json', {
            encoding: 'utf8',
          }),
        );
        this.pluginMode = PluginMode.ncc;
      } else if (fs.existsSync(path.resolve(pluginPath, 'package.json'))) {
        pluginMeta = JSON.parse(
          fs.readFileSync(pluginPath + '/package.json', {
            encoding: 'utf8',
          }),
        );
        this.pluginMode = fs.existsSync(tsConfigPath) ? PluginMode.ts : PluginMode.legacy;
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

      const isWindows = os.platform() === 'win32';
      let modulePath = undefined;
      if (this.pluginMode === PluginMode.ncc) {
        modulePath = isWindows
          ? `file://${pluginPath}/build/${pluginMeta.main}`
          : `${pluginPath}/build/${pluginMeta.main}`;
      } else {
        modulePath = isWindows
          ? `file://${pluginPath}/${pluginMeta.main}`
          : `${pluginPath}/${pluginMeta.main}`;
      }

      if (!modulePath) {
        throw new Error('Plugin main file not found');
      }

      this.modulePath = modulePath;

      this.name = pluginMeta.name;
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

      console.log('Using tsconfig:', tsConfigPath);

      let module: any;

      this.require = createRequire(resolve(pluginPath)); // Adjust to the plugin's entry point
      if (fs.existsSync(tsConfigPath) && devMode) {
        this.require('ts-node').register({
          project: resolve(userDir, 'plugins', pluginDirName, 'tsconfig.json'),
          skipProject: false,
          transpileOnly: true,
        });
        module = this.require(modulePath).default;
      } else if (this.pluginMode === PluginMode.js || this.pluginMode === PluginMode.ncc) {
        console.log('Loading DEFAULT MODULE in plugin', modulePath);
        module = this.require(modulePath).default;
      } else {
        module = this.require(modulePath);
      }

      if (!module) {
        throw new Error('Plugin module not found');
      }

      this.pluginModule = new module() as PluginModule;

      if (!this.pluginModule) {
        throw new Error('Plugin not found');
      }

      this.pluginModule.dirname = pluginDirName;

      const functions = ModuleService.getModulePluginFunctions();

      this.pluginModule.modules = {
        stream: functions.stream,
        community: functions.community,
        control: functions.control,
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

      this.pluginModule.chat = {
        sayInChat: sayInChat,
      };

      this.pluginModule.getAssetPath = (assetPath: string) => {
        return path.resolve(userDir, 'web', 'assets', this.dirname, assetPath);
      };

      this.pluginModule.getLocalFilePath = (filePath: string) => {
        return path.resolve(userDir, 'plugins', this.dirname, filePath);
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

      this.pluginModule.getActiveViewer = UserService.getActiveViewer;

      if (fs.existsSync(userDir + '/plugins/' + pluginDirName + '/settings.json')) {
        this.pluginModule.settings = JSON.parse(
          fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/settings.json', {
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
          pluginLog(this.dirname, 'onLoad failed:', e instanceof Error ? e.message : e);
        }
      }
    } catch (e: any) {
      const pluginMeta = JSON.parse(
        fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/package.json', {
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
    if (this.pluginMode === PluginMode.ts) {
      await new Promise((res, rej) => {
        console.log('Transpiling plugin', this.dirname);
        childProcess.exec(
          `tsc --outDir ./js`,
          {
            cwd: path.resolve('user', 'plugins', this.dirname),
          },
          (error: any, out: any, err: any) => {
            console.log('Transpiled plugin', this.dirname, out);
            if (error) {
              rej(error);
              return;
            }
            res('OK');
            chmodr('./js', 0o755, (err: any) => {});
          },
        );
      });
    }
    if (this.devMode && (PluginMode.ts === this.pluginMode || this.dirname === 'animallauncher')) {
      const mainFile =
        this.pluginMode === PluginMode.ts
          ? `${this.main.substring(this.main.lastIndexOf('/') + 1).replace('.ts', '.js')}`
          : this.main;
      console.log('Building plugin', this.dirname, mainFile);
      return new Promise((res, rej) => {
        childProcess.exec(
          `ncc build ${this.pluginMode === PluginMode.ts ? `js/${mainFile}` : mainFile} -o build --source-map`,
          {
            cwd: path.resolve('user', 'plugins', this.dirname),
          },
          (error: any, out: any, err: any) => {
            if (error) {
              rej(error);
              return;
            }
            const manifest = {
              name: this.name,
              main: mainFile,
              version: this.version,
              description: this.description,
            };
            try {
              fs.writeFileSync(
                path.resolve('user', 'plugins', this.dirname, 'build', 'manifest.json'),
                JSON.stringify(manifest, null, 2),
                { encoding: 'utf8' },
              );
              fs.rmSync(path.resolve('user', 'plugins', this.dirname, 'js'), { recursive: true });
            } catch (e) {
              console.log('Failed to write manifest', e);
            }
            PluginService.refreshPlugin(this.dirname);
            res('OK');
          },
        );
      });
    }
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
