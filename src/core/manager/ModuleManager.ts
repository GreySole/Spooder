import { CommunityModuleInterface } from '../../integration/interface/CommunityModuleInterface.ts';
import { ControlModuleInterface } from '../../integration/interface/ControlModuleInterface.ts';
import { StreamModuleInterface } from '../../integration/interface/StreamModuleInterface.ts';
import { CoreModule, PlatformType } from '../../Types.ts';
import ConfigManager from './ConfigManager.ts';
import { WebManager } from './webui/WebManager.ts';

interface ModuleContainer {
  [key: string]: any;
}

export default class ModuleManager {
  private static instance: ModuleManager;

  constructor(onAllModulesLoaded: () => void) {
    if (ModuleManager.instance) {
      return ModuleManager.instance;
    }

    ModuleManager.instance = this;

    if (ConfigManager.getFlags().initMode) {
      this.registerCoreModule(CoreModule.init, CoreModule.init);
    } else {
      console.log('REGISTERING MODULES');

      Promise.all([
        this.registerIntegrationModule('twitch', PlatformType.stream),
        this.registerIntegrationModule('discord', PlatformType.community),
      ])
        .then(() => onAllModulesLoaded())
        .catch((e) => console.log('Module load error', e.message));
    }
  }

  static getCoreModule(module: CoreModule) {
    return ModuleManager.instance.coreModules[module];
  }

  static getControlModule(name: string) {
    return ModuleManager.instance.activeControls[name] as ControlModuleInterface;
  }

  static getStreamModule(name: string) {
    return ModuleManager.instance.activeStreams[name] as StreamModuleInterface;
  }

  static getCommunityModule(name: string) {
    return ModuleManager.instance.activeCommunities[name] as CommunityModuleInterface;
  }

  static getCoreModules() {
    return ModuleManager.instance.coreModules;
  }

  static getControlModules() {
    return ModuleManager.instance.activeControls;
  }

  static getStreamModules() {
    console.log('GETSTREAMMODS', ModuleManager.instance.activeStreams);
    return ModuleManager.instance.activeStreams;
  }

  static getCommunityModules() {
    return ModuleManager.instance.activeCommunities;
  }

  static findModule(name: string) {
    if (ModuleManager.instance.activeStreams[name] !== undefined) {
      return ModuleManager.instance.activeStreams[name];
    } else if (ModuleManager.instance.activeCommunities[name] !== undefined) {
      return ModuleManager.instance.activeCommunities[name];
    }

    return undefined;
  }

  static onExternalNetworkChanged() {
    const streamModules = ModuleManager.getStreamModules();
    for (let s in streamModules) {
      streamModules.onExternalNetworkChanged();
    }
  }

  coreModules = {} as ModuleContainer;
  activeControls = {} as ModuleContainer;
  activeStreams = {} as ModuleContainer;
  activeCommunities = {} as ModuleContainer;

  async registerCoreModule(name: string, coreModule: CoreModule) {
    const newModule = await import(`../${name}/module.ts`);
    this.coreModules[coreModule] = new newModule.default();
  }

  async registerIntegrationModule(name: string, platformType: PlatformType) {
    return new Promise(async (res, rej) => {
      console.log('REGISTERING MOD', name);
      const newModule = await import(`../../integration/${name}/main.ts`);
      if (platformType === PlatformType.stream) {
        ModuleManager.instance.activeStreams[name] =
          new newModule.default() as StreamModuleInterface;
        WebManager.registerModuleApi(ModuleManager.instance.activeStreams[name]);
        ModuleManager.instance.activeStreams[name].autoLogin();
      } else if (platformType === PlatformType.community) {
        ModuleManager.instance.activeCommunities[name] =
          new newModule.default() as CommunityModuleInterface;
        WebManager.registerModuleApi(ModuleManager.instance.activeCommunities[name]);
        ModuleManager.instance.activeCommunities[name].autoLogin();
      } else if (platformType === PlatformType.control) {
        ModuleManager.instance.activeControls[name] =
          new newModule.default() as ControlModuleInterface;
      }
      res(undefined);
    }).catch((e) => console.log('Module load error', e.message));
  }
}
