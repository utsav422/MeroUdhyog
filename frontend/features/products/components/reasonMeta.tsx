'use client';

export const REASON_META: Record<string, { label: string; classes: string }> = {
  stock_in: { label: 'Stock added', classes: 'bg-success-50 text-success-700' },
  production: { label: 'Production used', classes: 'bg-brand-50 text-brand-700' },
  order: { label: 'Sold', classes: 'bg-warning-50 text-warning-700' },
  cancelled: { label: 'Cancelled / returned', classes: 'bg-black/5 text-[var(--muted)]' },
};

export const REASON_OPTIONS = [
  { value: 'stock_in', label: 'Stock added' },
  { value: 'production', label: 'Production used' },
  { value: 'order', label: 'Sold' },
  { value: 'cancelled', label: 'Cancelled / returned' },
];

export function ReasonBadge({ reason }: { reason: string }) {
  const meta = REASON_META[reason] ?? { label: reason, classes: 'bg-black/5 text-[var(--muted)]' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}