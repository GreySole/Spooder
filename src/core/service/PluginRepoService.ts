import AdmZip from 'adm-zip';
import Axios from 'axios';
import childProcess from 'child_process';
import fs from 'fs-extra';
import nodeSchedule from 'node-schedule';
import path from 'path';
import { userDir } from '../../Types';
import { spooderLog } from '../Logging';
import { withLoading } from '../util/AppUtil';
import { downloadToFile } from '../util/DownloadUtil';
import { compareVersions } from '../util/VersionUtil';
import ConfigService from './ConfigService';
import OSCService from './OSCService';
import PluginService from './PluginService';

// Plugins are distributed from Git repos laid out like an /export_plugin zip: a `plugin/`
// (or legacy `command/`) folder for the plugin itself, plus optional `overlay/`, `utility/`,
// `public/`, `settings/`, `assets/` folders and an `icon.png` at the repo root. A repo
// dedicated to one plugin can skip the `plugin/` wrapper and keep those files at the repo
// root instead (see looksLikePlugin/stageCheckout) - the checkout is normalized into the
// wrapped shape during staging either way, so it can be handed straight to
// PluginService.installPluginFromTemp, the same code path a manually uploaded zip takes.
//
// Two install modes, tracked per plugin:
//   'release' - default. Downloads the zip attached to the repo's latest GitHub release
//               (falling back to the tag's source zipball). No git binary needed, and
//               the plugin runs from its prebuilt `build/` output.
//   'source'  - clones the repo with the system git CLI and runs the plugin from source
//               in dev mode. Updates are `git fetch` + hard reset to the branch HEAD.
//
// Source clones are kept in user/plugin-repos/<pluginName> rather than in the installed
// plugin folder, because a repo spans several install destinations (user/plugins and
// several user/web subfolders) and there's no single directory that could be the worktree.
//
// A private repo carries a fine-grained GitHub PAT (read-only Contents+Metadata) as
// `token`. The same token authenticates both modes: it's sent as a Bearer header to the
// GitHub API and the release-asset endpoint for 'release' mode, and as a per-invocation
// `http.extraheader` for 'source' mode's clone/fetch - never written into the URL or
// .git/config, where it would linger in plaintext. It's stripped from every response this
// service hands to a route (see redact()); only the service itself ever reads it back out.

export type PluginRepoMode = 'release' | 'source';

export interface PluginRepoUpdate {
  available: boolean;
  version: string | null;
  commit: string | null;
  summary: string;
  checkedAt: string;
}

export interface PluginRepoRecord {
  pluginName: string;
  url: string;
  mode: PluginRepoMode;
  branch: string | null;
  version: string | null;
  commit: string | null;
  installedAt: string;
  lastChecked: string | null;
  update: PluginRepoUpdate | null;
  token: string | null;
}

// What PluginRepoRecord looks like once it's left this service - never the token itself,
// just whether one is on file, so the UI can show "private" without being able to read it.
export type PublicPluginRepoRecord = Omit<PluginRepoRecord, 'token'> & { hasToken: boolean };

interface PluginRepoRegistry {
  [pluginName: string]: PluginRepoRecord;
}

interface ReleaseInfo {
  version: string;
  // Public download link - works unauthenticated, but 404s on a private repo.
  assetUrl: string;
  // The GitHub API's asset endpoint, needed to download from a private repo: it accepts
  // the same Bearer token as the releases lookup, where assetUrl does not. Null when the
  // release has no attached zip and assetUrl points at a source zipball instead (that URL
  // is already an API endpoint, so it takes the Bearer token directly).
  assetApiUrl: string | null;
  assetName: string;
}

interface InstallResult {
  pluginName: string;
  mode: PluginRepoMode;
  branch: string | null;
  version: string | null;
  commit: string | null;
}

const registryPath = path.join(userDir, 'settings', 'plugin-repos.json');
const reposRoot = path.join(userDir, 'plugin-repos');
const scratchRoot = path.join(userDir, 'tmp', '_repo');

function repoDir(pluginName: string) {
  return path.join(reposRoot, pluginName);
}

function progress(pluginName: string, message: string) {
  OSCService.sendToTCP?.('/spooder/plugin/install/progress', {
    pluginName,
    status: 'progress',
    message,
  });
}

