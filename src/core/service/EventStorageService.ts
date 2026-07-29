import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { KeyedObject, userDir } from '../../Types';
import { spooderLog } from '../Logging';

type StoredType = 'string' | 'number' | 'boolean' | 'json';

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

export default class EventStorageService {
  private static db: DatabaseSync;

  static initialize() {
    const dbPath = userDir + '/settings/eventstorage.db';
    const isNewDb = !fs.existsSync(dbPath);

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

    if (isNewDb) {
      EventStorageService.migrateFromJson();
    }
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
  static getValue(
    eventName: string,
    key: string,
    type: 'string' | 'number' | 'boolean',
    defaultValue: any,
  ) {
    const row = EventStorageService.db
      .prepare('SELECT value_type, value_text, value_number, value_boolean FROM event_values WHERE event_name = ? AND key = ?')
      .get(eventName, key) as KeyedObject | undefined;
    if (!row || row.value_type !== type) {
      return defaultValue;
    }
    const decoded = decodeRow(row);
    return decoded ?? defaultValue;
  }

  static setValue(eventName: string, key: string, type: 'string' | 'number' | 'boolean', value: any) {
    EventStorageService.setRawValue(eventName, key, value);
  }
}
