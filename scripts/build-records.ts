/**
 * Merge data/seed.json + data/export.jsonl (if present) → data/records.json
 * Commit records.json so Vercel read-only deploys have content.
 */
import fs from 'fs';
import path from 'path';

type Row = {
  id: string;
  title: string;
  summary: string;
  agency: string;
  source: string;
  source_url: string;
  download_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string;
  raw_meta: string | null;
};

function normalize(r: Record<string, unknown>): Row {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    summary: String(r.summary || ''),
    agency: String(r.agency || 'OTHER'),
    source: String(r.source || 'unknown'),
    source_url: String(r.source_url || ''),
    download_url: (r.download_url as string | null) ?? null,
    thumbnail_url: (r.thumbnail_url as string | null) ?? null,
    published_at: (r.published_at as string | null) ?? null,
    collected_at: String(
      r.collected_at || r.published_at || new Date().toISOString()
    ),
    raw_meta:
      typeof r.raw_meta === 'string'
        ? r.raw_meta
        : r.raw_meta
          ? JSON.stringify(r.raw_meta)
          : null,
  };
}

const dataDir = path.join(process.cwd(), 'data');
const byId = new Map<string, Row>();

const seedPath = path.join(dataDir, 'seed.json');
if (fs.existsSync(seedPath)) {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as unknown[];
  for (const r of seed) {
    const n = normalize(r as Record<string, unknown>);
    byId.set(n.id, n);
  }
}

const exportPath = path.join(dataDir, 'export.jsonl');
if (fs.existsSync(exportPath)) {
  const lines = fs
    .readFileSync(exportPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const line of lines) {
    try {
      const n = normalize(JSON.parse(line) as Record<string, unknown>);
      byId.set(n.id, n);
    } catch {
      /* skip */
    }
  }
}

const records = [...byId.values()].sort((a, b) => {
  const da = a.published_at || a.collected_at || '';
  const db = b.published_at || b.collected_at || '';
  return db.localeCompare(da);
});

const out = path.join(dataDir, 'records.json');
fs.writeFileSync(out, JSON.stringify(records, null, 2) + '\n');
console.log(`Wrote ${out} (${records.length} records)`);