// execFile (not exec) so a repo URL can never be reinterpreted as shell syntax, and with
// the credential prompts disabled - this runs headless, so a private repo without cached
// credentials must fail fast instead of hanging on a username prompt forever.
function runGit(args: string[], cwd?: string, timeout = 300000): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 16,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      },
      (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error((stderr || error.message || 'git command failed').trim()));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

// Extra `-c` args to splice in front of a git subcommand that talks to the network (clone,
// fetch). Passed per-invocation rather than `git remote set-url`-ed with the token embedded,
// so the token never lands in .git/config or a `git remote -v` listing. Scoped to
// https://github.com/ specifically so it's never sent to a different host a redirect or
// submodule might point at.
function gitAuthArgs(url: string, token: string | null | undefined): string[] {
  if (!token) {
    return [];
  }
  if (!parseGitHubRepo(url)) {
    return [];
  }
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

function normalizeRepoUrl(url: string): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
    throw new Error(
      'Plugin repo URLs must be http(s) Git URLs, for example https://github.com/owner/repo',
    );
  }
  return trimmed;
}

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}

// display_name has no purpose outside a Spooder plugin's package.json - every plugin
// shipped with the app carries one, and a generic npm package never does - so it's the
// signal that lets a repo with no plugin/ wrapper still be trusted as an installable
// plugin rather than treating any GitHub repo with a package.json as one.
function looksLikePlugin(dir: string): boolean {
  const manifestPath = path.join(dir, 'build', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return true;
  }
  const packagePath = path.join(dir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, { encoding: 'utf8' }));
    return !!(pkg.name && pkg.display_name);
  } catch (e) {
    return false;
  }
}

// The plugin's own folder inside a checkout. 'command' is the pre-0.5 name and still
// turns up in older plugin repos, so both are accepted here and by installPluginFromTemp.
// A repo with neither falls back to treating its own root as that folder, for a plugin
// that keeps its files at the repo root instead of nesting them under plugin/.
function pluginSubdir(rootDir: string): string | null {
  for (const candidate of ['plugin', 'command']) {
    if (fs.existsSync(path.join(rootDir, candidate))) {
      return path.join(rootDir, candidate);
    }
  }
  return looksLikePlugin(rootDir) ? rootDir : null;
}

function readPluginName(rootDir: string): string | null {
  const dir = pluginSubdir(rootDir);
  if (!dir) {
    return null;
  }
  for (const metaFile of [path.join('build', 'manifest.json'), 'package.json']) {
    const metaPath = path.join(dir, metaFile);
    if (!fs.existsSync(metaPath)) {
      continue;
    }
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, { encoding: 'utf8' }));
      if (meta.name) {
        return meta.name;
      }
    } catch (e) {
      // Try the next metadata file rather than failing the whole install on one bad JSON.
    }
  }
  return null;
}

// Release zips built by /export_plugin have the plugin folders at the top level, but a
// GitHub source zipball wraps everything in a single "owner-repo-<sha>" folder.
function findCheckoutRoot(extractDir: string): string | null {
  if (pluginSubdir(extractDir)) {
    return extractDir;
  }
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    const nested = path.join(extractDir, dirs[0].name);
    if (pluginSubdir(nested)) {
      return nested;
    }
  }
  return null;
}

// Sibling folders a checkout may carry next to plugin/ (or, in a flat repo, next to
// everything else at the root) that install to their own destinations outside the plugin
// folder - see installPluginFromTemp. icon.png is the other root-level file with this
// treatment, handled separately below since it's a file, not a folder.
const INSTALL_SIBLINGS = ['overlay', 'utility', 'public', 'settings', 'assets'];

function shouldSkipCopy(sourceDir: string, src: string): boolean {
  const rel = path.relative(sourceDir, src);
  if (rel === '') {
    return false;
  }
  const parts = rel.split(path.sep);
  return parts[0] === '.git' || parts.includes('node_modules');
}

