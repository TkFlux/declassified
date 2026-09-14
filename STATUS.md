# Declassified status

- Feed snapshot: **638** unique records (FBI 583, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-8.txt` (+ optional `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **550**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-09-14 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=550 upserted=550; cia fetched=55 upserted=11.
- Production: https://declassified-tkflux.vercel.app
