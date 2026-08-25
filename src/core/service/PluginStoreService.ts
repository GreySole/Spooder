import fs from 'fs-extra';
import path from 'path';
import { PluginStore, userDir } from '../../Types';
import { webLog } from '../Logging';

// node:sqlite ships with Node 22.5+ and needs no native build, which matters because plugins
// are bundled through ncc in some install modes and a native module would not survive that.
// Resolved lazily so a plugin that never touches its store still loads on older runtimes.
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
};

let DatabaseSyncCtor: (new (path: string) => SqliteDatabase) | null | undefined;

function getDatabaseCtor(): new (path: string) => SqliteDatabase {
  if (DatabaseSyncCtor === undefined) {
    try {
      DatabaseSyncCtor = require('node:sqlite').DatabaseSync;
    } catch {
      DatabaseSyncCtor = null;
    }
  }
  if (!DatabaseSyncCtor) {
    throw new Error(
      `Plugin storage needs node:sqlite, which this Node build (${process.version}) does not ` +
        'provide. Node 22.5 or newer is required.',
    );
  }
  return DatabaseSyncCtor;
}

const SCHEMA_VERSION = 1;
const DB_FILENAME = 'data.db';
// SQLite writes two sidecars next to the database - data.db-wal and data.db-shm - so the
// store is three files, not one. Keeping them in their own subfolder stops them from
// littering the plugin root next to the author's source.
const DB_DIRNAME = 'store';
const DB_SIDECAR_SUFFIXES = ['-wal', '-shm'];

/**
 * One SQLite file per plugin, living in a `store` folder inside the plugin's own directory
 * so that install, uninstall, export and restore - all of which already operate on that
 * directory - carry it along without needing to know it exists.
 */
class SqlitePluginStore implements PluginStore {
  private db: SqliteDatabase | null = null;
  private readonly dbPath: string;
  private readonly pluginName: string;

  constructor(pluginName: string) {
    this.pluginName = pluginName;
    this.dbPath = path.resolve(userDir, 'plugins', pluginName, DB_DIRNAME, DB_FILENAME);
  }

  /**
   * Opened on first use rather than at load, so the majority of plugins that never store
   * anything never get a stray data.db in their folder.
   */
  private handle(): SqliteDatabase {
    if (this.db) {
      return this.db;
    }

    const Database = getDatabaseCtor();
    fs.ensureDirSync(path.dirname(this.dbPath));
    SqlitePluginStore.migrateLegacyLayout(this.pluginName);
    const db = new Database(this.dbPath);

    // Order matters. Switching journal_mode takes an exclusive lock, and without a busy
    // timeout already in effect that throws SQLITE_BUSY outright when another connection
    // holds the file - so the timeout has to be set before the WAL switch, not after.
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec('PRAGMA journal_mode = WAL');
    // NORMAL rather than FULL: a power cut can cost the last few commits but cannot corrupt
    // the file, and skipping an fsync per write keeps chat-driven saves cheap.
    db.exec('PRAGMA synchronous = NORMAL');
    // Keep the -wal sidecar from growing without bound on a long stream.
    db.exec('PRAGMA wal_autocheckpoint = 256');

    db.exec(
      `CREATE TABLE IF NOT EXISTS store (
         collection TEXT NOT NULL,
         key        TEXT NOT NULL,
         value      TEXT NOT NULL,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (collection, key)
       )`,
    );

    // Collections declared through init() are recorded here so one can report as existing
    // while still empty - startup code then reads from it without special-casing first run.
    db.exec(
      `CREATE TABLE IF NOT EXISTS collections (
         name       TEXT PRIMARY KEY,
         created_at INTEGER NOT NULL
       )`,
    );

    // The primary key is (collection, key), so scans for a whole collection already ride
    // its index - no secondary index needed.
    const version = Number(
      Object.values(db.prepare('PRAGMA user_version').get() ?? {})[0] ?? 0,
    );
    if (version < SCHEMA_VERSION) {
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }

    this.db = db;
    return db;
  }

