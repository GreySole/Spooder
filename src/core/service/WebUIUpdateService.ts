import AdmZip from 'adm-zip';
import Axios from 'axios';
import fs from 'fs-extra';
import nodeSchedule from 'node-schedule';
import path from 'path';
import { spooderLog } from '../Logging';
import { compareVersions } from '../util/VersionUtil';
import { BlockedRelease, selectCompatibleRelease } from '../util/ReleaseCompatUtil';
import ConfigService from './ConfigService';
import RegistryService from './RegistryService';

interface WebUIModule {
  name: string;
  repoOwner: string;
  repoName: string;
}

export interface UpdateCheckResult {
  updated: string[];
  blocked: (BlockedRelease & { name: string })[];
}

interface ReleaseInfo {
  version: string;
  assetUrl: string;
}

// Each Spooder web UI lives in its own repo, with a GitHub Actions workflow that builds
// it and publishes the `build/` output as a zip asset on a tagged release (see each
// repo's .github/workflows/build-release.yml). This service never builds anything
// itself - it just checks each repo's latest release, and if it's newer than what's
// installed, downloads and unzips the prebuilt asset straight into webui/<name>/build.
// That's the whole point: end users get a finished build, no node/npm toolchain or
// submodule checkout required on the machine actually running Spooder.
const MODULES: WebUIModule[] = [
  { name: 'main', repoOwner: 'GreySole', repoName: 'Spooder-WebUI' },
  { name: 'init', repoOwner: 'GreySole', repoName: 'Spooder-InitUI' },
  { name: 'mod', repoOwner: 'GreySole', repoName: 'Spooder-ModUI' },
  { name: 'login', repoOwner: 'GreySole', repoName: 'Spooder-LoginUI' },
  { name: 'share', repoOwner: 'GreySole', repoName: 'Spooder-ShareUI' },
  { name: 'public', repoOwner: 'GreySole', repoName: 'Spooder-PublicUI' },
];

function buildDestDir(mod: WebUIModule) {
  return path.join('./', 'webui', mod.name, 'build');
}

// The installed release's version isn't derivable from anything else once build/ is just
// static files, so it's tracked in a small marker file dropped alongside them.
function versionMarkerPath(mod: WebUIModule) {
  return path.join(buildDestDir(mod), '.release-version');
}

function downloadTempZipPath(mod: WebUIModule) {
  return path.join('./', 'webui', mod.name, `${mod.name}-release.zip`);
}

export default class WebUIUpdateService {
  private static job: any = null;
  private static updating: boolean = false;
  private static launchChecked: boolean = false;

  // True once the named UI has a page in it. webui_update.enabled defaults to false, and that
  // setting governs whether Spooder keeps itself *current* - it says nothing about whether
  // there is a UI at all. A checkout with no build (a fresh clone, or one set up by an external
  // installer that only runs `npm install && npm run build`) has no app to serve regardless.
  private static hasBuild(name: string): boolean {
    return fs.existsSync(path.join('.', 'webui', name, 'build', 'index.html'));
  }

  static hasWebUI(): boolean {
    return WebUIUpdateService.hasBuild('main');
  }

  // The setup wizard Spooder serves before it has a config.json - a different WebService
  // instance, started from src/core/init/module.ts rather than spooder.ts, but it is exactly
  // as unable to serve a UI it has never downloaded.
  static hasInitUI(): boolean {
    return WebUIUpdateService.hasBuild('init');
  }

  // The in-flight first download, shared by every caller. ConfigService.refreshConfig() runs
  // at boot immediately before spooder.ts's own awaited call, and InitSchedule() below fires
  // this as a fire-and-forget safety net - so two calls landing back to back is the normal
  // case, not an edge case. checkForUpdate()'s own reentrancy guard resolves a second caller
  // immediately without waiting for the first to finish, which is fine for a periodic check
  // but wrong here: whoever is awaiting "is the UI ready" needs the real answer, not whichever
  // call happened to arrive second. Caching the promise means every caller awaits the same
  // download rather than racing to see who asked first - and since checkForUpdate(true) always
  // fetches every module in one pass, that one shared download satisfies whichever single
  // build a particular caller was actually waiting on.
  private static initialDownload: Promise<void> | null = null;

  private static ensureDownloaded(hasIt: () => boolean): Promise<void> {
    if (hasIt()) {
      return Promise.resolve();
    }
    if (!WebUIUpdateService.initialDownload) {
      spooderLog('No WebUI build found; downloading the latest release before starting.');
      WebUIUpdateService.initialDownload = WebUIUpdateService.checkForUpdate(true).then(() => {}).finally(() => {
        WebUIUpdateService.initialDownload = null;
      });
    }
    return WebUIUpdateService.initialDownload;
  }

  /**
   * Downloads the main WebUI if it is not already present, otherwise resolves immediately.
   *
   * Called and awaited at boot, before WebService starts accepting connections - a checkout
   * with no build must not start serving an empty directory while the download happens in the
   * background, or the first request (and the manager app's own "is it ready yet" check) would
   * hit a 404 that looks like a broken install rather than one still finishing.
   */
  static ensureInitialDownload(): Promise<void> {
    return WebUIUpdateService.ensureDownloaded(WebUIUpdateService.hasWebUI);
  }

  /**
   * Same as ensureInitialDownload, gating on the init wizard's build instead of the main UI's -
   * for the boot path a checkout with no config.json takes, which serves webui/init/build from
   * an entirely separate WebService instance and would otherwise never trigger a download at
   * all, since it never reaches ConfigService.refreshConfig().
   */
  static ensureInitUIDownload(): Promise<void> {
    return WebUIUpdateService.ensureDownloaded(WebUIUpdateService.hasInitUI);
  }

