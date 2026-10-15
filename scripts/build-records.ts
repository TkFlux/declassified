/** Build the union of committed history, local history, seed and current crawl. */
import fs from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { pathToFileURL } from 'url';
import type { RecordRow } from '../src/lib/types';

function normalize(value: unknown): RecordRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record object');
  const r = value as Record<string, unknown>;
  const text = (key: string) => typeof r[key] === 'string' ? (r[key] as string).trim() : '';
  const url = (key: string) => {
    const s = text(key);
    if (!s) return null;
    if (!/^https?:$/.test(new URL(s).protocol)) throw new Error(`Invalid ${key}`);
    return s;
  };
  const date = (key: string) => {
    const s = text(key);
    if (!s) return null;
    if (!Number.isFinite(Date.parse(s))) throw new Error(`Invalid ${key}`);
    return new Date(s).toISOString();
  };
  if (!text('id') || !url('source_url')) throw new Error('Record needs an id and HTTP(S) source_url');
  const agency = text('agency') || 'OTHER';
  if (!['NARA', 'NDC', 'FBI', 'CIA', 'STATE', 'NSA', 'OTHER'].includes(agency)) throw new Error('Invalid agency');
  return {
    id: text('id'), title: text('title'), summary: text('summary'),
    agency: agency as RecordRow['agency'], source: text('source') || 'unknown',
    source_url: url('source_url')!, download_url: url('download_url'),
    thumbnail_url: url('thumbnail_url'), published_at: date('published_at'),
    collected_at: date('collected_at') || date('published_at') || new Date(0).toISOString(),
    raw_meta: typeof r.raw_meta === 'string' ? text('raw_meta') || null : r.raw_meta ? JSON.stringify(r.raw_meta) : null,
  };
}

function parseArray(raw: string): RecordRow[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Snapshot must be an array');
  return value.map(normalize);
}

/** Strict local reader: never turn corrupt history into an empty archive. */
export function readPackedHistory(dir: string): RecordRow[] {
  const names = fs.readdirSync(dir).filter(n => /^records\.b64\.part\d+\.txt$/.test(n));
  let encoded = '';
  if (names.length) {
    for (let i = 1; i <= names.length; i++) {
      const name = `records.b64.part${i}.txt`;
      if (!names.includes(name)) throw new Error(`Missing snapshot part: ${name}`);
      encoded += fs.readFileSync(path.join(dir, name), 'utf8').trim();
    }
  } else {
    const file = path.join(dir, 'records.b64.txt');
    if (!fs.existsSync(file)) return [];
    encoded = fs.readFileSync(file, 'utf8').trim();
  }
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid or missing packed snapshot');
  return parseArray(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
}

/** First populated value wins; later inputs only enrich missing metadata. */
export function mergeRecords(groups: RecordRow[][]): RecordRow[] {
  const byId = new Map<string, RecordRow>();
  for (const rows of groups) for (const row of rows) {
    const previous = byId.get(row.id);
    if (!previous) { byId.set(row.id, { ...row }); continue; }
    if (previous.source_url !== row.source_url) throw new Error(`Conflicting source URLs for id ${row.id}`);
    for (const key of ['title', 'summary', 'download_url', 'thumbnail_url', 'published_at', 'raw_meta'] as const) {
      if (!previous[key] && row[key]) Object.assign(previous, { [key]: row[key] });
    }
    if (previous.agency === 'OTHER') previous.agency = row.agency;
    if (previous.source === 'unknown') previous.source = row.source;
    // collected_at means first discovery, not last seen. Epoch denotes unknown.
    if (row.collected_at !== new Date(0).toISOString() &&
        (previous.collected_at === new Date(0).toISOString() || row.collected_at < previous.collected_at)) {
      previous.collected_at = row.collected_at;
    }
  }
  return [...byId.values()].sort((a, b) =>
    (b.published_at || b.collected_at).localeCompare(a.published_at || a.collected_at) || a.id.localeCompare(b.id));
}

export function buildRecords(dir: string): RecordRow[] {
  const read = (name: string) => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? parseArray(fs.readFileSync(file, 'utf8')) : [];
  };
  const exportPath = path.join(dir, 'export.jsonl');
  const exported = fs.existsSync(exportPath) ? fs.readFileSync(exportPath, 'utf8')
    .split(/\r?\n/).filter(line => line.trim()).map(line => normalize(JSON.parse(line))) : [];
  const records = mergeRecords([readPackedHistory(dir), read('records.json'), read('seed.json'), exported]);
  const out = path.join(dir, 'records.json');
  const temporary = `${out}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(records, null, 2) + '\n');
    fs.renameSync(temporary, out);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = path.join(process.cwd(), 'data');
  console.log(`Wrote ${path.join(dir, 'records.json')} (${buildRecords(dir).length} records)`);
}
