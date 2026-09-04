import AdmZip from 'adm-zip';
import childProcess from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { userDir } from '../../Types';
import { spooderLog } from '../Logging';
import { downloadToFile } from '../util/DownloadUtil';
import OSCService from './OSCService';

// Installing a module's backend, which unlike its WebUI half is TypeScript that Spooder's own
// build compiles. There is no prebuilt bundle to drop in: the module arrives as source, is
// built in place, and is live after a restart.
//
// Building on the user's machine rather than shipping a bundle is not a compromise. Every
// Spooder install is already a source install - the README says clone, npm install, npm run
// start, and typescript ships in dependencies - and it is the only approach that works for a
// module with native dependencies, since npm compiles those for the platform it is on. A
// bundler cannot inline sodium-native or @discordjs/opus at all.

// npm and the build both run from the Spooder root, two levels above the compiled service.
function projectRoot(): string {
  return path.resolve(__dirname, '../../..');
}

// Deliberately not derived from this file's own __dirname. ModuleService reads modules from
// wherever the currently running code lives - src/integration under tsx, dist/integration
// under compiled node - and that split is correct for reading whatever already works. Writing
// is different: a module's downloaded source always has to land in src/integration so tsc
// picks it up (tsconfig.build.json's rootDir and include only ever span src/**). Computing this
// from __dirname the same way ModuleService does would put freshly downloaded .ts source into
// dist/integration whenever Spooder itself happens to be running compiled - a location nothing
// ever compiles or copies a manifest from, so the module would silently never load. Anchoring
// to projectRoot() instead means an install always lands somewhere the next build will find it,
// regardless of which mode the installing process happens to be running in.
const integrationDir = path.join(projectRoot(), 'src', 'integration');
const stagingRoot = path.join(userDir, 'tmp', 'module-install');

export interface ModuleInstallResult {
  name: string;
  version: string | null;
  // Always true: nothing that changes dist/ takes effect until the process restarts.
  restartRequired: boolean;
}

function progress(name: string, message: string) {
  OSCService.sendToTCP?.('/spooder/module/install/progress', {
    moduleName: name,
    status: 'progress',
    message,
  });
  spooderLog(`[module install] ${name}: ${message}`);
}

function run(command: string, args: string[], label: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // execFile, not exec, so nothing in a module name or path can be read as shell syntax.
    // npm is npm.cmd on Windows, which execFile will not find without the shell.
    const isWindows = process.platform === 'win32';
    childProcess.execFile(
      isWindows ? `${command}.cmd` : command,
      args,
      { cwd: projectRoot(), timeout: timeoutMs, maxBuffer: 1024 * 1024 * 32, shell: isWindows },
      (error: any, stdout: string, stderr: string) => {
        if (error) {
          // tsc reports on stdout, npm on stderr; whichever spoke is what the user needs.
          const detail = (stdout || stderr || error.message || '').trim();
          reject(new Error(`${label} failed:\n${detail.slice(-2000)}`));
          return;
        }
        resolve();
      },
    );
  });
}

export default class ModuleInstallService {
  // One install at a time, and nothing else while one is running. npm install rewrites the
  // node_modules the live process is still lazily importing from, so the gap between install
  // and restart is genuinely unsafe - it must not be widened by a second install starting.
  private static busy: string | null = null;

  static isBusy(): string | null {
    return ModuleInstallService.busy;
  }

  static moduleDir(name: string): string {
    return path.join(integrationDir, name);
  }

  /**
   * Whether this module's folder is a live git checkout - a submodule someone is developing
   * in, rather than an installed copy.
   *
   * Installing over one replaces its working tree with a plain folder and removing one deletes
   * it outright, in both cases leaving the parent repo with a broken gitlink and the work
   * gone. So those are refused.
   *
   * The test is whether `.git` is actually there, not whether .gitmodules mentions the path.
   * A clone made without `--recursive` lists the submodule but has nothing checked out, and
   * installing into that empty directory destroys nothing - which is exactly how you would set
   * up a machine to test installing modules for real.
   */
  static isDevelopmentCheckout(name: string): boolean {
    return fs.existsSync(path.join(ModuleInstallService.moduleDir(name), '.git'));
  }

  private static refuseIfDevelopmentCheckout(name: string, verb: string) {
    if (ModuleInstallService.isDevelopmentCheckout(name)) {
      throw new Error(
        `'${name}' is checked out as a git submodule for development, so Spooder will not ` +
          `${verb} it. Use git in src/integration/${name} instead.`,
      );
    }
  }

  static isInstalled(name: string): boolean {
    return fs.existsSync(path.join(ModuleInstallService.moduleDir(name), 'package.json'));
  }

  /**
   * Downloads a module's source, builds it, and leaves it ready for the next start.
   *
   * The whole thing is undone on any failure: a module that will not build must not leave a
   * half-populated folder for the next build to trip over.
   */
  static async install(options: {
    name: string;
    zipUrl: string;
    version?: string | null;
    sha256?: string | null;
  }): Promise<ModuleInstallResult> {
    const { name, zipUrl } = options;

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      throw new Error(`'${name}' is not a valid module name.`);
    }
    if (ModuleInstallService.busy) {
      throw new Error(
        `Spooder is already installing ${ModuleInstallService.busy}. Wait for that to finish.`,
      );
    }
    ModuleInstallService.refuseIfDevelopmentCheckout(name, 'overwrite');

