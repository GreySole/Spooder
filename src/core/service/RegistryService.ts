import Axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import { userDir } from '../../Types';
import { spooderLog } from '../Logging';

// Catalogues of installable modules and plugins. The Spooder registry is built in; anyone can
// add their own, which is what makes this a system rather than one curated list - a team can
// run an internal registry, and a module author can publish one without waiting on a PR.
//
// Each source is one index.json, fetched from raw.githubusercontent rather than the API: raw
// content is CDN-served and carries no rate limit, where api.github.com allows 60 requests an
// hour per IP - a budget already shared by every update check Spooder makes. One file per
// source means adding a registry costs one conditional request, not one per entry.

const OFFICIAL_SOURCE_ID = 'github:GreySole/Spooder-Registry';

// Long enough that opening the tab repeatedly costs nothing, short enough that a newly
// published entry shows up the same day without hunting for a refresh button.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface RegistryArtifact {
  repo: string;
  version?: string;
  asset?: string;
  sha256?: string;
}

export interface RegistryEntry {
  id: string;
  kind: 'module' | 'plugin';
  name: string;
  summary: string;
  author: string;
  license: string;
  tags?: string[];
  icon?: string;
  homepage?: string;
  spooder: string;
  track: 'pinned' | 'latest';
  server?: RegistryArtifact;
  webui?: RegistryArtifact;
  plugin?: RegistryArtifact;
}

export interface RegistryIndex {
  schemaVersion: number;
  entries: RegistryEntry[];
}

export interface RegistrySource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  // The built-in Spooder registry. Can be turned off - someone running only an internal
  // registry has a real reason to - but not removed, so there is always a way back.
  official: boolean;
}

// An entry plus where it came from. Provenance is not decoration here: installing from a
// registry is trusting whoever curates it, so the tab has to be able to say which one.
export interface SourcedEntry extends RegistryEntry {
  source: { id: string; name: string };
}

export interface CatalogueResult {
  entries: SourcedEntry[];
  sources: SourceStatus[];
  // Entry ids offered by more than one registry, with the source that won. Surfaced rather
  // than silently resolved, because a registry shadowing another's entry is worth knowing.
  duplicates: { id: string; usedFrom: string; alsoIn: string[] }[];
}

export interface SourceStatus extends RegistrySource {
  fetchedAt: string | null;
  entryCount: number;
  // Set when this source could not be reached and its entries came from cache, or when it
  // has never been reached at all.
  error: string | null;
}

interface SourceCache {
  etag: string | null;
  fetchedAt: string;
  index: RegistryIndex;
}

const sourcesPath = path.join(userDir, 'settings', 'registries.json');
const cacheDir = path.join(userDir, 'settings', 'registry-cache');

const OFFICIAL: RegistrySource = {
  id: OFFICIAL_SOURCE_ID,
  name: 'Spooder Registry',
  url: 'https://raw.githubusercontent.com/GreySole/Spooder-Registry/main/index.json',
  enabled: true,
  official: true,
};

/**
 * Accepts what a person would actually paste: `owner/repo`, a GitHub page URL, or a direct
 * link to an index.json. Anything else is refused rather than guessed at.
 */
export function normalizeRegistryUrl(input: string): { id: string; url: string; name: string } {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error('Enter a registry repository or index URL.');
  }

  // owner/repo, optionally owner/repo#branch
  const shorthand = raw.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:#([A-Za-z0-9._\/-]+))?$/);
  if (shorthand) {
    const [, owner, repo, branch] = shorthand;
    return {
      id: `github:${owner}/${repo}`,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch ?? 'main'}/index.json`,
      name: repo,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (e) {
    throw new Error(`'${raw}' is not a repository or a URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('A registry must be served over https.');
  }

  if (parsed.hostname === 'github.com') {
    const parts = parsed.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length < 2) {
      throw new Error('That GitHub URL does not name a repository.');
    }
    const [owner, repo] = parts;
    return {
      id: `github:${owner}/${repo.replace(/\.git$/, '')}`,
      url: `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, '')}/main/index.json`,
      name: repo.replace(/\.git$/, ''),
    };
  }

  // A direct index URL - self-hosted registries are the reason this is allowed at all.
  return { id: `url:${parsed.href}`, url: parsed.href, name: parsed.hostname };
}

export default class RegistryService {
  private static fetching: Promise<CatalogueResult> | null = null;

  // ---------------------------------------------------------------- sources

  private static readStoredSources(): RegistrySource[] {
    try {
      const stored = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
      return Array.isArray(stored) ? stored : [];
    } catch (e) {
      return [];
    }
  }

