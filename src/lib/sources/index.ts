import type { CrawlSourceResult } from '../types';
import { crawlNara } from './nara';
import { crawlFbi } from './fbi';
import { crawlCia } from './cia';

export type SourceId = 'nara' | 'fbi' | 'cia' | 'all';

/** State / NSA intentionally disabled for MVP — often auth-walled or sparse public HTML. */
export const DISABLED_SOURCES = ['state', 'nsa'] as const;

export async function runCrawl(
  source: SourceId = 'all'
): Promise<CrawlSourceResult[]> {
  const results: CrawlSourceResult[] = [];

  if (source === 'all' || source === 'nara') {
    results.push(await crawlNara());
  }
  if (source === 'all' || source === 'fbi') {
    results.push(await crawlFbi({ enrichLimit: 3 }));
  }
  if (source === 'all' || source === 'cia') {
    results.push(await crawlCia());
  }

  return results;
}

export { crawlNara, crawlFbi, crawlCia };
