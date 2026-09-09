/**
 * Restartable crawler with polite delays + robots.txt awareness.
 * Usage:
 *   npm run crawl
 *   npm run crawl -- --source nara
 *   npm run crawl -- --source fbi
 *   npm run crawl -- --source cia
 *   npm run crawl -- --resume
 */
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/lib/db';
import { runCrawl, DISABLED_SOURCES, type SourceId } from '../src/lib/sources';

const STATE_PATH = path.join(process.cwd(), 'data', 'crawl-state.json');

type CrawlState = {
  lastRunAt: string | null;
  completedSources: string[];
  lastResults: unknown[];
};

function loadState(): CrawlState {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as CrawlState;
  } catch {
    return { lastRunAt: null, completedSources: [], lastResults: [] };
  }
}

function saveState(state: CrawlState): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function parseArgs(argv: string[]) {
  const out: { source: SourceId; resume: boolean } = {
    source: 'all',
    resume: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      out.source = argv[++i] as SourceId;
    } else if (argv[i] === '--resume') {
      out.resume = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  getDb();

  console.log('Declassified crawler');
  console.log(`Source: ${args.source}`);
  console.log(`Disabled (MVP): ${DISABLED_SOURCES.join(', ')}`);
  console.log('Note: metadata + URLs only; PDFs are not bulk-downloaded.\n');

  const state = loadState();
  const order: SourceId[] =
    args.source === 'all' ? ['nara', 'fbi', 'cia'] : [args.source];

  const toRun = args.resume
    ? order.filter((s) => !state.completedSources.includes(s))
    : order;

  if (args.resume && toRun.length === 0) {
    console.log('All sources already completed in crawl-state.json. Delete it to re-run.');
    closeDb();
    return;
  }

  if (!args.resume) {
    state.completedSources = [];
    state.lastResults = [];
  }

  for (const src of toRun) {
    console.log(`--- Crawling ${src} ---`);
    const results = await runCrawl(src);
    for (const r of results) {
      console.log(
        `${r.source}: fetched=${r.fetched} upserted=${r.upserted}` +
          (r.errors.length ? ` errors=${r.errors.length}` : '')
      );
      if (r.errors.length) {
        for (const e of r.errors) console.warn(`  ! ${e}`);
      }
      state.lastResults.push(r);
      state.completedSources.push(r.source);
      state.lastRunAt = new Date().toISOString();
      saveState(state);
    }
  }

  console.log('\nDone. State saved to data/crawl-state.json');
  console.log('Tip: UI reads from SQLite — run `npm run seed` first for sample data.');
  closeDb();
}

main().catch((e) => {
  console.error(e);
  closeDb();
  process.exit(1);
});
