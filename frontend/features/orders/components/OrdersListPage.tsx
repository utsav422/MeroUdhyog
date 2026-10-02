'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Tabs,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  PencilSimple,
  Trash,
  ShoppingCart,
  Clock,
  ArrowsClockwise,
  CurrencyDollar,
  TrendUp,
  Package,
  Warning,
  Truck,
  DownloadSimple,
  FilePdf,
  CheckCircle,
  HandCoins,
} from '@phosphor-icons/react';
import {
  CreditLimitBar,
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import type { Column, SortState, Filters, DateRangeValue } from '@/components/shared';
import { EMPTY_DATE_RANGE, dateInRange } from '@/components/shared';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { downloadCsv } from '@/lib/exportCsv';
import { useOrders, ordersKeys, itemCount, useOrderStatusUpdate, useCreateDeliveryForOrder, useBulkOrderStatusUpdate, nextOrderStatuses } from '../api';
import type { Order } from '../api';
import { useReorder, ReorderBadge } from './Reorder';
import { useDeliveries } from '../../deliveries/api';
import type { Delivery } from '../../deliveries/api';
import { useProducts, defaultVariantPrice } from '../../products/api';
import type { Variant } from '../../products/api';
import { useCustomers, customersKeys } from '../../customers/api';
import type { CustomerPrice } from '../../customers/api';
import { khataKeys } from '../../khata/api';
import { useRoutes } from '../../routes/api';
import CustomerSelect from './CustomerSelect';

type LineItem = {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: string;
};

/**
 * Orders are partitioned across two pages. `undelivered` is everything still
 * in the fulfilment pipeline (including failed/cancelled); `delivered` is the
 * completed archive. The two sets are an exact partition of all orders.
 */
export type OrdersScope = 'undelivered' | 'delivered';

const SCOPE_META: Record<
  OrdersScope,
  { title: string; subtitle: string; href: string; emptyTitle: string; emptyDescription: string }
> = {
  undelivered: {
    title: 'Orders',
    subtitle: 'Orders that have not been delivered yet',
    href: '/orders',
    emptyTitle: 'No pending orders',
    emptyDescription: 'Every order has been delivered. Check the delivered page for the full history.',
  },
  delivered: {
    title: 'Delivered Orders',
    subtitle: 'Completed orders that have been delivered',
    href: '/orders/delivered',
    emptyTitle: 'No delivered orders',
    emptyDescription: 'Orders appear here once their delivery is marked as delivered.',
  },
};

const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'ready',
  'assigned',
  'picked_up',
  'in_transit',
  'in_delivery',
  'delivered',
  'failed',
  'cancelled',
];

