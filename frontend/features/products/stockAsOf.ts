import type { Product, StockMovement } from './api';
import { localDayKey, netOf } from './ledgerMetrics';

/**
 * "Stock as of <day>" sheet: exactly one row per variant, whether or not it
 * saw any movement. A variant with no movement simply has opening === closing
 * and zeroes in every flow column, which is what an as-of sheet needs in
 * order to be a complete picture of the warehouse.
 */
export type StockAsOfRow = {
  key: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string | null;
  sku: string | null;
  unit: string | null;
  isActive: boolean;
  opening: number;
  added: number;
  sold: number;
  /** Consumed as raw material, or written off. Both leave the warehouse. */
  used: number;
  returned: number;
  closing: number;
  movementCount: number;
};

export type StockAsOfTotals = {
  opening: number;
  added: number;
  sold: number;
  used: number;
  returned: number;
  net: number;
  closing: number;
  variants: number;
  moved: number;
  unchanged: number;
};

export type MovementFilter = 'all' | 'moved' | 'unchanged';

export const MOVEMENT_FILTER_OPTIONS: { value: MovementFilter; label: string }[] = [
  { value: 'all', label: 'All variants' },
  { value: 'moved', label: 'With movement today' },
  { value: 'unchanged', label: 'No movement today' },
];

const NUMERIC_FIELDS = new Set(['opening', 'added', 'sold', 'used', 'returned', 'closing']);

/**
 * Build one row per variant for the given local day key.
 *
 * `closing` is the live on-hand quantity and `opening` is derived by walking
 * today's net movement back, so the sheet always satisfies
 * `opening + added - sold - used + returned === closing` even when the
 * movement history has gaps.
 */
export function buildStockAsOfRows(
  products: Product[],
  movements: StockMovement[],
  day: string,
): StockAsOfRow[] {
  const byVariant = new Map<string, StockMovement[]>();
  for (const m of movements) {
    if (localDayKey(m.created_at) !== day) continue;
    const list = byVariant.get(m.variant_id);
    if (list) list.push(m);
    else byVariant.set(m.variant_id, [m]);
  }

  const rows: StockAsOfRow[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      const list = byVariant.get(variant.id) ?? [];
      let added = 0;
      let sold = 0;
      let used = 0;
      let returned = 0;
      let net = 0;
      for (const m of list) {
        const abs = Math.abs(m.quantity);
        net += netOf(m);
        if (m.reason === 'stock_in') added += m.quantity;
        else if (m.reason === 'order') sold += abs;
        else if (m.reason === 'production' || m.reason === 'damaged') used += abs;
        else if (m.reason === 'cancelled') returned += abs;
      }
      const closing = variant.stock_quantity ?? 0;
      rows.push({
        key: variant.id,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantName: variant.name,
        sku: variant.sku,
        unit: variant.unit,
        isActive: product.is_active && variant.is_active,
        opening: closing - net,
        added,
        sold,
        used,
        returned,
        closing,
        movementCount: list.length,
      });
    }
  }
  return rows;
}

export function sumStockAsOf(rows: StockAsOfRow[]): StockAsOfTotals {
  const totals: StockAsOfTotals = {
    opening: 0,
    added: 0,
    sold: 0,
    used: 0,
    returned: 0,
    net: 0,
    closing: 0,
    variants: rows.length,
    moved: 0,
    unchanged: 0,
  };
  for (const r of rows) {
    totals.opening += r.opening;
    totals.added += r.added;
    totals.sold += r.sold;
    totals.used += r.used;
    totals.returned += r.returned;
    totals.closing += r.closing;
    if (r.movementCount > 0) totals.moved += 1;
    else totals.unchanged += 1;
  }
  totals.net = totals.added - totals.sold - totals.used + totals.returned;
  return totals;
}

export function sortStockAsOfRows(
  rows: StockAsOfRow[],
  sort: { field: string; direction: 'asc' | 'desc' },
): StockAsOfRow[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const byName = (v: string | null) => (v ?? '').toLowerCase();
  return [...rows].sort((a, b) => {
    if (sort.field === 'product') {
      const p = byName(a.productName).localeCompare(byName(b.productName));
      if (p) return p * dir;
      const v = byName(a.variantName).localeCompare(byName(b.variantName));
      if (v) return v * dir;
      return a.key.localeCompare(b.key);
    }
    if (sort.field === 'variant') {
      const v = byName(a.variantName).localeCompare(byName(b.variantName));
      return v ? v * dir : a.key.localeCompare(b.key);
    }
    if (NUMERIC_FIELDS.has(sort.field)) {
      const av = a[sort.field as keyof StockAsOfRow] as number;
      const bv = b[sort.field as keyof StockAsOfRow] as number;
      if (av !== bv) return (av - bv) * dir;
      return byName(a.productName).localeCompare(byName(b.productName));
    }
    return 0;
  });
}
