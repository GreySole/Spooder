import { userDir, KeyedObject } from './Types.ts';
import path from 'path';
import fs from 'fs';
import ModuleService from './core/service/ModuleService.ts';
import os from 'os';

interface PluginModule {
  settings?: KeyedObject;
  onSettings?: (settings: KeyedObject) => void;
  onDestroy?: () => void;
  streamModules: KeyedObject;
  communityModules: KeyedObject;
  controlModules: KeyedObject;
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

  private pluginModule: PluginModule | undefined = undefined;

  constructor(pluginDirName: string, pluginPath: string) {
    console.log(
      'LOADING PLUGIN',
      path.resolve(pluginPath, 'package.json'),
      path.resolve(userDir, 'plugins', pluginDirName, 'package.json'),
      fs.existsSync(path.resolve(userDir, 'plugins', pluginDirName, 'package.json')),
    );
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

        this.name = pluginMeta.name;
        this.dirname = pluginDirName;
        this.author = pluginMeta.author;
        this.version = pluginMeta.version;
        this.description = pluginMeta.description;
        this.dependencies = pluginMeta.dependencies;
        let overlayDir = path.join(userDir, 'web', 'overlay', pluginDirName);
        let utilityDir = path.join(userDir, 'web', 'utility', pluginDirName);
        let publicDir = path.join(userDir, 'web', 'public', pluginDirName);
        this.hasOverlay = fs.existsSync(overlayDir);
        this.hasUtility = fs.existsSync(utilityDir);
        this.hasPublic = fs.existsSync(publicDir);
        this.status = 'ok';

        import(modulePath).then((module) => {
          this.pluginModule = new module.default() as PluginModule;

          if (!this.pluginModule) {
            throw new Error('Plugin not found');
          }

          this.pluginModule.streamModules = ModuleService.getStreamModules();
          this.pluginModule.communityModules = ModuleService.getCommunityModules();
          this.pluginModule.controlModules = ModuleService.getControlModules();

          if (fs.existsSync(userDir + '/plugins/' + pluginDirName + '/settings.json')) {
            this.pluginModule.settings = JSON.parse(
              fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/settings.json', {
                encoding: 'utf8',
              }),
            );

            if (this.pluginModule.onSettings != null) {
              this.pluginModule.onSettings(this.pluginModule.settings ?? {});
            }
          }
        });
      }
    } catch (e: any) {
      let pluginMeta = JSON.parse(
        fs.readFileSync(userDir + '/plugins/' + pluginDirName + '/package.json', {
          encoding: 'utf8',
        }),
      );

      this.name = pluginDirName;
      this.dirname = pluginDirName;
      this.status = 'failed';
      this.description = e.code + ' - ' + e.message;
      this.dependencies = pluginMeta.dependencies;
      console.log('Refresh Failed', e);
    }
  }

  async destroy() {
    await this.pluginModule?.onDestroy?.();
    this.pluginModule = undefined;
  }
}
