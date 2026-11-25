'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Group, Select, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Receipt,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  UserPlus,
  TrendDown,
  CaretLeft,
  CaretRight,
  Download,
  Warning,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { useSession } from '@/lib/providers';
import { useDateMode, type DateMode } from '@/lib/date-mode';
import { BS_MONTHS, bsMonthLength, bsMonthStartAd, bsPartsFromAd } from '@/lib/nepali-date';
import { useOrders } from '@/features/orders/api';
import { useReorder, ReorderBadge, canReorder } from '@/features/orders/components/Reorder';
import {
  useProducts,
  useCategories,
  defaultVariantPrice,
  useLowStock,
  useStockMovements,
  MAX_FETCH,
} from '@/features/products/api';
import { useCustomers } from '@/features/customers/api';
import { useDeliveries } from '@/features/deliveries/api';
import {
  formatMoney,
  formatCompact,
  timeAgo,
  formatNumber,
  formatDate,
  formatDateTime,
  formatMonthYear,
} from '@/lib/format';
import { downloadCsv } from '@/lib/exportCsv';

const PIE_COLORS = ['#1b4332', '#f59e0b', '#a8c5b8', '#528a72', '#7ba695'];
const PERIOD_OPTIONS = [
  { value: '2d', label: '2 days', days: 2, months: 0 },
  { value: '7d', label: '7 days', days: 7, months: 0 },
  { value: '15d', label: '15 days', days: 15, months: 0 },
  { value: '1m', label: '1 month', days: 0, months: 1 },
  { value: '2m', label: '2 months', days: 0, months: 2 },
  { value: '3m', label: '3 months', days: 0, months: 3 },
  { value: 'custom', label: 'Custom range', days: 0, months: 0 },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value'];
type DashboardDateRange = [Date | null, Date | null];

function money(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>}
            {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const AD_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parseKey(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function presetDateRange(period: PeriodValue): DashboardDateRange {
  if (period === 'custom') return [null, null];
  const option = PERIOD_OPTIONS.find((p) => p.value === period) ?? PERIOD_OPTIONS[3];
  const end = startOfDay(new Date());
  const start = startOfDay(end);
  if (option.months > 0) {
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - option.months);
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
  } else {
    start.setDate(start.getDate() - (option.days - 1));
  }
  return [start, end];
}

function adMonthRangeLabel(startKey: string, endKey: string): string {
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey.split('-').map(Number);
  const start = AD_MONTHS[startMonth - 1]?.slice(0, 3) ?? '';
  const end = AD_MONTHS[endMonth - 1]?.slice(0, 3) ?? '';
  if (startYear === endYear) {
    return startMonth === endMonth ? `${start} ${startYear}` : `${start} – ${end} ${startYear}`;
  }
  return `${start} ${startYear} – ${end} ${endYear}`;
}

function bsMonthRangeLabel(startKey: string, endKey: string): string {
  const start = bsPartsFromAd(startKey);
  const end = bsPartsFromAd(endKey);
  if (!start || !end) return '';
  const startMonth = BS_MONTHS[start.month - 1] ?? `Month ${start.month}`;
  const endMonth = BS_MONTHS[end.month - 1] ?? `Month ${end.month}`;
  if (start.year === end.year) {
    return start.month === end.month
      ? `${startMonth} ${start.year}`
      : `${startMonth} – ${endMonth} ${start.year}`;
  }
  return `${startMonth} ${start.year} – ${endMonth} ${end.year}`;
}

function secondaryDayLabel(date: Date, mode: DateMode): string {
  if (mode === 'BS') {
    const monthName = AD_MONTHS[date.getMonth()]?.slice(0, 3) ?? '';
    return date.getDate() === 1 ? `${monthName} ${date.getDate()}` : String(date.getDate());
  }
  const bs = bsPartsFromAd(toKey(date));
  if (!bs) return '—';
  const monthName = BS_MONTHS[bs.month - 1] ?? `Month ${bs.month}`;
  return bs.day === 1 ? `${monthName} ${bs.day}` : String(bs.day);
}

function DispatchCalendar({ eventDates }: { eventDates: Set<string> }) {
  const mode = useDateMode();
  const today = new Date();
  const todayKey = toKey(today);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayKey);

  const viewBs = useMemo(() => bsPartsFromAd(toKey(viewDate)), [viewDate]);
  const bsYear = viewBs?.year ?? 0;
  const bsMonth = viewBs?.month ?? 0;
  const bsStartKey = mode === 'BS' && viewBs ? bsMonthStartAd(bsYear, bsMonth) : '';
  const startOfMonth = bsStartKey
    ? parseKey(bsStartKey)
    : new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth =
    mode === 'BS' && viewBs
      ? bsMonthLength(bsYear, bsMonth)
      : new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0).getDate();
  const leading = (startOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const monthEnd = new Date(
    startOfMonth.getFullYear(),
    startOfMonth.getMonth(),
    startOfMonth.getDate() + daysInMonth - 1,
  );
  const monthStartKey = toKey(startOfMonth);
  const monthEndKey = toKey(monthEnd);
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const day = i - leading + 1;
    return day >= 1 && day <= daysInMonth
      ? new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), startOfMonth.getDate() + day - 1)
      : null;
  });

  const monthLabel = formatMonthYear(startOfMonth, mode);
  const secondaryLabel =
    mode === 'BS'
      ? adMonthRangeLabel(monthStartKey, monthEndKey)
      : bsMonthRangeLabel(monthStartKey, monthEndKey);
  const eventCount = [...eventDates].filter((d) => d >= monthStartKey && d <= monthEndKey).length;

  const navigate = (dir: -1 | 1) => {
    if (mode === 'BS' && viewBs) {
      let nextMonth = bsMonth + dir;
      let nextYear = bsYear;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const nextStart = bsMonthStartAd(nextYear, nextMonth);
      if (nextStart) setViewDate(parseKey(nextStart));
      return;
    }
    setViewDate(new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + dir, 1));
  };

  const dayLabel = (date: Date) =>
    mode === 'BS' ? String(bsPartsFromAd(toKey(date))?.day ?? '—') : String(date.getDate());

  return (
    <Panel
      title="Calendar"
      subtitle="Scheduled dispatches & deliveries"
      action={
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)]">
            {monthLabel}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5"
                aria-label="Previous month"
              >
                <CaretLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5"
                aria-label="Next month"
              >
                <CaretRight size={13} />
              </button>
            </div>
          </div>
          {secondaryLabel && (
            <span className="text-[10px] leading-none text-[var(--muted)]">{secondaryLabel}</span>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-[11px] font-medium text-[var(--muted)]">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (date === null) return <div key={`empty-${i}`} />;
          const key = toKey(date);
          const hasEvent = eventDates.has(key);
          const isSelected = selected === key;
          const isToday = todayKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-xs transition-colors ${
                isSelected
                  ? 'bg-brand-600 font-semibold text-white'
                  : isToday
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-[var(--foreground)] hover:bg-black/5'
              }`}
            >
              <span>{dayLabel(date)}</span>
              <span className={`text-[9px] leading-none ${isSelected ? 'text-white/70' : 'text-[var(--muted)]/50'}`}>
                {secondaryDayLabel(date, mode)}
              </span>
              {hasEvent && !isSelected && <span className="-mt-0.5 h-1 w-1 rounded-full bg-accent-500" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
          {eventCount} dispatch{eventCount === 1 ? '' : 'es'} queued
        </span>
        <Link
          href="/orders/calendar"
          className="inline-flex items-center gap-1 font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Activity calendar
          <ArrowUpRight size={12} weight="bold" />
        </Link>
      </div>
    </Panel>
  );
}

export default function DashboardPage() {
  const session = useSession();
  const ordersQuery = useOrders();
  const productsQuery = useProducts();
  const categoriesQuery = useCategories();
  const customersQuery = useCustomers();
  const deliveriesQuery = useDeliveries();
  const lowStockQuery = useLowStock(MAX_FETCH);
  const stockMovementsQuery = useStockMovements(MAX_FETCH);
  const reorder = useReorder();
  const [period, setPeriod] = useState<PeriodValue>('1m');
  const [customRange, setCustomRange] = useState<DashboardDateRange>(() => presetDateRange('1m'));
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);

  const presetRange = useMemo(() => presetDateRange(period), [period]);
  const activeRange = period === 'custom' ? customRange : presetRange;
  const [startKey, endKey] = useMemo(
    () => [
      activeRange[0] ? toKey(activeRange[0]) : '',
      activeRange[1] ? toKey(activeRange[1]) : '',
    ],
    [activeRange],
  );
  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? 'Custom range';
  const rangeLabel = useMemo(() => {
    if (!startKey && !endKey) return 'All time';
    if (startKey && endKey) return `${formatDate(startKey)} – ${formatDate(endKey)}`;
    return startKey ? `From ${formatDate(startKey)}` : `Up to ${formatDate(endKey)}`;
  }, [startKey, endKey]);

  const inPeriod = useCallback(
    (timestamp?: string | null) => {
      if (!timestamp) return false;
      const key = timestamp.slice(0, 10);
      if (startKey && key < startKey) return false;
      if (endKey && key > endKey) return false;
      return true;
    },
    [startKey, endKey],
  );

  const allProducts = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const productOptions = useMemo(
    () =>
      allProducts
        .map((p) => ({ value: p.id, label: p.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allProducts],
  );

  const variantOptions = useMemo(() => {
    const selectedProduct = productId ? allProducts.filter((p) => p.id === productId) : allProducts;
    return selectedProduct
      .flatMap((p) =>
        p.variants.map((v) => ({ value: v.id, label: `${p.name} · ${v.name}` })),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allProducts, productId]);

  const products = useMemo(
    () => allProducts.filter((p) => !productId || p.id === productId),
    [allProducts, productId],
  );

  const orders = useMemo(
    () =>
      (ordersQuery.data ?? [])
        .filter((o) => inPeriod(o.created_at))
        .map((o) => ({
          ...o,
          items: o.items.filter(
            (i) =>
              (!productId || i.product_id === productId) &&
              (!variantId || i.variant_id === variantId),
          ),
        }))
        .filter((o) => !productId && !variantId || o.items.length > 0),
    [ordersQuery.data, inPeriod, productId, variantId],
  );

  const customers = useMemo(
    () => (customersQuery.data ?? []).filter((c) => inPeriod(c.created_at)),
    [customersQuery.data, inPeriod],
  );

  const deliveries = useMemo(
    () =>
      (deliveriesQuery.data ?? []).filter((d) =>
        inPeriod(d.created_at ?? d.assigned_at ?? null),
      ),
    [deliveriesQuery.data, inPeriod],
  );

  const lowStock = useMemo(
    () =>
      (lowStockQuery.data ?? [])
        .filter(
          (v) =>
            (!productId || v.product_id === productId) &&
            (!variantId || v.variant_id === variantId),
        )
        .slice(0, 5),
    [lowStockQuery.data, productId, variantId],
  );

  const stockMovements = useMemo(
    () =>
      (stockMovementsQuery.data ?? [])
        .filter(
          (m) =>
            inPeriod(m.created_at) &&
            (!productId || m.product_id === productId) &&
            (!variantId || m.variant_id === variantId),
        )
        .slice(0, 10),
    [stockMovementsQuery.data, inPeriod, productId, variantId],
  );

  // Failed/cancelled orders are locked out of every revenue calculation —
  // they only ever appear as counts, never as money.
  const moneyOrders = useMemo(
    () => orders.filter((o) => !['failed', 'cancelled'].includes(o.status)),
    [orders],
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const kpis = useMemo(() => {
    const revenuePaid = moneyOrders
      .filter((o) => o.payment_status === 'paid')
      .reduce(
        (s, o) =>
          s +
          (productId || variantId
            ? o.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
            : Number(o.total_amount || 0)),
        0,
      );
    const revenuePending = moneyOrders
      .filter((o) => o.payment_status !== 'paid')
      .reduce(
        (s, o) =>
          s +
          (productId || variantId
            ? o.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
            : Number(o.total_amount || 0)),
        0,
      );
    const activeDeliveries = deliveries.filter(
      (d) => !['delivered', 'failed', 'pending_assignment'].includes(d.status),
    ).length;
    const pendingOrders = orders.filter((o) => ['draft', 'confirmed'].includes(o.status)).length;
    const completedOrders = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status)).length;
    const conversionRate =
      orders.length > 0
        ? Math.round((orders.filter((o) => o.payment_status === 'paid').length / orders.length) * 100)
        : 0;
    return {
      revenue: revenuePaid,
      revenuePending,
      orders: orders.length,
      pendingOrders,
      completedOrders,
      activeDeliveries,
      customers: customers.length,
      products: products.length,
      conversionRate,
    };
  }, [orders, deliveries, customers, products, moneyOrders, productId, variantId]);

  const revenueByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of moneyOrders) {
      if (o.payment_status !== 'paid') continue;
      const day = (o.created_at ?? '').slice(0, 10);
      if (!day) continue;
      const revenue =
        productId || variantId
          ? o.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          : Number(o.total_amount || 0);
      map.set(day, money(map.get(day) ?? 0) + revenue);
    }
    return [...map.entries()]
      .map(([date, total]) => ({ date, name: date.slice(5).replace('-', '/'), total: Math.round(total) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [moneyOrders, productId, variantId]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      const cat = categoryMap.get(product.category_id ?? '') ?? 'Uncategorized';
      const total = product.variants.reduce((s, v) => s + Number(defaultVariantPrice(v) || 0), 0);
      map.set(cat, money(map.get(cat) ?? 0) + total);
    }
    const arr = [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 5);
  }, [products, categoryMap]);

  const totalCategoryValue = topCategories.reduce((s, c) => s + c.value, 0);

  const orderStatusBreakdown = useMemo(() => {
    const total = orders.length || 1;
    const of = (status: string) => orders.filter((o) => o.status === status).length;
    return [
      { key: 'delivered', label: 'Delivered', count: of('delivered'), color: 'bg-brand-600' },
      { key: 'in_delivery', label: 'In delivery', count: of('in_delivery'), color: 'bg-brand-500' },
      { key: 'confirmed', label: 'Confirmed', count: of('confirmed'), color: 'bg-brand-400' },
      { key: 'ready', label: 'Ready', count: of('ready'), color: 'bg-brand-300' },
      { key: 'draft', label: 'Draft', count: of('draft'), color: 'bg-brand-200' },
    ].map((s) => ({ ...s, pct: Math.round((s.count / total) * 100) }));
  }, [orders]);

  const activeDeliveryDates = useMemo(() => {
    const set = new Set<string>();
    for (const d of deliveries) {
      if (['delivered', 'failed'].includes(d.status)) continue;
      const ref = d.assigned_at ?? d.created_at;
      if (ref) set.add(toKey(new Date(ref)));
    }
    return set;
  }, [deliveries]);

  const deliveryStats = useMemo(() => {
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === 'delivered').length;
    const inTransit = deliveries.filter((d) => d.status === 'in_transit').length;
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, inTransit, rate };
  }, [deliveries]);

  const topProducts = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; revenue: number; id: string }>();
    for (const order of moneyOrders) {
      for (const item of order.items) {
        const key = item.product_id ?? item.product_name;
        const cur = counts.get(key) ?? {
          name: item.product_name,
          qty: 0,
          revenue: 0,
          id: item.product_id ?? '',
        };
        cur.qty += Number(item.quantity || 0);
        cur.revenue += Number(item.amount || 0);
        counts.set(key, cur);
      }
    }
    return [...counts.values()].sort((a, b) => b.qty - a.qty);
  }, [moneyOrders]);

  const maxProductQty = Math.max(...topProducts.map((p) => p.qty), 1);
  const maxProductRevenue = Math.max(...topProducts.map((p) => money(p.revenue)), 1);
  const totalUnitsSold = topProducts.reduce((s, p) => s + p.qty, 0);
  const totalSalesRevenue = topProducts.reduce((s, p) => s + money(p.revenue), 0);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [orders],
  );

  const activity = useMemo(() => {
    const events: {
      id: string;
      ts: string;
      icon: React.ReactNode;
      title: string;
      desc: string;
      color: string;
    }[] = [];
    for (const d of deliveries) {
      if (d.delivered_at) {
        events.push({
          id: `del-${d.id}`,
          ts: d.delivered_at,
          icon: <MapPin size={14} />,
          title: 'Delivery completed',
          desc: `${d.order_ref ?? 'Order'} delivered to ${d.customer_name ?? 'customer'}`,
          color: 'text-success-600',
        });
      }
    }
    for (const o of orders.slice(0, 5)) {
      events.push({
        id: `ord-${o.id}`,
        ts: o.created_at,
        icon: <Receipt size={14} />,
        title: 'New order',
        desc: ['failed', 'cancelled'].includes(o.status)
          ? o.order_ref
          : `${o.order_ref} · ${formatMoney(o.total_amount)}`,
        color: 'text-brand-600',
      });
    }
    for (const c of customers.slice(0, 3)) {
      events.push({
        id: `cus-${c.id}`,
        ts: c.created_at,
        icon: <UserPlus size={14} />,
        title: 'New customer',
        desc: c.name,
        color: 'text-accent-600',
      });
    }
    for (const m of stockMovements) {
      if (m.quantity < 0) {
        const units = Math.abs(m.quantity);
        events.push({
          id: `mov-${m.id}`,
          ts: m.created_at,
          icon: <TrendDown size={14} />,
          title: 'Stock decreased',
          desc: `${m.product_name}${m.variant_name ? ` · ${m.variant_name}` : ''} · ${units} unit${units === 1 ? '' : 's'}`,
          color: 'text-warning-600',
        });
      }
    }
    return events.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 50);
  }, [orders, deliveries, customers, stockMovements]);

  const firstName = session?.full_name?.split(' ')[0] ?? 'there';

  const handleExport = () => {
    const rows: Array<Array<string | number | null | undefined>> = [];
    const push = (cells: Array<string | number | null | undefined>) => rows.push(cells);

    push(['DASHBOARD REPORT']);
    push(['Generated', formatDateTime(new Date())]);
    push(['Period', periodLabel]);
    push(['Date range', rangeLabel]);
    push([]);
    push(['KPI', 'Value']);
    push(['Revenue (paid)', formatMoney(kpis.revenue)]);
    push(['Revenue pending', formatMoney(kpis.revenuePending)]);
    push(['Total orders', kpis.orders]);
    push(['Pending orders', kpis.pendingOrders]);
    push(['Completed orders', kpis.completedOrders]);
    push(['Active deliveries', kpis.activeDeliveries]);
    push(['Delivered rate', `${deliveryStats.rate}%`]);
    push(['Customers', kpis.customers]);
    push(['Products', kpis.products]);
    push(['Paid conversion', `${kpis.conversionRate}%`]);
    push([]);
    push(['REVENUE TREND', 'Revenue']);
    for (const d of revenueByDay) push([d.date, Math.round(d.total)]);
    push([]);
    push(['TOP PRODUCTS', 'Units sold', 'Revenue']);
    for (const p of topProducts) push([p.name, p.qty, money(p.revenue)]);
    push([]);
    push(['SALES BY CATEGORY', 'Inventory value']);
    for (const c of topCategories) push([c.name, c.value]);
    push([]);
    push(['ORDER STATUS', 'Count', 'Share']);
    for (const s of orderStatusBreakdown) push([s.label, s.count, `${s.pct}%`]);
    push([]);
    push(['LOW STOCK', 'Stock left']);
    for (const v of lowStock) {
      push([`${v.product_name}${v.variant_name ? ` (${v.variant_name})` : ''}`, v.stock_quantity]);
    }

    downloadCsv(
      `dashboard-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Section', 'Metric 1', 'Metric 2', 'Metric 3'],
      rows,
    );
  };

  if (
    ordersQuery.isLoading ||
    productsQuery.isLoading ||
    customersQuery.isLoading ||
    deliveriesQuery.isLoading ||
    lowStockQuery.isLoading ||
    stockMovementsQuery.isLoading
  ) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <Text size="sm" c="dimmed">
            Loading dashboard…
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)]">
            Welcome back, {firstName}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-black/[0.02]"
          >
            <Download size={15} />
            Export
          </button>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-[#412402] transition-colors hover:bg-accent-600"
          >
            <ArrowRight size={15} weight="bold" />
            New order
          </Link>
        </div>
      </div>

      <Group gap="sm" wrap="wrap" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <Select
          size="sm"
          label="Period"
          value={period}
          onChange={(value) => {
            const next = value as PeriodValue;
            if (next === 'custom' && period !== 'custom') setCustomRange(presetRange);
            setPeriod(next);
          }}
          data={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
          allowDeselect={false}
          w={150}
        />
        <DatePickerInput
          size="sm"
          label="Date range"
          type="range"
          clearable
          value={activeRange}
          onChange={(value) => {
            const next = value ?? [null, null];
            setCustomRange([toDate(next[0]), toDate(next[1])]);
            setPeriod('custom');
          }}
          placeholder="Choose a date range"
          valueFormat="MMM D, YYYY"
          w={260}
        />
        <Select
          size="sm"
          label="Product"
          value={productId}
          onChange={(value) => {
            setProductId(value);
            setVariantId(null);
          }}
          data={productOptions}
          placeholder="All products"
          clearable
          w={220}
        />
        <Select
          size="sm"
          label="Variant"
          value={variantId}
          onChange={setVariantId}
          data={variantOptions}
          placeholder="All variants"
          clearable
          w={220}
        />
        <Text size="xs" c="dimmed" className="self-end pb-2">
          {periodLabel} · {rangeLabel} — applies to every dashboard section and the CSV export.
        </Text>
      </Group>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          <Warning size={18} weight="duotone" className="shrink-0 text-warning-600" />
          <span className="shrink-0 font-semibold">Low stock</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {lowStock.map((v) => (
              <Link
                key={v.variant_id}
                href={`/products/${v.product_id}`}
                className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-white px-2.5 py-1 text-xs font-medium text-warning-800 transition-colors hover:border-warning-400 hover:bg-warning-100"
              >
                {v.product_name}
                <span className="font-semibold">{v.stock_quantity} left</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPI row — flat, value + micro-metadata only */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl bg-[var(--surface-1)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Revenue</p>
          <p className="mt-1.5 text-xl font-semibold text-[var(--foreground)]">
            {formatMoney(kpis.revenue)}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {formatMoney(kpis.revenuePending)} pending
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-1)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Orders</p>
          <p className="mt-1.5 text-xl font-semibold text-[var(--foreground)]">
            {formatNumber(kpis.orders)}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {kpis.pendingOrders} pending · {kpis.completedOrders} done
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-1)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Deliveries
          </p>
          <p className="mt-1.5 text-xl font-semibold text-[var(--foreground)]">
            {kpis.activeDeliveries}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success-700">
            {deliveryStats.rate}% delivered
            <Link
              href="/deliveries/portal"
              className="inline-flex items-center gap-0.5 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              · live map
              <ArrowUpRight size={11} weight="bold" />
            </Link>
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-1)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Customers
          </p>
          <p className="mt-1.5 text-xl font-semibold text-[var(--foreground)]">
            {formatNumber(kpis.customers)}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {kpis.conversionRate}% paid · {kpis.products} products
          </p>
        </div>
      </div>

      {/* Revenue trend + Sales by category */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Revenue trend"
          subtitle={`In lakhs (NPR) · ${periodLabel} · ${rangeLabel}`}
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1b4332" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1b4332" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#8b8fa3' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#8b8fa3' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip formatter={(value) => [formatMoney(Number(value)), 'Revenue']} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#1b4332"
                  strokeWidth={2.5}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Sales by category" subtitle="Monthly distribution breakdown">
          {totalCategoryValue > 0 ? (
            <>
              <div className="relative h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topCategories}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {topCategories.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    Total
                  </span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {formatMoney(totalCategoryValue)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {topCategories.map((cat, i) => {
                  const pct = Math.round((cat.value / totalCategoryValue) * 100);
                  return (
                    <div key={cat.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
                        {cat.name}
                      </span>
                      <span className="shrink-0 font-medium text-[var(--muted)]">
                        {pct}% · {formatMoney(cat.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--muted)]">
              No category data yet
            </p>
          )}
        </Panel>
      </div>

      {/* Orders by status + Calendar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Orders by status" subtitle="Live fulfilment pipelines">
          <div className="flex flex-col gap-4">
            {orderStatusBreakdown.map((s) => (
              <div key={s.key}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-[var(--foreground)]">
                    {s.label}{' '}
                    <span className="text-[var(--muted)]">({formatNumber(s.count)} orders)</span>
                  </span>
                  <span className="font-semibold text-[var(--foreground)]">{s.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/5">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
            <span className="text-[var(--muted)]">
              Total active lifecycle: {formatNumber(orders.length)} transactions
            </span>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"
            >
              Manage orders
              <ArrowUpRight size={12} weight="bold" />
            </Link>
          </div>
        </Panel>

        <DispatchCalendar eventDates={activeDeliveryDates} />
      </div>

      {/* Top products + Recent activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title="Top products"
            action={
              <Link
                href="/products"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </Link>
            }
          >
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Units sold
                </p>
                <p className="mt-0.5 text-lg font-semibold leading-tight text-[var(--foreground)]">
                  {formatNumber(totalUnitsSold)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Revenue generated
                </p>
                <p className="mt-0.5 text-lg font-semibold leading-tight text-[var(--foreground)]">
                  {formatMoney(totalSalesRevenue)}
                </p>
              </div>
            </div>
            <div className="max-h-[340px] space-y-3 overflow-y-auto overscroll-contain pr-2">
              {topProducts.map((p, i) => {
                const unitPct = Math.round((p.qty / maxProductQty) * 100);
                const revenuePct = Math.round((money(p.revenue) / maxProductRevenue) * 100);
                const unitShare = totalUnitsSold > 0 ? Math.round((p.qty / totalUnitsSold) * 100) : 0;
                const revenueShare =
                  totalSalesRevenue > 0 ? Math.round((money(p.revenue) / totalSalesRevenue) * 100) : 0;
                return (
                  <div key={p.id || p.name} className="rounded-xl bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--foreground)]">
                            {p.name}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                            {formatMoney(p.revenue)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="text-[var(--muted)]">Units sold</span>
                            <span className="font-medium text-[var(--foreground)]">
                              {formatNumber(p.qty)} · {unitShare}% of sales
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${unitPct}%` }}
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="text-[var(--muted)]">Revenue generated</span>
                            <span className="font-medium text-[var(--foreground)]">
                              {revenueShare}% of revenue
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                            <div
                              className="h-full rounded-full bg-accent-500"
                              style={{ width: `${revenuePct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {topProducts.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="lg">
                  No product sales yet
                </Text>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Recent activity">
          <div className="max-h-[420px] space-y-0 overflow-y-auto overscroll-contain pr-2">
            {activity.map((ev, i) => (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/5 ${ev.color}`}>
                    {ev.icon}
                  </div>
                  {i < activity.length - 1 && <div className="w-px flex-1 bg-[var(--border)]" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="text-sm font-medium text-[var(--foreground)]">{ev.title}</div>
                  <div className="text-xs text-[var(--muted)]">{ev.desc}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)]/70">{timeAgo(ev.ts)}</div>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <Text size="sm" c="dimmed">
                No recent activity
              </Text>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent orders"
        action={
          <Link href="/orders" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            View all orders
          </Link>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['Order', 'Customer', 'Date', 'Items', 'Amount', 'Payment', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] ${
                      i >= 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {o.order_ref}
                    </Link>
                    <ReorderBadge order={o} className="ml-1.5 align-middle" />
                    {canReorder(o) && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => reorder.reorderOrder(o)}
                          disabled={reorder.isPending}
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                        >
                          <ArrowsClockwise size={12} weight="bold" />
                          Re-order
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {customers.find((c) => c.id === o.customer_id)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{formatDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-right text-[var(--muted)]">
                    {o.items.reduce((s, it) => s + Number(it.quantity || 0), 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {['failed', 'cancelled'].includes(o.status) ? (
                      <span className="text-[var(--muted)]/50">—</span>
                    ) : (
                      <span className="font-semibold text-[var(--foreground)]">
                        {formatMoney(o.total_amount)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                        o.payment_status === 'paid'
                          ? 'bg-success-50 text-success-700'
                          : 'bg-warning-50 text-warning-700'
                      }`}
                    >
                      {o.payment_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                        o.status === 'delivered'
                          ? 'bg-success-50 text-success-700'
                          : o.status === 'cancelled' || o.status === 'failed'
                            ? 'bg-danger-50 text-danger-700'
                            : o.status === 'in_transit' || o.status === 'in_delivery'
                              ? 'bg-warning-50 text-warning-700'
                              : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                    No orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}