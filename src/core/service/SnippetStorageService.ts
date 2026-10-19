import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { EventGraphEdge, EventGraphNode, KeyedObject, Snippet, userDir } from '../../Types';

// Custom snippets only - the built-in samples (SampleSnippets.ts) live in code and never touch
// this table, so there is nothing here for SnippetStorageService to migrate or version yet.
export default class SnippetStorageService {
  private static db: DatabaseSync;

  static initialize() {
    SnippetStorageService.db = new DatabaseSync(userDir + '/settings/snippets.db');
    SnippetStorageService.db.exec(`
      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        edges_json TEXT NOT NULL,
        position INTEGER NOT NULL
      ) WITHOUT ROWID;
    `);
  }

  static listAll(): Snippet[] {
    const rows = SnippetStorageService.db
      .prepare('SELECT * FROM snippets ORDER BY position ASC')
      .all() as KeyedObject[];
    return rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      nodes: JSON.parse(row.nodes_json as string),
      edges: JSON.parse(row.edges_json as string),
    }));
  }

  static create(
    name: string,
    description: string,
    nodes: EventGraphNode[],
    edges: EventGraphEdge[],
  ): Snippet {
    const db = SnippetStorageService.db;
    const id = uuidv4();
    const position = Number(
      Object.values(db.prepare('SELECT COUNT(*) AS c FROM snippets').get() ?? {})[0] ?? 0,
    );
    db.prepare(
      `INSERT INTO snippets (id, name, description, nodes_json, edges_json, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, name, description ?? '', JSON.stringify(nodes), JSON.stringify(edges), position);
    return { id, name, description: description || undefined, nodes, edges };
  }

  static update(
    id: string,
    name: string,
    description: string,
    nodes: EventGraphNode[],
    edges: EventGraphEdge[],
  ): Snippet | undefined {
    const db = SnippetStorageService.db;
    const existing = db.prepare('SELECT id FROM snippets WHERE id = ?').get(id);
    if (!existing) {
      return undefined;
    }
    db.prepare(
      `UPDATE snippets SET name = ?, description = ?, nodes_json = ?, edges_json = ? WHERE id = ?`,
    ).run(name, description ?? '', JSON.stringify(nodes), JSON.stringify(edges), id);
    return { id, name, description: description || undefined, nodes, edges };
  }

  static delete(id: string): boolean {
    const result = SnippetStorageService.db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
