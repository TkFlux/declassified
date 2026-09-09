/**
 * Export all records to JSONL (metadata + URLs only).
 * Usage: npm run export:jsonl
 */
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/lib/db';
import type { RecordRow } from '../src/lib/types';

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM records ORDER BY COALESCE(published_at, collected_at) DESC`
    )
    .all() as RecordRow[];

  const outPath = path.join(process.cwd(), 'data', 'export.jsonl');
  const lines = rows.map((r) => JSON.stringify(r));
  fs.writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''));
  console.log(`Wrote ${rows.length} records to ${outPath}`);
  closeDb();
}

main().catch((e) => {
  console.error(e);
  closeDb();
  process.exit(1);
});
