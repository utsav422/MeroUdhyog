'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, NumberInput, Group, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  PencilSimple,
  TrashSimple,
  Plus,
  Package,
  Tag,
  StackSimple,
  CurrencyDollar,
  Barbell,
  Info,
  Check,
} from '@phosphor-icons/react';
import {
  useProduct,
  useCategories,
  defaultVariantPrice,
  productsKeys,
  inventoryKeys,
} from '@/features/products/api';
import type { Variant } from '@/features/products/api';
import { LoadingState, ErrorState } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';

type EditableRow = {
  id: string | null;
  priceId: string | null;
  key: string;
  name: string;
  sku: string;
  size: string;
  size_type: string;
  stock_quantity: number;
  low_stock_threshold: number;
  price: number;
  wholesale_price: number;
  cost_price: number;
  mrp_price: number;
};

function seedRows(variants: Variant[]): EditableRow[] {
  return variants.map((v) => {
    const active = v.prices.find((p) => p.is_active) ?? v.prices[0];
    return {
      id: v.id,
      priceId: active?.id ?? null,
      key: v.id,
      name: v.name,
      sku: v.sku ?? '',
      size: v.size ?? '',
      size_type: v.size_type ?? '',
      stock_quantity: v.stock_quantity ?? 0,
      low_stock_threshold: v.low_stock_threshold ?? 5,
      price: Number(active?.price ?? 0),
      wholesale_price: Number(active?.wholesale_price ?? 0),
      cost_price: Number(active?.cost_price ?? 0),
      mrp_price: Number(active?.mrp_price ?? 0),
    };
  });
}

