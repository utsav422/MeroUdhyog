'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, Table, Text, Progress, Group, Badge } from '@mantine/core';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  CurrencyDollar,
  Receipt,
  Truck,
  Users,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  UserPlus,
  Clock,
  Package,
  ShoppingCart,
  TrendUp,
  TrendDown,
  Warning,
  CheckCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { useSession } from '@/lib/providers';
import { PageHeader, KPICard, ChartCard, ChartLegend } from '@/components/shared';
import { useOrders } from '@/features/orders/api';
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
import type { Order } from '@/features/orders/api';

const PIE_COLORS = ['#6f4bff', '#22c55e', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#64748b'];

function money(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <Text size="xs" c="dimmed" fw={500}>{label}</Text>
        <Text fw={700} size="md">{value}</Text>
      </div>
    </div>
  );
}

const STATUS_TABS = [
  { key: 'all', label: 'All orders', icon: ShoppingCart },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'active', label: 'Active', icon: ArrowsClockwise },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
] as const;

export default function DashboardPage() {
  const session = useSession();
  const ordersQuery = useOrders();
  const productsQuery = useProducts();
  const categoriesQuery = useCategories();
  const customersQuery = useCustomers();
  const deliveriesQuery = useDeliveries();
  const lowStockQuery = useLowStock(5);
  const stockMovementsQuery = useStockMovements(10);

  const orders = ordersQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const lowStock = lowStockQuery.data ?? [];
  const stockMovements = stockMovementsQuery.data ?? [];

  // Failed and cancelled orders are locked and their amounts must never count
  // anywhere; they only ever appear as counts.
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
    const revenuePaid = moneyOrders.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const revenuePending = moneyOrders.filter((o) => o.payment_status !== 'paid').reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const activeDeliveries = deliveries.filter((d) => !['delivered', 'failed', 'pending_assignment'].includes(d.status)).length;
    const pendingOrders = orders.filter((o) => ['draft', 'confirmed'].includes(o.status)).length;
    const completedOrders = orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled').length;
    const conversionRate = orders.length > 0 ? Math.round((orders.filter((o) => o.payment_status === 'paid').length / orders.length) * 100) : 0;
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
    const orderCount = new Map<string, number>();
    for (const o of moneyOrders) {
      const day = (o.created_at ?? '').slice(0, 10);
      if (!day) continue;
      if (o.payment_status === 'paid') {
        map.set(day, money(map.get(day) ?? 0) + Number(o.total_amount || 0));
      }
      orderCount.set(day, (orderCount.get(day) ?? 0) + 1);
    }
    const allDays = new Set([...map.keys(), ...orderCount.keys()]);
    return [...allDays]
      .map((date) => ({
        name: date.slice(5).replace('-', '/'),
        revenue: Math.round(money(map.get(date) ?? 0)),
        orders: orderCount.get(date) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [moneyOrders]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      const cat = categoryMap.get(product.category_id ?? '') ?? 'Uncategorized';
      const total = product.variants.reduce((s, v) => s + Number(defaultVariantPrice(v) || 0), 0);
      map.set(cat, money(map.get(cat) ?? 0) + total);
    }
    const arr = [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 6);
  }, [products, categoryMap]);

  const totalCategoryValue = topCategories.reduce((s, c) => s + c.value, 0);

  const topProducts = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; revenue: number; id: string }>();
    for (const order of moneyOrders) {
      for (const item of order.items) {
        const key = item.product_id ?? item.product_name;
        const cur = counts.get(key) ?? { name: item.product_name, qty: 0, revenue: 0, id: item.product_id ?? '' };
        cur.qty += Number(item.quantity || 0);
        cur.revenue += Number(item.amount || 0);
        counts.set(key, cur);
      }
    }
    return [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [moneyOrders]);

  const maxProductQty = Math.max(...topProducts.map((p) => p.qty), 1);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);
  }, [orders]);

  const deliveryStats = useMemo(() => {
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === 'delivered').length;
    const inTransit = deliveries.filter((d) => d.status === 'in_transit').length;
    const failed = deliveries.filter((d) => d.status === 'failed').length;
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, inTransit, failed, rate };
  }, [deliveries]);

  const activity = useMemo(() => {
    const events: { id: string; ts: string; icon: React.ReactNode; title: string; desc: string; color: string }[] = [];
    for (const d of deliveries) {
      if (d.delivered_at) {
        events.push({
          id: `del-${d.id}`,
          ts: d.delivered_at,
          icon: <MapPin size={14} />,
          title: 'Delivery completed',
          desc: `${d.order_ref ?? 'Order'} delivered to ${d.customer_name ?? 'customer'}`,
          color: 'text-emerald-500',
        });
      }
    }
    for (const o of orders.slice(0, 5)) {
      events.push({
        id: `ord-${o.id}`,
        ts: o.created_at,
        icon: <Receipt size={14} />,
        title: 'New order',
        desc: ['failed', 'cancelled'].includes(o.status) ? o.order_ref : `${o.order_ref} · ${formatMoney(o.total_amount)}`,
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
        color: 'text-blue-500',
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
          color: 'text-amber-500',
        });
      }
    }
    return events.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8);
  }, [orders, deliveries, customers, stockMovements]);

  const firstName = session?.full_name?.split(' ')[0] ?? 'there';

  if (ordersQuery.isLoading || productsQuery.isLoading || customersQuery.isLoading || deliveriesQuery.isLoading || lowStockQuery.isLoading || stockMovementsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <Text size="sm" c="dimmed">Loading dashboard…</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Text fw={700} size="xl" className="leading-tight">
            Welcome back, {firstName}
          </Text>
          <Text size="sm" c="dimmed" className="mt-1">
            Here&apos;s a snapshot of your business performance today.
          </Text>
        </div>
        <a
          href="/orders"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-all hover:bg-brand-700 hover:shadow-md"
        >
          <Receipt size={16} weight="bold" />
          New order
          <ArrowRight size={14} />
        </a>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Warning size={18} weight="duotone" className="shrink-0 text-amber-600" />
          <span className="shrink-0 font-semibold">Low stock</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {lowStock.map((v) => (
              <Link
                key={v.variant_id}
                href={`/products/${v.product_id}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100"
              >
                {v.product_name}
                <span className="font-semibold">{v.stock_quantity} left</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <CurrencyDollar size={22} weight="bold" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              <TrendUp size={12} weight="bold" />
              12.5%
            </span>
          </div>
          <Text size="xs" c="dimmed" fw={500}>Revenue</Text>
          <Text fw={700} size="xl" className="mt-0.5">{formatMoney(kpis.revenue)}</Text>
          <Text size="xs" c="dimmed" className="mt-1">{formatMoney(kpis.revenuePending)} pending</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <ShoppingCart size={22} weight="bold" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              <TrendUp size={12} weight="bold" />
              8.2%
            </span>
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total orders</Text>
          <Text fw={700} size="xl" className="mt-0.5">{formatNumber(kpis.orders)}</Text>
          <Text size="xs" c="dimmed" className="mt-1">{kpis.pendingOrders} pending, {kpis.completedOrders} done</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Truck size={22} weight="bold" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              {deliveryStats.rate}% success
            </span>
          </div>
          <Text size="xs" c="dimmed" fw={500}>Active deliveries</Text>
          <Text fw={700} size="xl" className="mt-0.5">{kpis.activeDeliveries}</Text>
          <div className="mt-1 flex items-center justify-between gap-2">
            <Text size="xs" c="dimmed">{deliveryStats.inTransit} in transit</Text>
            <Link
              href="/deliveries/portal"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Live map
              <ArrowUpRight size={12} weight="bold" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Users size={22} weight="bold" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              {kpis.conversionRate}% rate
            </span>
          </div>
          <Text size="xs" c="dimmed" fw={500}>Customers</Text>
          <Text fw={700} size="xl" className="mt-0.5">{formatNumber(kpis.customers)}</Text>
          <Text size="xs" c="dimmed" className="mt-1">{kpis.products} products</Text>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Revenue & Orders"
            legend={
              <ChartLegend items={[{ label: 'Revenue', color: '#6f4bff' }, { label: 'Orders', color: '#22c55e' }]} />
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6f4bff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6f4bff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => formatCompact(v)} />
                <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e4e7ec', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(value, name) => name === 'revenue' ? [formatMoney(Number(value)), 'Revenue'] : [value, 'Orders']}
                />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#6f4bff" strokeWidth={2.5} fill="url(#revGrad)" />
                <Area yAxisId="ord" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} fill="url(#orderGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard
          title="Sales by category"
          legend={
            <ChartLegend
              items={topCategories.slice(0, 5).map((c, i) => ({ label: c.name, color: PIE_COLORS[i % PIE_COLORS.length] }))}
            />
          }
        >
          {totalCategoryValue > 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={topCategories} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                    {topCategories.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full space-y-2 px-2">
                {topCategories.slice(0, 4).map((cat, i) => {
                  const pct = totalCategoryValue > 0 ? Math.round((cat.value / totalCategoryValue) * 100) : 0;
                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">{cat.name}</span>
                      <span className="text-xs font-semibold text-zinc-800">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Text size="sm" c="dimmed" className="flex h-full items-center justify-center">
              No category data yet
            </Text>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <Text fw={600} size="md">Top products</Text>
              <a href="/products" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                View all
              </a>
            </div>
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const pct = Math.round((p.qty / maxProductQty) * 100);
                return (
                  <div key={p.id || p.name} className="flex items-center gap-4 rounded-xl border border-zinc-50 bg-zinc-50/50 px-4 py-3 transition-colors hover:bg-zinc-50">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-zinc-800">{p.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-zinc-800">{formatMoney(p.revenue)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 text-xs text-zinc-400">{formatNumber(p.qty)} units</span>
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
          </Card>
        </div>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <Text fw={600} size="md">Recent activity</Text>
          </div>
          <div className="space-y-0">
            {activity.map((ev, i) => (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 ${ev.color}`}>
                    {ev.icon}
                  </div>
                  {i < activity.length - 1 && <div className="w-px flex-1 bg-zinc-100" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="text-sm font-medium text-zinc-800">{ev.title}</div>
                  <div className="text-xs text-zinc-500">{ev.desc}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">{timeAgo(ev.ts)}</div>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <Text size="sm" c="dimmed">No recent activity</Text>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Text fw={600} size="md">Recent orders</Text>
          <a href="/orders" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            View all orders
          </a>
        </div>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="text-zinc-400">
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Order</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Customer</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Date</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Items</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Amount</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Payment</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {recentOrders.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>
                  <a href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.order_ref}
                  </a>
                </Table.Td>
                <Table.Td>
                  <span className="text-zinc-600">{customers.find((c) => c.id === o.customer_id)?.name ?? '—'}</span>
                </Table.Td>
                <Table.Td>
                  <span className="text-zinc-500">{formatDate(o.created_at)}</span>
                </Table.Td>
                <Table.Td ta="right">
                  <span className="text-zinc-600">{o.items.reduce((s, it) => s + Number(it.quantity || 0), 0)}</span>
                </Table.Td>
                <Table.Td ta="right">
                  {['failed', 'cancelled'].includes(o.status) ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <span className="font-semibold text-zinc-800">{formatMoney(o.total_amount)}</span>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={o.payment_status === 'paid' ? 'success' : o.payment_status === 'partial' ? 'warning' : 'warning'}
                    radius="sm"
                    styles={{ label: { textTransform: 'none', fontWeight: 600 } }}
                  >
                    {o.payment_status.replace(/_/g, ' ')}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={o.status === 'delivered' ? 'success' : o.status === 'cancelled' || o.status === 'failed' ? 'danger' : o.status === 'in_transit' || o.status === 'in_delivery' ? 'warning' : o.status === 'picked_up' || o.status === 'assigned' ? 'blue' : o.status === 'ready' ? 'cyan' : 'gray'}
                    radius="sm"
                    styles={{ label: { textTransform: 'none', fontWeight: 600 } }}
                  >
                    {o.status.replace(/_/g, ' ')}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
            {recentOrders.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7} c="dimmed" ta="center" py="lg">
                  No orders yet
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </div>
  );
}
