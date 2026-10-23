/**
 * Backfill: union every record that ever appeared in the committed snapshot
 * (all git history, all branches), deduped by ID, newest version wins
 * (keeping earlier enrichment such as download_url when the newer copy lacks it).
 *
 *   npm run backfill:history            # writes data/records.b64.part*.txt
 *   npm run backfill:history -- --dry-run
 *
 * first_seen / last_seen are set from the commit dates of the first / last
 * snapshot version that contained the record. IDs in data/removed-ids.json are skipped.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import type { RecordRow } from '../src/lib/types';
import {
  decodePacked,
  mergeRecord,
  PART_RE,
  readRemovedIds,
  sortRecords,
  writePacked,
} from '../src/lib/snapshot';
import { normalize } from './build-records';

const cwd = process.cwd();
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd, maxBuffer: 1 << 28 }).toString('utf8');
const show = (rev: string, file: string): string | null => {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], {
      cwd,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString('utf8');
  } catch {
    return null;
  }
};

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v;
    const recs = (v as { records?: unknown }).records;
    return Array.isArray(recs) ? recs : [];
  } catch {
    return [];
  }
}

/** Reconstruct what the loader would have served at a given commit. */
function snapshotAt(rev: string): unknown[] {
  const files = git('ls-tree', '--name-only', rev, 'data/').split('\n').filter(Boolean);
  const names = new Set(files.map((f) => f.slice('data/'.length)));
  let b64 = (names.has('records.b64.txt') && show(rev, 'data/records.b64.txt')?.trim()) || '';
  if (b64.length < 10000) {
    const parts: string[] = [];
    for (let i = 1; names.has(`records.b64.part${i}.txt`); i++) {
      parts.push((show(rev, `data/records.b64.part${i}.txt`) || '').trim());
    }
    if (parts.length) b64 = parts.join('');
  }
  const out: unknown[] = [];
  if (b64) {
    try {
      out.push(...decodePacked(b64));
    } catch {
      /* half-pushed / corrupt intermediate commit: skip */
    }
  }
  for (const n of [...names].sort()) {
    if (n.startsWith('records') && n.endsWith('.json') && !PART_RE.test(n)) {
      out.push(...parseJsonArray(show(rev, `data/${n}`)));
    }
  }
  return out;
}

const dryRun = process.argv.includes('--dry-run');
// Oldest → newest so later versions win.
const revs = git('rev-list', '--reverse', '--date-order', '--all', '--', 'data/')
  .split('\n')
  .filter(Boolean);
const head = new Set(snapshotAt('HEAD').map((r) => String((r as { id: string }).id)));
const removed = readRemovedIds(path.join(cwd, 'data'));
const byId = new Map<string, RecordRow>();
let versions = 0;
for (const rev of revs) {
  const rows = snapshotAt(rev);
  if (!rows.length) continue;
  versions++;
  const when = new Date(git('show', '-s', '--format=%cI', rev).trim()).toISOString();
  for (const raw of rows) {
    let r: RecordRow;
    try {
      r = normalize(raw as Record<string, unknown>);
    } catch {
      continue;
    }
    if (removed.has(r.id)) continue;
    const prev = byId.get(r.id);
    byId.set(
      r.id,
      mergeRecord(prev, {
        ...r,
        first_seen: r.first_seen || prev?.first_seen || when,
        last_seen: r.last_seen && r.last_seen > when ? r.last_seen : when,
      })
    );
  }
}
const records = sortRecords([...byId.values()]);
const counts: Record<string, number> = {};
for (const r of records) counts[r.agency] = (counts[r.agency] || 0) + 1;
const restored = records.filter((r) => !head.has(r.id));
console.log(`scanned ${revs.length} commits, ${versions} with a decodable snapshot`);
console.log(`HEAD ${head.size} → union ${records.length} (restored ${restored.length})`);
console.log('agencies', counts);
if (!dryRun) {
  const w = writePacked(path.join(cwd, 'data'), records);
  console.log(`wrote ${w.parts} parts (${w.bytes} base64 chars)`);
}
