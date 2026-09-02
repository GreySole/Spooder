import AdmZip from 'adm-zip';
import Axios from 'axios';
import fs from 'fs-extra';
import { downloadToFile } from '../util/DownloadUtil';
import path from 'path';
import { userDir } from '../../Types';
import { spooderLog } from '../Logging';
import { compareVersions } from '../util/VersionUtil';
import ModuleService from './ModuleService';

// A module has two halves in different places. Its backend half is TypeScript compiled into
// dist by Spooder's own build, so it ships with Spooder. Its WebUI half is a Module Federation
// remote - static files - so it does not need to be built here at all: this service downloads
// the prebuilt output from the module's own GitHub release and serves it, the same trick
// WebUIUpdateService uses for the web UIs themselves.
//
// Which repo to pull is declared by the backend module, in the `webui` block of its
// spooder_module manifest, so the pairing lives with the module rather than in a list here:
//
//   "spooder_module": {
//     "name": "twitch",
//     "type": "stream",
//     "file": "twitch.ts",
//     "webui": { "repoOwner": "GreySole", "repoName": "Spooder-WebUI-Twitch-Module" }
//   }
//
// Installed UIs live under user/, not next to the WebUI build, so that updating either Spooder
// or the WebUI does not wipe them.

export interface ModuleUIDescriptor {
  key: string;
  url: string;
  version: string | null;
}

interface ModuleUIRepo {
  key: string;
  repoOwner: string;
  repoName: string;
}

interface ReleaseInfo {
  version: string;
  assetUrl: string;
  // Present only when the registry pinned this release; a 'latest' entry has no reviewed hash.
  sha256?: string | null;
}

const MANIFEST_FILENAME = 'mf-manifest.json';

export function moduleUIDir(key: string) {
  return path.join(userDir, 'modules', key, 'web');
}

function versionMarkerPath(key: string) {
  return path.join(moduleUIDir(key), '.release-version');
}

export default class ModuleUIService {
  private static updating = false;

  /**
   * The module UIs actually present on disk, as the WebUI's loader wants them: a name and the
   * URL of the remote's manifest. A module whose backend half is loaded but whose UI has never
   * been downloaded is simply absent - the WebUI then shows no tab for it, which is honest.
   */
  static getInstalled(): ModuleUIDescriptor[] {
    const descriptors: ModuleUIDescriptor[] = [];
    for (const repo of ModuleUIService.getModuleUIRepos()) {
      const manifest = path.join(moduleUIDir(repo.key), MANIFEST_FILENAME);
      if (!fs.existsSync(manifest)) {
        continue;
      }
      descriptors.push({
        key: repo.key,
        url: `/modules/${repo.key}/${MANIFEST_FILENAME}`,
        version: ModuleUIService.getLocalVersion(repo.key),
      });
    }
    return descriptors;
  }

  static getLocalVersion(key: string): string | null {
    try {
      return fs.readFileSync(versionMarkerPath(key), 'utf-8').trim() || null;
    } catch (e) {
      return null;
    }
  }

  // Read off the loaded modules rather than a list kept here, so installing a backend module
  // is all it takes for its UI to start being fetched.
  private static getModuleUIRepos(): ModuleUIRepo[] {
    const repos: ModuleUIRepo[] = [];
    const seen = new Set<string>();

    let containers;
    try {
      containers = [
        ModuleService.getStreamModules(),
        ModuleService.getCommunityModules(),
        ModuleService.getControlModules(),
      ];
    } catch (e) {
      // /module/ui can be requested before any module has registered - a browser that was
      // already open when Spooder restarted, say. No modules yet means no UIs to report,
      // which is a valid answer rather than a 500.
      return [];
    }

    for (const container of containers) {
      for (const key in container) {
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const manifestPath = path.join(__dirname, '../../integration', key, 'package.json');
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const webui = manifest?.spooder_module?.webui;
          if (webui?.repoOwner && webui?.repoName) {
            repos.push({ key, repoOwner: webui.repoOwner, repoName: webui.repoName });
          }
        } catch (e) {
          // A module with no manifest on disk, or no webui block, simply has no UI to fetch.
        }
      }
    }
    return repos;
  }

  static async getLatestRelease(repo: ModuleUIRepo): Promise<ReleaseInfo | null> {
    try {
      const response = await Axios({
        url: `https://api.github.com/repos/${repo.repoOwner}/${repo.repoName}/releases/latest`,
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
      });
      const tagName: string | undefined = response.data?.tag_name;
      const asset = response.data?.assets?.[0];
      if (!tagName || !asset?.browser_download_url) {
        return null;
      }
      return {
        version: tagName.replace(/^v/, ''),
        assetUrl: asset.browser_download_url,
      };
    } catch (e: any) {
      spooderLog(`Failed to check ${repo.repoName} latest release:`, e.message);
      return null;
    }
  }

  /**
   * Checks every installed module's UI repo in turn and downloads whichever have a newer
   * release. Sequential so downloads do not compete or interleave their logs.
   */
  static async checkForUpdate(force = false) {
    if (ModuleUIService.updating) {
      spooderLog('Module UI update already in progress, skipping check');
      return;
    }

    ModuleUIService.updating = true;
    try {
      for (const repo of ModuleUIService.getModuleUIRepos()) {
        try {
          await ModuleUIService.checkModule(repo, force);
        } catch (e: any) {
          spooderLog(`${repo.repoName} update failed:`, e.message ?? e);
        }
      }
    } finally {
      ModuleUIService.updating = false;
    }
  }

  private static async checkModule(repo: ModuleUIRepo, force: boolean) {
    const localVersion = ModuleUIService.getLocalVersion(repo.key);
    const release = await ModuleUIService.getLatestRelease(repo);

    if (!release) {
      return;
    }

    if (!force && localVersion && compareVersions(release.version, localVersion) <= 0) {
      spooderLog(`${repo.repoName} is up to date (${localVersion})`);
      return;
    }

    spooderLog(
      `Updating ${repo.repoName}: ${localVersion ?? 'not installed'} -> ${release.version}`,
    );
    await ModuleUIService.downloadAndInstall(repo, release);
    spooderLog(`${repo.repoName} updated to ${release.version}`);
  }

  private static async downloadAndInstall(repo: ModuleUIRepo, release: ReleaseInfo) {
    const dest = moduleUIDir(repo.key);
    const zipPath = path.join(userDir, 'modules', repo.key, `${repo.key}-web.zip`);

    // Verified when the registry pinned a hash for this artifact. An entry tracking `latest`
    // has nothing to check against, which is the trade that setting makes explicit.
    await downloadToFile(release.assetUrl, zipPath, release.sha256 ?? null);

    try {
      // Extract beside the live directory and swap, so a failed download never leaves a
      // half-written remote that the WebUI would then try to load.
      const tempExtractDir = `${dest}.tmp`;
      fs.removeSync(tempExtractDir);
      new AdmZip(zipPath).extractAllTo(tempExtractDir, true);

      if (!fs.existsSync(path.join(tempExtractDir, MANIFEST_FILENAME))) {
        throw new Error(`release asset has no ${MANIFEST_FILENAME} at its root`);
      }

      fs.removeSync(dest);
      fs.moveSync(tempExtractDir, dest);
      fs.writeFileSync(versionMarkerPath(repo.key), release.version, 'utf-8');
    } finally {
      fs.removeSync(zipPath);
    }
  }
}
