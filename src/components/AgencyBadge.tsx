const COLORS: Record<string, string> = {
  NARA: 'bg-sky-900/60 text-sky-200 border-sky-700',
  NDC: 'bg-indigo-900/60 text-indigo-200 border-indigo-700',
  FBI: 'bg-amber-900/50 text-amber-100 border-amber-700',
  CIA: 'bg-emerald-900/50 text-emerald-100 border-emerald-700',
  STATE: 'bg-rose-900/50 text-rose-100 border-rose-700',
  NSA: 'bg-violet-900/50 text-violet-100 border-violet-700',
  OTHER: 'bg-ink-800 text-ink-200 border-ink-600',
};

export function AgencyBadge({ agency }: { agency: string }) {
  const cls = COLORS[agency] || COLORS.OTHER;
  return (
    <span
      className={`stamp inline-flex items-center rounded border px-2 py-0.5 ${cls}`}
    >
      {agency}
    </span>
  );
}
