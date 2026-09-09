/**
 * FBI Vault — listing pages are largely JS-rendered; the public sitemap.xml
 * is a reliable, polite source of newest Vault document URLs (metadata only).
 */
import type { CrawlSourceResult, RecordRow } from '../types';
import { politeFetch, slugId } from '../http';
import { upsertRecords } from '../db';

const SITEMAP = 'https://vault.fbi.gov/sitemap.xml';

function titleFromVaultUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // Prefer folder / collection name when path is folder/part/view
    const raw = parts[0] || parts[parts.length - 1] || url;
    return decodeURIComponent(raw)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

function parseSitemap(xml: string, limit: number): Array<{
  loc: string;
  lastmod: string | null;
}> {
  const out: Array<{ loc: string; lastmod: string | null }> = [];
  const re =
    /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1].trim();
    if (!loc.includes('vault.fbi.gov')) continue;
    // Prefer document/view entries over site chrome
    if (/\/(about-vault|browse-files|search|explanation)/i.test(loc)) continue;
    out.push({
      loc,
      lastmod: m[2] ? new Date(m[2].trim()).toISOString() : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function enrichDownload(pageUrl: string): Promise<string | null> {
  try {
    const res = await politeFetch(pageUrl, { delayMs: 700 });
    if (!res.ok) return null;
    const html = await res.text();
    const pdf =
      html.match(/href=["']([^"']+\.pdf[^"']*)["']/i)?.[1] ||
      html.match(/href=["']([^"']+@@download\/file[^"']*)["']/i)?.[1];
    if (!pdf) {
      // Common Plone pattern when HTML is thin
      if (pageUrl.endsWith('/view')) {
        return pageUrl.replace(/\/view$/, '/@@download/file');
      }
      return null;
    }
    if (pdf.startsWith('/')) return `https://vault.fbi.gov${pdf}`;
    if (pdf.startsWith('http')) return pdf;
    return null;
  } catch {
    return null;
  }
}

export async function crawlFbi(opts: {
  limit?: number;
  enrichLimit?: number;
} = {}): Promise<CrawlSourceResult> {
  const errors: string[] = [];
  const rows: Array<Omit<RecordRow, 'collected_at'>> = [];
  let fetched = 0;
  const limit = opts.limit ?? 40;
  const enrichLimit = opts.enrichLimit ?? 3;

  try {
    const res = await politeFetch(SITEMAP, {
      delayMs: 1000,
      headers: { Accept: 'application/xml,text/xml,*/*' },
      timeoutMs: 60000,
    });
    if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
    const xml = await res.text();
    if (!xml.includes('<urlset') && !xml.includes('<url>')) {
      throw new Error('Sitemap response did not look like XML');
    }
    const entries = parseSitemap(xml, limit);
    fetched = entries.length;

    for (const e of entries) {
      const isPdfPath = /\.pdf(\?|$)/i.test(e.loc);
      rows.push({
        id: slugId('fbi', e.loc),
        title: titleFromVaultUrl(e.loc),
        summary:
          'FBI Vault public reading-room document from sitemap (newest first). Metadata only.',
        agency: 'FBI',
        source: 'fbi-vault-sitemap',
        source_url: e.loc,
        download_url: isPdfPath ? e.loc : null,
        thumbnail_url: null,
        published_at: e.lastmod,
        raw_meta: JSON.stringify({ listed_from: SITEMAP }),
      });
    }

    for (let i = 0; i < Math.min(enrichLimit, rows.length); i++) {
      if (rows[i].download_url) continue;
      const dl = await enrichDownload(rows[i].source_url);
      if (dl) rows[i].download_url = dl;
    }
  } catch (e) {
    errors.push(`FBI sitemap: ${(e as Error).message}`);
  }

  const upserted = rows.length ? upsertRecords(rows) : 0;
  return { source: 'fbi', fetched, upserted, errors };
}
