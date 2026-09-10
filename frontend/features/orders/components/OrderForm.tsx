'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { ordersKeys } from '../api';
import type { Order } from '../api';
import { useProducts, defaultVariantPrice } from '../../products/api';
import type { Variant } from '../../products/api';
import { useCustomers } from '../../customers/api';
import type { CustomerPrice } from '../../customers/api';

const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];

type LineItem = {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: string;
};

export default function OrderForm({
  order,
  onDone,
}: {
  order?: Order;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const customersQuery = useCustomers();
  const productsQuery = useProducts();

  const [items, setItems] = useState<LineItem[]>(
    order
      ? order.items.map((it) => ({
          product_id: it.product_id ?? '',
          variant_id: it.variant_id ?? '',
          product_name: it.product_name,
          variant_name: it.variant_name ?? '',
          quantity: Number(it.quantity),
          unit_price: String(Number(it.unit_price)),
        }))
      : [],
  );
  const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>([]);

  const form = useForm({
    initialValues: {
      customer_id: (order?.customer_id ?? undefined) as string | undefined,
      notes: order?.notes ?? '',
      payment_status: order?.payment_status ?? 'unpaid',
    },
  });

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

  const lineTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  }, [items]);

  const heldByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of order?.items ?? []) {
      if (it.variant_id) map.set(it.variant_id, (map.get(it.variant_id) ?? 0) + (Number(it.quantity) || 0));
    }
    return map;
  }, [order]);

  const variantById = (variantId: string) => {
    return variantOptions.find((o) => o.value === variantId);
  };

  const availableFor = (variantId: string): number => {
    if (!variantId) return 0;
    const variant = variantById(variantId);
    const stock = variant ? variant.data.stock_quantity || 0 : 0;
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
      if (order) {
        await apiClient.patch(`/orders/${order.id}`, payload);
      } else {
        await apiClient.post('/orders', payload);
      }
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: order ? 'Order updated' : 'Order created',
        message: order ? 'Changes saved successfully' : 'New order placed successfully',
      });
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      onDone?.();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  return (
    <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
      <Stack gap="lg">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
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

        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
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

        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
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
          <Button variant="default" onClick={onDone} size="md">
            Cancel
          </Button>
          <Button
            type="submit"
            loading={saveMutation.isPending}
            size="md"
            className="shadow-sm shadow-brand-200"
          >
            {order ? 'Save changes' : 'Create order'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
