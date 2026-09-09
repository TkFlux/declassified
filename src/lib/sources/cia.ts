/**
 * CIA Electronic Reading Room — historical collections + reading-room hub links.
 */
import type { CrawlSourceResult, RecordRow } from '../types';
import { politeFetch, slugId, stripHtml } from '../http';
import { upsertRecords } from '../db';

const HUBS = [
  'https://www.cia.gov/readingroom/',
  'https://www.cia.gov/readingroom/historical-collections',
  'https://www.cia.gov/readingroom/collection/nixon-collection',
];

function parseLinks(
  html: string,
  base: string
): Array<{ title: string; href: string }> {
  const out: Array<{ title: string; href: string }> = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const origin = new URL(base).origin;

  while ((m = re.exec(html))) {
    let href = m[1].replace(/&amp;/g, '&');
    const title = stripHtml(m[2]);
    if (!title || title.length < 8 || title.length > 200) continue;
    if (href.startsWith('/')) href = origin + href;
    if (!href.startsWith('http')) continue;
    if (!href.includes('cia.gov')) continue;
    if (seen.has(href)) continue;
    const blob = `${title} ${href}`.toLowerCase();
    if (
      !/readingroom|collection|document|declass|foia|historical|crest|bulletin|nixon|release/.test(
        blob
      )
    ) {
      continue;
    }
    if (/submit request|fee schedule|search help|back to top/i.test(title))
      continue;
    seen.add(href);
    out.push({ title, href });
    if (out.length >= 40) break;
  }
  return out;
}

export async function crawlCia(): Promise<CrawlSourceResult> {
  const errors: string[] = [];
  const rows: Array<Omit<RecordRow, 'collected_at'>> = [];
  let fetched = 0;

  for (const url of HUBS) {
    try {
      const res = await politeFetch(url, { delayMs: 1200 });
      if (!res.ok) {
        errors.push(`CIA ${url} HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const links = parseLinks(html, url);
      fetched += links.length;
      for (const L of links) {
        const isPdf = /\.pdf(\?|$)/i.test(L.href);
        rows.push({
          id: slugId('cia', L.href),
          title: L.title,
          summary:
            'CIA Electronic Reading Room / historical collection link. Metadata only.',
          agency: 'CIA',
          source: 'cia-readingroom',
          source_url: L.href,
          download_url: isPdf ? L.href : null,
          thumbnail_url: null,
          published_at: null,
          raw_meta: JSON.stringify({ listed_from: url }),
        });
      }
    } catch (e) {
      errors.push(`CIA ${url}: ${(e as Error).message}`);
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const unique = [...byId.values()];
  const upserted = unique.length ? upsertRecords(unique) : 0;
  return { source: 'cia', fetched, upserted, errors };
}
