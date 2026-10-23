/**
 * US Department of War — PURSUE UAP records (https://www.war.gov/UFO/).
 *
 * The collection page's searchable database is a single CSV
 * (Portals/1/Interactive/2026/UFO/uap-data.csv?release=<n>). Every release
 * (01, 02, …) is appended to that CSV, so ingesting the whole file each crawl
 * picks up new releases automatically. The cache-busting `?release=` query is
 * discovered from the collection page; falls back to the bare CSV URL.
 *
 * war.gov sits behind Akamai and returns 403 to non-browser clients, so this
 * source sends ordinary browser headers (UA, Accept, Accept-Language, Referer).
 */
import type { CrawlSourceResult, RecordRow } from '../types';
import { sleep, slugId } from '../http';

export const PURSUE_PAGE_URL = 'https://www.war.gov/UFO/';
export const PURSUE_CSV_BASE =
  'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: PURSUE_PAGE_URL,
};

/** RFC 4180 CSV parser (quoted fields, "" escapes, embedded newlines, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** CSV text -> array of objects keyed by (trimmed) header names. */
export function csvToObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) o[h] = r[i] ?? '';
    });
    return o;
  });
}

/** Collapse whitespace incl. NBSP. */
export function clean(s: string | undefined | null): string {
  return (s || '').replace(/[\s\u00a0]+/g, ' ').trim();
}

/** "10/23/26" | "10/23/2026" -> "2026-10-23" (null if not M/D/Y). */
export function parseUsDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(clean(s));
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mm = String(Number(m[1])).padStart(2, '0');
  const dd = String(Number(m[2])).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const TYPE_LABEL: Record<string, string> = {
  PDF: 'PDF',
  VID: 'Video',
  IMG: 'Image',
  AUD: 'Audio',
};

