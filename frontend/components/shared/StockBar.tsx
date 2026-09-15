'use client';

/** Horizontal stock meter. The bar is capped at 100 units so stocks below 100
 *  render proportionally smaller (a bar of 50 reads "half"), and the tone shifts
 *  to warning/danger the closer to zero stock gets.
 *
 *  pct = min(stock, 100) / 100  → the percentage *changes* with the quantity,
 *  and the color follows: 0 = danger, ≤ threshold = warning, else brand.
 */
export default function StockBar({
  stock,
  threshold = 0,
  showValue = true,
  formatNumber,
}: {
  stock: number;
  threshold?: number;
  showValue?: boolean;
  formatNumber?: (n: number) => string;
}) {
  const qty = Math.max(0, Number(stock) || 0);
  const out = qty === 0;
  const low = qty > 0 && qty <= threshold;

  const pct = out ? 0 : Math.min((qty / 100) * 100, 100);

  const tone = out
    ? { bar: 'bg-danger-500', text: 'text-danger-600' }
    : low
      ? { bar: 'bg-warning-500', text: 'text-warning-700' }
      : { bar: 'bg-brand-600', text: 'text-[var(--foreground)]' };

  const label = formatNumber ? formatNumber(qty) : String(qty);

  return (
    <div
      className="group flex items-center gap-2.5"
      title={`${label} in stock${low || out ? ' — low' : ''}`}
    >
      <div className="h-1.5 min-w-[56px] flex-1 overflow-hidden rounded-full bg-black/5">
        <div className={`h-full rounded-full transition-[width] duration-300 ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${tone.text}`}>
          {label}
          {out && <span className="hidden text-[9px] uppercase tracking-wide text-[var(--muted)] group-hover:inline sm:inline">out</span>}
          {low && !out && <span className="hidden text-[9px] uppercase tracking-wide text-warning-600 group-hover:inline sm:inline">low</span>}
        </span>
      )}
    </div>
  );
}