  static InitSchedule() {
    if (WebUIUpdateService.job) {
      WebUIUpdateService.job.cancel();
      WebUIUpdateService.job = null;
    }

    // A safety net, not the primary path - spooder.ts awaits ensureInitialDownload() before
    // the server starts. This only matters if that first attempt failed and something later
    // calls InitSchedule again (e.g. a config save) while the build is still missing.
    if (!WebUIUpdateService.hasWebUI()) {
      WebUIUpdateService.ensureInitialDownload().catch((e) =>
        spooderLog('WebUI download failed:', e.message ?? e),
      );
    }

    const settings = ConfigService.getConfig().webui_update;

    // Once per launch, not once per InitSchedule - this also runs on every config save, and
    // the midnight schedule would otherwise leave a UI release up to a day away after a start.
    if (settings?.enabled && !WebUIUpdateService.launchChecked && WebUIUpdateService.hasWebUI()) {
      WebUIUpdateService.launchChecked = true;
      WebUIUpdateService.checkForUpdate().catch((e) =>
        spooderLog('WebUI launch update check failed:', e.message ?? e),
      );
    }

    if (settings?.enabled) {
      WebUIUpdateService.job = nodeSchedule.scheduleJob(settings.schedule, () => {
        WebUIUpdateService.checkForUpdate().catch((e) =>
          spooderLog('WebUI update check failed:', e.message ?? e),
        );
      });
    }
  }

  static getLocalVersion(mod: WebUIModule): string | null {
    try {
      const version = fs.readFileSync(versionMarkerPath(mod), 'utf8').trim();
      return version || null;
    } catch (e) {
      return null;
    }
  }

  // Checks every configured web UI module in turn (sequential, so downloads don't compete
  // for bandwidth or interleave their logs) and updates whichever ones have a newer release.
  // Resolves to the repo names that were actually installed or updated, and to the releases
  // that were left alone because they need a newer Spooder.
  static async checkForUpdate(force = false): Promise<UpdateCheckResult> {
    const result: UpdateCheckResult = { updated: [], blocked: [] };
    if (WebUIUpdateService.updating) {
      spooderLog('WebUI update already in progress, skipping check');
      return result;
    }

    WebUIUpdateService.updating = true;
    try {
      for (const mod of MODULES) {
        try {
          const outcome = await WebUIUpdateService.checkModule(mod, force);
          if (outcome.updated) {
            result.updated.push(mod.repoName);
          }
          if (outcome.blocked) {
            result.blocked.push({ name: mod.repoName, ...outcome.blocked });
          }
        } catch (e: any) {
          spooderLog(`${mod.repoName} update failed:`, e.message ?? e);
        }
      }
    } finally {
      WebUIUpdateService.updating = false;
    }

    // Module UIs are downloaded the same way and on the same schedule - to a user there is no
    // difference between the WebUI being out of date and a module's tab being out of date.
    // Imported lazily so ModuleUIService's route back to ModuleService is never part of load
    // order, the same reason PluginRepoService is loaded that way in ConfigService.
    try {
      const { default: ModuleUIService } = await import('./ModuleUIService');
      const moduleResult = await ModuleUIService.checkForUpdate(force);
      result.updated.push(...moduleResult.updated);
      result.blocked.push(...moduleResult.blocked);
    } catch (e: any) {
      spooderLog('Module UI update check failed:', e.message ?? e);
    }

    // Backend modules are only reported, never installed - see ModuleUpdateService.
    try {
      const { default: ModuleUpdateService } = await import('./ModuleUpdateService');
      await ModuleUpdateService.checkAll();
    } catch (e: any) {
      spooderLog('Module update check failed:', e.message ?? e);
    }
    return result;
  }

  private static async checkModule(
    mod: WebUIModule,
    force: boolean,
  ): Promise<{ updated: boolean; blocked: BlockedRelease | null }> {
    const localVersion = WebUIUpdateService.getLocalVersion(mod);
    const { release, blocked } = await selectCompatibleRelease(
      mod.repoOwner,
      mod.repoName,
      RegistryService.getSpooderVersion(),
    );

    // Only worth mentioning when it is something the user does not already have.
    const worthMentioning =
      blocked && (!localVersion || compareVersions(blocked.version, localVersion) > 0)
        ? blocked
        : null;
    if (worthMentioning) {
      spooderLog(
        `${mod.repoName} ${worthMentioning.version} needs Spooder ${worthMentioning.requires}; update Spooder to get it.`,
      );
    }

    if (!release) {
      return { updated: false, blocked: worthMentioning };
    }

    if (!force && localVersion && compareVersions(release.version, localVersion) <= 0) {
      spooderLog(`${mod.repoName} is up to date (${localVersion})`);
      return { updated: false, blocked: worthMentioning };
    }

    spooderLog(
      `Updating ${mod.repoName}: ${localVersion ?? 'not installed'} -> ${release.version}`,
    );

    await WebUIUpdateService.downloadAndInstall(mod, release);

    spooderLog(`${mod.repoName} updated to ${release.version}`);
    return { updated: true, blocked: worthMentioning };
  }

  private static async downloadAndInstall(mod: WebUIModule, release: ReleaseInfo) {
    const response = await Axios({
      url: release.assetUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      headers: { Accept: 'application/octet-stream' },
    });

    const zipPath = downloadTempZipPath(mod);
    fs.ensureDirSync(path.dirname(zipPath));
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    try {
      const dest = buildDestDir(mod);
      const tempExtractDir = `${dest}.tmp`;

      fs.removeSync(tempExtractDir);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempExtractDir, true);

      fs.removeSync(dest);
      fs.moveSync(tempExtractDir, dest);

      fs.writeFileSync(versionMarkerPath(mod), release.version, 'utf-8');
    } finally {
      fs.removeSync(zipPath);
    }
  }
}
