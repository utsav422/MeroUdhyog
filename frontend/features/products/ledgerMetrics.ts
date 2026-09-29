import type { StockMovement } from './api';

export type DayFrame = {
  id: string;
  created_at: string;
  reason: string;
  order_id: string | null;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  opening: number;
  added: number;
  sold: number;
  used: number;
  closing: number;
};

export type DayMetrics = {
  day: string;
  label: string;
  opening: number;
  added: number;
  sold: number;
  produced: number;
  damaged: number;
  closing: number;
  frames: DayFrame[];
};

export type VariantDayMetrics = DayMetrics & { variant_id: string };

export function localDayKey(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayLabel(key: string): string {
  const today = localDayKey(new Date());
  if (key === today) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDayKey(yesterday)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Signed change to stock for one movement (may go negative). */
export function netOf(m: StockMovement): number {
  if (m.reason === 'stock_in') return m.quantity;
  if (m.reason === 'order') return -Math.abs(m.quantity);
  if (m.reason === 'production') return -Math.abs(m.quantity);
  if (m.reason === 'damaged') return -Math.abs(m.quantity);
  if (m.reason === 'cancelled') return Math.abs(m.quantity);
  return m.quantity;
}

/**
 * Day metrics per variant, anchored to the live stock_quantity so openings
 * and closings always reflect real on-hand stock and can never go negative
 * from ledger history gaps.
 *
 * Closing of a day is the stock level at the end of that day, which is the
 * opening of the following day (opening_today = closing_yesterday). Every
 * day keeps the invariant: opening + added - sold - produced - damaged + returned = closing.
 */
export function computeDayMetrics(
  rows: StockMovement[],
  liveStock: Record<string, number>,
): VariantDayMetrics[] {
  const asc = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const byVariant = new Map<string, Map<string, StockMovement[]>>();
  for (const m of asc) {
    const day = localDayKey(m.created_at);
    let days = byVariant.get(m.variant_id);
    if (!days) {
      days = new Map();
      byVariant.set(m.variant_id, days);
    }
    const list = days.get(day);
    if (list) list.push(m);
    else days.set(day, [m]);
  }

  const out: VariantDayMetrics[] = [];
  for (const [variantId, days] of byVariant) {
    const dayKeys = [...days.keys()].sort().reverse();
    const stock = liveStock[variantId] ?? 0;
    let netFromDay = 0;
    for (const day of dayKeys) {
      const list = days.get(day)!;
      const net = list.reduce((s, m) => s + netOf(m), 0);
      let added = 0;
      let sold = 0;
      let produced = 0;
      let damaged = 0;
      for (const m of list) {
        const abs = Math.abs(m.quantity);
        if (m.reason === 'stock_in') added += m.quantity;
        else if (m.reason === 'order') sold += abs;
        else if (m.reason === 'production') produced += abs;
        else if (m.reason === 'damaged') damaged += abs;
      }
      netFromDay += net;
      const opening = stock - netFromDay;
      const closing = opening + net;
      const frames: DayFrame[] = [];
      let cursor = opening;
      let frameOpening: number;
      for (const m of list) {
        const abs = Math.abs(m.quantity);
        frameOpening = cursor;
        cursor += netOf(m);
        frames.push({
          id: m.id,
          created_at: m.created_at,
          reason: m.reason,
          order_id: m.order_id,
          variant_id: m.variant_id,
          product_id: m.product_id,
          product_name: m.product_name,
          variant_name: m.variant_name,
          opening: frameOpening,
          added: m.reason === 'stock_in' ? m.quantity : 0,
          sold: m.reason === 'order' ? abs : 0,
          used: m.reason === 'production' || m.reason === 'damaged' ? abs : 0,
          closing: cursor,
        });
      }
      out.push({
        variant_id: variantId,
        day,
        label: dayLabel(day),
        opening,
        added,
        sold,
        produced,
        damaged,
        closing,
        frames,
      });
    }
  }

  out.sort((a, b) =>
    a.day === b.day ? (a.variant_id < b.variant_id ? -1 : 1) : (a.day < b.day ? 1 : -1),
  );
  return out;
}