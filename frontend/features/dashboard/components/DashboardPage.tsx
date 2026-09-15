'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Text } from '@mantine/core';
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
import { useOrders } from '@/features/orders/api';
import { useReorder, ReorderBadge, canReorder } from '@/features/orders/components/Reorder';
import {
  useProducts,
  useCategories,
  defaultVariantPrice,
  useLowStock,
  useStockMovements,
} from '@/features/products/api';
import { useCustomers } from '@/features/customers/api';
import { useDeliveries } from '@/features/deliveries/api';
import { formatMoney, formatCompact, timeAgo, formatNumber, formatDate } from '@/lib/format';

const PIE_COLORS = ['#1b4332', '#f59e0b', '#a8c5b8', '#528a72', '#7ba695'];
const PERIOD_OPTIONS = [
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
  { value: '1y', label: '1Y', days: 365 },
] as const;

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
        <div className="mb-4 flex items-start justify-between gap-3">
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

/**
 * Self-contained month calendar. Dispatch/delivery dates are derived from
 * `assigned_at ?? created_at` on active deliveries as a stand-in — swap for a
 * real `scheduled_date` field once the deliveries API exposes one.
 */
function DispatchCalendar({ eventDates }: { eventDates: Set<string> }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today.toDateString());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dateKey = (d: number) => new Date(year, month, d).toDateString();
  const eventCount = [...eventDates].filter(
    (d) => new Date(d).getMonth() === month && new Date(d).getFullYear() === year,
  ).length;
  const isSelectedToday = selected === today.toDateString();

  return (
    <Panel
      title="Calendar"
      subtitle="Scheduled dispatches & deliveries"
      action={
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)]">
          {monthLabel}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5"
              aria-label="Previous month"
            >
              <CaretLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5"
              aria-label="Next month"
            >
              <CaretRight size={13} />
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-[11px] font-medium text-[var(--muted)]">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />;
          const key = dateKey(d);
          const hasEvent = eventDates.has(key);
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`mx-auto flex h-7 w-7 flex-col items-center justify-center rounded-full text-xs transition-colors ${
                isSelected
                  ? 'bg-brand-600 font-semibold text-white'
                  : 'text-[var(--foreground)] hover:bg-black/5'
              }`}
            >
              {d}
              {hasEvent && !isSelected && <span className="-mt-1 h-1 w-1 rounded-full bg-accent-500" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
          {eventCount} dispatch{eventCount === 1 ? '' : 'es'} queued
        </span>
        <span>
          {isSelectedToday
            ? 'Selected: Today'
            : `Selected: ${new Date(selected).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </span>
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
  const lowStockQuery = useLowStock(5);
  const stockMovementsQuery = useStockMovements(10);
  const reorder = useReorder();
  const [period, setPeriod] = useState<(typeof PERIOD_OPTIONS)[number]['value']>('30d');

  const orders = ordersQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const lowStock = lowStockQuery.data ?? [];
  const stockMovements = stockMovementsQuery.data ?? [];

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
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const revenuePending = moneyOrders
      .filter((o) => o.payment_status !== 'paid')
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
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
  }, [orders, deliveries, customers, products, moneyOrders]);

  const revenueByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of moneyOrders) {
      if (o.payment_status !== 'paid') continue;
      const day = (o.created_at ?? '').slice(0, 10);
      if (!day) continue;
      map.set(day, money(map.get(day) ?? 0) + Number(o.total_amount || 0));
    }
    const rows = [...map.entries()]
      .map(([date, total]) => ({ date, name: date.slice(5).replace('-', '/'), total: Math.round(total) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const days = PERIOD_OPTIONS.find((p) => p.value === period)?.days ?? 30;
    return rows.slice(-days);
  }, [moneyOrders, period]);

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
      if (ref) set.add(new Date(ref).toDateString());
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
      <div className="flex items-start justify-between gap-4">
        <div>
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
          subtitle="In lakhs (NPR / INR)"
          action={
            <div className="flex items-center gap-1 rounded-lg bg-black/[0.03] p-0.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    period === opt.value
                      ? 'bg-white text-[var(--foreground)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
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
            <div className="max-h-[420px] space-y-3 overflow-y-auto overscroll-contain pr-2">
              {topProducts.map((p, i) => {
                const pct = Math.round((p.qty / maxProductQty) * 100);
                return (
                  <div
                    key={p.id || p.name}
                    className="flex items-center gap-4 rounded-xl bg-[var(--surface-1)] px-4 py-3"
                  >
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
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {formatNumber(p.qty)} units
                        </span>
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