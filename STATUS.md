# Declassified status

- Feed snapshot: **609** unique records (NARA 11, NDC 30, CIA 14, FBI 554) via `data/records.b64.part1-9.txt` (+ optional `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **550**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Production: https://declassified-tkflux.vercel.app
