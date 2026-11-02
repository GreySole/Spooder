import fs, { existsSync } from 'fs';
import path from 'path';
import { CommunityModuleInterface } from '../../interface/CommunityModuleInterface';
import { ControlModuleInterface } from '../../interface/ControlModuleInterface';
import { StreamModuleInterface } from '../../interface/StreamModuleInterface';
import { CoreModule, KeyedObject, PlatformType } from '../../Types';
import ConfigService from './ConfigService';
import { WebService } from './WebService';
import { withLoading } from '../util/AppUtil';

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

      withLoading(async () => {
        const integrationPath = path.join(__dirname, '../../integration');
        if(!existsSync(integrationPath)){
          onAllModulesLoaded();
          return;
        }
        const files = await fs.promises.readdir(integrationPath);
        console.log('Found integration files', files);
        const results = await Promise.allSettled(
          files.map(async (file) => {
            try {
              const filePath = path.join(integrationPath, file);
              const stat = await fs.promises.stat(filePath);
              if (stat.isDirectory()) {
                const packageJsonPath = path.join(filePath, 'package.json');
                if (await fs.promises.stat(packageJsonPath).catch(() => false)) {
                  const packageJson = JSON.parse(
                    await fs.promises.readFile(packageJsonPath, 'utf-8'),
                  );
                  if (packageJson.spooder_module) {
                    const modInfo = packageJson.spooder_module;
                    const fileName = modInfo.file
                      ? modInfo.file.includes('.')
                        ? modInfo.file.substring(0, modInfo.file.lastIndexOf('.'))
                        : `${modInfo.file}`
                      : 'main';
                    if (
                      modInfo.type !== PlatformType.stream &&
                      modInfo.type !== PlatformType.community &&
                      modInfo.type !== PlatformType.control
                    ) {
                      console.log(
                        `Module ${modInfo.name} has invalid platform type ${modInfo.type}. Skipping module load.`,
                      );
                      return null;
                    }
                    return ModuleService.registerIntegrationModule(
                      modInfo.name,
                      modInfo.type,
                      fileName,
                    );
                  }
                }
              }
            } catch (e) {
              console.log(`Module load error for ${file}`, e);
            }
            return null;
          }),
        );
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.log('Module load error', result.reason);
          }
        });
        onAllModulesLoaded();
      });
    }
  }

  private static displayNames = new Map<string, string | undefined>();

  // The name a module is shown under in menus, from `spooder_module.displayName` in its
  // package.json. Absent for a module that doesn't declare one, and the caller falls back to
  // the module's own name.
  static getDisplayName(name: string): string | undefined {
    if (!ModuleService.displayNames.has(name)) {
      let displayName: string | undefined;
      try {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(__dirname, '../../integration', name, 'package.json'), 'utf-8'),
        );
        displayName = manifest?.spooder_module?.displayName;
      } catch (e) {
        // No package.json on disk for this name - nothing to display but the name itself.
      }
      ModuleService.displayNames.set(name, displayName);
    }
    return ModuleService.displayNames.get(name);
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

  static async registerIntegrationModule(
    name: string,
    platformType: PlatformType,
    fileName: string,
  ) {
    return new Promise(async (res, rej) => {
      console.log('REGISTERING MOD', name);
      const newModule = await import(`../../integration/${name}/${fileName}`);
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

  // A module's autoLogin can reject, throw, or never settle (bad refresh token, dead network).
  // None of that may hold up startup, or the web UI never comes up to fix it.
  private static async safeAutoLogin(kind: string, name: string, module: any) {
    const timeoutMs = 30000;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => module.autoLogin()),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        }),
      ]);
    } catch (e) {
      console.log(`${kind} module auto-login error (${name}), continuing startup`, e);
    } finally {
      clearTimeout(timer);
    }
  }

  static async autoLoginModules() {
    return withLoading(async () => {
      const inst = ModuleService.instance;
      for (const s in inst.activeStreams) {
        await ModuleService.safeAutoLogin('Stream', s, inst.activeStreams[s]);
      }
      for (const s in inst.activeCommunities) {
        await ModuleService.safeAutoLogin('Community', s, inst.activeCommunities[s]);
      }
      for (const s in inst.activeControls) {
        await ModuleService.safeAutoLogin('Control', s, inst.activeControls[s]);
      }
    });
  }
}