// Copies a checkout into user/tmp/<pluginName> for installPluginFromTemp to consume, which
// requires the plugin's own files under a plugin/ (or command/) folder there. Two repo
// layouts are accepted: "wrapped", where that folder already exists at the repo root
// alongside the optional overlay/utility/public/settings/assets folders and icon.png (the
// layout /export_plugin produces); and "flat", where the plugin's files sit directly at
// the repo root with no wrapper - simpler for a repo dedicated to one plugin. A flat
// checkout still gets those same sibling folders/icon recognized if present at the root;
// everything else there is nested under plugin/ to match what installPluginFromTemp expects.
//
// Git metadata and dependencies are stripped, and so are the plugin's settings.json and
// _share folder: those belong to this installation, not to the repo, and a plugin that
// happens to commit an example settings.json must not wipe the user's real settings.
function stageCheckout(sourceDir: string, destDir: string) {
  fs.removeSync(destDir);

  const wrapped = ['plugin', 'command'].some((candidate) =>
    fs.existsSync(path.join(sourceDir, candidate)),
  );

  if (wrapped) {
    fs.copySync(sourceDir, destDir, {
      filter: (src: string) => {
        if (shouldSkipCopy(sourceDir, src)) {
          return false;
        }
        const parts = path.relative(sourceDir, src).split(path.sep);
        if (parts.length === 2 && (parts[0] === 'plugin' || parts[0] === 'command')) {
          if (parts[1] === 'settings.json' || parts[1] === '_share') {
            return false;
          }
        }
        return true;
      },
    });
    return;
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    if (entry.name === 'settings.json' || entry.name === '_share') {
      continue;
    }

    const from = path.join(sourceDir, entry.name);
    const to =
      entry.name === 'icon.png' || INSTALL_SIBLINGS.includes(entry.name)
        ? path.join(destDir, entry.name)
        : path.join(destDir, 'plugin', entry.name);

    fs.copySync(from, to, { filter: (src: string) => !shouldSkipCopy(sourceDir, src) });
  }
}

export default class PluginRepoService {
  private static registry: PluginRepoRegistry | null = null;
  private static job: any = null;
  private static checking = false;
  private static gitAvailable: boolean | null = null;

  static InitSchedule() {
    if (PluginRepoService.job) {
      PluginRepoService.job.cancel();
      PluginRepoService.job = null;
    }
    const settings = ConfigService.getConfig().plugin_update;
    if (settings?.enabled) {
      PluginRepoService.job = nodeSchedule.scheduleJob(settings.schedule, () => {
        PluginRepoService.checkAllForUpdates().catch((e) =>
          spooderLog('Plugin update check failed:', e.message ?? e),
        );
      });
    }
  }

  // ---------------------------------------------------------------- registry

  private static loadRegistry(): PluginRepoRegistry {
    if (PluginRepoService.registry) {
      return PluginRepoService.registry;
    }
    try {
      if (fs.existsSync(registryPath)) {
        PluginRepoService.registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      } else {
        PluginRepoService.registry = {};
      }
    } catch (e: any) {
      spooderLog('Failed to read plugin-repos.json, starting empty:', e.message ?? e);
      PluginRepoService.registry = {};
    }
    return PluginRepoService.registry!;
  }

  private static saveRegistry() {
    try {
      fs.ensureDirSync(path.dirname(registryPath));
      fs.writeFileSync(registryPath, JSON.stringify(PluginRepoService.loadRegistry(), null, 2));
    } catch (e: any) {
      spooderLog('Failed to save plugin-repos.json:', e.message ?? e);
    }
  }

  static getRepos(): PluginRepoRegistry {
    return PluginRepoService.loadRegistry();
  }

  static getRepo(pluginName: string): PluginRepoRecord | null {
    return PluginRepoService.loadRegistry()[pluginName] ?? null;
  }

  private static redact(record: PluginRepoRecord): PublicPluginRepoRecord {
    const { token, ...rest } = record;
    return { ...rest, hasToken: !!token };
  }

  // These are what routes should hand back to the frontend - getRepo/getRepos above stay
  // raw for the service's own use (checking/installing/updating need the real token).
  static getRepoForClient(pluginName: string): PublicPluginRepoRecord | null {
    const record = PluginRepoService.getRepo(pluginName);
    return record ? PluginRepoService.redact(record) : null;
  }

  static getReposForClient(): { [pluginName: string]: PublicPluginRepoRecord } {
    const registry = PluginRepoService.loadRegistry();
    const result: { [pluginName: string]: PublicPluginRepoRecord } = {};
    for (const pluginName of Object.keys(registry)) {
      result[pluginName] = PluginRepoService.redact(registry[pluginName]);
    }
    return result;
  }

