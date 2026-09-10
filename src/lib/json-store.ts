import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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

function parseRecords(raw: string): RecordRow[] {
  const parsed = JSON.parse(raw) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : [];
  return arr.map((r) => normalize(r as Partial<RecordRow> & { id: string }));
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
  return parseRecords(raw);
}

function loadB64File(filePath: string): RecordRow[] {
  try {
    let b64 = '';
    if (fs.existsSync(filePath)) {
      b64 = fs.readFileSync(filePath, 'utf8').trim();
    }
    if (!b64 || b64.length < 10000) {
      const dir = path.dirname(filePath);
      const parts: string[] = [];
      for (let i = 1; i <= 20; i++) {
        const pp = path.join(dir, `records.b64.part${i}.txt`);
        if (!fs.existsSync(pp)) break;
        parts.push(fs.readFileSync(pp, 'utf8').trim());
      }
      if (parts.length) b64 = parts.join('');
    }
    if (!b64) return [];
    const buf = zlib.gunzipSync(Buffer.from(b64, 'base64'));
    return parseRecords(buf.toString('utf8'));
  } catch {
    return [];
  }
}

/** Merge records.b64.txt + records*.json, else seed.json + export.jsonl */
export function loadJsonRecords(force = false): RecordRow[] {
  if (_cache && !force) return _cache;

  const byId = new Map<string, RecordRow>();

  const dataDir = path.join(process.cwd(), 'data');
  let loaded = false;
  if (fs.existsSync(dataDir)) {
    const b64path = path.join(dataDir, 'records.b64.txt');
    for (const r of loadB64File(b64path)) {
      byId.set(r.id, r);
      loaded = true;
    }
    for (const name of fs.readdirSync(dataDir).sort()) {
      if (!name.startsWith('records') || !name.endsWith('.json')) continue;
      loaded = true;
      for (const r of loadFromFile(path.join(dataDir, name))) byId.set(r.id, r);
    }
  }
  if (!loaded) {
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

async function loadRemoteFromGithub(): Promise<RecordRow[]> {
  const byId = new Map<string, RecordRow>();
  const base = 'https://raw.githubusercontent.com/TkFlux/declassified/main/data';
  try {
    let b64 = '';
    const res = await fetch(`${base}/records.b64.txt`, { cache: 'no-store' });
    if (res.ok) b64 = (await res.text()).trim();
    if (!b64 || b64.length < 10000) {
      const parts: string[] = [];
      for (let i = 1; i <= 20; i++) {
        const r = await fetch(`${base}/records.b64.part${i}.txt`, { cache: 'no-store' });
        if (!r.ok) break;
        parts.push((await r.text()).trim());
      }
      if (parts.length) b64 = parts.join('');
    }
    if (b64) {
      const buf = zlib.gunzipSync(Buffer.from(b64, 'base64'));
      for (const r of parseRecords(buf.toString('utf8'))) byId.set(r.id, r);
    }
  } catch {
    /* ignore */
  }
  return [...byId.values()];
}

/** Prefer local; if under 500 records, merge GitHub raw b64 snapshot */
export async function ensureRecordsLoaded(): Promise<RecordRow[]> {
  const local = loadJsonRecords(true);
  if (local.length >= 500) return local;
  const remote = await loadRemoteFromGithub();
  if (!remote.length) return local;
  const byId = new Map(local.map((r) => [r.id, r] as const));
  for (const r of remote) byId.set(r.id, r);
  _cache = [...byId.values()].sort((a, b) => {
    const da = a.published_at || a.collected_at || '';
    const db = b.published_at || b.collected_at || '';
    if (db !== da) return db.localeCompare(da);
    return (b.collected_at || '').localeCompare(a.collected_at || '');
  });
  return _cache;
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

export async function queryRecordsJsonAsync(filters: RecordFilters = {}): Promise<{
  rows: RecordRow[];
  total: number;
}> {
  const all = (await ensureRecordsLoaded()).filter((r) => matches(r, filters));
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  return { rows: all.slice(offset, offset + limit), total: all.length };
}

export function getRecordByIdJson(id: string): RecordRow | undefined {
  return loadJsonRecords().find((r) => r.id === id);
}

export async function getRecordByIdJsonAsync(
  id: string
): Promise<RecordRow | undefined> {
  return (await ensureRecordsLoaded()).find((r) => r.id === id);
}

export function getAgenciesJson(): string[] {
  const set = new Set(loadJsonRecords().map((r) => r.agency));
  return [...set].sort();
}

export async function getAgenciesJsonAsync(): Promise<string[]> {
  const set = new Set((await ensureRecordsLoaded()).map((r) => r.agency));
  return [...set].sort();
}

/** Reset cache — useful in tests */
export function resetJsonCache(): void {
  _cache = null;
}
