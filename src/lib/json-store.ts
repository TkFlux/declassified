import fs from 'fs';
import path from 'path';
import type { Agency, RecordFilters, RecordRow } from './types';

let _cache: RecordRow[] | null = null;

function dataPath(name: string): string {
  return path.join(process.cwd(), 'data', name);
}

function normalize(r: Partial<RecordRow> & { id: string }): RecordRow {
  return {
    id: String(r.id),
    title: r.title || '',
    summary: r.summary || '',
    agency: (r.agency as Agency) || 'OTHER',
    source: r.source || 'unknown',
    source_url: r.source_url || '',
    download_url: r.download_url ?? null,
    thumbnail_url: r.thumbnail_url ?? null,
    published_at: r.published_at ?? null,
    collected_at:
      r.collected_at || r.published_at || new Date(0).toISOString(),
    raw_meta:
      typeof r.raw_meta === 'string'
        ? r.raw_meta
        : r.raw_meta
          ? JSON.stringify(r.raw_meta)
          : null,
  };
}

function loadFromFile(filePath: string): RecordRow[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  if (filePath.endsWith('.jsonl')) {
    const out: RecordRow[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(normalize(JSON.parse(line)));
      } catch {
        /* skip bad line */
      }
    }
    return out;
  }
  const parsed = JSON.parse(raw) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : [];
  return arr.map((r) => normalize(r as Partial<RecordRow> & { id: string }));
}

/** Merge records.json (preferred), else seed.json + export.jsonl */
export function loadJsonRecords(force = false): RecordRow[] {
  if (_cache && !force) return _cache;

  const byId = new Map<string, RecordRow>();

  const recordsJson = dataPath('records.json');
  if (fs.existsSync(recordsJson)) {
    for (const r of loadFromFile(recordsJson)) byId.set(r.id, r);
  } else {
    for (const r of loadFromFile(dataPath('seed.json'))) byId.set(r.id, r);
    for (const r of loadFromFile(dataPath('export.jsonl'))) byId.set(r.id, r);
  }

  const rows = [...byId.values()].sort((a, b) => {
    const da = a.published_at || a.collected_at || '';
    const db = b.published_at || b.collected_at || '';
    if (db !== da) return db.localeCompare(da);
    return (b.collected_at || '').localeCompare(a.collected_at || '');
  });

  _cache = rows;
  return rows;
}

function matches(row: RecordRow, filters: RecordFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = `${row.title} ${row.summary} ${row.agency} ${row.source}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.agency && filters.agency !== 'all') {
    if (row.agency.toUpperCase() !== filters.agency.toUpperCase()) return false;
  }
  if (filters.download === 'available') {
    if (!row.download_url) return false;
  } else if (filters.download === 'page-only') {
    if (row.download_url) return false;
  }
  return true;
}

export function queryRecordsJson(filters: RecordFilters = {}): {
  rows: RecordRow[];
  total: number;
} {
  const all = loadJsonRecords().filter((r) => matches(r, filters));
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  return { rows: all.slice(offset, offset + limit), total: all.length };
}

export function getRecordByIdJson(id: string): RecordRow | undefined {
  return loadJsonRecords().find((r) => r.id === id);
}

export function getAgenciesJson(): string[] {
  const set = new Set(loadJsonRecords().map((r) => r.agency));
  return [...set].sort();
}

/** Reset cache — useful in tests */
export function resetJsonCache(): void {
  _cache = null;
}
