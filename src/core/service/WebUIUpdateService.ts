import AdmZip from 'adm-zip';
import Axios from 'axios';
import fs from 'fs-extra';
import nodeSchedule from 'node-schedule';
import path from 'path';
import { spooderLog } from '../Logging';
import { compareVersions } from '../util/VersionUtil';
import ConfigService from './ConfigService';

interface WebUIModule {
  name: string;
  repoOwner: string;
  repoName: string;
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

  static InitSchedule() {
    if (WebUIUpdateService.job) {
      WebUIUpdateService.job.cancel();
      WebUIUpdateService.job = null;
    }
    const settings = ConfigService.getConfig().webui_update;
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

  // GitHub's "latest release" only ever considers non-draft, non-prerelease releases,
  // which is exactly what we want - a tagged, CI-built release, nothing in progress.
  static async getLatestRelease(mod: WebUIModule): Promise<ReleaseInfo | null> {
    try {
      const response = await Axios({
        url: `https://api.github.com/repos/${mod.repoOwner}/${mod.repoName}/releases/latest`,
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
      spooderLog(`Failed to check ${mod.repoName} latest release:`, e.message);
      return null;
    }
  }

  // Checks every configured web UI module in turn (sequential, so downloads don't compete
  // for bandwidth or interleave their logs) and updates whichever ones have a newer release.
  static async checkForUpdate(force = false) {
    if (WebUIUpdateService.updating) {
      spooderLog('WebUI update already in progress, skipping check');
      return;
    }

    WebUIUpdateService.updating = true;
    try {
      for (const mod of MODULES) {
        try {
          await WebUIUpdateService.checkModule(mod, force);
        } catch (e: any) {
          spooderLog(`${mod.repoName} update failed:`, e.message ?? e);
        }
      }
    } finally {
      WebUIUpdateService.updating = false;
    }
  }

  private static async checkModule(mod: WebUIModule, force: boolean) {
    const localVersion = WebUIUpdateService.getLocalVersion(mod);
    const release = await WebUIUpdateService.getLatestRelease(mod);

    if (!release) {
      return;
    }

    if (!force && localVersion && compareVersions(release.version, localVersion) <= 0) {
      spooderLog(`${mod.repoName} is up to date (${localVersion})`);
      return;
    }

    spooderLog(
      `Updating ${mod.repoName}: ${localVersion ?? 'not installed'} -> ${release.version}`,
    );

    await WebUIUpdateService.downloadAndInstall(mod, release);

    spooderLog(`${mod.repoName} updated to ${release.version}`);
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
