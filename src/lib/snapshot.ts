/**
 * Packed feed snapshot helpers (gzip + base64, split into part files).
 *
 * The committed snapshot is an ACCUMULATING archive: a new crawl is merged
 * into it (see mergeSnapshot) instead of replacing it, so records that fall
 * outside a source's crawl window (e.g. the FBI Vault sitemap's newest-700
 * window) are kept. Records are only removed when explicitly listed in
 * data/removed-ids.json (confirmed gone).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { RecordRow } from './types';

/** Characters per part file. Small enough for single-file API pushes. */
export const DEFAULT_PART_SIZE = 3500;
/** Hard ceiling when scanning for part files (not a record cap). */
export const MAX_PARTS = 1000;
export const PART_RE = /^records\.b64\.part(\d+)\.txt$/;
export const STUB_NAME = 'records.b64.txt';
export const MANIFEST_NAME = 'snapshot-manifest.json';
export const REMOVED_NAME = 'removed-ids.json';

export function partName(i: number): string {
  return `records.b64.part${i}.txt`;
}

/** Concatenate part files 1..N (stops at first missing part). */
export function readPartsB64(dir: string): string {
  const parts: string[] = [];
  for (let i = 1; i <= MAX_PARTS; i++) {
    const p = path.join(dir, partName(i));
    if (!fs.existsSync(p)) break;
    parts.push(fs.readFileSync(p, 'utf8').trim());
  }
  return parts.join('');
}

export function decodePacked(b64: string): unknown[] {
  const clean = b64.replace(/\s+/g, '');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new Error('Invalid or empty packed snapshot');
  }
  const json = zlib.gunzipSync(Buffer.from(clean, 'base64')).toString('utf8');
  const parsed = JSON.parse(json) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : null;
  if (!arr) throw new Error('Packed snapshot is not an array');
  return arr;
}

export function encodePacked(records: unknown[]): string {
  // gzipSync writes mtime=0, so output is deterministic for identical input.
  return zlib
    .gzipSync(Buffer.from(JSON.stringify(records), 'utf8'), { level: 9 })
    .toString('base64');
}

/**
 * Strict reader used by build scripts: throws on corruption rather than
 * silently returning an empty archive (which would wipe history).
 */
export function readPackedStrict(dir: string): unknown[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((n) => PART_RE.test(n));
  let b64 = '';
  if (names.length) {
    const nums = names.map((n) => Number(PART_RE.exec(n)![1])).sort((a, b) => a - b);
    nums.forEach((n, idx) => {
      if (n !== idx + 1) throw new Error(`Missing snapshot part: ${partName(idx + 1)}`);
    });
    b64 = readPartsB64(dir);
  } else {
    const stub = path.join(dir, STUB_NAME);
    if (!fs.existsSync(stub)) return [];
    b64 = fs.readFileSync(stub, 'utf8').trim();
    if (b64.length < 100 && !/^[A-Za-z0-9+/=]+$/.test(b64)) return [];
  }
  const manifestPath = path.join(dir, MANIFEST_NAME);
  const rows = decodePacked(b64);
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { records?: number };
    if (typeof m.records === 'number' && m.records !== rows.length) {
      throw new Error(
        `Snapshot has ${rows.length} records but ${MANIFEST_NAME} says ${m.records}`
      );
    }
  }
  return rows;
}

/** Write parts 1..N, delete stale higher parts, refresh stub + manifest. */
export function writePacked(
  dir: string,
  records: RecordRow[],
  partSize = DEFAULT_PART_SIZE
): { parts: number; bytes: number } {
  const b64 = encodePacked(records);
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += partSize) chunks.push(b64.slice(i, i + partSize));
  fs.mkdirSync(dir, { recursive: true });
  chunks.forEach((c, i) => fs.writeFileSync(path.join(dir, partName(i + 1)), c));
  for (const n of fs.readdirSync(dir)) {
    const m = PART_RE.exec(n);
    if (m && Number(m[1]) > chunks.length) fs.unlinkSync(path.join(dir, n));
  }
  fs.writeFileSync(
    path.join(dir, STUB_NAME),
    `See records.b64.part1.txt … part${chunks.length}.txt (gzip+base64 feed snapshot).\n`
  );
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.agency] = (counts[r.agency] || 0) + 1;
  fs.writeFileSync(
    path.join(dir, MANIFEST_NAME),
    JSON.stringify(
      { records: records.length, parts: chunks.length, base64_chars: b64.length, agencies: counts },
      null,
      2
    ) + '\n'
  );
  return { parts: chunks.length, bytes: b64.length };
}