function httpUrl(s: string | undefined): string | null {
  const v = clean(s);
  return /^https?:\/\//i.test(v) ? v.replace(/ /g, '%20') : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function fmtReleaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

/**
 * Map CSV rows to feed records. Release numbers are the dense rank of the
 * distinct release dates in the CSV (R01 = earliest), which matches war.gov's
 * numbering because each release adds rows with a new release date.
 */
export function pursueRowsToRecords(
  objs: Array<Record<string, string>>,
  csvUrl = PURSUE_CSV_BASE
): Array<Omit<RecordRow, 'collected_at'>> {
  const usable = objs.filter((o) => clean(o['Title']));
  const dates = [
    ...new Set(usable.map((o) => parseUsDate(o['Release Date'] || '')).filter(Boolean) as string[]),
  ].sort();
  const releaseOf = new Map(dates.map((d, i) => [d, i + 1]));
  const out: Array<Omit<RecordRow, 'collected_at'>> = [];
  const ids = new Set<string>();

  for (const o of usable) {
    const title = clean(o['Title']);
    const typeCode = clean(o['Type']).toUpperCase() || 'DOC';
    const fileType = TYPE_LABEL[typeCode] || typeCode;
    const agencyName = clean(o['Agency']) || 'Unknown agency';
    const releaseDate = parseUsDate(o['Release Date'] || '');
    const release = releaseDate ? releaseOf.get(releaseDate)! : null;
    const releaseLabel = release ? `Release ${String(release).padStart(2, '0')}` : 'Release ?';
    const dvids = clean(o['DVIDS Video ID']);
    const link = httpUrl(o['PDF | Image Link']);
    const thumb = httpUrl(o['Modal Image']);
    const incidentDate = clean(o['Incident Date']);
    const incidentLoc = clean(o['Incident Location']);
    const blurb = clean(o['Description Blurb']);

    // Primary media: videos/audio live on DVIDS; documents/images on war.gov.
    let sourceUrl: string;
    let downloadUrl: string | null = null;
    let pairedDoc: string | null = null;
    if ((typeCode === 'VID' || typeCode === 'AUD') && dvids) {
      sourceUrl = `https://www.dvidshub.net/${typeCode === 'AUD' ? 'audio' : 'video'}/${dvids}`;
      pairedDoc = link;
    } else if (link) {
      sourceUrl = link;
      downloadUrl = link;
    } else {
      sourceUrl = PURSUE_PAGE_URL;
    }

    const code = /\b([A-Z]+-UAP-[A-Z]*\d+[A-Z]?)\b/i.exec(title)?.[1]?.toUpperCase();
    let id = slugId('pursue', typeCode, code || title);
    if (ids.has(id)) id = slugId('pursue', typeCode, title);
    if (ids.has(id)) continue;
    ids.add(id);

    const incident = [incidentDate && incidentDate !== 'N/A' ? incidentDate : '', incidentLoc && incidentLoc !== 'N/A' ? incidentLoc : '']
      .filter(Boolean)
      .join(', ');
    const fileName = (downloadUrl || '').split('/').pop() || '';
    const header =
      `PURSUE ${releaseLabel}` +
      (releaseDate ? ` (${fmtReleaseDate(releaseDate)})` : '') +
      ` · ${fileType} · ${agencyName}` +
      (incident ? ` · Incident: ${incident}` : '');
    const headerLine = /[.!?]$/.test(header) ? header : `${header}.`;
    const summary = [headerLine, blurb, fileName ? `File: ${safeDecode(fileName)}` : '']
      .filter(Boolean)
      .join(' ');

    out.push({
      id,
      title,
      summary,
      agency: 'PURSUE',
      source: 'war-pursue',
      source_url: sourceUrl,
      download_url: downloadUrl,
      thumbnail_url: thumb,
      published_at: releaseDate ? `${releaseDate}T12:00:00.000Z` : null,
      raw_meta: JSON.stringify({
        collection: 'PURSUE (war.gov/UFO)',
        release,
        release_label: releaseLabel,
        release_date: releaseDate,
        file_type: fileType,
        type_code: typeCode,
        originating_agency: agencyName,
        incident_date: incidentDate || null,
        incident_location: incidentLoc || null,
        featured: /^yes$/i.test(clean(o['Featured'])),
        redacted: /^true$/i.test(clean(o['Redaction'])),
        dvids_id: dvids || null,
        video_title: clean(o['Video Title']) || null,
        paired_document: pairedDoc,
        pdf_pairing: clean(o['PDF Pairing']) || null,
        video_pairing: clean(o['Video Pairing']) || null,
        image_alt: clean(o['Image Alt Text']) || null,
        image_virin: clean(o['Image VIRIN']) || null,
        csv_url: csvUrl,
      }),
    });
  }
  return out;
}

/** Find the current cache-busted CSV URL on the collection page (highest ?release=). */
export function discoverCsvUrl(html: string): string | null {
  const re = /uap-data\.csv\?release=([0-9A-Za-z._-]+)/g;
  let best: { url: string; n: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = parseFloat(m[1]) || 0;
    if (!best || n > best.n) best = { url: `${PURSUE_CSV_BASE}?release=${m[1]}`, n };
  }
  return best?.url ?? null;
}

async function browserFetchText(url: string, tries = 3): Promise<string> {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(2000 * i);
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      });
      if (res.ok) return await res.text();
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`${url}: ${lastErr}`);
}

export async function crawlPursue(): Promise<CrawlSourceResult> {
  const errors: string[] = [];
  const { upsertRecords } = await import('../db');
  let csvUrl = PURSUE_CSV_BASE;
  try {
    const html = await browserFetchText(PURSUE_PAGE_URL);
    csvUrl = discoverCsvUrl(html) || PURSUE_CSV_BASE;
  } catch (e) {
    errors.push(`PURSUE page: ${(e as Error).message} (using bare CSV URL)`);
  }
  let text: string;
  try {
    text = await browserFetchText(csvUrl);
  } catch (e) {
    if (csvUrl === PURSUE_CSV_BASE) {
      errors.push(`PURSUE CSV: ${(e as Error).message}`);
      return { source: 'pursue', fetched: 0, upserted: 0, errors };
    }
    try {
      csvUrl = PURSUE_CSV_BASE;
      text = await browserFetchText(csvUrl);
    } catch (e2) {
      errors.push(`PURSUE CSV: ${(e2 as Error).message}`);
      return { source: 'pursue', fetched: 0, upserted: 0, errors };
    }
  }
  if (!/Release Date/.test(text.slice(0, 2000))) {
    errors.push('PURSUE CSV: unexpected header (format changed?)');
    return { source: 'pursue', fetched: 0, upserted: 0, errors };
  }
  const objs = csvToObjects(text);
  const rows = pursueRowsToRecords(objs, csvUrl);
  const upserted = rows.length ? upsertRecords(rows) : 0;
  return { source: 'pursue', fetched: objs.length, upserted, errors };
}
