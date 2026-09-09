import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Agency, DraftRow, RecordFilters, RecordRow } from './types';

const DEFAULT_DB = path.join(process.cwd(), 'data', 'declassified.db');

let _db: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH || DEFAULT_DB;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      agency TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      download_url TEXT,
      thumbnail_url TEXT,
      published_at TEXT,
      collected_at TEXT NOT NULL,
      raw_meta TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_records_published ON records(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_records_agency ON records(agency);
    CREATE INDEX IF NOT EXISTS idx_records_collected ON records(collected_at DESC);

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (record_id) REFERENCES records(id)
    );

    CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      fetched INTEGER DEFAULT 0,
      upserted INTEGER DEFAULT 0,
      error TEXT
    );
  `);
}

export function upsertRecord(
  record: Omit<RecordRow, 'collected_at'> & { collected_at?: string }
): void {
  const db = getDb();
  const collected_at = record.collected_at || new Date().toISOString();
  db.prepare(
    `INSERT INTO records (
      id, title, summary, agency, source, source_url,
      download_url, thumbnail_url, published_at, collected_at, raw_meta
    ) VALUES (
      @id, @title, @summary, @agency, @source, @source_url,
      @download_url, @thumbnail_url, @published_at, @collected_at, @raw_meta
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      agency = excluded.agency,
      source = excluded.source,
      source_url = excluded.source_url,
      download_url = COALESCE(excluded.download_url, records.download_url),
      thumbnail_url = COALESCE(excluded.thumbnail_url, records.thumbnail_url),
      published_at = COALESCE(excluded.published_at, records.published_at),
      raw_meta = COALESCE(excluded.raw_meta, records.raw_meta)`
  ).run({
    id: record.id,
    title: record.title,
    summary: record.summary || '',
    agency: record.agency,
    source: record.source,
    source_url: record.source_url,
    download_url: record.download_url,
    thumbnail_url: record.thumbnail_url,
    published_at: record.published_at,
    collected_at,
    raw_meta: record.raw_meta,
  });
}

export function upsertRecords(
  records: Array<Omit<RecordRow, 'collected_at'> & { collected_at?: string }>
): number {
  const db = getDb();
  const tx = db.transaction((rows: typeof records) => {
    for (const r of rows) upsertRecord(r);
    return rows.length;
  });
  return tx(records);
}

export function queryRecords(filters: RecordFilters = {}): {
  rows: RecordRow[];
  total: number;
} {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.q) {
    where.push(
      `(title LIKE @q OR summary LIKE @q OR agency LIKE @q OR source LIKE @q)`
    );
    params.q = `%${filters.q}%`;
  }
  if (filters.agency && filters.agency !== 'all') {
    where.push(`agency = @agency`);
    params.agency = filters.agency.toUpperCase();
  }
  if (filters.download === 'available') {
    where.push(`download_url IS NOT NULL AND download_url != ''`);
  } else if (filters.download === 'page-only') {
    where.push(`(download_url IS NULL OR download_url = '')`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.limit = limit;
  params.offset = offset;

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM records ${whereSql}`).get(params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT * FROM records ${whereSql}
       ORDER BY COALESCE(published_at, collected_at) DESC, collected_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params) as RecordRow[];

  return { rows, total };
}

export function getRecordById(id: string): RecordRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM records WHERE id = ?`).get(id) as
    | RecordRow
    | undefined;
}

export function createDraft(recordId: string, text: string): DraftRow {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO drafts (record_id, text, status, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?)`
    )
    .run(recordId, text, now, now);
  return db
    .prepare(`SELECT * FROM drafts WHERE id = ?`)
    .get(info.lastInsertRowid) as DraftRow;
}

export function listDrafts(status?: string): Array<
  DraftRow & { title: string; source_url: string; agency: Agency }
> {
  const db = getDb();
  if (status && status !== 'all') {
    return db
      .prepare(
        `SELECT d.*, r.title, r.source_url, r.agency
         FROM drafts d JOIN records r ON r.id = d.record_id
         WHERE d.status = ?
         ORDER BY d.created_at DESC`
      )
      .all(status) as Array<
      DraftRow & { title: string; source_url: string; agency: Agency }
    >;
  }
  return db
    .prepare(
      `SELECT d.*, r.title, r.source_url, r.agency
       FROM drafts d JOIN records r ON r.id = d.record_id
       ORDER BY d.created_at DESC`
    )
    .all() as Array<
    DraftRow & { title: string; source_url: string; agency: Agency }
  >;
}

export function updateDraftStatus(
  id: number,
  status: 'pending' | 'approved' | 'rejected'
): DraftRow | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?`
  ).run(status, now, id);
  return db.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as
    | DraftRow
    | undefined;
}

export function getAgencies(): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT DISTINCT agency FROM records ORDER BY agency`)
      .all() as Array<{ agency: string }>
  ).map((r) => r.agency);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Reset singleton — useful in tests */
export function resetDbConnection(): void {
  closeDb();
}
