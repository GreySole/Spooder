/**
 * Durable per-plugin record storage, backed by a SQLite file in the plugin's own folder.
 *
 * Use this instead of hand-rolling JSON side files with getLocalFilePath for anything that
 * accumulates at runtime - per-viewer saves, warning counts, conversation history. Writing
 * a whole JSON file per change truncates it to zero bytes first, so an interruption mid-save
 * loses the entire file; a row write here is atomic and survives a crash.
 *
 * Config still belongs in settings.json (getSettings/setSettings) and form schemas in
 * settings-form.json. Those are small, hand-editable, and shipped with the plugin.
 *
 * Records are addressed by `collection` and `key` - roughly a table name and a row id.
 * A collection is created the first time it is written to. Values are stored as JSON, so
 * anything JSON.stringify accepts round-trips; class instances come back as plain objects.
 */
export interface PluginStore {
  /**
   * Declare the collections this plugin uses, creating their backing storage. Call it from
   * onLoad, before any read or write.
   *
   * Declaring is optional - get and set create a collection on first use either way - but
   * it means a collection reports as existing while still empty, so startup code can read
   * from it without special-casing a first run. Safe to call repeatedly.
   */
  init(...collections: string[]): void;

  /** Read one record. Returns undefined when the collection or key is absent. */
  get<T = unknown>(collection: string, key: string): T | undefined;

  /** Write one record, replacing any existing value for the same collection and key. */
  set(collection: string, key: string, value: unknown): void;

  /** Write many records in a single transaction - either all of them land, or none do. */
  setMany(collection: string, entries: Record<string, unknown>): void;

  /** Every record in a collection, keyed the same way it was written. */
  all<T = unknown>(collection: string): Record<string, T>;

  /** Just the keys of a collection, without deserializing the values. */
  keys(collection: string): string[];

  /** True when the collection holds that key. */
  has(collection: string, key: string): boolean;

  /** Number of records in a collection. */
  count(collection: string): number;

  /** Remove one record. Returns false when there was nothing to remove. */
  delete(collection: string, key: string): boolean;

  /** Remove every record in a collection, returning how many went. */
  clear(collection: string): number;

  /** Every known collection - those declared through init, and those holding records. */
  collections(): string[];

  /**
   * Write a consistent snapshot to `destPath`, creating a single self-contained file.
   * Use this rather than copying the .db - recent writes may still be in the -wal sidecar,
   * so a plain file copy of a live database can silently come back missing records.
   */
  backup(destPath: string): void;
}

/** Stand-in used before core wires up the real store. Every read is empty; writes throw. */
export class NoopPluginStore implements PluginStore {
  private fail(): never {
    throw new Error(
      'Plugin store is not available. It is provided by Spooder at load time - a plugin ' +
        'cannot construct one itself.',
    );
  }

  init(..._collections: string[]): void {
    this.fail();
  }
  get<T = unknown>(_collection: string, _key: string): T | undefined {
    return undefined;
  }
  set(_collection: string, _key: string, _value: unknown): void {
    this.fail();
  }
  setMany(_collection: string, _entries: Record<string, unknown>): void {
    this.fail();
  }
  all<T = unknown>(_collection: string): Record<string, T> {
    return {};
  }
  keys(_collection: string): string[] {
    return [];
  }
  has(_collection: string, _key: string): boolean {
    return false;
  }
  count(_collection: string): number {
    return 0;
  }
  delete(_collection: string, _key: string): boolean {
    return false;
  }
  clear(_collection: string): number {
    return 0;
  }
  collections(): string[] {
    return [];
  }
  backup(_destPath: string): void {
    this.fail();
  }
}
