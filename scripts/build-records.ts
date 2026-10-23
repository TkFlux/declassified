/**
 * Merge a new crawl INTO the committed feed snapshot (accumulating archive).
 *
 *   npm run crawl && npm run export:jsonl && npm run build:records
 *
 * Inputs (data/):
 *   records.b64.part*.txt   existing packed snapshot (read strictly; corrupt => abort)
 *   export.jsonl            new crawl (from `npm run export:jsonl`)
 *   seed.json               only used when there is no snapshot yet
 *   removed-ids.json        optional: IDs explicitly confirmed gone (only removal path)
 *
 * Output: records.b64.part1..N.txt (+ stub records.b64.txt, snapshot-manifest.json).
 * New IDs are added, existing IDs updated (keeping previous download_url etc.
 * when the crawl lacks one), and IDs missing from the crawl window are KEPT.
 *
 * Flags: --dry-run (report only), --part-size N, --seen-at ISO
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { RecordRow } from '../src/lib/types';
import {
  DEFAULT_PART_SIZE,
  mergeSnapshot,
  readPackedStrict,
  readRemovedIds,
  writePacked,
} from '../src/lib/snapshot';

export function normalize(r: Record<string, unknown>): RecordRow {
  if (!r || typeof r !== 'object' || !r.id) throw new Error('Record without id');
  const out: RecordRow = {
    id: String(r.id),
    title: String(r.title || ''),
    summary: String(r.summary || ''),
    agency: String(r.agency || 'OTHER') as RecordRow['agency'],
    source: String(r.source || 'unknown'),
    source_url: String(r.source_url || ''),
    download_url: (r.download_url as string | null) || null,
    thumbnail_url: (r.thumbnail_url as string | null) || null,
    published_at: (r.published_at as string | null) || null,
    collected_at: String(r.collected_at || r.published_at || new Date(0).toISOString()),
    raw_meta:
      typeof r.raw_meta === 'string'
        ? r.raw_meta
        : r.raw_meta
          ? JSON.stringify(r.raw_meta)
          : null,
  };
  if (typeof r.first_seen === 'string' && r.first_seen) out.first_seen = r.first_seen;
  if (typeof r.last_seen === 'string' && r.last_seen) out.last_seen = r.last_seen;
  return out;
}

function readJsonl(file: string): RecordRow[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return normalize(JSON.parse(l) as Record<string, unknown>);
      } catch (e) {
        throw new Error(`${path.basename(file)} line ${i + 1}: ${(e as Error).message}`);
      }
    });
}

export function buildRecords(
  dir: string,
  opts: { dryRun?: boolean; partSize?: number; seenAt?: string } = {}
) {
  let existing = readPackedStrict(dir).map((r) => normalize(r as Record<string, unknown>));
  if (!existing.length) {
    const seedPath = path.join(dir, 'seed.json');
    if (fs.existsSync(seedPath)) {
      existing = (JSON.parse(fs.readFileSync(seedPath, 'utf8')) as unknown[]).map((r) =>
        normalize(r as Record<string, unknown>)
      );
    }
  }
  const crawl = readJsonl(path.join(dir, 'export.jsonl'));
  const result = mergeSnapshot(existing, crawl, {
    seenAt: opts.seenAt,
    removed: readRemovedIds(dir),
  });
  if (existing.length && result.records.length + result.removed.length < existing.length) {
    throw new Error('Refusing to write: merged snapshot lost records');
  }
  const written = opts.dryRun
    ? null
    : writePacked(dir, result.records, opts.partSize ?? DEFAULT_PART_SIZE);
  return { ...result, before: existing.length, crawl: crawl.length, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const val = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = path.join(process.cwd(), 'data');
  const r = buildRecords(dir, {
    dryRun: argv.includes('--dry-run'),
    partSize: val('--part-size') ? Number(val('--part-size')) : undefined,
    seenAt: val('--seen-at'),
  });
  const counts: Record<string, number> = {};
  for (const x of r.records) counts[x.agency] = (counts[x.agency] || 0) + 1;
  console.log(
    `snapshot ${r.before} + crawl ${r.crawl} → ${r.records.length} records ` +
      `(added ${r.added.length}, updated ${r.updated.length}, kept-outside-window ${r.kept.length}, removed ${r.removed.length})`
  );
  console.log('agencies', counts);
  if (r.written) console.log(`wrote ${r.written.parts} parts (${r.written.bytes} base64 chars)`);
  else console.log('dry run: nothing written');
}
