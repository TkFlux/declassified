# Declassified status

- Feed snapshot: **759** unique records (FBI 704, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-9.txt` (+ stub `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-12 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Delta vs prior snapshot (2026-10-08): +5/−5 FBI Vault IDs (sitemap window churn); totals unchanged at 759.
  - Adds: Dugway Proving Ground Dpg, Dolly Parton, Reuben Sturman, Records Regarding The Review Of The Investigative Holdings Related To Jeffrey Epstein (2 parts).
  - Drops: Fbi Foia Appeals Intake And Processing Standard Operating Procedures (2), D B Cooper, Benjamin Valvo, Joseph Adonis (out of 700-window).
  - Snapshot keeps previously found vault.fbi.gov download links when a record falls outside the crawl's 8-page enrichment window.
  - download_url changes among shared IDs: 0.
- Production: https://declassified-tkflux.vercel.app

## Retention investigation (2026-10-14)

- Root cause: `build-records.ts` previously rebuilt only from seed + current export;
  it never read the packed committed snapshot. SQLite upserts do not delete absent
  IDs, but a fresh/partial database cannot supply historical discoveries. The
  sitemap's 700-entry window then became an accidental archive limit.
- The builder now retains the union of packed history, existing JSON, seed and
  export, with one row per stable ID and conservative metadata enrichment.
- Replaying the October 8 snapshot (`c30c16d`) against October 12 (`eb6d11a`)
  produced **764 unique records**, retaining all five reported drops while adding
  the five new discoveries. This was an isolated replay, not a production refresh.
- The committed feed remains the October 12 snapshot above. Packaging and the
  external Mon/Thu scheduler are unchanged; refreshes must package the output of
  `npm run build:records`. See README for the retention and correction policy.