function toUnit(v: number | string | undefined): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useProduct(params.id);
  const categoriesQuery = useCategories();

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [original, setOriginal] = useState<Map<string, EditableRow>>(new Map());

  const startEditing = () => {
    if (!data) return;
    const seeded = seedRows(data.variants);
    setRows(seeded);
    setOriginal(new Map(seeded.filter((r) => r.id).map((r) => [r.id as string, r])));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setRows(null);
    setOriginal(new Map());
  };

  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => (prev ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...(prev ?? []),
      {
        id: null,
        priceId: null,
        key: `new-${Math.random().toString(36).slice(2)}`,
        name: '',
        sku: '',
        size: '',
        size_type: '',
        stock_quantity: 0,
        low_stock_threshold: 5,
        price: 0,
        wholesale_price: 0,
        cost_price: 0,
        mrp_price: 0,
      },
    ]);
  };

  const invalidateInventory = () => {
    qc.invalidateQueries({ queryKey: inventoryKeys.all });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data || !rows) return;
      for (const row of rows) {
        if (!row.id) {
          if (!row.name.trim()) {
            throw new Error('Every new variant needs a name.');
          }
          await apiClient.post(`/products/${data.id}/variants`, {
            name: row.name.trim(),
            sku: row.sku.trim() || null,
            size: row.size.trim() || null,
            size_type: row.size_type.trim() || null,
            stock_quantity: toUnit(row.stock_quantity),
            low_stock_threshold: toUnit(row.low_stock_threshold),
            sort_order: 0,
            prices: [
              {
                price: row.price,
                wholesale_price: row.wholesale_price || null,
                cost_price: row.cost_price || null,
                mrp_price: row.mrp_price || null,
              },
            ],
          });
          continue;
        }
        const orig = original.get(row.id);
        if (!orig) continue;

        const variantPatch: Record<string, unknown> = {};
        if (row.name !== orig.name) variantPatch.name = row.name;
        if ((row.sku.trim() || null) !== orig.sku) variantPatch.sku = row.sku.trim() || null;
        if ((row.size.trim() || null) !== orig.size) variantPatch.size = row.size.trim() || null;
        if ((row.size_type.trim() || null) !== orig.size_type) {
          variantPatch.size_type = row.size_type.trim() || null;
        }
        if (toUnit(row.stock_quantity) !== toUnit(orig.stock_quantity)) {
          variantPatch.stock_quantity = toUnit(row.stock_quantity);
        }
        if (toUnit(row.low_stock_threshold) !== toUnit(orig.low_stock_threshold)) {
          variantPatch.low_stock_threshold = toUnit(row.low_stock_threshold);
        }
        if (Object.keys(variantPatch).length > 0) {
          await apiClient.patch(`/products/${data.id}/variants/${row.id}`, variantPatch);
        }

        if (row.priceId) {
          const pricePatch: Record<string, unknown> = {};
          if (row.price !== orig.price) pricePatch.price = row.price;
          if (row.wholesale_price !== orig.wholesale_price) pricePatch.wholesale_price = row.wholesale_price || null;
          if (row.cost_price !== orig.cost_price) pricePatch.cost_price = row.cost_price || null;
          if (row.mrp_price !== orig.mrp_price) pricePatch.mrp_price = row.mrp_price || null;
          if (Object.keys(pricePatch).length > 0) {
            await apiClient.patch(
              `/products/${data.id}/variants/${row.id}/prices/${row.priceId}`,
              pricePatch,
            );
          }
        }
      }
    },
    onSuccess: async () => {
      notifications.show({
        color: 'success',
        title: 'Product updated',
        message: 'Variants, stock and prices saved',
      });
      qc.invalidateQueries({ queryKey: productsKeys.all });
      invalidateInventory();
      cancelEditing();
      await refetch();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (variantId: string) => {
      if (!data) return;
      await apiClient.delete(`/products/${data.id}/variants/${variantId}`);
    },
    onSuccess: async () => {
      notifications.show({
        color: 'success',
        title: 'Variant deleted',
        message: 'Removed from the product',
      });
      qc.invalidateQueries({ queryKey: productsKeys.all });
      invalidateInventory();
      await refetch();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  const category = categoriesQuery.data?.find((c) => c.id === data.category_id);
  const totalValue = data.variants.reduce((s, v) => s + Number(defaultVariantPrice(v) || 0), 0);
  const totalCost = data.variants.reduce((s, v) => s + Number(v.prices[0]?.cost_price || 0), 0);
  const totalStock = data.variants.reduce((s, v) => s + (v.stock_quantity ?? 0), 0);
  const activeVariants = data.variants.filter((v) => v.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Group mb="md">
          <Button
            variant="subtle"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => router.push('/products')}
            color="gray"
          >
            Back to products
          </Button>
        </Group>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Package size={28} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <Text fw={700} size="xl" className="leading-tight">
                  {data.name}
                </Text>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    data.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${data.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  {data.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <Text size="sm" c="dimmed" className="mt-0.5">
                {data.sku ?? 'No SKU'} · {category?.name ?? 'Uncategorized'}
              </Text>
            </div>
          </div>
          <Group gap="sm">
            <Button
              variant={editing ? 'light' : 'default'}
              leftSection={<PencilSimple size={16} />}
              onClick={editing ? cancelEditing : startEditing}
            >
              {editing ? 'Cancel editing' : 'Edit variants'}
            </Button>
            <Button
              variant="default"
              leftSection={<Info size={16} />}
              onClick={() => router.push(`/products/${data.id}/edit`)}
            >
              Edit product
            </Button>
          </Group>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CurrencyDollar size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total value</Text>
          <Text fw={700} size="lg" className="mt-0.5">{formatMoney(totalValue)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Across all variants</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Barbell size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total cost</Text>
          <Text fw={700} size="lg" className="mt-0.5">{formatMoney(totalCost)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Cost of goods</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <StackSimple size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Units in stock</Text>
          <Text fw={700} size="lg" className="mt-0.5">{totalStock}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Across all variants</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Tag size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Variants</Text>
          <Text fw={700} size="lg" className="mt-0.5">{data.variants.length}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">{activeVariants} active</Text>
        </div>
      </div>

      {data.description && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Info size={18} className="text-zinc-500" />
            <Text fw={600} size="sm" className="text-zinc-700">Description</Text>
          </div>
          <Text size="sm" className="leading-relaxed text-zinc-600">{data.description}</Text>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Text fw={600} size="md" className="text-zinc-800">Variants & pricing</Text>
              <Text size="xs" c="dimmed" className="mt-0.5">
                {editing
                  ? 'Edit stock and prices inline, then press Update'
                  : `${data.variants.length} variants configured`}
              </Text>
            </div>
            {editing && (
              <Button
                variant="light"
                size="xs"
                leftSection={<Plus size={14} />}
                onClick={addRow}
              >
                Add variant
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">#</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Variant</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">SKU</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Size</Table.Th>
                {editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Stock</Table.Th>}
                {editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Threshold</Table.Th>}
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Price</Table.Th>
                {editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Wholesale</Table.Th>}
                {editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Cost</Table.Th>}
                {editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">MRP</Table.Th>}
                {!editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Cost</Table.Th>}
                {!editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Margin</Table.Th>}
                {!editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Stock</Table.Th>}
                {!editing && <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>}
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {!editing &&
                data.variants.map((v, idx) => {
                  const price = Number(defaultVariantPrice(v) || 0);
                  const cost = Number(v.prices[0]?.cost_price || 0);
                  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
                  const stock = v.stock_quantity ?? 0;
                  const low = stock <= (v.low_stock_threshold ?? 5);
                  return (
                    <Table.Tr key={v.id}>
                      <Table.Td>
                        <span className="text-xs text-zinc-400">{idx + 1}</span>
                      </Table.Td>
                      <Table.Td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <Package size={14} weight="duotone" />
                          </div>
                          <span className="font-medium text-zinc-800">{v.name}</span>
                        </div>
                      </Table.Td>
                      <Table.Td>
                        <span className="rounded-lg bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">
                          {v.sku ?? '—'}
                        </span>
                      </Table.Td>
                      <Table.Td>
                        <span className="text-zinc-500">
                          {v.size ? `${v.size}${v.size_type ? ` ${v.size_type}` : ''}` : '—'}
                        </span>
                      </Table.Td>
                      <Table.Td ta="right">
                        <span className="font-semibold text-zinc-800">{formatMoney(defaultVariantPrice(v))}</span>
                      </Table.Td>
                      <Table.Td ta="right">
                        <span className="text-zinc-600">
                          {v.prices[0]?.cost_price ? formatMoney(v.prices[0].cost_price) : '—'}
                        </span>
                      </Table.Td>
                      <Table.Td ta="right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            margin > 0 ? 'bg-emerald-50 text-emerald-600' : margin < 0 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {price > 0 ? `${margin}%` : '—'}
                        </span>
                      </Table.Td>
                      <Table.Td ta="right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
                            low && stock === 0
                              ? 'bg-red-50 text-red-700'
                              : low
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {stock}
                          {low && stock === 0 && <span className="text-[10px] uppercase">out</span>}
                          {low && stock > 0 && <span className="text-[10px] uppercase">low</span>}
                        </span>
                      </Table.Td>
                      <Table.Td>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            v.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${v.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                          {v.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </Table.Td>
                      <Table.Td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label="Edit variant"
                            onClick={startEditing}
                            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          >
                            <PencilSimple size={15} />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete variant"
                            onClick={() => {
                              if (window.confirm(`Delete variant "${v.name}"? This cannot be undone.`)) {
                                deleteMutation.mutate(v.id);
                              }
                            }}
                            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <TrashSimple size={15} />
                          </button>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}

              {editing &&
                (rows ?? []).map((row, idx) => (
                  <Table.Tr
                    key={row.key}
                    className={row.id ? undefined : 'bg-brand-50/30'}
                  >
                    <Table.Td>
                      <span className="text-xs text-zinc-400">{idx + 1}</span>
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        size="xs"
                        required
                        placeholder="Variant name"
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.currentTarget.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        size="xs"
                        placeholder="SKU"
                        value={row.sku}
                        onChange={(e) => updateRow(row.key, { sku: e.currentTarget.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="flex items-center gap-1">
                        <TextInput
                          size="xs"
                          w={70}
                          placeholder="Size"
                          value={row.size}
                          onChange={(e) => updateRow(row.key, { size: e.currentTarget.value })}
                        />
                        <TextInput
                          size="xs"
                          w={60}
                          placeholder="Unit"
                          value={row.size_type}
                          onChange={(e) => updateRow(row.key, { size_type: e.currentTarget.value })}
                        />
                      </div>
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={80}
                        min={0}
                        allowDecimal={false}
                        value={row.stock_quantity}
                        onChange={(v) => updateRow(row.key, { stock_quantity: toUnit(v) })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={80}
                        min={0}
                        allowDecimal={false}
                        value={row.low_stock_threshold}
                        onChange={(v) => updateRow(row.key, { low_stock_threshold: toUnit(v) })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={110}
                        min={0}
                        prefix="₹ "
                        decimalScale={2}
                        value={row.price}
                        onChange={(v) => updateRow(row.key, { price: Number(v) || 0 })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={110}
                        min={0}
                        prefix="₹ "
                        decimalScale={2}
                        value={row.wholesale_price}
                        onChange={(v) => updateRow(row.key, { wholesale_price: Number(v) || 0 })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={110}
                        min={0}
                        prefix="₹ "
                        decimalScale={2}
                        value={row.cost_price}
                        onChange={(v) => updateRow(row.key, { cost_price: Number(v) || 0 })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={110}
                        min={0}
                        prefix="₹ "
                        decimalScale={2}
                        value={row.mrp_price}
                        onChange={(v) => updateRow(row.key, { mrp_price: Number(v) || 0 })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          aria-label="Delete variant"
                          onClick={() => {
                            if (row.id) {
                              if (window.confirm(`Delete variant "${row.name}"? This cannot be undone.`)) {
                                deleteMutation.mutate(row.id);
                              }
                            } else {
                              setRows((prev) => (prev ?? []).filter((r) => r.key !== row.key));
                            }
                          }}
                          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <TrashSimple size={15} />
                        </button>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </div>

        {editing && (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
            <Button variant="default" size="sm" onClick={cancelEditing}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="light"
              leftSection={<Plus size={14} />}
              onClick={addRow}
            >
              Add variant
            </Button>
            <Button
              size="sm"
              leftSection={<Check size={14} weight="bold" />}
              loading={saveMutation.isPending}
              className="shadow-sm shadow-brand-200"
              onClick={() => saveMutation.mutate()}
            >
              Update product
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}