  private serialize(value: unknown): string {
    // undefined is not valid JSON, and a plugin passing it almost always means "no value"
    // rather than "crash" - store it as null so reads stay predictable.
    return JSON.stringify(value === undefined ? null : value);
  }

  private deserialize<T>(raw: unknown): T | undefined {
    if (typeof raw !== 'string') {
      return undefined;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A row that will not parse is corrupt beyond our help; skip it rather than taking
      // down the caller's whole read.
      webLog(`Plugin store (${this.pluginName}): skipping unparseable value`);
      return undefined;
    }
  }

  init(...collections: string[]): void {
    const names = collections.flat().filter((name) => typeof name === 'string' && name.length > 0);
    if (names.length === 0) {
      // Still touch the handle: declaring nothing should leave a usable, initialised store.
      this.handle();
      return;
    }

    const db = this.handle();
    const statement = db.prepare(
      'INSERT INTO collections (name, created_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING',
    );
    const now = Date.now();
    db.exec('BEGIN');
    try {
      for (const name of names) {
        statement.run(name, now);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  get<T = unknown>(collection: string, key: string): T | undefined {
    const row = this.handle()
      .prepare('SELECT value FROM store WHERE collection = ? AND key = ?')
      .get(collection, key);
    return row ? this.deserialize<T>(row.value) : undefined;
  }

  set(collection: string, key: string, value: unknown): void {
    this.handle()
      .prepare(
        `INSERT INTO store (collection, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (collection, key) DO UPDATE SET value = excluded.value,
                                                     updated_at = excluded.updated_at`,
      )
      .run(collection, key, this.serialize(value), Date.now());
  }

  setMany(collection: string, entries: Record<string, unknown>): void {
    const db = this.handle();
    const statement = db.prepare(
      `INSERT INTO store (collection, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (collection, key) DO UPDATE SET value = excluded.value,
                                                   updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(entries)) {
        statement.run(collection, key, this.serialize(value), now);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  all<T = unknown>(collection: string): Record<string, T> {
    const rows = this.handle()
      .prepare('SELECT key, value FROM store WHERE collection = ?')
      .all(collection);
    const out: Record<string, T> = {};
    for (const row of rows) {
      const value = this.deserialize<T>(row.value);
      if (value !== undefined) {
        out[String(row.key)] = value;
      }
    }
    return out;
  }

  keys(collection: string): string[] {
    return this.handle()
      .prepare('SELECT key FROM store WHERE collection = ?')
      .all(collection)
      .map((row) => String(row.key));
  }

  has(collection: string, key: string): boolean {
    return (
      this.handle()
        .prepare('SELECT 1 FROM store WHERE collection = ? AND key = ?')
        .get(collection, key) !== undefined
    );
  }

  count(collection: string): number {
    const row = this.handle()
      .prepare('SELECT COUNT(*) AS c FROM store WHERE collection = ?')
      .get(collection);
    return Number(row?.c ?? 0);
  }

  delete(collection: string, key: string): boolean {
    const result = this.handle()
      .prepare('DELETE FROM store WHERE collection = ? AND key = ?')
      .run(collection, key);
    return result.changes > 0;
  }

  clear(collection: string): number {
    return this.handle().prepare('DELETE FROM store WHERE collection = ?').run(collection).changes;
  }

  collections(): string[] {
    const rows = this.handle()
      .prepare(
        `SELECT name FROM collections
         UNION
         SELECT DISTINCT collection AS name FROM store
         ORDER BY name`,
      )
      .all();
    return rows.map((row) => String(row.name));
  }

  backup(destPath: string): void {
    fs.ensureDirSync(path.dirname(destPath));
    fs.removeSync(destPath);
    // VACUUM INTO rather than a file copy: committed rows may still be sitting in the -wal
    // sidecar, so copying data.db on its own can silently lose recent writes.
    this.handle().exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
  }

  /** Checkpoints the WAL and releases the file, so the folder can be deleted or archived. */
  close(): void {
    if (!this.db) {
      return;
    }
    try {
      this.db.close();
    } catch (e) {
      webLog(`Plugin store (${this.pluginName}): error while closing`, e);
    }
    this.db = null;
  }

  /** True once anything has actually been written, i.e. a data.db exists on disk. */
  static exists(pluginName: string): boolean {
    SqlitePluginStore.migrateLegacyLayout(pluginName);
    return fs.existsSync(SqlitePluginStore.pathFor(pluginName));
  }

  static pathFor(pluginName: string): string {
    return path.resolve(userDir, 'plugins', pluginName, DB_DIRNAME, DB_FILENAME);
  }

  /**
   * Stores used to sit loose in the plugin root. Move any left there into `store/`, sidecars
   * included, before the database is opened - a stale -wal beside a moved data.db would be
   * read as a different database's log and discarded, losing the writes it still holds.
   */
  static migrateLegacyLayout(pluginName: string): void {
    const legacyBase = path.resolve(userDir, 'plugins', pluginName, DB_FILENAME);
    if (!fs.existsSync(legacyBase)) {
      return;
    }

    const targetBase = SqlitePluginStore.pathFor(pluginName);
    if (fs.existsSync(targetBase)) {
      // Both layouts present: the new one is authoritative, so retire the old rather than
      // overwrite live data with it.
      webLog(`Plugin store (${pluginName}): store/ already present, leaving legacy data.db in place`);
      return;
    }

    try {
      fs.ensureDirSync(path.dirname(targetBase));
      fs.moveSync(legacyBase, targetBase);
      for (const suffix of DB_SIDECAR_SUFFIXES) {
        if (fs.existsSync(`${legacyBase}${suffix}`)) {
          fs.moveSync(`${legacyBase}${suffix}`, `${targetBase}${suffix}`);
        }
      }
      webLog(`Plugin store (${pluginName}): moved data.db into ${DB_DIRNAME}/`);
    } catch (e) {
      webLog(`Plugin store (${pluginName}): could not move data.db into ${DB_DIRNAME}/`, e);
    }
  }
}

export default class PluginStoreService {
  private static stores: Record<string, SqlitePluginStore> = {};

  /** The store handed to a plugin at load time. One per plugin, reused across reloads. */
  static forPlugin(pluginName: string): PluginStore {
    if (!PluginStoreService.stores[pluginName]) {
      PluginStoreService.stores[pluginName] = new SqlitePluginStore(pluginName);
    }
    return PluginStoreService.stores[pluginName];
  }

  /**
   * Release a plugin's database file. Must run before the plugin folder is deleted or
   * archived: an open handle leaves orphaned -wal/-shm files behind, and on Windows blocks
   * the directory removal outright.
   */
  static close(pluginName: string): void {
    PluginStoreService.stores[pluginName]?.close();
    delete PluginStoreService.stores[pluginName];
  }

  static closeAll(): void {
    for (const pluginName of Object.keys(PluginStoreService.stores)) {
      PluginStoreService.close(pluginName);
    }
  }

  /** Whether this plugin has ever written anything, i.e. whether a data.db exists. */
  static hasStore(pluginName: string): boolean {
    return SqlitePluginStore.exists(pluginName);
  }

  /** Every file belonging to a plugin's database, sidecars included. */
  static filesFor(pluginName: string): string[] {
    const base = SqlitePluginStore.pathFor(pluginName);
    return [base, ...DB_SIDECAR_SUFFIXES.map((suffix) => `${base}${suffix}`)].filter((file) =>
      fs.existsSync(file),
    );
  }

  /** The folder inside a plugin directory that holds its database, sidecars included. */
  static dirFor(pluginName: string): string {
    return path.resolve(userDir, 'plugins', pluginName, DB_DIRNAME);
  }

  static readonly dbFilename = DB_FILENAME;
  static readonly dbDirname = DB_DIRNAME;
}
