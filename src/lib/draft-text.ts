import type { RecordRow } from './types';

const MAX = 260;

export function buildTweetDraft(record: RecordRow): string {
  const link = record.download_url || record.source_url;
  const agency = record.agency ? `[${record.agency}] ` : '';
  const base = `${agency}${record.title}`.trim();
  const summary = (record.summary || '').replace(/\s+/g, ' ').trim();

  let body = summary
    ? `${base} — ${summary}`
    : base;

  const suffix = `\n\n${link}`;
  const budget = MAX - suffix.length;

  if (body.length > budget) {
    body = body.slice(0, Math.max(0, budget - 1)).trimEnd() + '…';
  }

  return `${body}${suffix}`;
}
