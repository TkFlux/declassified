import robotsParser from 'robots-parser';

const DEFAULT_UA =
  'DeclassifiedBot/0.1 (+https://github.com/TkFlux/declassified; research; polite)';

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function canFetch(url: string, userAgent = DEFAULT_UA): Promise<boolean> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.origin}/robots.txt`;
    let robots = robotsCache.get(robotsUrl);
    if (!robots) {
      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(10000),
      });
      const text = res.ok ? await res.text() : '';
      robots = robotsParser(robotsUrl, text);
      robotsCache.set(robotsUrl, robots);
    }
    return robots.isAllowed(url, userAgent) !== false;
  } catch {
    return true;
  }
}

export async function politeFetch(
  url: string,
  opts: {
    delayMs?: number;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const delayMs = opts.delayMs ?? 800;
  await sleep(delayMs);

  const allowed = await canFetch(url);
  if (!allowed) {
    throw new Error(`robots.txt disallows: ${url}`);
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    redirect: 'follow',
  });

  return res;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugId(prefix: string, ...parts: string[]): string {
  const raw = parts.join('|').toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${prefix}-${hex}`;
}

export { DEFAULT_UA };
