import fs from 'fs';
import path from 'path';
import { getDb, upsertRecords, closeDb } from '../src/lib/db';

async function main() {
  getDb();
  const seedPath = path.join(process.cwd(), 'data', 'seed.json');
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as Array<{
    id: string;
    title: string;
    summary: string;
    agency: string;
    source: string;
    source_url: string;
    download_url: string | null;
    thumbnail_url: string | null;
    published_at: string | null;
  }>;

  const collected_at = new Date().toISOString();
  const n = upsertRecords(
    raw.map((r) => ({
      ...r,
      agency: r.agency as 'NARA' | 'NDC' | 'FBI' | 'CIA' | 'OTHER',
      collected_at,
      raw_meta: JSON.stringify({ seeded: true }),
    }))
  );

  console.log(`Seeded ${n} records into ${process.env.DATABASE_PATH || 'data/declassified.db'}`);
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
