import Axios from 'axios';
import semver from 'semver';
import { spooderLog } from '../Logging';

// Shared by the updaters that download a prebuilt release (the web UIs and the module UIs), so
// none of them installs something this Spooder cannot run.
//
// A release declares the Spooder versions it needs in its repo's package.json, as a semver
// range under a top-level `spooder` key (`spooder_module.spooder` is read too, so a backend
// module's manifest can carry it). It is read from the release's own tag rather than from the
// zip, so an incompatible release is ruled out before anything is downloaded. A release that
// declares nothing, or whose package.json cannot be read, is treated as compatible - the
// updaters worked that way before this existed, and existing releases declare no range.

export interface SelectableRelease {
  version: string;
  assetUrl: string;
}

export interface BlockedRelease {
  version: string;
  requires: string;
}

export interface ReleaseSelection {
  // Newest release this Spooder can run, or null when there is none (or the repo is unreachable).
  release: SelectableRelease | null;
  // A newer release that was skipped because it needs a newer Spooder.
  blocked: BlockedRelease | null;
}

export function satisfiesSpooder(range: string | null | undefined, spooderVersion: string) {
  if (!range) {
    return true;
  }
  const version = semver.coerce(spooderVersion);
  if (!version) {
    return true;
  }
  // satisfies() answers false, rather than throwing, for a range it cannot parse - and a typo
  // in a release's package.json should not read as "needs a Spooder that does not exist".
  if (!semver.validRange(range)) {
    return true;
  }
  return semver.satisfies(version, range);
}

async function readRequiredSpooder(owner: string, repo: string, tag: string) {
  try {
    const response = await Axios({
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${tag}/package.json`,
      method: 'GET',
      responseType: 'json',
      timeout: 10000,
    });
    const range = response.data?.spooder_module?.spooder ?? response.data?.spooder;
    return typeof range === 'string' && range.trim() ? range.trim() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Picks the newest non-draft, non-prerelease release of a repo that has a downloadable asset
 * and that the running Spooder can run. `blocked` is the newest release skipped for needing a
 * newer Spooder, so the caller can say what an upgrade would unlock.
 */
export async function selectCompatibleRelease(
  owner: string,
  repo: string,
  spooderVersion: string,
): Promise<ReleaseSelection> {
  let releases: any[];
  try {
    const response = await Axios({
      url: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=15`,
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
    });
    releases = response.data ?? [];
  } catch (e: any) {
    spooderLog(`Failed to check ${repo} releases:`, e.message);
    return { release: null, blocked: null };
  }

  let blocked: BlockedRelease | null = null;
  for (const candidate of releases) {
    const asset = candidate.assets?.[0];
    if (candidate.draft || candidate.prerelease || !candidate.tag_name || !asset?.browser_download_url) {
      continue;
    }
    const version = String(candidate.tag_name).replace(/^v/, '');
    const requires = await readRequiredSpooder(owner, repo, candidate.tag_name);
    if (satisfiesSpooder(requires, spooderVersion)) {
      return { release: { version, assetUrl: asset.browser_download_url }, blocked };
    }
    if (!blocked) {
      blocked = { version, requires: requires! };
    }
  }
  return { release: null, blocked };
}
