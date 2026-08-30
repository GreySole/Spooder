import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { KeyedObject, userDir } from '../../Types';
import { spooderLog } from '../Logging';
import { toArray } from '../util/ArrayUtil';

type StoredType = 'string' | 'number' | 'boolean' | 'json';

// What a graph node asks for. 'array' maps onto the 'json' column type below.
export type StoredValueType = 'string' | 'number' | 'boolean' | 'array';

function inferType(value: any): StoredType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'json';
}

function encodeForColumn(type: StoredType, value: any) {
  switch (type) {
    case 'string':
      return { value_text: value, value_number: null, value_boolean: null };
    case 'number':
      return { value_text: null, value_number: value, value_boolean: null };
    case 'boolean':
      return { value_text: null, value_number: null, value_boolean: value ? 1 : 0 };
    case 'json':
      return { value_text: JSON.stringify(value), value_number: null, value_boolean: null };
  }
}

function decodeRow(row: KeyedObject): any {
  switch (row.value_type as StoredType) {
    case 'string':
      return row.value_text;
    case 'number':
      return row.value_number;
    case 'boolean':
      return row.value_boolean === 1;
    case 'json':
      try {
        return JSON.parse(row.value_text);
      } catch (e) {
        return undefined;
      }
  }
  return undefined;
}

// See EventGraphStorageService for why the import is gated on this rather than on whether the
// database file happens to exist.
const MIGRATION_VERSION = 1;

export default class EventStorageService {
  private static db: DatabaseSync;

  static initialize() {
    const dbPath = userDir + '/settings/eventstorage.db';

    EventStorageService.db = new DatabaseSync(dbPath);
    EventStorageService.db.exec(`
      CREATE TABLE IF NOT EXISTS event_values (
        event_name TEXT NOT NULL,
        key TEXT NOT NULL,
        value_type TEXT NOT NULL CHECK(value_type IN ('string','number','boolean','json')),
        value_text TEXT,
        value_number REAL,
        value_boolean INTEGER,
        PRIMARY KEY (event_name, key)
      ) WITHOUT ROWID;
    `);

    EventStorageService.migrateIfNeeded();
  }

  /**
   * Gated on stored data plus user_version rather than on the file existing - the database
   * file is created by the open above, so a crash before the import finished would otherwise
   * suppress it permanently. Importing only into an empty table means the retry cannot
   * clobber values a running instance has since written.
   */
  private static migrateIfNeeded() {
    const db = EventStorageService.db;
    const version = Number(Object.values(db.prepare('PRAGMA user_version').get() ?? {})[0] ?? 0);
    if (version >= MIGRATION_VERSION) {
      return;
    }

    const rowCount = Number(
      Object.values(db.prepare('SELECT COUNT(*) AS c FROM event_values').get() ?? {})[0] ?? 0,
    );
    if (rowCount === 0) {
      EventStorageService.migrateFromJson();
    }

    db.exec(`PRAGMA user_version = ${MIGRATION_VERSION}`);
  }

  private static migrateFromJson() {
    const jsonPath = userDir + '/settings/eventstorage.json';
    if (!fs.existsSync(jsonPath)) {
      return;
    }

    let data: KeyedObject;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, { encoding: 'utf-8' }));
    } catch (e) {
      spooderLog('Error reading eventstorage.json for migration, starting with an empty store.');
      return;
    }

    let migratedRows = 0;
    let skippedEntries = 0;
    for (const eventName in data) {
      const entry = data[eventName];
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        // Bare top-level scalars were never reachable through getVar/getSharedVar
        // (both always index one level deeper), so there's nothing to migrate.
        skippedEntries++;
        continue;
      }
      for (const key in entry) {
        const value = entry[key];
        if (value === null || value === undefined) {
          continue;
        }
        EventStorageService.setRawValue(eventName, key, value);
        migratedRows++;
      }
    }

    spooderLog(
      `Migrated ${migratedRows} eventstorage values from eventstorage.json to SQLite` +
        (skippedEntries > 0 ? ` (skipped ${skippedEntries} unreachable bare entries)` : ''),
    );
  }

  // Generic get/set used by the legacy response-script sandbox (getVar/setVar/getSharedVar/
  // setSharedVar) - preserves any JSON-serializable value, including the arrays some real
  // events store (e.g. a quote list), not just the three primitive types graph nodes use.
  static getRawValue(eventName: string, key: string, defaultValue: any = 0) {
    const row = EventStorageService.db
      .prepare('SELECT value_type, value_text, value_number, value_boolean FROM event_values WHERE event_name = ? AND key = ?')
      .get(eventName, key) as KeyedObject | undefined;
    if (!row) {
      return defaultValue;
    }
    const decoded = decodeRow(row);
    return decoded ?? defaultValue;
  }

  static setRawValue(eventName: string, key: string, value: any) {
    const type = inferType(value);
    const encoded = encodeForColumn(type, value);
    EventStorageService.db
      .prepare(
        `INSERT INTO event_values (event_name, key, value_type, value_text, value_number, value_boolean)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_name, key) DO UPDATE SET
           value_type = excluded.value_type,
           value_text = excluded.value_text,
           value_number = excluded.value_number,
           value_boolean = excluded.value_boolean`,
      )
      .run(eventName, key, type, encoded.value_text, encoded.value_number, encoded.value_boolean);
  }

  // Typed get/set used by the new get_*_value/set_*_value graph nodes.
  //
  // 'array' isn't a column type of its own: arrays are stored as 'json' like any other
  // structure (which is also how the response-script sandbox has always stored them), so the
  // read checks the decoded shape rather than the row's type name. A key holding a json object
  // reads as the default here rather than as an array, exactly as a number key reads as the
  // default for a string get.
  static getValue(
    eventName: string,
    key: string,
    type: StoredValueType,
    defaultValue: any,
  ) {
    const row = EventStorageService.db
      .prepare('SELECT value_type, value_text, value_number, value_boolean FROM event_values WHERE event_name = ? AND key = ?')
      .get(eventName, key) as KeyedObject | undefined;
    if (!row) {
      return defaultValue;
    }
    if (type === 'array') {
      const decoded = row.value_type === 'json' ? decodeRow(row) : undefined;
      return Array.isArray(decoded) ? decoded : defaultValue;
    }
    if (row.value_type !== type) {
      return defaultValue;
    }
    const decoded = decodeRow(row);
    return decoded ?? defaultValue;
  }

  static setValue(eventName: string, key: string, type: StoredValueType, value: any) {
    // Normalized here rather than at the call site so a Set Array Value node can never leave a
    // scalar behind a key the matching get will then refuse to read.
    EventStorageService.setRawValue(eventName, key, type === 'array' ? toArray(value) : value);
  }
}
