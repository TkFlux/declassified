# Declassified status

- Feed snapshot: **759** unique records (FBI 704, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-9.txt` (+ stub `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-05 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Delta vs prior snapshot (2026-10-01): +3/−3 FBI Vault IDs (sitemap window churn); totals unchanged at 759.
  - Adds (Vault updates ~Oct 1): Luis Posada Carriles (part 02 final), Henry Kissinger (part 25), D B Cooper (part 122).
  - Drops (out of 700-window): Joseph Adonis parts 01 and 06, Bombrob And Operation Punchout part 28.
- Fix: FBI download-link enrichment now only accepts links hosted on vault.fbi.gov and prefers the Vault's `at_download/file` link. It previously grabbed an unrelated fbijobs.gov EEOC policy PDF from the page footer (16 records affected), and its `@@download/file` guess 404s. Pages with no file link now get no download_url instead of a guess.
- Production: https://declassified-tkflux.vercel.app
