# Declassified status

- Feed snapshot: **759** unique records (FBI 704, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-9.txt` (+ stub `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-08 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Delta vs prior snapshot (2026-10-05): +5/−5 FBI Vault IDs (sitemap window churn); totals unchanged at 759.
  - Adds (Vault updates Oct 5–6): Bombrob And Operation Punchout parts 38 and 39, Arctic Frost part 07, Joseph Bisogno part 01 and part 02 (final).
  - Drops: Joseph Bisogno "final" (Vault re-split it into parts 01 and 02), Joseph Adonis parts 02–05 (out of 700-window).
  - Snapshot keeps previously found vault.fbi.gov download links when a record falls outside the crawl's 8-page enrichment window (4 Waco Branch Davidian Compound Audio parts would otherwise lose their file link).
- Fix: FBI download-link enrichment now only accepts links hosted on vault.fbi.gov and prefers the Vault's `at_download/file` link. It previously grabbed an unrelated fbijobs.gov EEOC policy PDF from the page footer (16 records affected), and its `@@download/file` guess 404s. Pages with no file link now get no download_url instead of a guess.
- Production: https://declassified-tkflux.vercel.app
