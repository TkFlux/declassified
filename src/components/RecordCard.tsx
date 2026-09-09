'use client';

import { useState } from 'react';
import { AgencyBadge } from './AgencyBadge';

export type RecordCardData = {
  id: string;
  title: string;
  summary: string;
  agency: string;
  source: string;
  source_url: string;
  download_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Date unknown';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Chicago',
    });
  } catch {
    return iso;
  }
}

export function RecordCard({
  record,
  onDrafted,
  draftsEnabled = true,
}: {
  record: RecordCardData;
  onDrafted?: () => void;
  draftsEnabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hasFile = Boolean(record.download_url);
  const official = record.download_url || record.source_url;

  async function draftForX() {
    if (!draftsEnabled) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: record.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMsg('Draft queued for approval');
      onDrafted?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-950/80 shadow-lg shadow-black/20 transition hover:border-ink-600">
      {record.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={record.thumbnail_url}
          alt=""
          className="h-36 w-full object-cover opacity-90"
        />
      ) : (
        <div className="flex h-28 items-end bg-gradient-to-br from-ink-800 to-ink-950 px-4 pb-3">
          <span className="stamp text-ink-400">Public record</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <AgencyBadge agency={record.agency} />
          <span className="text-xs text-ink-400">
            {formatDate(record.published_at || record.collected_at)}
          </span>
        </div>
        <h2 className="font-display text-lg font-semibold leading-snug text-ink-50">
          {record.title}
        </h2>
        <p className="line-clamp-2 text-sm text-ink-300">{record.summary}</p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <a
            href={official}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-white"
          >
            {hasFile ? 'Official download' : 'Official source'}
          </a>
          {draftsEnabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={draftForX}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-xs font-semibold text-ink-100 hover:border-ink-400 disabled:opacity-50"
            >
              {busy ? 'Drafting…' : 'Draft for X'}
            </button>
          ) : (
            <span
              title="Drafts are disabled on this deploy"
              className="rounded-md border border-ink-800 px-3 py-1.5 text-xs text-ink-500"
            >
              Drafts disabled
            </span>
          )}
        </div>
        {msg && <p className="text-xs text-ink-400">{msg}</p>}
      </div>
    </article>
  );
}
