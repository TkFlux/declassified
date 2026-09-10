# Declassified status

- Feed snapshot: **609** unique records (NARA 11, NDC 30, CIA 14, FBI 554) via `data/records.b64.txt` (gzip+base64).
- Crawl defaults: FBI sitemap limit **550**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local `records.b64.txt` and falls back to GitHub raw if under 500.
- Alias: https://declassified-tkflux.vercel.app
