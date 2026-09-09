/**
 * CLI search against SQLite.
 * Usage: npm run search -- --query "Cuba"
 */
import { getDb, queryRecords, closeDb } from '../src/lib/db';

function parseArgs(argv: string[]) {
  let query = '';
  let agency = 'all';
  let download: 'all' | 'available' | 'page-only' = 'all';
  let limit = 20;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--query' || argv[i] === '-q') && argv[i + 1]) {
      query = argv[++i];
    } else if (argv[i] === '--agency' && argv[i + 1]) {
      agency = argv[++i];
    } else if (argv[i] === '--download' && argv[i + 1]) {
      download = argv[++i] as typeof download;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Number(argv[++i]) || 20;
    }
  }
  return { query, agency, download, limit };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.error('Usage: npm run search -- --query "Cuba"');
    process.exit(2);
  }
  getDb();
  const { rows, total } = queryRecords({
    q: args.query,
    agency: args.agency,
    download: args.download,
    limit: args.limit,
    offset: 0,
  });
  console.log(`Found ${total} match(es); showing ${rows.length}\n`);
  for (const r of rows) {
    const dig = r.download_url ? 'download' : 'page-only / not digitized';
    console.log(`- [${r.agency}] ${r.title}`);
    console.log(`  ${r.summary.slice(0, 120)}${r.summary.length > 120 ? '…' : ''}`);
    console.log(`  ${dig} | ${r.source_url}`);
    console.log('');
  }
  closeDb();
}

main().catch((e) => {
  console.error(e);
  closeDb();
  process.exit(1);
});
