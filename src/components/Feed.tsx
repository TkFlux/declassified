'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecordCard, type RecordCardData } from './RecordCard';

type ApiResponse = {
  rows: RecordCardData[];
  total: number;
  limit: number;
  offset: number;
  readOnly?: boolean;
};

const AGENCIES = ['all', 'NARA', 'NDC', 'FBI', 'CIA'] as const;

export function Feed() {
  const [q, setQ] = useState('');
  const [agency, setAgency] = useState('all');
  const [download, setDownload] = useState<'all' | 'available' | 'page-only'>(
    'all'
  );
  const [rows, setRows] = useState<RecordCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const limit = 12;

  const load = useCallback(
    async (nextOffset: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(nextOffset),
          agency,
          download,
        });
        if (q.trim()) params.set('q', q.trim());
        const res = await fetch(`/api/records?${params}`);
        const data = (await res.json()) as ApiResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setTotal(data.total);
        setOffset(nextOffset);
        setReadOnly(Boolean(data.readOnly));
        setRows((prev) => (replace ? data.rows : [...prev, ...data.rows]));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [q, agency, download]
  );

  useEffect(() => {
    void load(0, true);
  }, [load]);

  const hasMore = rows.length < total;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
        <h1 className="font-display text-2xl font-bold text-ink-50">
          Continuous release feed
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Newest public / declassified records first. Search and filter by
          agency or digitization status.
          {readOnly
            ? ' This deploy serves bundled JSON (no SQLite).'
            : ' Draft for X creates an approval-only queue entry — nothing is posted automatically.'}
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void load(0, true);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles & summaries…"
            className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 md:col-span-2"
          />
          <select
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50"
          >
            {AGENCIES.map((a) => (
              <option key={a} value={a}>
                {a === 'all' ? 'All agencies' : a}
              </option>
            ))}
          </select>
          <select
            value={download}
            onChange={(e) =>
              setDownload(e.target.value as 'all' | 'available' | 'page-only')
            }
            className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50"
          >
            <option value="all">All digitization</option>
            <option value="available">Download available</option>
            <option value="page-only">Page-only / not digitized</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-ink-100 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-white md:col-span-4 md:w-fit"
          >
            Apply filters
          </button>
        </form>
        <p className="mt-3 text-xs text-ink-400">
          Showing {rows.length} of {total}
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-stamp-red/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <RecordCard key={r.id} record={r} draftsEnabled={!readOnly} />
        ))}
      </section>

      {!loading && rows.length === 0 && (
        <p className="text-center text-ink-400">
          No records yet. Run <code className="text-ink-200">npm run seed</code>{' '}
          then refresh
          {readOnly ? (
            <>
              , or commit <code className="text-ink-200">data/records.json</code>
            </>
          ) : null}
          .
        </p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(offset + limit, false)}
            className="rounded-md border border-ink-600 px-4 py-2 text-sm font-medium text-ink-100 hover:border-ink-400 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