    ModuleInstallService.busy = name;
    const dest = ModuleInstallService.moduleDir(name);
    const staging = path.join(stagingRoot, `${name}-${Date.now()}`);
    const zipPath = path.join(stagingRoot, `${name}.zip`);
    const hadPrevious = ModuleInstallService.isInstalled(name);
    const backup = `${dest}.previous`;

    try {
      fs.ensureDirSync(stagingRoot);
      fs.removeSync(staging);

      progress(name, 'Downloading...');
      await downloadToFile(zipUrl, zipPath, options.sha256 ?? null);

      progress(name, 'Extracting...');
      new AdmZip(zipPath).extractAllTo(staging, true);

      // A GitHub source zipball wraps everything in one <repo>-<ref> folder; a release asset
      // built from the module folder does not. Accept either by finding the manifest.
      const root = ModuleInstallService.findModuleRoot(staging);
      if (!root) {
        throw new Error(
          'That download has no package.json with a spooder_module block, so it is not a Spooder module.',
        );
      }

      // Keep the old copy until the new one builds, so a failed update is not also an uninstall.
      fs.removeSync(backup);
      if (hadPrevious) {
        fs.moveSync(dest, backup);
      }
      fs.removeSync(dest);
      fs.moveSync(root, dest);

      progress(name, 'Installing dependencies...');
      await run('npm', ['install', '--no-audit', '--no-fund'], 'npm install', 10 * 60 * 1000);

      progress(name, 'Building...');
      await run('npm', ['run', 'build'], 'Build', 10 * 60 * 1000);

      fs.removeSync(backup);
      progress(name, 'Installed. Restart to load it.');

      return {
        name,
        version: ModuleInstallService.readVersion(dest),
        restartRequired: true,
      };
    } catch (e: any) {
      // Put back whatever was there and rebuild, so a failed install leaves a working Spooder
      // rather than one that no longer compiles.
      progress(name, 'Install failed, rolling back...');
      fs.removeSync(dest);
      if (hadPrevious && fs.existsSync(backup)) {
        fs.moveSync(backup, dest);
      }
      await ModuleInstallService.rebuildQuietly();
      throw e;
    } finally {
      fs.removeSync(staging);
      fs.removeSync(zipPath);
      ModuleInstallService.busy = null;
    }
  }

  /**
   * Removes a module's source and rebuilds without it. The compiled output goes too - the
   * prebuild check prunes dist/integration for anything no longer in src.
   */
  static async remove(name: string): Promise<{ name: string; restartRequired: boolean }> {
    if (ModuleInstallService.busy) {
      throw new Error(`Spooder is busy installing ${ModuleInstallService.busy}.`);
    }
    if (!ModuleInstallService.isInstalled(name)) {
      throw new Error(`${name} is not installed.`);
    }
    ModuleInstallService.refuseIfDevelopmentCheckout(name, 'remove');

    ModuleInstallService.busy = name;
    try {
      progress(name, 'Removing...');
      fs.removeSync(ModuleInstallService.moduleDir(name));
      // The downloaded tab too. Leaving it behind means Spooder keeps serving a remote for a
      // module it no longer has, and reinstalling later would silently reuse whatever version
      // happened to be sitting there.
      fs.removeSync(path.join(userDir, 'modules', name));

      progress(name, 'Rebuilding...');
      await run('npm', ['install', '--no-audit', '--no-fund'], 'npm install', 10 * 60 * 1000);
      await run('npm', ['run', 'build'], 'Build', 10 * 60 * 1000);

      progress(name, 'Removed. Restart to unload it.');
      return { name, restartRequired: true };
    } finally {
      ModuleInstallService.busy = null;
    }
  }

  private static readVersion(dir: string): string | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).version ?? null;
    } catch (e) {
      return null;
    }
  }

  // The folder holding the module's manifest, whether that is the zip root or one level down.
  private static findModuleRoot(dir: string): string | null {
    const isModule = (candidate: string) => {
      try {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(candidate, 'package.json'), 'utf-8'),
        );
        return manifest?.spooder_module?.name !== undefined;
      } catch (e) {
        return false;
      }
    };

    if (isModule(dir)) {
      return dir;
    }
    for (const entry of fs.readdirSync(dir)) {
      const child = path.join(dir, entry);
      if (fs.statSync(child).isDirectory() && isModule(child)) {
        return child;
      }
    }
    return null;
  }

  private static async rebuildQuietly() {
    try {
      await run('npm', ['install', '--no-audit', '--no-fund'], 'npm install', 10 * 60 * 1000);
      await run('npm', ['run', 'build'], 'Build', 10 * 60 * 1000);
    } catch (e: any) {
      spooderLog('Rebuild after a failed module install did not succeed:', e.message ?? e);
    }
  }
}
