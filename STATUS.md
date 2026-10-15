# Declassified status

- Feed snapshot: **759** unique records (FBI 704, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-9.txt` (+ stub `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-15 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Delta vs prior snapshot (2026-10-12): +1/−1 FBI Vault IDs (sitemap window churn); totals unchanged at 759.
  - Adds: Thomas Crooks.
  - Drops: Francis Sheeran (out of 700-window).
  - Snapshot keeps previously found vault.fbi.gov download links when a record falls outside the crawl's 8-page enrichment window.
  - download_url changes among shared IDs: 0.
- Production: https://declassified-tkflux.vercel.app
