import { spooderLog } from '../Logging';
import { compareVersions } from '../util/VersionUtil';
import { BlockedRelease, selectCompatibleRelease } from '../util/ReleaseCompatUtil';
import ModuleInstallService from './ModuleInstallService';
import RegistryService, { SourcedEntry } from './RegistryService';

// Finds out whether an installed module's backend has a newer release, without installing it.
//
// Unlike the web UIs, which are static files that swap in safely, a backend module is source
// that Spooder downloads, builds and restarts for - not something to do behind the user's back
// in the middle of a stream. So this only reports; the Modules tab offers the update as a
// button, and that goes through the same install route as a first install.

export interface ModuleUpdateInfo {
  installedVersion: string | null;
  // The version an update would install, or null when the module is current.
  available: string | null;
  // A newer release that was skipped because it needs a newer Spooder.
  blocked: BlockedRelease | null;
}

export default class ModuleUpdateService {
  private static results = new Map<string, ModuleUpdateInfo>();
  private static checking: Promise<void> | null = null;

  static get(id: string): ModuleUpdateInfo | null {
    return ModuleUpdateService.results.get(id) ?? null;
  }

  static all(): [string, ModuleUpdateInfo][] {
    return [...ModuleUpdateService.results.entries()];
  }

  /**
   * Checks every installed, registry-listed module. A module that is a live git checkout is
   * skipped: Spooder will not overwrite one, so offering an update for it would be a button
   * that can only fail.
   */
  static checkAll(force = false): Promise<void> {
    if (!ModuleUpdateService.checking) {
      ModuleUpdateService.checking = ModuleUpdateService.run(force).finally(() => {
        ModuleUpdateService.checking = null;
      });
    }
    return ModuleUpdateService.checking;
  }

  private static async run(force: boolean) {
    const catalogue = await RegistryService.getCatalogue(force);
    const spooderVersion = RegistryService.getSpooderVersion();
    const next = new Map<string, ModuleUpdateInfo>();

    for (const entry of catalogue.entries) {
      if (
        entry.kind !== 'module' ||
        !entry.server?.repo ||
        !ModuleInstallService.isInstalled(entry.id) ||
        ModuleInstallService.isDevelopmentCheckout(entry.id)
      ) {
        continue;
      }
      try {
        const info = await ModuleUpdateService.checkOne(entry, spooderVersion);
        next.set(entry.id, info);
        if (info.available) {
          spooderLog(
            `${entry.name} ${info.available} is available (installed ${info.installedVersion ?? 'unknown'}).`,
          );
        }
        if (info.blocked) {
          spooderLog(
            `${entry.name} ${info.blocked.version} needs Spooder ${info.blocked.requires}; update Spooder to get it.`,
          );
        }
      } catch (e: any) {
        spooderLog(`${entry.name} update check failed:`, e.message ?? e);
      }
    }
    ModuleUpdateService.results = next;
  }

  private static async checkOne(
    entry: SourcedEntry,
    spooderVersion: string,
  ): Promise<ModuleUpdateInfo> {
    const installedVersion = ModuleInstallService.getInstalledVersion(entry.id);
    const isNewer = (version: string) =>
      !installedVersion || compareVersions(version, installedVersion) > 0;

    // A pinned entry means "this exact reviewed release", so that is what an update is - the
    // repo's newer releases are not on offer until the registry moves the pin.
    if (entry.track === 'pinned' && entry.server?.version) {
      const pinned = entry.server.version;
      return {
        installedVersion,
        available: isNewer(pinned) ? pinned : null,
        blocked: null,
      };
    }

    const [owner, repo] = entry.server!.repo.split('/');
    const { release, blocked } = await selectCompatibleRelease(owner, repo, spooderVersion);
    return {
      installedVersion,
      available: release && isNewer(release.version) ? release.version : null,
      blocked: blocked && isNewer(blocked.version) ? blocked : null,
    };
  }
}
