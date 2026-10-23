# Declassified status

- Feed snapshot: **937** unique records (FBI 882, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-12.txt` (+ stub `records.b64.txt`, counts in `data/snapshot-manifest.json`).
- **Snapshot is now an accumulating archive** (2026-10-22): refreshes merge the crawl into the
  existing snapshot (`npm run build:records`); records outside the FBI sitemap's 700-item
  window are kept. Removal only via `data/removed-ids.json`. Records carry `first_seen` / `last_seen`.
- Backfill (2026-10-22): union of every snapshot version in git history (`npm run backfill:history`):
  759 → 937 records, **178 FBI records restored** (e.g. Joseph Gurera ×6, Frank Palermo ×3, Matteo Valvo ×2,
  Francis Sheeran, D B Cooper, Assata Shakur, Arctic Frost, Patriot Front, Junius Scales, Albert Wohlstetter, Joseph Adonis, The Zodiac Killer part 07).
  All 759 current records are unchanged apart from the added `first_seen`/`last_seen` fields.
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or any number of parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-22 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Production: https://declassified-tkflux.vercel.app
