# Declassified

Continuous visual feed of U.S. **declassified / public-release** records, plus a **Draft for X** queue that is **approval-only** (no auto-posting).

Repo: [TkFlux/declassified](https://github.com/TkFlux/declassified)

## Features

- **Next.js App Router + TypeScript + Tailwind** card feed (newest first)
- Search + filters (agency, download available vs page-only)
- Cards: title, summary, agency badge, date, optional thumbnail, official link
- Flag when **declassified but not digitized** (no file URL)
- **Load more** pagination
- **Draft for X** → short tweet text stored in SQLite for human approval (`/drafts`)
- **Collector** scripts: polite crawl (delays + robots.txt), SQLite, JSONL export, CLI search
- Metadata + URLs only — **does not bulk-download PDFs**

## Quick start

```bash
# Node 20+
npm install
npm run seed          # load realistic sample records into SQLite
npm run dev           # http://localhost:3000
```

Other scripts:

```bash
npm run build && npm start
npm test
npm run crawl                    # all enabled sources
npm run crawl -- --source nara   # one source
npm run crawl -- --resume        # skip sources already marked done in data/crawl-state.json
npm run search -- --query "Cuba"
npm run export:jsonl             # data/export.jsonl
```

Copy `.env.example` to `.env` if you want to override `DATABASE_PATH`.

## Draft for X

1. On any feed card, click **Draft for X**.
2. Open **Draft queue** (`/drafts`).
3. Approve / reject / copy text.
4. **Nothing is posted to X** by this app.

## Architecture

```
src/app/            Next.js UI + API routes (records, drafts, search)
src/components/     Feed, RecordCard, badges
src/lib/db.ts       better-sqlite3 schema + queries
src/lib/sources/    NARA/NDC, FBI Vault, CIA public page crawlers
scripts/            crawl, search, seed, export-jsonl
data/seed.json      sample records so UI works before a full crawl
data/*.db           local SQLite (gitignored)
```

The UI and CLI share the same SQLite file (`data/declassified.db` by default).

## Crawl sources (MVP)

| Source | Path | Notes |
|--------|------|--------|
| **NARA / NDC** | Press listing HTML + `/declassification` | `press-releases.rss` currently serves HTML (Drupal); we parse press + declass links. Respects long crawl-delay. |
| **FBI Vault** | `sitemap.xml` (newest first) + light enrich | Listing UI is JS-heavy; sitemap is the reliable real-fetch path. Optional `@@download/file` guess on a few items. |
| **CIA** | Reading Room + historical collections | Keyword-filtered public links; coverage is opportunistic |
| **State / NSA** | **Disabled** | Often sparse HTML or not reliably scrapable without APIs/auth |

**Working MVP over perfect coverage:** if a live site blocks this environment or changes markup, `npm run seed` still populates the UI. Re-run `npm run crawl` when network access is good.

### Future

- Optional **NARA Catalog API** key (`NARA_API_KEY`) for richer catalog search
- Stronger FBI Vault parsers / sitemap support
- STATE/NSA adapters if stable public endpoints appear

## Tests

```bash
npm test
```

Covers schema/migrate, upsert + filters, draft queue, tweet draft truncation, and light RSS/HTML parsers.

## Constraints / ethics

- Polite delays and robots.txt checks via `src/lib/http.ts`
- Restartable crawl state in `data/crawl-state.json`
- Public UI — no ChatGPT auth
- Collect **metadata + URLs only**

## License

MIT (or as declared by the repository owner).
