import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import {
  EventGraph,
  EventGraphEdge,
  EventGraphFile,
  EventGraphNode,
  KeyedObject,
  userDir,
} from '../../Types';
import { spooderLog } from '../Logging';
import { migrateEventsFileToGraphs } from '../util/EventGraphMigration';

export default class EventGraphStorageService {
  private static db: DatabaseSync;

  static initialize() {
    const dbPath = userDir + '/settings/events.db';
    const isNewDb = !fs.existsSync(dbPath);

    EventGraphStorageService.db = new DatabaseSync(dbPath);
    EventGraphStorageService.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        group_name TEXT NOT NULL,
        cooldown REAL NOT NULL,
        chatnotification INTEGER NOT NULL,
        cooldownnotification INTEGER NOT NULL
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS event_nodes (
        event_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        module_name TEXT NOT NULL,
        node_type_id TEXT NOT NULL,
        values_json TEXT NOT NULL,
        delay REAL,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        width REAL,
        PRIMARY KEY (event_id, node_id)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS event_edges (
        event_id TEXT NOT NULL,
        edge_id TEXT NOT NULL,
        from_node TEXT NOT NULL,
        from_port TEXT NOT NULL,
        to_node TEXT NOT NULL,
        to_port TEXT NOT NULL,
        PRIMARY KEY (event_id, edge_id)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS event_groups (
        name TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
    `);

    EventGraphStorageService.addMissingColumns();

    if (isNewDb) {
      EventGraphStorageService.migrateFromJson();
    }
  }

  // CREATE TABLE IF NOT EXISTS leaves an existing table exactly as it was, so a column added to
  // the schema above never reaches a database that already exists. Adding them here keeps both
  // paths on one shape: a fresh database gets them from the CREATE, an older one from these.
  private static addMissingColumns() {
    const columns = new Set(
      (EventGraphStorageService.db.prepare('PRAGMA table_info(event_nodes)').all() as KeyedObject[]).map(
        (row) => row.name as string,
      ),
    );
    if (!columns.has('width')) {
      EventGraphStorageService.db.exec('ALTER TABLE event_nodes ADD COLUMN width REAL');
    }
  }

  private static migrateFromJson() {
    const jsonPath = userDir + '/settings/events.json';
    if (!fs.existsSync(jsonPath)) {
      return;
    }

    let data: KeyedObject;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, { encoding: 'utf-8' }));
    } catch (e) {
      spooderLog('Error reading events.json for migration, starting with an empty store.');
      return;
    }

    let file: EventGraphFile;
    if (data.graphs) {
      file = {
        graphs: data.graphs,
        groups: data.groups ?? ['Default'],
        disabledGroups: data.disabledGroups ?? [],
      };
    } else {
      spooderLog('Migrating events.json from the legacy flat format to the node graph format');
      file = migrateEventsFileToGraphs(data);
    }

    EventGraphStorageService.saveAll(file.graphs, file.groups, file.disabledGroups);
    spooderLog(
      `Migrated ${Object.keys(file.graphs).length} events from events.json to SQLite`,
    );
  }

  static loadAll(): EventGraphFile {
    const db = EventGraphStorageService.db;

    const eventRows = db.prepare('SELECT * FROM events').all() as KeyedObject[];
    const nodeRows = db.prepare('SELECT * FROM event_nodes').all() as KeyedObject[];
    const edgeRows = db.prepare('SELECT * FROM event_edges').all() as KeyedObject[];
    const groupRows = db
      .prepare('SELECT * FROM event_groups ORDER BY position ASC')
      .all() as KeyedObject[];

    const nodesByEvent = new Map<string, EventGraphNode[]>();
    for (const row of nodeRows) {
      const node: EventGraphNode = {
        id: row.node_id as string,
        kind: row.kind as EventGraphNode['kind'],
        moduleName: row.module_name as string,
        nodeTypeId: row.node_type_id as string,
        values: JSON.parse(row.values_json as string),
        position: { x: row.position_x as number, y: row.position_y as number },
      };
      if (row.delay !== null) {
        node.delay = row.delay as number;
      }
      // Null for every node the user hasn't resized - the card falls back to the node type's
      // own nodeWidth, then to the standard width.
      if (row.width !== null && row.width !== undefined) {
        node.width = row.width as number;
      }
      if (!nodesByEvent.has(row.event_id as string)) {
        nodesByEvent.set(row.event_id as string, []);
      }
      nodesByEvent.get(row.event_id as string)!.push(node);
    }

    const edgesByEvent = new Map<string, EventGraphEdge[]>();
    for (const row of edgeRows) {
      const edge: EventGraphEdge = {
        id: row.edge_id as string,
        fromNode: row.from_node as string,
        fromPort: row.from_port as string,
        toNode: row.to_node as string,
        toPort: row.to_port as string,
      };
      if (!edgesByEvent.has(row.event_id as string)) {
        edgesByEvent.set(row.event_id as string, []);
      }
      edgesByEvent.get(row.event_id as string)!.push(edge);
    }

    const graphs: { [eventId: string]: EventGraph } = {};
    for (const row of eventRows) {
      graphs[row.id as string] = {
        name: row.name as string,
        description: row.description as string,
        group: row.group_name as string,
        cooldown: row.cooldown as number,
        chatnotification: row.chatnotification === 1,
        cooldownnotification: row.cooldownnotification === 1,
        nodes: nodesByEvent.get(row.id as string) ?? [],
        edges: edgesByEvent.get(row.id as string) ?? [],
      };
    }

    const groups = groupRows.map((r) => r.name as string);
    const disabledGroups = groupRows.filter((r) => r.disabled === 1).map((r) => r.name as string);

    return { graphs, groups: groups.length > 0 ? groups : ['Default'], disabledGroups };
  }

  static saveAll(
    graphs: { [eventId: string]: EventGraph },
    groups: string[],
    disabledGroups: string[],
  ) {
    const db = EventGraphStorageService.db;

    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM event_nodes');
      db.exec('DELETE FROM event_edges');
      db.exec('DELETE FROM events');
      db.exec('DELETE FROM event_groups');

      const insertEvent = db.prepare(
        `INSERT INTO events (id, name, description, group_name, cooldown, chatnotification, cooldownnotification)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertNode = db.prepare(
        `INSERT INTO event_nodes (event_id, node_id, kind, module_name, node_type_id, values_json, delay, position_x, position_y, width)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertEdge = db.prepare(
        `INSERT INTO event_edges (event_id, edge_id, from_node, from_port, to_node, to_port)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertGroup = db.prepare(
        `INSERT INTO event_groups (name, position, disabled) VALUES (?, ?, ?)`,
      );

      for (const eventId in graphs) {
        const graph = graphs[eventId];
        insertEvent.run(
          eventId,
          graph.name,
          graph.description,
          graph.group,
          graph.cooldown,
          graph.chatnotification ? 1 : 0,
          graph.cooldownnotification ? 1 : 0,
        );
        for (const node of graph.nodes) {
          insertNode.run(
            eventId,
            node.id,
            node.kind,
            node.moduleName,
            node.nodeTypeId,
            JSON.stringify(node.values ?? {}),
            node.delay ?? null,
            node.position.x,
            node.position.y,
            node.width ?? null,
          );
        }
        for (const edge of graph.edges) {
          insertEdge.run(eventId, edge.id, edge.fromNode, edge.fromPort, edge.toNode, edge.toPort);
        }
      }

      groups.forEach((name, index) => {
        insertGroup.run(name, index, disabledGroups.includes(name) ? 1 : 0);
      });

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}
