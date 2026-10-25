import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export class SqliteStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive: true});
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS role_window_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);');
  }
  load() { const row = this.db.prepare('SELECT data FROM role_window_state WHERE id=1').get(); return row ? JSON.parse(row.data) : null; }
  save(state) { this.db.prepare('INSERT INTO role_window_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(state)); }
  close() { this.db.close(); }
}