/** IDs explicitly confirmed gone; the only way a record leaves the archive. */
export function readRemovedIds(dir: string): Set<string> {
  const p = path.join(dir, REMOVED_NAME);
  if (!fs.existsSync(p)) return new Set();
  const arr = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
  if (!Array.isArray(arr)) throw new Error(`${REMOVED_NAME} must be an array`);
  return new Set(
    arr.map((x) => (typeof x === 'string' ? x : String((x as { id: string }).id)))
  );
}

const NULLABLE_KEEP = ['download_url', 'thumbnail_url', 'published_at'] as const;

/**
 * Download links we trust. FBI links must live on vault.fbi.gov (page chrome
 * links to unrelated PDFs such as an fbijobs.gov EEOC policy; see PR #10).
 */
export function isTrustedDownloadUrl(r: Pick<RecordRow, 'agency' | 'download_url'>): boolean {
  if (!r.download_url) return false;
  if (!/^https?:\/\//i.test(r.download_url)) return false;
  if (r.agency === 'FBI') return /^https?:\/\/vault\.fbi\.gov\//i.test(r.download_url);
  return true;
}

/** Drop untrusted download links so they can never be carried forward. */
export function sanitizeRecord(r: RecordRow): RecordRow {
  if (r.download_url && !isTrustedDownloadUrl(r)) return { ...r, download_url: null };
  return r;
}

function minIso(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return a < b ? a : b;
}
function maxIso(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Merge one record version on top of an older one.
 * Newer wins for every field, except nullable enrichment fields
 * (download_url, thumbnail_url, published_at) which keep the older
 * value when the newer version lacks one. first_seen/last_seen widen.
 */
export function mergeRecord(
  olderIn: RecordRow | undefined,
  newerIn: RecordRow
): RecordRow {
  const newer = sanitizeRecord(newerIn);
  if (!olderIn) return { ...newer };
  const older = sanitizeRecord(olderIn);
  const out: RecordRow = { ...older, ...newer };
  for (const k of NULLABLE_KEEP) {
    if (!newer[k] && older[k]) (out as unknown as Record<string, unknown>)[k] = older[k];
  }
  if (!newer.title && older.title) out.title = older.title;
  if (!newer.summary && older.summary) out.summary = older.summary;
  out.first_seen = minIso(older.first_seen, newer.first_seen);
  out.last_seen = maxIso(older.last_seen, newer.last_seen);
  if (!out.first_seen) delete out.first_seen;
  if (!out.last_seen) delete out.last_seen;
  return out;
}

export function sortRecords(rows: RecordRow[]): RecordRow[] {
  return rows.sort((a, b) => {
    const da = a.published_at || a.collected_at || '';
    const db = b.published_at || b.collected_at || '';
    if (db !== da) return db.localeCompare(da);
    const ca = (b.collected_at || '').localeCompare(a.collected_at || '');
    return ca || a.id.localeCompare(b.id);
  });
}

/**
 * Accumulating merge: existing snapshot + new crawl.
 * - new IDs are added (first_seen = last_seen = seenAt)
 * - existing IDs are updated (crawl wins, enrichment kept when crawl lacks it)
 * - IDs missing from the crawl are KEPT unchanged
 * - IDs in `removed` are dropped (explicit confirmation only)
 */
export function mergeSnapshot(
  existing: RecordRow[],
  crawl: RecordRow[],
  opts: { seenAt?: string; removed?: Set<string> } = {}
): { records: RecordRow[]; added: string[]; updated: string[]; kept: string[]; removed: string[] } {
  const seenAt = opts.seenAt || new Date().toISOString();
  const removedSet = opts.removed || new Set<string>();
  const byId = new Map<string, RecordRow>();
  for (const r of existing) byId.set(r.id, mergeRecord(byId.get(r.id), r));
  const added: string[] = [];
  const updated: string[] = [];
  const crawlIds = new Set<string>();
  for (const r of crawl) {
    crawlIds.add(r.id);
    const prev = byId.get(r.id);
    const stamped: RecordRow = {
      ...r,
      first_seen: r.first_seen || seenAt,
      last_seen: seenAt,
    };
    if (prev) {
      // Keep original discovery date.
      stamped.first_seen = minIso(prev.first_seen || prev.collected_at, stamped.first_seen);
      updated.push(r.id);
    } else {
      added.push(r.id);
    }
    byId.set(r.id, mergeRecord(prev, stamped));
  }
  const removed: string[] = [];
  for (const id of removedSet) {
    if (byId.delete(id)) removed.push(id);
  }
  const kept = [...byId.keys()].filter((id) => !crawlIds.has(id));
  return { records: sortRecords([...byId.values()]), added, updated, kept, removed };
}
