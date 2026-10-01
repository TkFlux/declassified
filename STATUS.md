# Declassified status

- Feed snapshot: **759** unique records (FBI 704, NDC 30, CIA 14, NARA 11) via `data/records.b64.part1-9.txt` (+ stub `records.b64.txt`).
- Crawl defaults: FBI sitemap limit **700**, enrichLimit **8** (`src/lib/sources/fbi.ts`, `index.ts`).
- JSON store loads local gzip+base64 (single file or parts), and falls back to GitHub raw if under 500 records.
- Last crawl: 2026-10-01 (Mon/Thu refresh): nara fetched=37 upserted=36; fbi fetched=700 upserted=700; cia fetched=33 upserted=11.
- Delta vs prior snapshot (2026-09-28): +96/−96 FBI Vault IDs (sitemap window churn); 0 download_url changes; totals unchanged at 759.
  - Notable adds: Frank Brancato (20), Waco Branch Davidian Compound Audio (18), Communist Party Usa parts (11), Harry S. Stonehill (10), Frederick Hahneman (7), Martha Stern (7), August Maniaci (6), Black Liberation Army (3), plus Albert Kahn, Colombo/Gambino LCN, Going Dark Brief (Mar 2015), Harold Stassen, John DeCamp, Kristy Manzanares, Paul Vario, Francis Shelden.
  - Notable drops (out of 700-window): Agnes Smedley, Bombrob/Punchout, D B Cooper, Arctic Frost, Assata Shakur, Matt Gaetz, Patriot Front, Mar-a-Lago mention, Epstein investigative holdings, Thomas Crooks, Edwin Wilson And Frank Terpil, Nelson Rockefeller parts, Irish Republican Army parts, among others.
- Production: https://declassified-tkflux.vercel.app