  // Updates (or clears, with token: null) just the credential on an already-tracked repo -
  // for rotating an expiring PAT, or flipping a repo private without a full reinstall.
  static setToken(pluginName: string, token: string | null) {
    const registry = PluginRepoService.loadRegistry();
    const record = registry[pluginName];
    if (!record) {
      throw new Error(`${pluginName} was not installed from a repo.`);
    }
    record.token = token?.trim() || null;
    PluginRepoService.saveRegistry();
  }

  static async isGitAvailable(): Promise<boolean> {
    if (PluginRepoService.gitAvailable !== null) {
      return PluginRepoService.gitAvailable;
    }
    try {
      await runGit(['--version'], undefined, 15000);
      PluginRepoService.gitAvailable = true;
    } catch (e) {
      PluginRepoService.gitAvailable = false;
    }
    return PluginRepoService.gitAvailable;
  }

  // Drops the repo record and the local clone. Called when a plugin is deleted so a
  // later reinstall from a different repo doesn't inherit stale tracking info.
  static remove(pluginName: string) {
    const registry = PluginRepoService.loadRegistry();
    if (registry[pluginName]) {
      delete registry[pluginName];
      PluginRepoService.saveRegistry();
    }
    try {
      fs.removeSync(repoDir(pluginName));
    } catch (e: any) {
      spooderLog(`Failed to remove plugin repo clone for ${pluginName}:`, e.message ?? e);
    }
  }

  // ---------------------------------------------------------------- installing

  static async installFromUrl(options: {
    url: string;
    mode?: PluginRepoMode;
    branch?: string | null;
    // Set when a registry pinned this release and recorded the hash a reviewer checked. A
    // plugin runs in-process with the user's tokens, so this is the one point where that
    // record can still stop a swapped artifact.
    sha256?: string | null;
    // Fine-grained GitHub PAT for a private repo. Optional - public repos need nothing.
    token?: string | null;
  }): Promise<InstallResult> {
    return withLoading(async () => {
      const url = normalizeRepoUrl(options.url);
      const mode: PluginRepoMode = options.mode === 'source' ? 'source' : 'release';
      const branch = options.branch?.trim() || null;
      const token = options.token?.trim() || null;

      const result =
        mode === 'source'
          ? await PluginRepoService.installFromSource(url, branch, undefined, token)
          : await PluginRepoService.installFromRelease(
              url,
              undefined,
              options.sha256 ?? null,
              token,
            );

      PluginRepoService.recordInstall({
        pluginName: result.pluginName,
        url,
        mode,
        branch: result.branch,
        version: result.version,
        commit: result.commit,
        token,
      });

      return result;
    });
  }

  // Reinstalls an already-tracked plugin in a different mode: release builds for normal
  // use, source checkouts for hacking on the plugin locally.
  static async setMode(
    pluginName: string,
    mode: PluginRepoMode,
    branch?: string | null,
  ): Promise<InstallResult> {
    return withLoading(async () => {
      const record = PluginRepoService.getRepo(pluginName);
      if (!record) {
        throw new Error(`${pluginName} was not installed from a repo, so it has no mode to set.`);
      }

      const result =
        mode === 'source'
          ? await PluginRepoService.installFromSource(
              record.url,
              branch?.trim() || record.branch,
              pluginName,
              record.token,
            )
          : await PluginRepoService.installFromRelease(
              record.url,
              pluginName,
              null,
              record.token,
            );

      PluginRepoService.recordInstall({
        pluginName: result.pluginName,
        url: record.url,
        // A release install keeps the last known branch so switching back to source mode
        // returns to the branch the user was on rather than the repo default.
        branch: result.branch ?? record.branch,
        mode,
        version: result.version,
        commit: result.commit,
        // Mode switches reuse the credential already on file for this repo.
        token: record.token,
      });

      return result;
    });
  }

  private static recordInstall(fields: {
    pluginName: string;
    url: string;
    mode: PluginRepoMode;
    branch: string | null;
    version: string | null;
    commit: string | null;
    token: string | null;
  }) {
    const registry = PluginRepoService.loadRegistry();
    registry[fields.pluginName] = {
      ...fields,
      installedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      update: null,
    };
    PluginRepoService.saveRegistry();
  }

