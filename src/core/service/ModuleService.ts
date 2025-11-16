import { CommunityModuleInterface } from '../../interface/CommunityModuleInterface';
import { ControlModuleInterface } from '../../interface/ControlModuleInterface';
import { StreamModuleInterface } from '../../interface/StreamModuleInterface';
import { CoreModule, KeyedObject, PlatformType } from '../../Types';
import ConfigService from './ConfigService';
import { WebService } from './WebService';
import fs from 'fs';

interface ModuleContainer {
  [key: string]: StreamModuleInterface | CommunityModuleInterface | ControlModuleInterface;
}

interface StreamModuleContainer {
  [key: string]: StreamModuleInterface;
}

interface CommunityModuleContainer {
  [key: string]: CommunityModuleInterface;
}

interface ControlModuleContainer {
  [key: string]: ControlModuleInterface;
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

      const moduleFolders = fs.readdirSync('src/integration/');
      const moduleManifests: KeyedObject[] = [];

      moduleFolders.forEach(async (folder) => {
        const manifest = JSON.parse(
          fs.readFileSync(`src/integration/${folder}/manifest.json`, 'utf-8'),
        ) as KeyedObject;
        moduleManifests.push(manifest);
      });

      Promise.all(
        moduleManifests.map((manifest) => {
          if (!manifest.module_name || !manifest.module_type) {
            return Promise.reject('Invalid module manifest');
          }
          return ModuleService.registerIntegrationModule(
            manifest.module_name,
            manifest.module_type,
          );
        }),
      )
        .then(() => onAllModulesLoaded())
        .catch((e) => {
          console.log('Module load error', e);
        });
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
    return ModuleService.instance.activeControls as ControlModuleContainer;
  }

  static getStreamModules() {
    return ModuleService.instance.activeStreams as StreamModuleContainer;
  }

  static getCommunityModules() {
    return ModuleService.instance.activeCommunities as CommunityModuleContainer;
  }

  static findModule(
    name: string,
  ): StreamModuleInterface | CommunityModuleInterface | ControlModuleInterface | undefined {
    if (ModuleService.instance.activeStreams[name] !== undefined) {
      return ModuleService.instance.activeStreams[name];
    } else if (ModuleService.instance.activeCommunities[name] !== undefined) {
      return ModuleService.instance.activeCommunities[name];
    } else if (ModuleService.instance.activeControls[name] !== undefined) {
      return ModuleService.instance.activeControls[name];
    }

    return undefined;
  }

  static getResponseHandlers() {
    const masterHandlers = {} as KeyedObject;
    for (let s in ModuleService.instance.activeStreams) {
      masterHandlers[s] = ModuleService.instance.activeStreams[s].getResponseHandlers();
    }
    for (let s in ModuleService.instance.activeCommunities) {
      masterHandlers[s] = ModuleService.instance.activeCommunities[s].getResponseHandlers();
    }

    return masterHandlers;
  }

  static onExternalNetworkChanged() {
    const streamModules = ModuleService.getStreamModules();
    for (let s in streamModules) {
      streamModules[s].onExternalNetworkChanged();
    }
  }

  static onSharesChanged() {
    const streamModules = ModuleService.getStreamModules();
    for (let s in streamModules) {
      streamModules[s].onSharesChanged();
    }
  }

  static onPluginsLoaded() {
    const streamModules = ModuleService.getStreamModules();
    for (let s in streamModules) {
      streamModules[s].onPluginsLoaded();
    }
    const communityModules = ModuleService.getCommunityModules();
    for (let s in communityModules) {
      communityModules[s].onPluginsLoaded();
    }

    const controlModules = ModuleService.getControlModules();
    for (let s in controlModules) {
      controlModules[s].onPluginsLoaded();
    }
  }

  coreModules = {} as ModuleContainer;
  activeControls = {} as ModuleContainer;
  activeStreams = {} as ModuleContainer;
  activeCommunities = {} as ModuleContainer;

  static getModulePluginFunctions() {
    const streamModules = ModuleService.getStreamModules();
    const communityModules = ModuleService.getCommunityModules();
    const controlModules = ModuleService.getControlModules();

    let streamFunctions = {} as KeyedObject;
    let communityFunctions = {} as KeyedObject;
    let controlFunctions = {} as KeyedObject;
    for (let s in streamModules) {
      streamFunctions[s] = streamModules[s].getPluginFunctions();
    }
    for (let s in communityModules) {
      communityFunctions[s] = communityModules[s].getPluginFunctions();
    }
    for (let s in controlModules) {
      controlFunctions[s] = controlModules[s].getPluginFunctions();
    }

    return {
      stream: streamFunctions,
      community: communityFunctions,
      control: controlFunctions,
    };
  }

  async registerCoreModule(name: string, coreModule: CoreModule) {
    const newModule = await import(`../${name}/module`);
    this.coreModules[coreModule] = new newModule.default();
  }

  static async registerIntegrationModule(name: string, platformType: PlatformType) {
    return new Promise(async (res, rej) => {
      console.log('REGISTERING MOD', name);
      const newModule = await import(`../../integration/${name}/main`);

      if (platformType === PlatformType.stream) {
        ModuleService.instance.activeStreams[name] =
          new newModule.default() as StreamModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeStreams[name]);
      } else if (platformType === PlatformType.community) {
        ModuleService.instance.activeCommunities[name] =
          new newModule.default() as CommunityModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeCommunities[name]);
      } else if (platformType === PlatformType.control) {
        ModuleService.instance.activeControls[name] =
          new newModule.default() as ControlModuleInterface;
        WebService.registerModuleApi(ModuleService.instance.activeControls[name]);
      }
      res(undefined);
    }).catch((e) => {
      console.log('Module load error', e.message);
      return e;
    });
  }

  static async autoLoginModules() {
    for (let s in ModuleService.instance.activeStreams) {
      try {
        await ModuleService.instance.activeStreams[s].autoLogin();
      } catch (e) {
        console.log('Stream module auto-login error', e);
      }
    }
    for (let s in ModuleService.instance.activeCommunities) {
      try {
        await ModuleService.instance.activeCommunities[s].autoLogin();
      } catch (e) {
        console.log('Community module auto-login error', e);
      }
    }
    for (let s in ModuleService.instance.activeControls) {
      try {
        await ModuleService.instance.activeControls[s].autoLogin();
      } catch (e) {
        console.log('Control module auto-login error', e);
      }
    }
  }
}
