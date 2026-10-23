# Declassified

Continuous visual feed of U.S. **declassified / public-release** records, plus a **Draft for X** queue that is **approval-only** (no auto-posting).

Repo: [TkFlux/declassified](https://github.com/TkFlux/declassified)

## Features

- **Next.js App Router + TypeScript + Tailwind** card feed (newest first)
- Search + filters (agency, download available vs page-only)
- Cards: title, summary, agency badge, date, optional thumbnail, official link
- Flag when **declassified but not digitized** (no file URL)
- **Load more** pagination
- **Draft for X** → short tweet text stored in SQLite for human approval (`/drafts`) — **local only**
- **Collector** scripts: polite crawl (delays + robots.txt), SQLite, JSONL export, CLI search
- Metadata + URLs only — **does not bulk-download PDFs**
- **Vercel read-only deploy**: feed from bundled `data/records.b64.txt` / parts (no `better-sqlite3` on serverless)

## Quick start (local, full features)

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
npm run build:records            # merge export.jsonl INTO the packed snapshot (accumulates; never drops)
npm run backfill:history         # union every record ever committed (git history) into the snapshot
```

Copy `.env.example` to `.env` if you want to override `DATABASE_PATH` or force `READ_ONLY=1`.

## Deploy on Vercel (read-only feed)

Vercel serverless **cannot** use writable `better-sqlite3`. This app detects `process.env.VERCEL` (or `READ_ONLY=1`) and:

1. Serves the feed from committed gzip+base64 (`data/records.b64.txt` or `data/records.b64.part*.txt`), falling back to GitHub raw if under 500 local records
2. Keeps search + filters working in memory
3. **Disables Draft for X** with banner: *“Drafts work locally — this deploy is read-only”*

`better-sqlite3` is an **optionalDependency** and is only loaded dynamically when not in read-only mode, so the Vercel build does not need the native module.

### Steps

1. Ensure the feed snapshot is committed (regenerate after crawls):

   ```bash
   npm run export:jsonl   # crawl results from local SQLite → data/export.jsonl
   npm run build:records  # MERGES the crawl into data/records.b64.part*.txt
   git add data/records.b64* data/snapshot-manifest.json && git commit -m "Update records for Vercel"
   ```

2. Import the GitHub repo in Vercel (framework: Next.js — `vercel.json` included).
3. Deploy. No env vars required; `VERCEL=1` is set automatically.
4. Optional: set `READ_ONLY=1` on any host to force the JSON path.

Do **not** expect drafts, crawl, or SQLite writes on Vercel.

## Draft for X

1. On any feed card, click **Draft for X** (local / non-read-only only).
2. Open **Draft queue** (`/drafts`).
3. Approve / reject / copy text.
4. **Nothing is posted to X** by this app.

## Architecture

```
src/app/            Next.js UI + API routes (records, drafts, search)
src/components/     Feed, RecordCard, badges
src/lib/store.ts    Facade: SQLite locally, JSON on Vercel / READ_ONLY
src/lib/json-store.ts  Bundled b64/JSON load + in-memory filter/search
src/lib/db.ts       better-sqlite3 schema + queries (local / scripts)
src/lib/sources/    NARA/NDC, FBI Vault, CIA public page crawlers
scripts/            crawl, search, seed, export-jsonl, build-records
data/seed.json      sample records
data/records.b64*   committed accumulating snapshot for Vercel read-only feed (see data/snapshot-manifest.json)
data/*.db           local SQLite (gitignored)
```

Locally, the UI and CLI share SQLite (`data/declassified.db` by default). On Vercel, API routes use `src/lib/store.ts` → JSON/b64 only.

## Crawl sources (MVP)

| Source | Path | Notes |
|--------|------|--------|
| **NARA / NDC** | Press listing HTML + `/declassification` | `press-releases.rss` currently serves HTML (Drupal); we parse press + declass links. Respects long crawl-delay. |
| **FBI Vault** | `sitemap.xml` (newest first) + light enrich | Listing UI is JS-heavy; sitemap is the reliable real-fetch path. Optional `@@download/file` guess on a few items. |
| **CIA** | Reading Room + historical collections | Keyword-filtered public links; coverage is opportunistic |
| **State / NSA** | **Disabled** | Often sparse HTML or not reliably scrapable without APIs/auth |

**Working MVP over perfect coverage:** if a live site blocks this environment or changes markup, `npm run seed` still populates the UI. Re-run `npm run crawl` when network access is good. Refresh `data/records.b64*` before deploying.

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

## Growing the feed (accumulating archive)

Default FBI Vault crawl pulls the **700** newest sitemap entries (metadata + URLs only). NARA/CIA add more.
The crawl window is **not** the archive: each refresh is merged into the committed snapshot.

```bash
npm run crawl
npm run export:jsonl
npm run build:records      # merge, don't replace
```

Merge rules (`src/lib/snapshot.ts` → `mergeSnapshot`):

- New IDs are added (`first_seen` = `last_seen` = refresh time).
- Existing IDs are updated from the crawl; a previously found `download_url`
  (also `thumbnail_url`, `published_at`) is kept when the new crawl lacks one.
  Untrusted FBI download links (not on `vault.fbi.gov`) are dropped.
- IDs missing from the crawl window are **kept** unchanged (`last_seen` shows when they were last crawled).
- A record is removed only when its ID is listed in `data/removed-ids.json`
  (explicitly confirmed gone), e.g. `[{"id": "fbi-xxxx", "reason": "404 on vault", "confirmed_at": "2026-10-22"}]`.
- The build aborts (and writes nothing) if the existing snapshot is corrupt or a part is missing.

The snapshot is gzip+base64 split into ~3500-char `data/records.b64.partN.txt` files; the
number of parts grows with the archive (the loader reads parts until the first missing
index). `data/snapshot-manifest.json` records the expected record/part counts.
Commit **all** parts plus the manifest. `npm run backfill:history` rebuilds the union of
every snapshot version in git history (newest version of each ID wins).
Lattice also refreshes on a Mon/Thu schedule — it must run `build:records` (merge) rather than overwrite the parts.