  private static async installFromSource(
    url: string,
    branch: string | null,
    knownPluginName?: string,
    token?: string | null,
  ): Promise<InstallResult> {
    if (!(await PluginRepoService.isGitAvailable())) {
      throw new Error(
        'Git is not installed or not on PATH. Install Git to use source mode, or install this plugin from its releases instead.',
      );
    }

    const label = knownPluginName ?? url;
    const scratch = path.join(scratchRoot, `clone-${Date.now()}`);
    fs.ensureDirSync(scratchRoot);
    fs.removeSync(scratch);

    try {
      progress(label, branch ? `Cloning ${branch}...` : 'Cloning repository...');
      const args = [...gitAuthArgs(url, token), 'clone', '--single-branch'];
      if (branch) {
        args.push('--branch', branch);
      }
      args.push('--', url, scratch);
      await runGit(args);

      const pluginName = readPluginName(scratch) ?? knownPluginName;
      if (!pluginName) {
        throw new Error(
          "This repository has no plugin/ (or command/) folder with a package.json, so it isn't a Spooder plugin repo.",
        );
      }

      const dest = repoDir(pluginName);
      fs.ensureDirSync(reposRoot);
      fs.removeSync(dest);
      fs.moveSync(scratch, dest);

      const commit = await runGit(['rev-parse', 'HEAD'], dest);
      const checkedOutBranch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dest);

      await PluginRepoService.installFromCheckout(pluginName, dest, 'source');

      return {
        pluginName,
        mode: 'source',
        branch: checkedOutBranch,
        version: null,
        commit,
      };
    } finally {
      fs.removeSync(scratch);
    }
  }

  private static async installFromRelease(
    url: string,
    knownPluginName?: string,
    expectedSha256?: string | null,
    token?: string | null,
  ): Promise<InstallResult> {
    const gh = parseGitHubRepo(url);
    if (!gh) {
      throw new Error(
        'Release installs currently need a github.com repository URL. Install from source for other Git hosts.',
      );
    }

    const label = knownPluginName ?? url;
    const release = await PluginRepoService.getLatestRelease(gh, token);
    if (!release) {
      throw new Error(
        `No published release found for ${gh.owner}/${gh.repo}. Publish a release with the plugin zip attached, or install from source instead.` +
          (token ? '' : ' If this is a private repo, add a token first.'),
      );
    }

    const scratch = path.join(scratchRoot, `release-${Date.now()}`);
    const zipPath = path.join(scratchRoot, `${gh.repo}-${release.version}.zip`);
    fs.ensureDirSync(scratchRoot);
    fs.removeSync(scratch);

    try {
      progress(label, `Downloading ${release.version}...`);
      // A private repo's plain download link 404s without a browser session; the API's
      // asset endpoint takes the same Bearer token the releases lookup used instead.
      const downloadUrl = token && release.assetApiUrl ? release.assetApiUrl : release.assetUrl;
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : null;
      await downloadToFile(downloadUrl, zipPath, expectedSha256 ?? null, authHeaders);

      progress(label, 'Extracting...');
      new AdmZip(zipPath).extractAllTo(scratch, true);

      const checkoutRoot = findCheckoutRoot(scratch);
      if (!checkoutRoot) {
        throw new Error(
          `${release.assetName} has no plugin/ (or command/) folder at its root, so it isn't a Spooder plugin release.`,
        );
      }

      const pluginName = readPluginName(checkoutRoot) ?? knownPluginName;
      if (!pluginName) {
        throw new Error(`${release.assetName} has no readable plugin package.json or manifest.`);
      }

      await PluginRepoService.installFromCheckout(pluginName, checkoutRoot, 'release');

      return {
        pluginName,
        mode: 'release',
        branch: null,
        version: release.version,
        commit: null,
      };
    } finally {
      fs.removeSync(scratch);
      fs.removeSync(zipPath);
    }
  }

  // GitHub's "latest release" only considers non-draft, non-prerelease releases. A plugin
  // release is expected to carry an /export_plugin zip as its asset; if the author tagged
  // a release without attaching one, the tag's source zipball is used instead so tagging
  // alone is enough to publish.
  private static async getLatestRelease(
    gh: { owner: string; repo: string },
    token?: string | null,
  ): Promise<ReleaseInfo | null> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Spooder',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await Axios({
        url: `https://api.github.com/repos/${gh.owner}/${gh.repo}/releases/latest`,
        method: 'GET',
        headers,
      });
      const tagName: string | undefined = response.data?.tag_name;
      if (!tagName) {
        return null;
      }

      const assets: any[] = response.data?.assets ?? [];
      const zipAsset = assets.find((a) => a?.name?.toLowerCase().endsWith('.zip'));
      if (zipAsset?.browser_download_url) {
        return {
          version: tagName.replace(/^v/i, ''),
          assetUrl: zipAsset.browser_download_url,
          assetApiUrl: zipAsset.url ?? null,
          assetName: zipAsset.name,
        };
      }

      if (response.data?.zipball_url) {
        return {
          version: tagName.replace(/^v/i, ''),
          assetUrl: response.data.zipball_url,
          // zipball_url is already an api.github.com endpoint, so it takes the same
          // Bearer header the releases lookup used - no separate asset URL needed.
          assetApiUrl: null,
          assetName: `${gh.repo}-${tagName}-source.zip`,
        };
      }

      return null;
    } catch (e: any) {
      if (e.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to reach GitHub for ${gh.owner}/${gh.repo}: ${e.message}`);
    }
  }

  // Hands a checkout to the same installer a manually uploaded zip uses. Dev mode is set
  // before installing because installPluginFromTemp reloads every plugin when it finishes,
  // and Plugin decides between build/manifest.json and running from source off that flag.
  private static async installFromCheckout(
    pluginName: string,
    checkoutDir: string,
    mode: PluginRepoMode,
  ) {
    PluginService.stopPlugin(pluginName);

    progress(pluginName, 'Staging files...');
    stageCheckout(checkoutDir, path.join(userDir, 'tmp', pluginName));

    PluginService.setDevMode(pluginName, mode === 'source', false);

    const result: any = await PluginService.installPluginFromTemp(pluginName, {
      createInfo: null,
      overlay: true,
      utility: true,
      public: true,
    });

    if (result?.status === false) {
      throw new Error(result.message ?? 'Plugin install failed');
    }
  }

  // ---------------------------------------------------------------- updating

  static async checkForUpdate(pluginName: string): Promise<PluginRepoUpdate> {
    const record = PluginRepoService.getRepo(pluginName);
    if (!record) {
      throw new Error(`${pluginName} was not installed from a repo.`);
    }

    const update =
      record.mode === 'source'
        ? await PluginRepoService.checkSourceUpdate(record)
        : await PluginRepoService.checkReleaseUpdate(record);

    const registry = PluginRepoService.loadRegistry();
    if (registry[pluginName]) {
      registry[pluginName].update = update;
      registry[pluginName].lastChecked = update.checkedAt;
      PluginRepoService.saveRegistry();
    }

    return update;
  }

  private static async checkReleaseUpdate(record: PluginRepoRecord): Promise<PluginRepoUpdate> {
    const checkedAt = new Date().toISOString();
    const gh = parseGitHubRepo(record.url);
    if (!gh) {
      return {
        available: false,
        version: null,
        commit: null,
        summary: 'Release updates need a github.com repository URL.',
        checkedAt,
      };
    }

    const release = await PluginRepoService.getLatestRelease(gh, record.token);
    if (!release) {
      return {
        available: false,
        version: null,
        commit: null,
        summary: record.token
          ? 'No published releases found.'
          : 'No published releases found. If this is a private repo, add a token.',
        checkedAt,
      };
    }

    const available = !record.version || compareVersions(release.version, record.version) > 0;
    return {
      available,
      version: release.version,
      commit: null,
      summary: available
        ? `Version ${release.version} available (installed ${record.version ?? 'unknown'})`
        : `Up to date (${record.version})`,
      checkedAt,
    };
  }

  private static async checkSourceUpdate(record: PluginRepoRecord): Promise<PluginRepoUpdate> {
    const checkedAt = new Date().toISOString();
    const dir = repoDir(record.pluginName);

    if (!fs.existsSync(path.join(dir, '.git'))) {
      return {
        available: false,
        version: null,
        commit: null,
        summary: 'Local clone is missing. Reinstall from source to restore it.',
        checkedAt,
      };
    }

    if (!(await PluginRepoService.isGitAvailable())) {
      return {
        available: false,
        version: null,
        commit: null,
        summary: 'Git is not installed or not on PATH.',
        checkedAt,
      };
    }

    await runGit([...gitAuthArgs(record.url, record.token), 'fetch', '--prune', 'origin'], dir);
    const branch = record.branch ?? (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir));
    const remoteRef = `origin/${branch}`;
    const local = await runGit(['rev-parse', 'HEAD'], dir);
    const remote = await runGit(['rev-parse', remoteRef], dir);
    const behind = parseInt(await runGit(['rev-list', '--count', `HEAD..${remoteRef}`], dir), 10);
    const behindCount = Number.isNaN(behind) ? 0 : behind;

    if (behindCount === 0 || local === remote) {
      return {
        available: false,
        version: null,
        commit: local,
        summary: `Up to date with ${branch} (${local.substring(0, 7)})`,
        checkedAt,
      };
    }

    const subject = await runGit(['log', '-1', '--pretty=%s', remoteRef], dir);
    return {
      available: true,
      version: null,
      commit: remote,
      summary: `${behindCount} new commit${behindCount === 1 ? '' : 's'} on ${branch}: ${subject}`,
      checkedAt,
    };
  }

  // Checks every tracked plugin in turn (sequential, so clones and downloads don't compete
  // for bandwidth or interleave their logs). Never installs anything - the user decides.
  static async checkAllForUpdates(): Promise<{ [pluginName: string]: PluginRepoUpdate }> {
    if (PluginRepoService.checking) {
      spooderLog('Plugin update check already in progress, skipping');
      return {};
    }

    PluginRepoService.checking = true;
    const results: { [pluginName: string]: PluginRepoUpdate } = {};
    try {
      for (const pluginName of Object.keys(PluginRepoService.loadRegistry())) {
        try {
          results[pluginName] = await PluginRepoService.checkForUpdate(pluginName);
        } catch (e: any) {
          spooderLog(`${pluginName} update check failed:`, e.message ?? e);
        }
      }
    } finally {
      PluginRepoService.checking = false;
    }

    const outdated = Object.keys(results).filter((name) => results[name].available);
    if (outdated.length > 0) {
      spooderLog('Plugin updates available:', outdated.join(', '));
      OSCService.sendToTCP?.('/spooder/plugin/update/available', {
        plugins: outdated.map((name) => ({
          pluginName: name,
          summary: results[name].summary,
        })),
      });
    }

    return results;
  }

  static async update(pluginName: string): Promise<InstallResult> {
    return withLoading(async () => {
      const record = PluginRepoService.getRepo(pluginName);
      if (!record) {
        throw new Error(`${pluginName} was not installed from a repo.`);
      }

      const result =
        record.mode === 'source'
          ? await PluginRepoService.updateSource(record)
          : await PluginRepoService.installFromRelease(
              record.url,
              pluginName,
              null,
              record.token,
            );

      PluginRepoService.recordInstall({
        pluginName: result.pluginName,
        url: record.url,
        mode: record.mode,
        branch: result.branch ?? record.branch,
        version: result.version,
        commit: result.commit,
        token: record.token,
      });

      OSCService.sendToTCP?.('/spooder/plugin/install/complete', {
        pluginName: result.pluginName,
        status: 'complete',
        message: 'Updated!',
      });

      return result;
    });
  }

  // Reuses the existing clone so an update is a fetch instead of a full re-download. The
  // clone is treated as disposable (hard reset + clean), since local edits belong in
  // user/plugins/<name>, not here.
  private static async updateSource(record: PluginRepoRecord): Promise<InstallResult> {
    const dir = repoDir(record.pluginName);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      return PluginRepoService.installFromSource(
        record.url,
        record.branch,
        record.pluginName,
        record.token,
      );
    }

    if (!(await PluginRepoService.isGitAvailable())) {
      throw new Error('Git is not installed or not on PATH.');
    }

    progress(record.pluginName, 'Fetching latest source...');
    await runGit([...gitAuthArgs(record.url, record.token), 'fetch', '--prune', 'origin'], dir);

    const branch = record.branch ?? (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir));
    await runGit(['checkout', branch], dir);
    await runGit(['reset', '--hard', `origin/${branch}`], dir);
    await runGit(['clean', '-fdx'], dir);

    const commit = await runGit(['rev-parse', 'HEAD'], dir);
    await PluginRepoService.installFromCheckout(record.pluginName, dir, 'source');

    return {
      pluginName: record.pluginName,
      mode: 'source',
      branch,
      version: null,
      commit,
    };
  }
}
