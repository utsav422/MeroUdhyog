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
  X,
} from '@phosphor-icons/react';
import {
  useProduct,
  useCategories,
  defaultVariantPrice,
  productsKeys,
  inventoryKeys,
} from '@/features/products/api';
import type { Variant } from '@/features/products/api';
import UnitField from '@/features/products/components/UnitField';
import { LoadingState, ErrorState, StockBar } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { formatMoney, formatPriceUnit } from '@/lib/format';

type EditableRow = {
  id: string | null;
  name: string;
  sku: string;
  size: string;
  size_type: string;
  unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
  price: number;
  cost_price: number;
};

function toUnit(v: number | string | null | undefined): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toNumber(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function seedRow(v: Variant): EditableRow {
  const active = v.prices.find((p) => p.is_active) ?? v.prices[0];
  return {
    id: v.id,
    name: v.name,
    sku: v.sku ?? '',
    size: v.size ?? '',
    size_type: v.size_type ?? '',
    unit: v.unit ?? '',
    stock_quantity: toUnit(v.stock_quantity),
    low_stock_threshold: toUnit(v.low_stock_threshold),
    price: toNumber(active?.price),
    cost_price: toNumber(active?.cost_price),
  };
}

function newRow(): EditableRow {
  return {
    id: null,
    name: '',
    sku: '',
    size: '',
    size_type: '',
    unit: '',
    stock_quantity: 0,
    low_stock_threshold: 5,
    price: 0,
    cost_price: 0,
  };
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useProduct(params.id);
  const categoriesQuery = useCategories();

  const [editing, setEditing] = useState<{ id: string | null; row: EditableRow } | null>(null);

  const openEditVariant = (v: Variant) => setEditing({ id: v.id, row: seedRow(v) });
  const openNewVariant = () => setEditing({ id: null, row: newRow() });
  const closeEdit = () => setEditing(null);

  const updateEditRow = (patch: Partial<EditableRow>) => {
    setEditing((prev) => (prev ? { ...prev, row: { ...prev.row, ...patch } } : prev));
  };

  const invalidateInventory = () => {
    qc.invalidateQueries({ queryKey: inventoryKeys.all });
  };

  const saveVariantMutation = useMutation({
    mutationFn: async () => {
      if (!data || !editing) return;
      const row = editing.row;
      if (!row.name.trim()) {
        throw new Error('Variant name is required.');
      }

      if (!row.id) {
        await apiClient.post(`/products/${data.id}/variants`, {
          name: row.name.trim(),
          sku: row.sku.trim() || null,
          size: row.size.trim() || null,
          size_type: row.size_type.trim() || null,
          unit: row.unit.trim() || null,
          stock_quantity: toUnit(row.stock_quantity),
          low_stock_threshold: toUnit(row.low_stock_threshold),
          sort_order: 0,
          prices: [
            {
              price: row.price || 0,
              cost_price: row.cost_price || null,
              currency: 'INR',
            },
          ],
        });
        return;
      }

      const original = data.variants.find((v) => v.id === row.id);
      if (!original) throw new Error('Variant not found.');

      const variantPatch: Record<string, unknown> = {};
      if (row.name !== original.name) variantPatch.name = row.name;
      if ((row.sku.trim() || null) !== original.sku) variantPatch.sku = row.sku.trim() || null;
      if ((row.size.trim() || null) !== original.size) variantPatch.size = row.size.trim() || null;
      if ((row.size_type.trim() || null) !== original.size_type) {
        variantPatch.size_type = row.size_type.trim() || null;
      }
      if ((row.unit.trim() || null) !== original.unit) {
        variantPatch.unit = row.unit.trim() || null;
      }
      if (toUnit(row.stock_quantity) !== toUnit(original.stock_quantity)) {
        variantPatch.stock_quantity = toUnit(row.stock_quantity);
      }
      if (toUnit(row.low_stock_threshold) !== toUnit(original.low_stock_threshold)) {
        variantPatch.low_stock_threshold = toUnit(row.low_stock_threshold);
      }
      if (Object.keys(variantPatch).length > 0) {
        await apiClient.patch(`/products/${data.id}/variants/${row.id}`, variantPatch);
      }

      const active = original.prices.find((p) => p.is_active) ?? original.prices[0];
      if (active) {
        const pricePatch: Record<string, unknown> = {};
        if (row.price !== toNumber(active.price)) pricePatch.price = row.price || 0;
        if (row.cost_price !== toNumber(active.cost_price)) {
          pricePatch.cost_price = row.cost_price || null;
        }
        if (Object.keys(pricePatch).length > 0) {
          await apiClient.patch(
            `/products/${data.id}/variants/${row.id}/prices/${active.id}`,
            pricePatch,
          );
        }
      } else {
        await apiClient.post(`/products/${data.id}/variants/${row.id}/prices`, {
          price: row.price || 0,
          cost_price: row.cost_price || null,
          currency: 'INR',
        });
      }
    },
    onSuccess: async () => {
      notifications.show({
        color: 'success',
        title: editing?.id ? 'Variant updated' : 'Variant created',
        message: 'Changes saved successfully',
      });
      qc.invalidateQueries({ queryKey: productsKeys.all });
      invalidateInventory();
      closeEdit();
      await refetch();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
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
      if (editing?.id) closeEdit();
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
                    data.is_active ? 'bg-success-50 text-success-700' : 'bg-black/5 text-[var(--muted)]'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${data.is_active ? 'bg-success-500' : 'bg-[var(--muted)]'}`} />
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
              variant="light"
              leftSection={<Plus size={16} weight="bold" />}
              onClick={openNewVariant}
              disabled={!!editing}
            >
              Add variant
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
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CurrencyDollar size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total value</Text>
          <Text fw={700} size="lg" className="mt-0.5">{formatMoney(totalValue)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Across all variants</Text>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
            <Barbell size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total cost</Text>
          <Text fw={700} size="lg" className="mt-0.5">{formatMoney(totalCost)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Cost of goods</Text>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-700">
            <StackSimple size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Units in stock</Text>
          <Text fw={700} size="lg" className="mt-0.5">{totalStock}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">Across all variants</Text>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <Tag size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Variants</Text>
          <Text fw={700} size="lg" className="mt-0.5">{data.variants.length}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">{activeVariants} active</Text>
        </div>
      </div>

      {data.description && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="mb-3 flex items-center gap-2">
            <Info size={18} className="text-[var(--muted)]" />
            <Text fw={600} size="sm" className="text-[var(--foreground)]">Description</Text>
          </div>
          <Text size="sm" className="leading-relaxed text-[var(--muted)]">{data.description}</Text>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Text fw={600} size="md" className="text-[var(--foreground)]">Variants & pricing</Text>
              <Text size="xs" c="dimmed" className="mt-0.5">
                {editing
                  ? `Editing ${editing.id ? 'a variant' : 'a new variant'} — only this variant is affected`
                  : `${data.variants.length} variants configured`}
              </Text>
            </div>
            {!editing && (
              <Button
                variant="light"
                size="xs"
                leftSection={<Plus size={14} />}
                onClick={openNewVariant}
              >
                Add variant
              </Button>
            )}
          </div>
        </div>

        {editing && (
          <div className="border-b border-[var(--border)] p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package size={16} weight="duotone" className="text-brand-600" />
                <Text fw={600} size="sm" className="text-[var(--foreground)]">
                  {editing.id ? `Edit variant · ${editing.row.name || 'Untitled'}` : 'New variant'}
                </Text>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                aria-label="Close editor"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-black/5"
                disabled={saveVariantMutation.isPending}
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextInput
                label="Variant name"
                required
                placeholder="e.g. 500ml"
                value={editing.row.name}
                onChange={(e) => updateEditRow({ name: e.currentTarget.value })}
              />
              <TextInput
                label="SKU"
                placeholder="e.g. SKU-KETCHUP-500"
                value={editing.row.sku}
                onChange={(e) => updateEditRow({ sku: e.currentTarget.value })}
              />
              <TextInput
                label="Size"
                placeholder="e.g. 500"
                value={editing.row.size}
                onChange={(e) => updateEditRow({ size: e.currentTarget.value })}
              />
              <TextInput
                label="Size unit"
                placeholder="e.g. ml"
                value={editing.row.size_type}
                onChange={(e) => updateEditRow({ size_type: e.currentTarget.value })}
              />
              <UnitField
                label="Price unit"
                value={editing.row.unit}
                onChange={(u) => updateEditRow({ unit: u })}
                placeholder="e.g. per carton"
              />
              <NumberInput
                label="Wholesale price"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                value={editing.row.price}
                onChange={(val) => updateEditRow({ price: toNumber(val ?? undefined) })}
              />
              <NumberInput
                label="Cost of making"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                value={editing.row.cost_price}
                onChange={(val) => updateEditRow({ cost_price: toNumber(val ?? undefined) })}
              />
              <NumberInput
                label="Quantity on hand"
                min={0}
                allowDecimal={false}
                value={editing.row.stock_quantity}
                onChange={(val) => updateEditRow({ stock_quantity: toUnit(val ?? undefined) })}
              />
              <NumberInput
                label="Low-stock alert at"
                min={0}
                allowDecimal={false}
                value={editing.row.low_stock_threshold}
                onChange={(val) => updateEditRow({ low_stock_threshold: toUnit(val ?? undefined) })}
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={closeEdit}
                disabled={saveVariantMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                leftSection={<Check size={14} weight="bold" />}
                loading={saveVariantMutation.isPending}
                onClick={() => saveVariantMutation.mutate()}
              >
                {editing.id ? 'Save variant' : 'Create variant'}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr className="text-[var(--muted)]">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">#</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Variant</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">SKU</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Size</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Price</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Cost</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Margin</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Stock</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.variants.map((v, idx) => {
                const price = Number(defaultVariantPrice(v) || 0);
                const cost = Number(v.prices[0]?.cost_price || 0);
                const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
                const stock = v.stock_quantity ?? 0;
                return (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      <span className="text-xs text-[var(--muted)]">{idx + 1}</span>
                    </Table.Td>
                    <Table.Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Package size={14} weight="duotone" />
                        </div>
                        <span className="font-medium text-[var(--foreground)]">{v.name}</span>
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <span className="rounded-lg bg-black/5 px-2 py-0.5 font-mono text-xs text-[var(--muted)]">
                        {v.sku ?? '—'}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span className="text-[var(--muted)]">
                        {v.size ? `${v.size}${v.size_type ? ` ${v.size_type}` : ''}` : '—'}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <span className="font-semibold text-[var(--foreground)]">
                        {formatPriceUnit(defaultVariantPrice(v), v.unit)}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <span className="text-[var(--muted)]">
                        {v.prices[0]?.cost_price ? formatMoney(v.prices[0].cost_price) : '—'}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          margin > 0 ? 'bg-success-50 text-success-700' : margin < 0 ? 'bg-danger-50 text-danger-600' : 'bg-black/5 text-[var(--muted)]'
                        }`}
                      >
                        {price > 0 ? `${margin}%` : '—'}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <StockBar
                        stock={stock}
                        threshold={
                          Number(v.low_stock_threshold) > 0 ? Number(v.low_stock_threshold) : 5
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          v.is_active ? 'bg-success-50 text-success-700' : 'bg-black/5 text-[var(--muted)]'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${v.is_active ? 'bg-success-500' : 'bg-[var(--muted)]'}`} />
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Edit variant"
                          onClick={() => openEditVariant(v)}
                          disabled={!!editing}
                          className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40"
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
                          disabled={!!editing || deleteMutation.isPending}
                          className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-danger-50 hover:text-danger-500 disabled:opacity-40"
                        >
                          <TrashSimple size={15} />
                        </button>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}