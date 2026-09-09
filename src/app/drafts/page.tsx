'use client';

import { useCallback, useEffect, useState } from 'react';
import { AgencyBadge } from '@/components/AgencyBadge';

type Draft = {
  id: number;
  record_id: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  title: string;
  source_url: string;
  agency: string;
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/drafts?status=${status}`);
      const data = await res.json();
      if (data.readOnly) {
        setReadOnly(true);
        setBanner(
          data.banner || 'Drafts work locally — this deploy is read-only'
        );
        setDrafts([]);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed');
      setReadOnly(false);
      setBanner(null);
      setDrafts(data.drafts || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDraftStatus(id: number, next: 'approved' | 'rejected' | 'pending') {
    if (readOnly) return;
    const res = await fetch('/api/drafts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: next }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Update failed');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      {(readOnly || banner) && (
        <div className="rounded-md border border-stamp-amber/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          {banner || 'Drafts work locally — this deploy is read-only'}
        </div>
      )}

      <section className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
        <h1 className="font-display text-2xl font-bold text-ink-50">
          Draft for X — approval queue
        </h1>
        <p className="mt-1 text-sm text-ink-300">
          {readOnly
            ? 'Drafts are disabled on Vercel / read-only deploys. Clone the repo and run locally with SQLite to create and approve drafts.'
            : 'Drafts are stored locally for human review. This app never posts to X / Twitter. Copy approved text manually if you choose to publish.'}
        </p>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            {['pending', 'approved', 'rejected', 'all'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                  status === s
                    ? 'bg-ink-100 text-ink-950'
                    : 'border border-ink-700 text-ink-200 hover:border-ink-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-md border border-stamp-red/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="space-y-4">
          {drafts.map((d) => (
            <article
              key={d.id}
              className="rounded-xl border border-ink-800 bg-ink-950/80 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AgencyBadge agency={d.agency} />
                <span className="stamp rounded border border-ink-700 px-2 py-0.5 text-ink-300">
                  {d.status}
                </span>
                <span className="text-xs text-ink-500">#{d.id}</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-ink-50">
                {d.title}
              </h2>
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-ink-800 bg-ink-900/80 p-3 text-sm text-ink-100">
                {d.text}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(d.text)}
                  className="rounded-md border border-ink-600 px-3 py-1.5 text-xs font-semibold text-ink-100 hover:border-ink-400"
                >
                  Copy text
                </button>
                {d.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => void setDraftStatus(d.id, 'approved')}
                    className="rounded-md bg-stamp-green/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stamp-green"
                  >
                    Approve
                  </button>
                )}
                {d.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => void setDraftStatus(d.id, 'rejected')}
                    className="rounded-md bg-stamp-red/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stamp-red"
                  >
                    Reject
                  </button>
                )}
                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md px-3 py-1.5 text-xs text-ink-300 underline hover:text-white"
                >
                  Source
                </a>
              </div>
            </article>
          ))}
          {drafts.length === 0 && (
            <p className="text-center text-ink-400">
              No drafts in this filter. Use “Draft for X” on a feed card.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
