'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Table, Text, ActionIcon, Input } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PencilSimple, MapPin, Phone, Envelope, BuildingOffice, Check, X } from '@phosphor-icons/react';
import { useCustomer, useCustomerPrices, useCustomerOrders, customersKeys } from '@/features/customers/api';
import { useProducts, defaultVariantPrice } from '@/features/products/api';
import { LoadingState, ErrorState, StatusBadge } from '@/components/shared';
import { formatMoney, formatDate } from '@/lib/format';
import { apiClient } from '@/lib/api-client';

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading, isError, refetch } = useCustomer(params.id);
  const pricesQuery = useCustomerPrices(params.id);
  const ordersQuery = useCustomerOrders(params.id);
  const productsQuery = useProducts();

  const variantMap = useMemo(() => {
    const m = new Map<string, { product_name: string; variant_name: string; default_price: string }>();
    for (const p of productsQuery.data ?? []) {
      for (const v of p.variants) {
        m.set(v.id, {
          product_name: p.name,
          variant_name: v.name,
          default_price: defaultVariantPrice(v),
        });
      }
    }
    return m;
  }, [productsQuery.data]);

  // Filter defensively on the client so only this customer's orders are ever shown,
  // even if a stale/older backend ignores the customer_id query param.
  const orders = useMemo(
    () => (ordersQuery.data ?? []).filter((o) => o.customer_id === customer?.id),
    [ordersQuery.data, customer?.id],
  );
  const totalRevenue = orders
    .filter((o) => !['failed', 'cancelled'].includes(o.status))
    .reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const priceMap = useMemo(() => {
    const m = new Map<string, { id: string; price: string }>();
    for (const cp of pricesQuery.data ?? []) m.set(cp.variant_id, { id: cp.id, price: cp.price });
    return m;
  }, [pricesQuery.data]);

  const overrideCount = priceMap.size;
  const allVariantRows = useMemo(
    () =>
      [...variantMap.entries()].map(([variantId, info]) => ({
        variantId,
        productName: info.product_name,
        variantName: info.variant_name,
        defaultPrice: info.default_price,
        override: priceMap.get(variantId)?.price ?? '',
      })),
    [variantMap, priceMap],
  );

  const qc = useQueryClient();
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const priceMutation = useMutation({
    mutationFn: async ({ variantId, price }: { variantId: string; price: string }) => {
      if (!customer) return;
      const trimmed = price.trim();
      if (!trimmed) {
        await apiClient.delete(`/customers/${customer.id}/prices/${variantId}`);
      } else {
        await apiClient.post(`/customers/${customer.id}/prices`, {
          variant_id: variantId,
          price: trimmed,
          currency: 'INR',
        });
      }
      qc.invalidateQueries({ queryKey: customersKeys.prices(customer.id) });
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: 'Price updated',
        message: 'Customer pricing saved',
      });
      setEditingVariantId(null);
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const startEdit = (variantId: string, current: string) => {
    setEditingVariantId(variantId);
    setEditValue(current);
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!customer) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-4">
          <Button
            variant="subtle"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => router.push('/customers')}
            color="gray"
          >
            Back to customers
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 text-xl font-bold">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <Text fw={700} size="xl" className="leading-tight">
                  {customer.name}
                </Text>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    customer.is_active
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${customer.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  {customer.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <Text size="sm" c="dimmed" className="mt-0.5">
                {customer.company ?? 'No company'} · {customer.city ?? 'No city'}
              </Text>
            </div>
          </div>
          <Button
            variant="default"
            leftSection={<PencilSimple size={16} />}
            onClick={() => router.push(`/customers/${customer.id}/edit`)}
          >
            Edit customer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Envelope size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Email</Text>
          <Text fw={600} size="sm" className="mt-0.5 truncate">{customer.email || '—'}</Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Phone size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Phone</Text>
          <Text fw={600} size="sm" className="mt-0.5">{customer.phone || '—'}</Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <MapPin size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>City</Text>
          <Text fw={600} size="sm" className="mt-0.5">{customer.city || '—'}</Text>
          {customer.latitude && customer.longitude && (
            <div className="mt-1.5 space-y-0.5">
              <Text fw={600} size="sm" className="text-zinc-800">
                {Number(customer.latitude).toFixed(6)}, {Number(customer.longitude).toFixed(6)}
              </Text>
              <a
                href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Open in Google Maps
              </a>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <BuildingOffice size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total orders</Text>
          <Text fw={700} size="lg" className="mt-0.5">{orders.length}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {formatMoney(totalRevenue)} total revenue
          </Text>
        </div>
      </div>

      {customer.address && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <Text fw={600} size="sm" mb="xs" className="text-zinc-700">Address</Text>
          <Text size="sm" className="text-zinc-600">{customer.address}</Text>
        </div>
      )}

      {customer.notes && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <Text fw={600} size="sm" mb="xs" className="text-zinc-700">Notes</Text>
          <Text size="sm" className="text-zinc-600">{customer.notes}</Text>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">Product pricing</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {overrideCount} custom price overrides
          </Text>
        </div>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="text-zinc-400">
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Product</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Variant</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Default price</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Override price</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {allVariantRows.map((row) => {
              const isEditing = editingVariantId === row.variantId;
              return (
                <Table.Tr key={row.variantId}>
                  <Table.Td>
                    <span className="font-medium text-zinc-800">{row.productName}</span>
                  </Table.Td>
                  <Table.Td>
                    <span className="text-zinc-500">{row.variantName}</span>
                  </Table.Td>
                  <Table.Td ta="right">
                    <span className="text-zinc-500">{formatMoney(row.defaultPrice)}</span>
                  </Table.Td>
                  <Table.Td ta="right">
                    {isEditing ? (
                      <Input
                        size="xs"
                        value={editValue}
                        onChange={(e) => setEditValue(e.currentTarget.value)}
                        rightSection={
                          <span className="flex items-center gap-0.5">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="green"
                              loading={priceMutation.isPending}
                              onClick={() =>
                                priceMutation.mutate({
                                  variantId: row.variantId,
                                  price: editValue,
                                })
                              }
                            >
                              <Check size={14} />
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              onClick={() => setEditingVariantId(null)}
                            >
                              <X size={14} />
                            </ActionIcon>
                          </span>
                        }
                      />
                    ) : row.override ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold text-zinc-800">{formatMoney(row.override)}</span>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => startEdit(row.variantId, String(Number(row.override)))}
                        >
                          <PencilSimple size={14} />
                        </ActionIcon>
                      </span>
                    ) : (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="brand"
                        onClick={() => startEdit(row.variantId, '')}
                        title="Add override"
                      >
                        <PencilSimple size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {!isEditing && row.override && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        disabled={priceMutation.isPending}
                        onClick={() =>
                          priceMutation.mutate({ variantId: row.variantId, price: '' })
                        }
                        title="Remove override"
                      >
                        <X size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {allVariantRows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5} c="dimmed" ta="center" py="lg">
                  No products available to price.
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">Orders</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {orders.length} orders placed
          </Text>
        </div>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="text-zinc-400">
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Order</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Items</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Payment</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Total</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Date</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {orders.map((order) => (
              <Table.Tr
                key={order.id}
                className="cursor-pointer hover:bg-zinc-50"
                onClick={() => router.push(`/orders/${order.id}`)}
              >
                <Table.Td>
                  <span className="font-mono text-sm font-semibold text-zinc-800">
                    {order.order_ref}
                  </span>
                </Table.Td>
                <Table.Td>
                  <span className="text-zinc-600">{order.items.length} items</span>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={order.status} />
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={order.payment_status} />
                </Table.Td>
                <Table.Td ta="right">
                  {['failed', 'cancelled'].includes(order.status) ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <span className="font-semibold text-zinc-800">
                      {formatMoney(order.total_amount)}
                    </span>
                  )}
                </Table.Td>
                <Table.Td>
                  <span className="text-zinc-500">{formatDate(order.created_at)}</span>
                </Table.Td>
              </Table.Tr>
            ))}
            {orders.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6} c="dimmed" ta="center" py="lg">
                  No orders yet
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
    </div>
  );
}