function ScopeSwitch({ scope }: { scope: OrdersScope }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-1">
      {(['undelivered', 'delivered'] as const).map((s) => {
        const isCurrent = s === scope;
        return (
          <button
            key={s}
            type="button"
            onClick={() => router.push(SCOPE_META[s].href)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isCurrent
                ? 'bg-brand-50 text-brand-700'
                : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
            }`}
          >
            {s === 'delivered' ? 'Delivered' : 'Pending'}
          </button>
        );
      })}
    </div>
  );
}

function OrderStatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <Text size="xs" c="dimmed" fw={500}>{label}</Text>
        <Text fw={700} size="xl" className="leading-tight">{value}</Text>
        {subtext && <Text size="xs" c="dimmed" className="mt-0.5">{subtext}</Text>}
      </div>
    </div>
  );
}

export default function OrdersListPage({ scope = 'undelivered' }: { scope?: OrdersScope }) {
  const router = useRouter();
  const qc = useQueryClient();
  const meta = SCOPE_META[scope];
  const isDeliveredScope = scope === 'delivered';
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const ordersQuery = useOrders(routeFilter);
  const productsQuery = useProducts();
  const customersQuery = useCustomers();
  const deliveriesQuery = useDeliveries();
  const routesQuery = useRoutes();
  const statusMutation = useOrderStatusUpdate();
  const createDeliveryMutation = useCreateDeliveryForOrder();
  const bulkStatusMutation = useBulkOrderStatusUpdate();
  const reorder = useReorder();

  // Set of order ids that already have a Delivery record
  const deliveryOrderIds = useMemo(
    () => new Set((deliveriesQuery.data ?? []).map((d) => d.order_id)),
    [deliveriesQuery.data],
  );

  const deliveryByOrder = useMemo(() => {
    const map = new Map<string, Delivery>();
    for (const d of deliveriesQuery.data ?? []) map.set(d.order_id, d);
    return map;
  }, [deliveriesQuery.data]);

  const createDeliveryForOrder = (order: Order) => {
    createDeliveryMutation.mutate(order.id, {
      onSuccess: () =>
        notifications.show({
          color: 'success',
          title: 'Delivery created',
          message: `A delivery for ${order.order_ref} now appears in Deliveries. Assign an agent.`,
        }),
      onError: (error) =>
        notifications.show({
          color: 'red',
          title: 'Create failed',
          message: error instanceof Error ? error.message : 'Something went wrong',
        }),
    });
  };

  const changeOrderStatus = (order: Order, status: string) => {
    if (status === order.status) return;
    statusMutation.mutate(
      { orderId: order.id, status },
      {
        onSuccess: (res) => {
          const isReady = status === 'ready';
          notifications.show({
            color: 'success',
            title: isReady ? 'Order marked ready' : `Marked ${status.replace(/_/g, ' ')}`,
            message:
              isReady && res?.deliveryCreated
                ? 'Delivery has been created and will appear in the Deliveries section.'
                : isReady
                  ? 'The order already had a delivery.'
                  : 'Order status updated',
          });
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Update failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ field: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>([]);

  const form = useForm({
    initialValues: {
      customer_id: undefined as string | undefined,
      notes: '',
    },
  });

  // Non-null while the credit-limit confirmation dialog is open; holds the
  // values it will submit if the user chooses to continue.
  const [creditPrompt, setCreditPrompt] = useState<{
    values: typeof form.values;
    // Snapshot of the overage, so the modal still renders even if the local
    // projection changes (or was the stale reason we got here).
    block: {
      customerName: string;
      limit: number;
      used: number;
      total: number;
      projected: number;
      overBy: number;
    };
  } | null>(null);

  // The two pages are an exact partition of the order list, so scope is
  // applied before any search/filter/sort work below.
  const scopedOrders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    return isDeliveredScope
      ? all.filter((o) => o.status === 'delivered')
      : all.filter((o) => o.status !== 'delivered');
  }, [ordersQuery.data, isDeliveredScope]);

  const stats = useMemo(() => {
    const total = scopedOrders.length;
    const pending = scopedOrders.filter((o) => ['draft', 'confirmed'].includes(o.status)).length;
    const active = scopedOrders.filter((o) =>
      ['ready', 'assigned', 'picked_up', 'in_transit', 'in_delivery'].includes(o.status),
    ).length;
    const failed = scopedOrders.filter((o) => ['failed', 'cancelled'].includes(o.status)).length;
    const billable = scopedOrders
      .filter((o) => !['failed', 'cancelled'].includes(o.status))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const paid = scopedOrders
      .filter((o) => o.payment_status === 'paid' && !['failed', 'cancelled'].includes(o.status))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const units = scopedOrders.reduce(
      (s, o) => s + o.items.reduce((n, it) => n + Number(it.quantity || 0), 0),
      0,
    );
    return {
      total,
      pending,
      active,
      failed,
      billable,
      paid,
      units,
      outstanding: billable - paid,
    };
  }, [scopedOrders]);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customersQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [customersQuery.data]);

  const customerOptions = useMemo(
    () =>
      (customersQuery.data ?? [])
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [customersQuery.data],
  );

  const routeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of routesQuery.data ?? []) map.set(r.id, r.name);
    return map;
  }, [routesQuery.data]);

  const variantOptions = useMemo(() => {
    const list: { value: string; label: string; data: Variant; product_id: string }[] = [];
    for (const product of productsQuery.data ?? []) {
      for (const variant of product.variants) {
        list.push({
          value: variant.id,
          label: `${product.name} — ${variant.name}`,
          data: variant,
          product_id: product.id,
        });
      }
    }
    return list;
  }, [productsQuery.data]);

  const filtered = useMemo(() => {
    let rows = [...scopedOrders];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          o.order_ref.toLowerCase().includes(needle) ||
          (customerMap.get(o.customer_id ?? '') ?? '').toLowerCase().includes(needle),
      );
    }
    if (statusFilter) rows = rows.filter((o) => o.status === statusFilter);
    if (customerFilter) rows = rows.filter((o) => o.customer_id === customerFilter);
    rows = rows.filter((o) => dateInRange(o.created_at, dateFilter));
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.field as keyof Order] ?? '';
      const bv = b[sort.field as keyof Order] ?? '';
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [scopedOrders, search, statusFilter, customerFilter, dateFilter, sort, customerMap]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      `${isDeliveredScope ? 'delivered-orders' : 'pending-orders'}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Order',
        'Customer',
        'Route',
        'Date',
        'Items',
        'Total',
        'Payment',
        'Order status',
        'Delivery',
        'Notes',
      ],
      filtered.map((o) => [
        o.order_ref,
        o.customer_id ? customerMap.get(o.customer_id) ?? '' : '',
        o.route_id ? routeMap.get(o.route_id) ?? '' : '',
        formatDate(o.created_at),
        itemCount(o),
        o.total_amount ?? '',
        o.payment_status,
        o.status,
        deliveryByOrder.get(o.id)?.status ?? '',
        o.notes ?? '',
      ]),
    );
  };

  const lineTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  }, [items]);

  const heldByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of editing?.items ?? []) {
      if (it.variant_id) map.set(it.variant_id, (map.get(it.variant_id) ?? 0) + (Number(it.quantity) || 0));
    }
    return map;
  }, [editing]);

  const availableFor = (variantId: string): number => {
    if (!variantId) return 0;
    const opt = variantOptions.find((o) => o.value === variantId);
    const stock = opt ? opt.data.stock_quantity || 0 : 0;
    return stock + (heldByOrder.get(variantId) ?? 0);
  };

  const setCustomer = async (customerId: string | undefined) => {
    form.setFieldValue('customer_id', customerId);
    if (customerId) {
      try {
        const prices = await apiClient.get<CustomerPrice[]>(`/customers/${customerId}/prices`);
        setCustomerPrices(prices);
        setItems((prev) =>
          prev.map((it) => {
            const price = prices.find((p) => p.variant_id === it.variant_id);
            if (price) return { ...it, unit_price: String(Number(price.price)) };
            return it;
          }),
        );
      } catch {
        setCustomerPrices([]);
      }
    } else {
      setCustomerPrices([]);
    }
  };

  const addLine = () => {
    setItems((prev) => [
      ...prev,
      { product_id: '', variant_id: '', product_name: '', variant_name: '', quantity: 1, unit_price: '0' },
    ]);
  };

  const removeLine = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const onVariantSelect = (index: number, variantId: string) => {
    const opt = variantOptions.find((o) => o.value === variantId);
    if (!opt) return;
    const custom = customerPrices.find((p) => p.variant_id === variantId);
    const price = custom ? String(Number(custom.price)) : defaultVariantPrice(opt.data);
    const available = Math.max(availableFor(variantId), 0);
    const current = items[index]?.quantity ?? 0;
    updateLine(index, {
      variant_id: variantId,
      product_id: opt.product_id,
      product_name: opt.data.name,
      variant_name: opt.data.name,
      unit_price: price,
      quantity: available > 0 ? Math.min(Math.max(current, 1), available) : 0,
    });
  };

  const openCreate = () => {
    setEditing(null);
    form.reset();
    setItems([{ product_id: '', variant_id: '', product_name: '', variant_name: '', quantity: 1, unit_price: '0' }]);
    setCustomerPrices([]);
    setDrawerOpen(true);
  };

  const openEdit = async (order: Order) => {
    setEditing(order);
    form.setValues({
      customer_id: order.customer_id ?? undefined,
      notes: order.notes ?? '',
    });
    const rows = order.items.map((it) => ({
      product_id: it.product_id ?? '',
      variant_id: it.variant_id ?? '',
      product_name: it.product_name,
      variant_name: it.variant_name ?? '',
      quantity: Number(it.quantity),
      unit_price: String(Number(it.unit_price)),
    }));
    setItems(rows);
    if (order.customer_id) {
      try {
        setCustomerPrices(await apiClient.get<CustomerPrice[]>(`/customers/${order.customer_id}/prices`));
      } catch {
        setCustomerPrices([]);
      }
    }
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ values, overrideCreditLimit }: {
      values: typeof form.values;
      overrideCreditLimit?: boolean;
    }) => {
      const validItems = items
        .filter((it) => it.variant_id && it.quantity > 0)
        .map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          quantity: String(it.quantity),
        }));
      if (validItems.length === 0) {
        throw new Error('Add at least one line item with a product and quantity.');
      }
      for (const it of validItems) {
        const available = availableFor(it.variant_id);
        if (Number(it.quantity) > available) {
          throw new Error(
            `Insufficient stock: only ${available} unit${available === 1 ? '' : 's'} of this item available.`,
          );
        }
      }
      const payload = {
        customer_id: values.customer_id || null,
        delivery_address: values.customer_id
          ? customersQuery.data?.find((c) => c.id === values.customer_id)?.address || null
          : null,
        notes: values.notes || null,
        items: validItems,
        override_credit_limit: overrideCreditLimit === true,
      };
      if (editing) {
        await apiClient.patch(`/orders/${editing.id}`, payload);
      } else {
        await apiClient.post('/orders', payload);
      }
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: editing ? 'Order updated' : 'Order created',
        message: editing ? 'Changes saved successfully' : 'New order placed successfully',
      });
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      // Order totals drive the customer's credit figures, so every surface
      // showing a credit bar has to refetch.
      qc.invalidateQueries({ queryKey: customersKeys.all });
      qc.invalidateQueries({ queryKey: khataKeys.all });
      setDrawerOpen(false);
      setCreditPrompt(null);
      form.reset();
      setEditing(null);
    },
    onError: (error) => {
      // The local preview can be stale (e.g. another order was just placed).
      // A 409 means the server still considers this order over the limit, so
      // fall back to the confirmation prompt rather than a dead-end error.
      if (error instanceof ApiClientError && error.status === 409 && form.values.customer_id) {
        // Re-read from cache after invalidating, but fall back to the server's
        // message so the dialog never opens with nothing to show.
        const customer = customersQuery.data?.find((c) => c.id === form.values.customer_id);
        const limit = Number(customer?.credit_limit);
        const used = Math.max(Number(customer?.credit_used ?? 0) - (editing ? Number(editing.total_amount || 0) : 0), 0);
        const total = Number(lineTotal) || 0;
        setCreditPrompt({
          values: form.values,
          block: {
            customerName: customer?.name ?? 'This customer',
            limit: Number.isFinite(limit) ? limit : 0,
            used,
            total,
            projected: used + total,
            overBy: Math.max(used + total - (Number.isFinite(limit) ? limit : 0), 0),
          },
        });
        qc.invalidateQueries({ queryKey: customersKeys.all });
        return;
      }
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const selectedCustomer = useMemo(
    () => customersQuery.data?.find((c) => c.id === form.values.customer_id) ?? null,
    [customersQuery.data, form.values.customer_id],
  );

  // A customer with no limit is never gated, and a zero limit means "no
  // credit" — both are handled by the null/zero check here.
  const creditBlock = useMemo(() => {
    const customer = selectedCustomer;
    if (!customer || customer.credit_limit == null) return null;
    const limit = Number(customer.credit_limit);
    if (!Number.isFinite(limit)) return null;
    const used = Number(customer.credit_used ?? 0);
    const total = Number(lineTotal) || 0;
    // credit_used already counts the order being edited, so discount its
    // current total before adding the edited one. Without this, shrinking an
    // over-limit order would still look blocked.
    const editingTotal = editing ? Number(editing.total_amount || 0) : 0;
    const projected = used - editingTotal + total;
    if (!(projected > limit)) return null;
    return {
      customer,
      limit,
      used: Math.max(used - editingTotal, 0),
      total,
      projected,
      overBy: projected - limit,
    };
  }, [selectedCustomer, lineTotal, editing]);

  const submit = (values: typeof form.values) => {
    if (creditBlock) {
      setCreditPrompt({
        values,
        block: {
          customerName: creditBlock.customer.name,
          limit: creditBlock.limit,
          used: creditBlock.used,
          total: creditBlock.total,
          projected: creditBlock.projected,
          overBy: creditBlock.overBy,
        },
      });
      return;
    }
    saveMutation.mutate({ values });
  };

  const columns: Column<Order>[] = [
    {
      key: 'order_ref',
      header: 'Order',
      sortable: true,
      render: (o) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(`/orders/${o.id}`)}
            className="font-semibold text-brand-700 hover:underline"
          >
            {o.order_ref}
          </button>
          <ReorderBadge order={o} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <span className="text-zinc-600">
          {o.customer_id ? customerMap.get(o.customer_id) ?? '—' : '—'}
        </span>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (o) =>
        o.route_id ? (
          <span className="inline-flex items-center rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {routeMap.get(o.route_id) ?? '—'}
          </span>
        ) : (
          <span className="text-zinc-300">—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      render: (o) => <span className="text-zinc-500">{formatDate(o.created_at)}</span>,
    },
    ...(isDeliveredScope
      ? [
          {
            key: 'delivered_at',
            header: 'Delivered on',
            render: (o: Order) => {
              const at = deliveryByOrder.get(o.id)?.delivered_at;
              return at ? (
                <span className="text-zinc-500">{formatDateTime(at)}</span>
              ) : (
                <span className="text-zinc-300">—</span>
              );
            },
          },
        ]
      : []),
    {
      key: 'count',
      header: 'Items',
      align: 'right',
      render: (o) => (
        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          <Package size={12} />
          {itemCount(o)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) =>
        ['failed', 'cancelled'].includes(o.status) ? (
          <span className="text-zinc-300">—</span>
        ) : (
          <span className="font-semibold text-zinc-800">{formatMoney(o.total_amount)}</span>
        ),
    },
    {
      key: 'payment_status',
      header: 'Payment',
      render: (o) => <StatusBadge status={o.payment_status} />,
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (o) =>
        ['draft', 'cancelled', 'failed'].includes(o.status) ? (
          <span className="text-zinc-300">—</span>
        ) : (
          <button
            type="button"
            onClick={() => router.push(`/orders/${o.id}/invoice`)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            title={`View invoice for ${o.order_ref}`}
          >
            <FilePdf size={14} />
            Invoice
          </button>
        ),
    },
    {
      key: 'status',
      header: 'Order status',
      // Delivered is terminal, so there is no transition to offer — show a
      // read-only badge instead of an empty dropdown.
      render: (o) =>
        isDeliveredScope ? (
          <StatusBadge status={o.status} />
        ) : (
          <Select
            size="xs"
            w={140}
            value={o.status}
            data={[
              { value: o.status, label: o.status.replace(/_/g, ' ') },
              ...nextOrderStatuses(o.status).map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            ]}
            onChange={(v) => v && changeOrderStatus(o, v)}
            disabled={o.status === 'failed' || statusMutation.isPending}
          />
        ),
    },
    {
      key: 'delivery',
      header: 'Delivery',
      render: (o) => {
        const d = deliveryByOrder.get(o.id);
        return d ? <StatusBadge status={d.status} /> : <span className="text-zinc-300">—</span>;
      },
    },
  ];

  const rowActions = [
    {
      label: 'View details',
      icon: <Package size={16} />,
      onClick: (o: Order) => router.push(`/orders/${o.id}`),
    },
    {
      label: 'Edit',
      icon: <PencilSimple size={16} />,
      show: (o: Order) => o.status !== 'failed',
      onClick: (o: Order) => openEdit(o),
    },
    {
      label: 'Create delivery',
      icon: <Truck size={16} />,
      show: (o: Order) =>
        !deliveryOrderIds.has(o.id) && ['ready', 'in_delivery'].includes(o.status),
      onClick: (o: Order) => createDeliveryForOrder(o),
    },
    {
      label: 'Re-order',
      icon: <ArrowsClockwise size={16} />,
      show: (o: Order) => ['failed', 'cancelled'].includes(o.status),
      onClick: (o: Order) => reorder.reorderOrder(o),
    },
  ];

  const hasActiveFilters =
    !!statusFilter || !!customerFilter || dateFilter.mode !== 'all';

  const selectedOrders = useMemo(
    () => scopedOrders.filter((o) => selected.includes(o.id)),
    [scopedOrders, selected],
  );

  // Only statuses every selected order can legally move to (intersection of
  // the per-order next-status sets). Empty means the selection is a mix of
  // states with no shared valid transition.
  const commonNextStatuses = useMemo(() => {
    if (selectedOrders.length === 0) return [];
    let common: string[] | null = null;
    for (const o of selectedOrders) {
      const next = nextOrderStatuses(o.status);
      common = common === null ? next : common.filter((s) => next.includes(s));
      if (common.length === 0) break;
    }
    return common ?? [];
  }, [selectedOrders]);

  const applyBulkStatus = () => {
    if (!bulkStatus || selected.length === 0) return;
    bulkStatusMutation.mutate(
      { orderIds: selected, status: bulkStatus },
      {
        onSuccess: (res) => {
          notifications.show({
            color: 'success',
            title: 'Orders updated',
            message: `Updated ${res.updated} order${res.updated === 1 ? '' : 's'}${
              res.skipped.length > 0 ? ` · skipped ${res.skipped.length}` : ''
            }`,
          });
          setSelected([]);
          setBulkStatus(null);
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Bulk update failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <Group gap="sm">
            <ScopeSwitch scope={scope} />
            <Button
              variant="default"
              leftSection={<DownloadSimple size={16} />}
              onClick={handleExport}
            >
              Export CSV
            </Button>
            {!isDeliveredScope && (
              <Button
                leftSection={<Plus size={16} weight="bold" />}
                onClick={openCreate}
                className="shadow-sm shadow-brand-200"
              >
                New Order
              </Button>
            )}
          </Group>
        }
      />

      {isDeliveredScope ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <OrderStatCard
            icon={<CheckCircle size={22} weight="bold" />}
            label="Delivered orders"
            value={stats.total}
            color="bg-success-50 text-success-700"
          />
          <OrderStatCard
            icon={<Package size={22} weight="bold" />}
            label="Units delivered"
            value={stats.units}
            subtext="Across all delivered orders"
            color="bg-brand-50 text-brand-600"
          />
          <OrderStatCard
            icon={<TrendUp size={22} weight="bold" />}
            label="Order value"
            value={formatMoney(stats.billable.toString())}
            subtext="Excludes failed / cancelled"
            color="bg-brand-50 text-brand-600"
          />
          <OrderStatCard
            icon={<CurrencyDollar size={22} weight="bold" />}
            label="Collected"
            value={formatMoney(stats.paid.toString())}
            subtext="Fully paid orders"
            color="bg-success-50 text-success-700"
          />
          <OrderStatCard
            icon={<HandCoins size={22} weight="bold" />}
            label="Outstanding"
            value={formatMoney(stats.outstanding.toString())}
            subtext="Awaiting payment"
            color="bg-accent-50 text-accent-600"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <OrderStatCard
            icon={<ShoppingCart size={22} weight="bold" />}
            label="Undelivered"
            value={stats.total}
            subtext="Not yet delivered"
            color="bg-brand-50 text-brand-600"
          />
          <OrderStatCard
            icon={<Clock size={22} weight="bold" />}
            label="Pending"
            value={stats.pending}
            subtext="Awaiting processing"
            color="bg-accent-50 text-accent-600"
          />
          <OrderStatCard
            icon={<ArrowsClockwise size={22} weight="bold" />}
            label="Active"
            value={stats.active}
            subtext="In progress"
            color="bg-brand-50 text-brand-600"
          />
          <OrderStatCard
            icon={<Warning size={22} weight="bold" />}
            label="Failed / cancelled"
            value={stats.failed}
            subtext="Need re-order"
            color="bg-danger-50 text-danger-700"
          />
          <OrderStatCard
            icon={<CurrencyDollar size={22} weight="bold" />}
            label="Order value"
            value={formatMoney(stats.billable.toString())}
            subtext="Excludes failed / cancelled"
            color="bg-brand-50 text-brand-600"
          />
        </div>
      )}

      <div>
        <Tabs
          value={routeFilter ?? 'all'}
          onChange={(v) => {
            setRouteFilter(v === 'all' ? null : v);
            setPage(1);
            setSelected([]);
            setBulkStatus(null);
          }}
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="all">All routes</Tabs.Tab>
            {(routesQuery.data ?? []).map((r) => (
              <Tabs.Tab key={r.id} value={r.id}>
                {r.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by order number or customer…"
          filterDefs={[
            // Every row on the delivered page is already 'delivered', so a
            // status select there could only ever have one option.
            ...(isDeliveredScope
              ? []
              : [
                  {
                    type: 'select' as const,
                    key: 'status',
                    label: 'Status',
                    placeholder: 'All statuses',
                    options: ORDER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
                  },
                ]),
            {
              type: 'select' as const,
              key: 'customerId',
              label: 'Customer',
              placeholder: 'Any customer',
              options: customerOptions,
            },
            {
              type: 'rangedate' as const,
              key: 'createdRange',
              label: 'Order date',
            },
          ]}
          filterValues={
            {
              status: statusFilter,
              customerId: customerFilter,
              createdRange: dateFilter,
            } as Filters
          }
          onFiltersChange={(f) => {
            setStatusFilter((f.status as string | null) ?? null);
            setCustomerFilter((f.customerId as string | null) ?? null);
            setDateFilter((f.createdRange as DateRangeValue) ?? EMPTY_DATE_RANGE);
            setPage(1);
          }}
          onClear={() => {
            setSearch('');
            setStatusFilter(null);
            setCustomerFilter(null);
            setDateFilter(EMPTY_DATE_RANGE);
            setRouteFilter(null);
            setSelected([]);
            setPage(1);
          }}
          hasActiveFilters={hasActiveFilters}
        />

        <DataTable
          columns={columns}
          data={paged}
          loading={ordersQuery.isLoading}
          error={ordersQuery.isError}
          retry={() => ordersQuery.refetch()}
          isPermissionDenied={(ordersQuery.error as { status?: number } | undefined)?.status === 403}
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          rowActions={rowActions}
          getRowId={(o) => o.id}
          rowClassName={(o) => (o.status === 'failed' ? 'opacity-50' : undefined)}
          selectable={!isDeliveredScope}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          minWidth={1000}
          emptyTitle={meta.emptyTitle}
          emptyDescription={meta.emptyDescription}
        />

        {!isDeliveredScope && selected.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3">
            <Text size="sm" fw={600} className="text-brand-800">
              {selected.length} selected
            </Text>
            <Select
              size="xs"
              w={180}
              placeholder="Change status to…"
              data={commonNextStatuses.map((s) => ({
                value: s,
                label: s.replace(/_/g, ' '),
              }))}
              value={bulkStatus}
              onChange={setBulkStatus}
              disabled={commonNextStatuses.length === 0}
            />
            <Button
              size="xs"
              loading={bulkStatusMutation.isPending}
              disabled={!bulkStatus}
              onClick={applyBulkStatus}
            >
              Apply
            </Button>
            {commonNextStatuses.length === 0 && (
              <Text size="xs" c="dimmed">
                No shared valid transition for this selection
              </Text>
            )}
            <Group ml="auto">
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setSelected([]);
                  setBulkStatus(null);
                }}
              >
                Clear
              </Button>
            </Group>
          </div>
        )}

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <Drawer
        opened={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          form.reset();
          setEditing(null);
        }}
        title={
          <div>
            <Text fw={700} size="lg">{editing ? `Edit ${editing.order_ref}` : 'New Order'}</Text>
            <Text size="xs" c="dimmed" className="mt-0.5">
              {editing ? 'Update the order details below' : 'Fill in the details to create a new order'}
            </Text>
          </div>
        }
        position="right"
        size="lg"
        padding="lg"
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="lg">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
              <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
                Order details
              </Text>
              <Stack gap="md">
<Group grow>
                <CustomerSelect
                  label="Customer"
                  value={form.values.customer_id ?? null}
                  onChange={(v) => setCustomer(v ?? undefined)}
                />
              </Group>
                <Textarea
                  label="Notes"
                  placeholder="Add any order notes here…"
                  autosize
                  minRows={2}
                  {...form.getInputProps('notes')}
                />
              </Stack>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Text fw={600} size="sm" className="text-zinc-700">
                  Line items
                </Text>
                <Text size="xs" c="dimmed">{items.length} items</Text>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
                <Table verticalSpacing="sm" horizontalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr className="text-zinc-400">
                      <Table.Th className="text-xs font-semibold uppercase tracking-wider">Product</Table.Th>
                      <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={80}>Qty</Table.Th>
                      <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={110} ta="right">Unit price</Table.Th>
                      <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={110} ta="right">Total</Table.Th>
                      <Table.Th w={40} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((it, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td>
                          <Select
                            size="xs"
                            placeholder="Select product…"
                            searchable
                            data={variantOptions.map((o) => ({ value: o.value, label: o.label }))}
                            value={it.variant_id || null}
                            onChange={(v) => v && onVariantSelect(idx, v)}
                          />
                        </Table.Td>
                        <Table.Td>
                          <div className="flex flex-col gap-1">
                            <NumberInput
                              size="xs"
                              w={80}
                              min={0}
                              max={availableFor(it.variant_id)}
                              allowDecimal={false}
                              value={it.quantity}
                              onChange={(v) => updateLine(idx, { quantity: Math.min(Number(v) || 0, availableFor(it.variant_id)) })}
                            />
                            {it.variant_id && (
                              <span
                                className={`text-[10px] font-medium ${
                                  availableFor(it.variant_id) === 0 ? 'text-danger-500' : 'text-zinc-400'
                                }`}
                              >
                                {availableFor(it.variant_id) === 0 ? 'Out of stock' : `${availableFor(it.variant_id)} available`}
                              </span>
                            )}
                          </div>
                        </Table.Td>
                        <Table.Td ta="right">
                          <div className="flex flex-col items-end gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={it.unit_price}
                              onChange={(e) => updateLine(idx, { unit_price: e.currentTarget.value })}
                              className="h-8 w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-right text-sm outline-none focus:border-brand-400 focus:bg-white"
                            />
                            {(() => {
                              const unit = variantOptions.find((o) => o.value === it.variant_id)?.data.unit;
                              return unit ? (
                                <span className="text-[10px] font-medium text-zinc-400">per {unit}</span>
                              ) : null;
                            })()}
                          </div>
                        </Table.Td>
                        <Table.Td ta="right" fw={600} className="text-zinc-800">
                          {formatMoney(((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toString())}
                        </Table.Td>
                        <Table.Td>
                          <button
                            type="button"
                            aria-label="Remove line"
                            onClick={() => removeLine(idx)}
                            className="rounded-lg p-1 text-zinc-300 transition-colors hover:bg-danger-50 hover:text-danger-500"
                          >
                            <Trash size={14} />
                          </button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
              <Button
                variant="subtle"
                size="xs"
                onClick={addLine}
                leftSection={<Plus size={14} />}
                mt="sm"
                color="gray"
              >
                Add line item
              </Button>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm" c="dimmed">
                  {items.filter((it) => it.variant_id).length} items · {items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)} units
                </Text>
                <Text fw={700} size="lg">
                  Total: {formatMoney(lineTotal.toString())}
                </Text>
              </div>
              {/* Live warning before the user even tries to submit. */}
              {creditBlock && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
                  <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-warning-600" />
                  <Text size="xs" className="text-warning-800">
                    This order takes {creditBlock.customer.name} {formatMoney(creditBlock.overBy.toString())} past their{' '}
                    {formatMoney(creditBlock.limit.toString())} credit limit. You will be asked to confirm before saving.
                  </Text>
                </div>
              )}
            </div>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                onClick={() => setDrawerOpen(false)}
                size="md"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={saveMutation.isPending}
                size="md"
                className="shadow-sm shadow-brand-200"
              >
                {editing ? 'Save changes' : 'Create order'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>

      <Modal
        opened={!!creditPrompt}
        onClose={() => setCreditPrompt(null)}
        title={
          <div>
            <Text fw={700} size="lg">Credit limit exceeded</Text>
            <Text size="xs" c="dimmed" className="mt-0.5">
              This order can still be placed — confirm below.
            </Text>
          </div>
        }
        centered
        radius="xl"
        size="md"
      >
        {creditPrompt && (
          <Stack gap="md">
            <Alert
              color="warning"
              variant="light"
              icon={<Warning size={18} weight="fill" />}
              title={`${creditPrompt.block.customerName} is over their credit limit`}
            >
              {creditPrompt.block.limit === 0 ? (
                <>
                  This customer has no credit, so the {formatMoney(creditPrompt.block.total.toString())}{' '}
                  order takes them over by {formatMoney(creditPrompt.block.total.toString())}.
                </>
              ) : (
                <>
                  You are about to add {formatMoney(creditPrompt.block.total.toString())} to an
                  outstanding {formatMoney(creditPrompt.block.used.toString())}, taking the total to{' '}
                  {formatMoney(creditPrompt.block.projected.toString())} against a limit of{' '}
                  {formatMoney(creditPrompt.block.limit.toString())}.
                </>
              )}
            </Alert>

            {creditPrompt.block.limit > 0 && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
                <CreditLimitBar
                  figures={{
                    credit_limit: String(creditPrompt.block.limit),
                    credit_used: String(creditPrompt.block.projected),
                  }}
                />
              </div>
            )}

            <Text size="xs" c="dimmed">
              Continuing records the order normally. Settle the khata balance or raise the
              customer&apos;s credit limit to bring the usage back down.
            </Text>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                onClick={() => setCreditPrompt(null)}
                size="md"
              >
                Go back
              </Button>
              <Button
                color="warning"
                loading={saveMutation.isPending}
                size="md"
                onClick={() => {
                  const values = creditPrompt.values;
                  setCreditPrompt(null);
                  saveMutation.mutate({ values, overrideCreditLimit: true });
                }}
              >
                Continue anyway
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
