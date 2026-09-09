/**
 * NARA / NDC-style public pages.
 * Note: archives.gov "press-releases.rss" currently serves an HTML listing (Drupal),
 * not XML — we parse press-release links from that HTML plus /declassification.
 */
import type { CrawlSourceResult, RecordRow } from '../types';
import { politeFetch, slugId, stripHtml } from '../http';
import { upsertRecords } from '../db';

const PRESS_LIST =
  'https://www.archives.gov/press/press-releases.rss';
const DECLASS_HUB = 'https://www.archives.gov/declassification';
const DECLASS_RESEARCH =
  'https://www.archives.gov/research/declassification';

function collectAnchors(
  html: string,
  origin: string
): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let href = m[1].replace(/&amp;/g, '&');
    const title = stripHtml(m[2]);
    if (!title || title.length < 12 || title.length > 220) continue;
    if (href.startsWith('/')) href = origin + href;
    if (!href.startsWith('http')) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, title });
  }
  return out;
}

export async function crawlNara(): Promise<CrawlSourceResult> {
  const errors: string[] = [];
  const rows: Array<Omit<RecordRow, 'collected_at'>> = [];
  let fetched = 0;

  // Press release listing (HTML despite .rss suffix)
  try {
    const res = await politeFetch(PRESS_LIST, { delayMs: 2500 });
    if (!res.ok) throw new Error(`Press list HTTP ${res.status}`);
    const html = await res.text();
    const anchors = collectAnchors(html, 'https://www.archives.gov');
    for (const a of anchors) {
      if (!/\/press\/press-releases\//i.test(a.href)) continue;
      fetched += 1;
      rows.push({
        id: slugId('nara', a.href),
        title: a.title,
        summary: 'NARA press release listing (public announcement).',
        agency: 'NARA',
        source: 'nara-press-html',
        source_url: a.href,
        download_url: /\.pdf(\?|$)/i.test(a.href) ? a.href : null,
        thumbnail_url: null,
        published_at: null,
        raw_meta: JSON.stringify({ listed_from: PRESS_LIST }),
      });
      if (fetched >= 30) break;
    }
  } catch (e) {
    errors.push(`NARA press: ${(e as Error).message}`);
  }

  // Declassification hub + research declass page
  for (const url of [DECLASS_HUB, DECLASS_RESEARCH]) {
    try {
      const res = await politeFetch(url, { delayMs: 2500 });
      if (!res.ok) {
        errors.push(`NDC ${url} HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const anchors = collectAnchors(html, 'https://www.archives.gov');
      for (const a of anchors) {
        const blob = `${a.title} ${a.href}`.toLowerCase();
        if (
          !/declass|ndc|iscap|pidb|foia|release|classification|mandatory/.test(
            blob
          )
        ) {
          continue;
        }
        // Skip pure chrome
        if (/skip to main|contact us|citizen archivist/i.test(a.title)) continue;
        fetched += 1;
        const isFile = /\.(pdf|docx?)(\?|$)/i.test(a.href);
        rows.push({
          id: slugId('ndc', a.href),
          title: a.title.slice(0, 200),
          summary:
            'Linked from NARA declassification pages. Metadata only; files not bulk-downloaded.',
          agency: 'NDC',
          source: 'nara-declass-page',
          source_url: a.href,
          download_url: isFile ? a.href : null,
          thumbnail_url: null,
          published_at: null,
          raw_meta: JSON.stringify({ listed_from: url }),
        });
      }
    } catch (e) {
      errors.push(`NDC ${url}: ${(e as Error).message}`);
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const unique = [...byId.values()];
  const upserted = unique.length ? upsertRecords(unique) : 0;
  return { source: 'nara', fetched, upserted, errors };
}
