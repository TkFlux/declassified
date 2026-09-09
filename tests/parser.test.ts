import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml } from '../src/lib/http';

function parseRssItems(xml: string): Array<{ title: string; link: string }> {
  const items: Array<{ title: string; link: string }> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
      block.match(/<title>(.*?)<\/title>/i))?.[1]?.trim() || '';
    const link = (block.match(/<link>(.*?)<\/link>/i))?.[1]?.trim() || '';
    if (title && link) items.push({ title: stripHtml(title), link });
  }
  return items;
}

function parseVaultSitemap(
  xml: string,
  limit: number
): Array<{ loc: string; lastmod: string | null }> {
  const out: Array<{ loc: string; lastmod: string | null }> = [];
  const re =
    /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1].trim();
    if (!loc.includes('vault.fbi.gov')) continue;
    out.push({
      loc,
      lastmod: m[2] ? new Date(m[2].trim()).toISOString() : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

test('parseRssItems extracts CDATA titles and links', () => {
  const xml = `<?xml version="1.0"?>
  <rss><channel>
    <item>
      <title><![CDATA[Declassification Update]]></title>
      <link>https://www.archives.gov/press/1</link>
      <description><![CDATA[About <b>records</b>]]></description>
    </item>
    <item>
      <title>Plain Title</title>
      <link>https://www.archives.gov/press/2</link>
    </item>
  </channel></rss>`;

  const items = parseRssItems(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Declassification Update');
  assert.equal(items[0].link, 'https://www.archives.gov/press/1');
  assert.equal(items[1].title, 'Plain Title');
});

test('vault sitemap parser reads loc + lastmod', () => {
  const xml = `<?xml version="1.0"?>
  <urlset>
    <url>
      <loc>https://vault.fbi.gov/project-slammer/project-slammer-final/view</loc>
      <lastmod>2026-09-03T16:59:55Z</lastmod>
    </url>
    <url>
      <loc>https://example.com/ignore</loc>
      <lastmod>2026-01-01T00:00:00Z</lastmod>
    </url>
  </urlset>`;
  const entries = parseVaultSitemap(xml, 10);
  assert.equal(entries.length, 1);
  assert.match(entries[0].loc, /project-slammer/);
  assert.ok(entries[0].lastmod);
});

test('press HTML press-release href filter', () => {
  const html = `
    <a href="/press/press-releases/2026/nr26-1">Freedom Plane National Tour</a>
    <a href="/contact">Contact Us</a>
    <a href="/press/press-kits/">Press Kits</a>
  `;
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const kept: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/\/press\/press-releases\//i.test(m[1])) kept.push(stripHtml(m[2]));
  }
  assert.deepEqual(kept, ['Freedom Plane National Tour']);
});