  private static writeStoredSources(sources: RegistrySource[]) {
    fs.ensureDirSync(path.dirname(sourcesPath));
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2), 'utf-8');
  }

  /**
   * Every registry, official first. The official entry is merged in from code rather than
   * stored, so its URL cannot be edited into something else on disk and it cannot go missing.
   */
  static getSources(): RegistrySource[] {
    const stored = RegistryService.readStoredSources();
    const officialStored = stored.find((s) => s.id === OFFICIAL_SOURCE_ID);
    const official: RegistrySource = {
      ...OFFICIAL,
      enabled: officialStored ? officialStored.enabled !== false : true,
    };
    return [official, ...stored.filter((s) => s.id !== OFFICIAL_SOURCE_ID)];
  }

  static addSource(input: string, name?: string): RegistrySource {
    const { id, url, name: derivedName } = normalizeRegistryUrl(input);
    if (id === OFFICIAL_SOURCE_ID) {
      throw new Error('The Spooder registry is already installed.');
    }
    const stored = RegistryService.readStoredSources();
    if (stored.some((s) => s.id === id)) {
      throw new Error('That registry has already been added.');
    }
    const source: RegistrySource = {
      id,
      name: name?.trim() || derivedName,
      url,
      enabled: true,
      official: false,
    };
    RegistryService.writeStoredSources([...stored, source]);
    return source;
  }

  static removeSource(id: string) {
    if (id === OFFICIAL_SOURCE_ID) {
      throw new Error('The Spooder registry cannot be removed. Turn it off instead.');
    }
    const stored = RegistryService.readStoredSources();
    if (!stored.some((s) => s.id === id)) {
      throw new Error('That registry is not installed.');
    }
    RegistryService.writeStoredSources(stored.filter((s) => s.id !== id));
    fs.removeSync(RegistryService.cachePathFor(id));
  }

  static setSourceEnabled(id: string, enabled: boolean) {
    const stored = RegistryService.readStoredSources();
    const existing = stored.find((s) => s.id === id);
    if (existing) {
      existing.enabled = enabled;
      RegistryService.writeStoredSources(stored);
      return;
    }
    if (id === OFFICIAL_SOURCE_ID) {
      // Only recorded once it differs from the default, so the file stays empty until the
      // user has actually changed something.
      RegistryService.writeStoredSources([...stored, { ...OFFICIAL, enabled }]);
      return;
    }
    throw new Error('That registry is not installed.');
  }

  // ---------------------------------------------------------------- fetching

  private static cachePathFor(sourceId: string): string {
    // Source ids contain '/' and ':', neither of which belongs in a filename.
    const safe = sourceId.replace(/[^a-z0-9._-]/gi, '_');
    return path.join(cacheDir, `${safe}.json`);
  }

  private static readCache(sourceId: string): SourceCache | null {
    try {
      return JSON.parse(fs.readFileSync(RegistryService.cachePathFor(sourceId), 'utf-8'));
    } catch (e) {
      return null;
    }
  }

  private static writeCache(sourceId: string, cache: SourceCache) {
    fs.ensureDirSync(cacheDir);
    fs.writeFileSync(RegistryService.cachePathFor(sourceId), JSON.stringify(cache, null, 2));
  }

  private static async fetchSource(
    source: RegistrySource,
    force: boolean,
  ): Promise<{ entries: RegistryEntry[]; fetchedAt: string | null; error: string | null }> {
    const cache = RegistryService.readCache(source.id);

    if (!force && cache) {
      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age >= 0 && age < CACHE_TTL_MS) {
        return { entries: cache.index.entries, fetchedAt: cache.fetchedAt, error: null };
      }
    }

    try {
      const response = await Axios({
        url: source.url,
        method: 'GET',
        // 304 is success here, not an error - it means the cache is still good.
        validateStatus: (status) => status === 200 || status === 304,
        headers: cache?.etag ? { 'If-None-Match': cache.etag } : {},
      });

      if (response.status === 304 && cache) {
        const fetchedAt = new Date().toISOString();
        RegistryService.writeCache(source.id, { ...cache, fetchedAt });
        return { entries: cache.index.entries, fetchedAt, error: null };
      }

      const index = response.data as RegistryIndex;
      if (!index || !Array.isArray(index.entries)) {
        throw new Error('index.json is not in the expected shape');
      }

      const fetchedAt = new Date().toISOString();
      RegistryService.writeCache(source.id, {
        etag: (response.headers?.etag as string) ?? null,
        fetchedAt,
        index,
      });
      return { entries: index.entries, fetchedAt, error: null };
    } catch (e: any) {
      const message = e.message ?? String(e);
      spooderLog(`Could not reach registry '${source.name}':`, message);
      // A registry that cannot be reached should mean a stale list with a note, not an empty
      // tab - and never one bad source taking the others down with it.
      if (cache) {
        return { entries: cache.index.entries, fetchedAt: cache.fetchedAt, error: message };
      }
      return { entries: [], fetchedAt: null, error: message };
    }
  }

  /**
   * Every enabled registry, merged. Sources are read in order with the official one first, and
   * the first registry to claim an id keeps it - so a third-party registry cannot quietly
   * shadow an official entry with something else of the same name.
   */
  static async getCatalogue(force = false): Promise<CatalogueResult> {
    if (!force && RegistryService.fetching) {
      return RegistryService.fetching;
    }

    const run = (async (): Promise<CatalogueResult> => {
      const sources = RegistryService.getSources();
      const enabled = sources.filter((s) => s.enabled);

      const fetched = await Promise.all(
        enabled.map(async (source) => ({
          source,
          ...(await RegistryService.fetchSource(source, force)),
        })),
      );

      const entries: SourcedEntry[] = [];
      const claimedBy = new Map<string, string>();
      const duplicates = new Map<string, { usedFrom: string; alsoIn: string[] }>();

      for (const result of fetched) {
        for (const entry of result.entries) {
          const owner = claimedBy.get(entry.id);
          if (owner) {
            const record = duplicates.get(entry.id) ?? { usedFrom: owner, alsoIn: [] };
            record.alsoIn.push(result.source.name);
            duplicates.set(entry.id, record);
            continue;
          }
          claimedBy.set(entry.id, result.source.name);
          entries.push({
            ...entry,
            source: { id: result.source.id, name: result.source.name },
          });
        }
      }

      const statuses: SourceStatus[] = sources.map((source) => {
        const result = fetched.find((f) => f.source.id === source.id);
        return {
          ...source,
          fetchedAt: result?.fetchedAt ?? null,
          entryCount: result?.entries.length ?? 0,
          error: result?.error ?? null,
        };
      });

      return {
        entries,
        sources: statuses,
        duplicates: [...duplicates.entries()].map(([id, d]) => ({ id, ...d })),
      };
    })().finally(() => {
      RegistryService.fetching = null;
    });

    RegistryService.fetching = run;
    return run;
  }

  // ---------------------------------------------------------------- misc

  /**
   * Whether this Spooder can run an entry. Incompatible entries are still shown - someone told
   * to install something should find it and an explanation, rather than an empty search.
   */
  static isCompatible(entry: RegistryEntry, spooderVersion: string): boolean {
    const version = semver.coerce(spooderVersion);
    if (!version) {
      return true;
    }
    try {
      return semver.satisfies(version, entry.spooder);
    } catch (e) {
      return true;
    }
  }

  /**
   * The WebUI artifact a registry pins for a module, or null when no enabled registry pins one.
   *
   * This is what lets a pinned entry mean the same thing for both halves of a module. Without
   * it the backend installs the reviewed version while the tab quietly follows whatever the
   * repo published most recently - two different notions of "pinned" under one entry.
   *
   * Reads the cached catalogue rather than forcing a fetch: this runs inside the update check,
   * which is already on a schedule, and a registry that cannot be reached should fall back to
   * the module's own manifest rather than block the update.
   */
  static async getPinnedWebUI(moduleId: string): Promise<RegistryArtifact | null> {
    try {
      const catalogue = await RegistryService.getCatalogue(false);
      const entry = catalogue.entries.find((e) => e.id === moduleId && e.kind === 'module');
      if (!entry || entry.track !== 'pinned' || !entry.webui?.version) {
        return null;
      }
      return entry.webui;
    } catch (e) {
      return null;
    }
  }

  private static cachedVersion: string | null = null;

  /**
   * Spooder's own version, read from the package.json two levels above the compiled service.
   * Nothing else exposed this, and compatibility is meaningless without it.
   */
  static getSpooderVersion(): string {
    if (RegistryService.cachedVersion) {
      return RegistryService.cachedVersion;
    }
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf-8'),
      );
      RegistryService.cachedVersion = pkg.version ?? '0.0.0';
    } catch (e) {
      RegistryService.cachedVersion = '0.0.0';
    }
    return RegistryService.cachedVersion as string;
  }
}
