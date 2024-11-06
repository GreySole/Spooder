import { CommunityModuleInterface } from '../../integration/interface/CommunityModuleInterface.ts';
import { ControlModuleInterface } from '../../integration/interface/ControlModuleInterface.ts';
import { StreamModuleInterface } from '../../integration/interface/StreamModuleInterface.ts';
import { CoreModule, PlatformType } from '../../Types.ts';
import ConfigService from './ConfigService.ts';
import { WebService } from './WebService.ts';

interface ModuleContainer {
  [key: string]: any;
}

export default class ModuleService {
  private static instance: ModuleService;

  constructor(onAllModulesLoaded: () => void) {
    if (ModuleService.instance) {
      return ModuleService.instance;
    }

    ModuleService.instance = this;

    if (ConfigService.getFlags().initMode) {
      this.registerCoreModule(CoreModule.init, CoreModule.init);
    } else {
      console.log('REGISTERING MODULES');

      Promise.all([
        ModuleService.registerIntegrationModule('twitch', PlatformType.stream),
        ModuleService.registerIntegrationModule('discord', PlatformType.community),
        ModuleService.registerIntegrationModule('obs', PlatformType.control),
      ])
        .then(() => onAllModulesLoaded())
        .catch((e) => console.log('Module load error', e.message));
    }
  }

  static getCoreModule(module: CoreModule) {
    return ModuleService.instance.coreModules[module];
  }

  static getControlModule(name: string) {
    return ModuleService.instance.activeControls[name] as ControlModuleInterface;
  }

  static getStreamModule(name: string) {
    return ModuleService.instance.activeStreams[name] as StreamModuleInterface;
  }

  static getCommunityModule(name: string) {
    return ModuleService.instance.activeCommunities[name] as CommunityModuleInterface;
  }

  static getCoreModules() {
    return ModuleService.instance.coreModules;
  }

  static getControlModules() {
    return ModuleService.instance.activeControls;
  }

  static getStreamModules() {
    return ModuleService.instance.activeStreams;
  }

  static getCommunityModules() {
    return ModuleService.instance.activeCommunities;
  }

  static findModule(name: string) {
    if (ModuleService.instance.activeStreams[name] !== undefined) {
      return ModuleService.instance.activeStreams[name];
    } else if (ModuleService.instance.activeCommunities[name] !== undefined) {
      return ModuleService.instance.activeCommunities[name];
    }

    return undefined;
  }

  static onExternalNetworkChanged() {
    const streamModules = ModuleService.getStreamModules();
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

  static async registerIntegrationModule(name: string, platformType: PlatformType) {
    return new Promise(async (res, rej) => {
      console.log('REGISTERING MOD', name);
      const newModule = await import(`../../integration/${name}/main.ts`);
      if (platformType === PlatformType.stream) {
        ModuleService.instance.activeStreams[name] =
          new newModule.default() as StreamModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeStreams[name]);
        ModuleService.instance.activeStreams[name].autoLogin();
      } else if (platformType === PlatformType.community) {
        ModuleService.instance.activeCommunities[name] =
          new newModule.default() as CommunityModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeCommunities[name]);
        ModuleService.instance.activeCommunities[name].autoLogin();
      } else if (platformType === PlatformType.control) {
        ModuleService.instance.activeControls[name] =
          new newModule.default() as ControlModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeControls[name]);
      }
      res(undefined);
    }).catch((e) => console.log('Module load error', e.message));
  }
}
