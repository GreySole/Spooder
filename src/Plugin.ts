import { userDir, KeyedObject, StreamMessage } from './Types.ts';
import path from 'path';
import fs from 'fs';
import ModuleService from './core/service/ModuleService.ts';
import os from 'os';
import OSC from 'osc-js';
import { createRequire } from 'module';
import PluginService from './core/service/PluginService.ts';

interface PluginModule {
  streamModules: KeyedObject;
  communityModules: KeyedObject;
  controlModules: KeyedObject;
  settings?: KeyedObject;
  onSettings?: (settings: KeyedObject) => void;
  onLoad?: () => void;
  onDestroy?: () => void;
  onChat?: (message: StreamMessage) => void;
  onOSC?: (message: OSC.Message) => void;
  onEvent?: (event: string, data: KeyedObject) => void;
  registerExtra: (key: string, value: any) => void;
}

export default class Plugin {
  name: string = '';
  dirname: string = '';
  author: string = '';
  version: string = '';
  description: string = '';
  dependencies: string = '';
  hasOverlay: boolean = false;
  hasUtility: boolean = false;
  hasPublic: boolean = false;
  status: string = '';
  extra: KeyedObject = {};

  private pluginModule: PluginModule | undefined = undefined;
  private modulePath: string | undefined = undefined;
  private require: NodeJS.Require | undefined = undefined;

  constructor(require: NodeJS.Require, pluginDirName: string, pluginPath: string) {
    this.require = require;

    if (!PluginService.isPluginEnabled(pluginDirName)) {
      const pluginMeta = JSON.parse(
        fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/package.json', {
          encoding: 'utf8',
        }),
      );
      this.name = pluginMeta.name;
      this.author = pluginMeta.author;
      this.dirname = pluginDirName;
      this.status = 'disabled';
      this.description = pluginMeta.description;
      this.dependencies = pluginMeta.dependencies;
      return;
    }

    try {
      if (fs.existsSync(path.resolve(pluginPath, 'package.json'))) {
        let pluginMeta = JSON.parse(
          fs.readFileSync(pluginPath + '/package.json', {
            encoding: 'utf8',
          }),
        );

        const isWindows = os.platform() === 'win32';
        const modulePath = isWindows
          ? `file://${pluginPath}/${pluginMeta.main}`
          : `${pluginPath}/${pluginMeta.main}`;

        this.modulePath = modulePath;

        this.name = pluginMeta.name;
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
        this.extra = {} as KeyedObject;

        const module = this.require(modulePath);

        this.pluginModule = new module() as PluginModule;

        if (!this.pluginModule) {
          throw new Error('Plugin not found');
        }

        this.pluginModule.streamModules = ModuleService.getStreamModules();
        this.pluginModule.communityModules = ModuleService.getCommunityModules();
        this.pluginModule.controlModules = ModuleService.getControlModules();
        this.pluginModule.registerExtra = (key: string, value: any) => {
          this.extra[key] = value;
        };

        if (fs.existsSync(userDir + '/plugins/' + pluginDirName + '/settings.json')) {
          this.pluginModule.settings = JSON.parse(
            fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/settings.json', {
              encoding: 'utf8',
            }),
          );
          //console.log('Settings Loaded', this.pluginModule.settings);
          if (this.pluginModule.onSettings != null) {
            this.pluginModule.onSettings(this.pluginModule.settings ?? {});
          }
        }

        if (this.pluginModule.onLoad != null) {
          this.pluginModule.onLoad();
        }
      }
    } catch (e: any) {
      const pluginMeta = JSON.parse(
        fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/package.json', {
          encoding: 'utf8',
        }),
      );

      this.name = pluginMeta.name;
      this.author = pluginMeta.author;
      this.dirname = pluginDirName;
      this.status = 'failed';
      this.description = e.code + ' - ' + e.message;
      this.dependencies = pluginMeta.dependencies;
      console.log('Refresh Failed', e);
    }
  }

  onChat(message: StreamMessage) {
    this.pluginModule?.onChat?.(message);
  }

  onOSC(message: OSC.Message) {
    this.pluginModule?.onOSC?.(message);
  }

  onEvent(event: string, data: KeyedObject) {
    this.pluginModule?.onEvent?.(event, data);
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
