'use client';

/** Credit-limit meter. A customer with no limit renders a muted "No limit"
 *  pill instead of a bar, so an unset limit is never mistaken for "fully used".
 *
 *  The fill is the percentage of the limit already committed, and the tone
 *  follows that percentage:
 *    < 70%        healthy  (green)
 *    70% – 99%    warning  (amber)
 *    >= 100%      exceeded (red)
 *
 *  Over 100% the bar caps at full width and the label carries the real figure
 *  ("₹12.5k / ₹10k"), so an overrun is visible rather than clipped.
 */
export type CreditLimitFigures = {
  /** Null when the customer has no limit set. A limit of 0 is a real limit
   *  meaning "no credit", and renders differently from an absent limit. */
  credit_limit: string | null;
  credit_used: string | null | undefined;
  credit_available?: string | null;
  credit_utilization?: string | null;
};

export function creditLimitTone(percent: number) {
  if (percent >= 100) return 'danger' as const;
  if (percent >= 70) return 'warning' as const;
  return 'healthy' as const;
}

/** Percentage of the limit used, or null when the customer is unlimited.
 *  Falls back to deriving it from used/limit when the server did not send it.
 */
export function creditUsedPercent(figures: CreditLimitFigures): number | null {
  if (figures.credit_limit == null) return null;
  const limit = Number(figures.credit_limit);
  // A zero limit is "no credit", not "unlimited": any order breaches it.
  if (!Number.isFinite(limit) || limit === 0) return 100;
  if (figures.credit_utilization != null && figures.credit_utilization !== '') {
    const pct = Number(figures.credit_utilization);
    if (Number.isFinite(pct)) return Math.max(pct, 0);
  }
  const used = Number(figures.credit_used ?? 0);
  if (!Number.isFinite(used)) return 0;
  return Math.max((used / limit) * 100, 0);
}

export default function CreditLimitBar({
  figures,
  compact = false,
  className = '',
}: {
  figures: CreditLimitFigures;
  /** Table mode: shorter bar, label stacked under it. */
  compact?: boolean;
  className?: string;
}) {
  const pct = creditUsedPercent(figures);

  // A zero limit has no meaningful ratio to draw, so label it outright
  // instead of showing an empty bar reading "0 / 0".
  if (pct !== null && Number(figures.credit_limit) === 0) {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700 ${className}`}
        title="Credit limit is ₹0 — orders require confirmation"
      >
        No credit
      </span>
    );
  }

  if (pct === null) {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ${className}`}
        title="No credit limit set — orders are never blocked"
      >
        No limit
      </span>
    );
  }

  const used = Number(figures.credit_used ?? 0);
  const limit = Number(figures.credit_limit);
  const tone = creditLimitTone(pct);
  const width = Math.min(pct, 100);
  const over = pct >= 100;

  const bar =
    tone === 'danger'
      ? 'bg-danger-500'
      : tone === 'warning'
        ? 'bg-warning-500'
        : 'bg-success-500';
  const text =
    tone === 'danger'
      ? 'text-danger-600'
      : tone === 'warning'
        ? 'text-warning-700'
        : 'text-success-700';

  const title = over
    ? `Credit limit exceeded — ${pct.toFixed(0)}% of the limit used`
    : `${pct.toFixed(0)}% of the credit limit used`;

  const barClass = compact ? 'h-1.5 min-w-[52px]' : 'h-2 min-w-[96px]';

  return (
    <div className={`flex flex-col gap-1 ${className}`} title={title}>
      <div className="flex items-center gap-2">
        <div className={`flex-1 overflow-hidden rounded-full bg-black/5 ${barClass}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${bar}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${text}`}>
          {pct.toFixed(0)}%
          {over && <span className="ml-1 text-[9px] uppercase tracking-wide">over</span>}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
        <span className={text}>{compact ? 'Used' : 'Credit used'}</span>
        <span className="text-[var(--muted)]">
          {used.toLocaleString('en-IN', { maximumFractionDigits: 0 })} /{' '}
          {limit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}