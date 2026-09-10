'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Badge,
  Divider,
  Card,
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
} from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { useOrders, ordersKeys, itemCount, useOrderStatusUpdate, useCreateDeliveryForOrder, useBulkOrderStatusUpdate, nextOrderStatuses } from '../api';
import type { Order } from '../api';
import { useDeliveries } from '../../deliveries/api';
import type { Delivery } from '../../deliveries/api';
import { useProducts, defaultVariantPrice } from '../../products/api';
import type { Variant } from '../../products/api';
import { useCustomers } from '../../customers/api';
import type { CustomerPrice } from '../../customers/api';
import { useRoutes } from '../../routes/api';

type LineItem = {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: string;
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
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];

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

export default function OrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const ordersQuery = useOrders();
  const productsQuery = useProducts();
  const customersQuery = useCustomers();
  const deliveriesQuery = useDeliveries();
  const routesQuery = useRoutes();
  const statusMutation = useOrderStatusUpdate();
  const createDeliveryMutation = useCreateDeliveryForOrder();
  const bulkStatusMutation = useBulkOrderStatusUpdate();

  const paymentMutation = useMutation({
    mutationFn: async ({ orderId, paymentStatus }: { orderId: string; paymentStatus: string }) => {
      await apiClient.patch(`/orders/${orderId}`, { payment_status: paymentStatus });
    },
    onSuccess: (_data, vars) => {
      notifications.show({
        color: 'success',
        title: 'Payment updated',
        message: `Marked ${vars.paymentStatus.replace(/_/g, ' ')}`,
      });
      qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const changePaymentStatus = (order: Order, paymentStatus: string) => {
    if (paymentStatus === order.payment_status) return;
    paymentMutation.mutate({ orderId: order.id, paymentStatus });
  };

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
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
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
      payment_status: 'unpaid',
    },
  });

  const allOrders = ordersQuery.data ?? [];

  const stats = useMemo(() => {
    const total = allOrders.length;
    const pending = allOrders.filter((o) => ['draft', 'confirmed'].includes(o.status)).length;
    const active = allOrders.filter((o) =>
      ['ready', 'assigned', 'picked_up', 'in_transit', 'in_delivery'].includes(o.status),
    ).length;
    const completed = allOrders.filter((o) => o.status === 'delivered').length;
    const revenue = allOrders.filter((o) => o.payment_status === 'paid' && !['failed', 'cancelled'].includes(o.status)).reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return { total, pending, active, completed, revenue };
  }, [allOrders]);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customersQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [customersQuery.data]);

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
    let rows = [...allOrders];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          o.order_ref.toLowerCase().includes(needle) ||
          (customerMap.get(o.customer_id ?? '') ?? '').toLowerCase().includes(needle),
      );
    }
    if (statusFilter) rows = rows.filter((o) => o.status === statusFilter);
    if (routeFilter) rows = rows.filter((o) => o.route_id === routeFilter);
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.field as keyof Order] ?? '';
      const bv = b[sort.field as keyof Order] ?? '';
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [allOrders, search, statusFilter, routeFilter, sort, customerMap]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

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
      payment_status: order.payment_status,
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
    mutationFn: async (values: typeof form.values) => {
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
        payment_status: values.payment_status,
        items: validItems,
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
      setDrawerOpen(false);
      form.reset();
      setEditing(null);
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const columns: Column<Order>[] = [
    {
      key: 'order_ref',
      header: 'Order',
      sortable: true,
      render: (o) => (
        <button
          type="button"
          onClick={() => router.push(`/orders/${o.id}`)}
          className="font-semibold text-brand-700 hover:underline"
        >
          {o.order_ref}
        </button>
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
      render: (o) => (
        <Select
          size="xs"
          w={130}
          value={o.payment_status}
          data={PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
          onChange={(v) => v && changePaymentStatus(o, v)}
          disabled={o.status === 'failed' || paymentMutation.isPending}
        />
      ),
    },
    {
      key: 'status',
      header: 'Order status',
      render: (o) => (
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
  ];

  const hasActiveFilters = !!statusFilter || !!routeFilter;

  const selectedOrders = useMemo(
    () => allOrders.filter((o) => selected.includes(o.id)),
    [allOrders, selected],
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
        title="Orders"
        subtitle="Create and manage your sales orders"
        actions={
          <Button
            leftSection={<Plus size={16} weight="bold" />}
            onClick={openCreate}
            className="shadow-sm shadow-brand-200"
          >
            New Order
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <OrderStatCard
          icon={<ShoppingCart size={22} weight="bold" />}
          label="Total orders"
          value={stats.total}
          color="bg-brand-50 text-brand-600"
        />
        <OrderStatCard
          icon={<Clock size={22} weight="bold" />}
          label="Pending"
          value={stats.pending}
          subtext="Awaiting processing"
          color="bg-amber-50 text-amber-600"
        />
        <OrderStatCard
          icon={<ArrowsClockwise size={22} weight="bold" />}
          label="Active"
          value={stats.active}
          subtext="In progress"
          color="bg-blue-50 text-blue-600"
        />
        <OrderStatCard
          icon={<TrendUp size={22} weight="bold" />}
          label="Completed"
          value={stats.completed}
          subtext="Delivered"
          color="bg-emerald-50 text-emerald-600"
        />
        <OrderStatCard
          icon={<CurrencyDollar size={22} weight="bold" />}
          label="Revenue"
          value={formatMoney(stats.revenue)}
          subtext="Paid orders"
          color="bg-violet-50 text-violet-600"
        />
      </div>

      <div>
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by order number or customer…"
          filterDefs={[
            {
              type: 'select',
              key: 'status',
              label: 'Status',
              placeholder: 'All statuses',
              options: ORDER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            },
            {
              type: 'select',
              key: 'route',
              label: 'Route',
              placeholder: 'All routes',
              options: (routesQuery.data ?? []).map((r) => ({ value: r.id, label: r.name })),
            },
          ]}
          filterValues={{ status: statusFilter, route: routeFilter }}
          onFiltersChange={(f) => {
            setStatusFilter((f.status as string | null) ?? null);
            setRouteFilter((f.route as string | null) ?? null);
            setPage(1);
          }}
          onClear={() => {
            setSearch('');
            setStatusFilter(null);
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
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          minWidth={1000}
          emptyTitle="No orders found"
          emptyDescription="Create your first order to get started."
        />

        {selected.length > 0 && (
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
        <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
          <Stack gap="lg">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
              <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
                Order details
              </Text>
              <Stack gap="md">
                <Group grow>
                  <Select
                    label="Customer"
                    placeholder="Select customer"
                    clearable
                    searchable
                    data={(customersQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                    value={form.values.customer_id}
                    onChange={(v) => setCustomer(v ?? undefined)}
                  />
                  <Select
                    label="Payment status"
                    data={PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                    {...form.getInputProps('payment_status')}
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
              <div className="mb-3 flex items-center justify-between">
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
                                  availableFor(it.variant_id) === 0 ? 'text-red-500' : 'text-zinc-400'
                                }`}
                              >
                                {availableFor(it.variant_id) === 0 ? 'Out of stock' : `${availableFor(it.variant_id)} available`}
                              </span>
                            )}
                          </div>
                        </Table.Td>
                        <Table.Td ta="right">
                          <input
                            type="number"
                            step="0.01"
                            value={it.unit_price}
                            onChange={(e) => updateLine(idx, { unit_price: e.currentTarget.value })}
                            className="h-8 w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-right text-sm outline-none focus:border-brand-400 focus:bg-white"
                          />
                        </Table.Td>
                        <Table.Td ta="right" fw={600} className="text-zinc-800">
                          {formatMoney(((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toString())}
                        </Table.Td>
                        <Table.Td>
                          <button
                            type="button"
                            aria-label="Remove line"
                            onClick={() => removeLine(idx)}
                            className="rounded-lg p-1 text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500"
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
              <div className="flex items-center justify-between">
                <Text size="sm" c="dimmed">
                  {items.filter((it) => it.variant_id).length} items · {items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)} units
                </Text>
                <Text fw={700} size="lg">
                  Total: {formatMoney(lineTotal.toString())}
                </Text>
              </div>
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
    </div>
  );
}
