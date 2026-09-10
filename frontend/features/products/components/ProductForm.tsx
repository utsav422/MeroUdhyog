'use client';

import { useState } from 'react';
import {
  Button,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
  Paper,
  ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm, schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash, Package } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { useCategories, productsKeys } from '../api';
import type { Product, Variant, VariantInput, VariantPrice } from '../api';
import { productFormSchema } from '../schema';

type FormValues = {
  name: string;
  sku: string;
  category_id: string;
  price: number | undefined;
  wholesale_price: number | undefined;
  cost_price: number | undefined;
  mrp_price: number | undefined;
  stock_quantity: number;
  low_stock_threshold: number;
  description: string;
};

type EditableVariant = {
  id: string;
  name: string;
  sku: string;
  size: string;
  size_type: string;
  priceId: string | undefined;
  price: number | undefined;
  wholesale_price: number | undefined;
  cost_price: number | undefined;
  mrp_price: number | undefined;
  stock_quantity: number;
  low_stock_threshold: number;
};

type DraftVariant = {
  key: string;
  name: string;
  sku: string;
  size: string;
  size_type: string;
  price: number | undefined;
  wholesale_price: number | undefined;
  cost_price: number | undefined;
  mrp_price: number | undefined;
  stock_quantity: number;
  low_stock_threshold: number;
};

const toNumber = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const toStock = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

export default function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const qc = useQueryClient();
  const categoriesQuery = useCategories();
  const isEdit = !!product;

  const [editableVariants, setEditableVariants] = useState<EditableVariant[]>(() =>
    (product?.variants ?? []).map((v) => {
      const activePrice = v.prices.find((p) => p.is_active) ?? v.prices[0];
      return {
        id: v.id,
        name: v.name,
        sku: v.sku ?? '',
        size: v.size ?? '',
        size_type: v.size_type ?? '',
        priceId: activePrice?.id,
        price: toNumber(activePrice?.price),
        wholesale_price: toNumber(activePrice?.wholesale_price),
        cost_price: toNumber(activePrice?.cost_price),
        mrp_price: toNumber(activePrice?.mrp_price),
        stock_quantity: toStock(v.stock_quantity),
        low_stock_threshold: toStock(v.low_stock_threshold),
      };
    }),
  );
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([]);

  const form = useForm<FormValues>({
    validate: schemaResolver(productFormSchema),
    initialValues: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      category_id: product?.category_id ?? '',
      price: undefined,
      wholesale_price: undefined,
      cost_price: undefined,
      mrp_price: undefined,
      stock_quantity: 0,
      low_stock_threshold: 5,
      description: product?.description ?? '',
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        sku: values.sku || null,
        category_id: values.category_id || null,
      };

      if (isEdit && product) {
        await apiClient.patch(`/products/${product.id}`, payload);

        for (const ev of editableVariants) {
          const variantPatch: Record<string, unknown> = {};
          const original = product.variants.find((v) => v.id === ev.id);
          if (original) {
            if (ev.name !== original.name) variantPatch.name = ev.name;
            if ((ev.sku || null) !== original.sku) variantPatch.sku = ev.sku || null;
            if ((ev.size || null) !== original.size) variantPatch.size = ev.size || null;
            if ((ev.size_type || null) !== original.size_type) variantPatch.size_type = ev.size_type || null;
            if (ev.stock_quantity !== toStock(original.stock_quantity)) variantPatch.stock_quantity = ev.stock_quantity;
            if (ev.low_stock_threshold !== toStock(original.low_stock_threshold)) variantPatch.low_stock_threshold = ev.low_stock_threshold;
          }
          if (Object.keys(variantPatch).length > 0) {
            await apiClient.patch(`/products/${product.id}/variants/${ev.id}`, variantPatch);
          }

          if (ev.priceId) {
            await apiClient.patch(
              `/products/${product.id}/variants/${ev.id}/prices/${ev.priceId}`,
              {
                price: ev.price ?? 0,
                wholesale_price: ev.wholesale_price ?? null,
                cost_price: ev.cost_price ?? null,
                mrp_price: ev.mrp_price ?? null,
              },
            );
          }
        }

        for (const dv of draftVariants) {
          const variantPayload: VariantInput = {
            name: dv.name,
            sku: dv.sku || null,
            size: dv.size || null,
            size_type: dv.size_type || null,
            stock_quantity: dv.stock_quantity,
            low_stock_threshold: dv.low_stock_threshold,
            sort_order: 0,
            prices: [
              {
                price: dv.price ?? 0,
                wholesale_price: dv.wholesale_price ?? null,
                cost_price: dv.cost_price ?? null,
                mrp_price: dv.mrp_price ?? null,
                currency: 'INR',
              },
            ],
          };
          await apiClient.post(`/products/${product.id}/variants`, variantPayload);
        }
        return;
      }

      await apiClient.post('/products', {
        ...payload,
        variants: [
          {
            name: 'Default',
            sku: values.sku ? `${values.sku}-DEFAULT` : null,
            size: null,
            size_type: null,
            stock_quantity: values.stock_quantity,
            low_stock_threshold: values.low_stock_threshold,
            sort_order: 0,
            prices: [
              {
                price: values.price ?? 0,
                wholesale_price: values.wholesale_price ?? null,
                cost_price: values.cost_price ?? null,
                mrp_price: values.mrp_price ?? null,
                currency: 'INR',
              },
            ],
          },
        ],
      });
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: isEdit ? 'Product updated' : 'Product created',
        message: isEdit ? 'Changes saved successfully' : 'Product added to catalogue',
      });
      qc.invalidateQueries({ queryKey: productsKeys.all });
      if (isEdit && product) {
        router.push(`/products/${product.id}`);
      } else {
        router.push('/products');
      }
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const updateEditableVariant = (
    id: string,
    field: keyof EditableVariant,
    value: EditableVariant[keyof EditableVariant],
  ) => {
    setEditableVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };

  const addDraftVariant = () => {
    setDraftVariants((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        name: '',
        sku: '',
        size: '',
        size_type: '',
        price: undefined,
        wholesale_price: undefined,
        cost_price: undefined,
        mrp_price: undefined,
        stock_quantity: 0,
        low_stock_threshold: 5,
      },
    ]);
  };

  const updateDraftVariant = (
    key: string,
    field: keyof DraftVariant,
    value: DraftVariant[keyof DraftVariant],
  ) => {
    setDraftVariants((prev) => prev.map((v) => (v.key === key ? { ...v, [field]: value } : v)));
  };

  const removeDraftVariant = (key: string) => {
    setDraftVariants((prev) => prev.filter((v) => v.key !== key));
  };

  const backHref = () => {
    if (isEdit && product) return `/products/${product.id}`;
    return '/products';
  };

  return (
    <div>
      <Group mb="lg">
        <Button
          variant="subtle"
          leftSection={<ArrowLeft size={16} />}
          onClick={() => router.push(backHref())}
          color="gray"
        >
          {isEdit ? 'Back to product' : 'Back to products'}
        </Button>
      </Group>

      <form
        onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}
        className="flex max-w-3xl flex-col gap-6"
      >
        <Paper withBorder className="p-5">
          <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
            Basic information
          </Text>
          <Stack gap="md">
            <TextInput
              label="Product name"
              required
              placeholder="e.g. Tomato Ketchup"
              {...form.getInputProps('name')}
            />
            <TextInput
              label="SKU"
              placeholder="e.g. SKU-KETCHUP-500"
              {...form.getInputProps('sku')}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Category</label>
              <select
                {...form.getInputProps('category_id')}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              >
                <option value="">No category</option>
                {(categoriesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Stack>
        </Paper>

        {!isEdit && (
          <Paper withBorder className="p-5">
            <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
              Pricing
            </Text>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput
                label="Selling price"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                {...form.getInputProps('price')}
              />
              <NumberInput
                label="Wholesale price"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                {...form.getInputProps('wholesale_price')}
              />
              <NumberInput
                label="Cost of making"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                {...form.getInputProps('cost_price')}
              />
              <NumberInput
                label="MRP"
                min={0}
                prefix="₹ "
                decimalScale={2}
                placeholder="0.00"
                {...form.getInputProps('mrp_price')}
              />
            </div>
            <Text size="xs" c="dimmed" mt="xs">
              Wholesale price, cost of making and MRP feed the finance / profit &amp; loss reports.
            </Text>
          </Paper>
        )}

        {!isEdit && (
          <Paper withBorder className="p-5">
            <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
              Stock
            </Text>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput
                label="Quantity on hand"
                min={0}
                allowDecimal={false}
                placeholder="0"
                {...form.getInputProps('stock_quantity')}
              />
              <NumberInput
                label="Low-stock alert at"
                min={0}
                allowDecimal={false}
                placeholder="5"
                {...form.getInputProps('low_stock_threshold')}
              />
            </div>
            <Text size="xs" c="dimmed" mt="xs">
              Stock is reduced automatically when orders are placed. You will be alerted when quantity on hand
              drops to or below the low-stock threshold.
            </Text>
          </Paper>
        )}

        <Paper withBorder className="p-5">
          <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
            Additional details
          </Text>
          <Textarea
            label="Description"
            placeholder="Short product description"
            autosize
            minRows={2}
            {...form.getInputProps('description')}
          />
        </Paper>

        {isEdit && product && (
          <Paper withBorder className="p-5">
            <Text fw={600} size="sm" mb="md" className="text-zinc-700">
              Variants & pricing
            </Text>

            {product.variants.length === 0 && editableVariants.length === 0 && (
              <Text size="sm" c="dimmed" className="mb-3">
                No variants yet. Add one below.
              </Text>
            )}

            <Stack gap="md" mb="md">
              {editableVariants.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                      <Package size={13} weight="duotone" />
                    </div>
                    <Text size="xs" fw={600} className="text-zinc-500">
                      Variant
                    </Text>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Variant name"
                      value={ev.name}
                      onChange={(e) => updateEditableVariant(ev.id, 'name', e.currentTarget.value)}
                    />
                    <TextInput
                      label="SKU"
                      value={ev.sku}
                      onChange={(e) => updateEditableVariant(ev.id, 'sku', e.currentTarget.value)}
                    />
                    <TextInput
                      label="Size"
                      value={ev.size}
                      onChange={(e) => updateEditableVariant(ev.id, 'size', e.currentTarget.value)}
                    />
                    <TextInput
                      label="Unit"
                      value={ev.size_type}
                      onChange={(e) => updateEditableVariant(ev.id, 'size_type', e.currentTarget.value)}
                    />
                    <NumberInput
                      label="Price"
                      min={0}
                      prefix="₹ "
                      decimalScale={2}
                      value={ev.price}
                      onChange={(val) => updateEditableVariant(ev.id, 'price', typeof val === 'number' ? val : undefined)}
                    />
                    <NumberInput
                      label="Cost price"
                      min={0}
                      prefix="₹ "
                      decimalScale={2}
                      value={ev.cost_price}
                      onChange={(val) => updateEditableVariant(ev.id, 'cost_price', typeof val === 'number' ? val : undefined)}
                    />
                    <NumberInput
                      label="Wholesale price"
                      min={0}
                      prefix="₹ "
                      decimalScale={2}
                      value={ev.wholesale_price}
                      onChange={(val) => updateEditableVariant(ev.id, 'wholesale_price', typeof val === 'number' ? val : undefined)}
                    />
                    <NumberInput
                      label="MRP"
                      min={0}
                      prefix="₹ "
                      decimalScale={2}
                      value={ev.mrp_price}
                      onChange={(val) => updateEditableVariant(ev.id, 'mrp_price', typeof val === 'number' ? val : undefined)}
                    />
                    <NumberInput
                      label="Quantity on hand"
                      min={0}
                      allowDecimal={false}
                      value={ev.stock_quantity}
                      onChange={(val) => updateEditableVariant(ev.id, 'stock_quantity', typeof val === 'number' ? val : 0)}
                    />
                    <NumberInput
                      label="Low-stock alert at"
                      min={0}
                      allowDecimal={false}
                      value={ev.low_stock_threshold}
                      onChange={(val) => updateEditableVariant(ev.id, 'low_stock_threshold', typeof val === 'number' ? val : 0)}
                    />
                  </div>
                </div>
              ))}
            </Stack>

            {draftVariants.length > 0 && (
              <div className="mb-4">
                <Divider mb="md" label="New variants" labelPosition="left" />
                <Stack gap="md">
                  {draftVariants.map((dv) => (
                    <div
                      key={dv.key}
                      className="rounded-lg border border-dashed border-brand-200 bg-brand-50/30 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <Text size="xs" fw={600} className="text-brand-700">
                          New variant
                        </Text>
                        <ActionIcon
                          size="sm"
                          color="red"
                          variant="subtle"
                          onClick={() => removeDraftVariant(dv.key)}
                        >
                          <Trash size={14} />
                        </ActionIcon>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextInput
                          label="Variant name"
                          placeholder="e.g. 500ml"
                          required
                          value={dv.name}
                          onChange={(e) => updateDraftVariant(dv.key, 'name', e.currentTarget.value)}
                        />
                        <TextInput
                          label="SKU"
                          placeholder="e.g. SKU-KETCHUP-500"
                          value={dv.sku}
                          onChange={(e) => updateDraftVariant(dv.key, 'sku', e.currentTarget.value)}
                        />
                        <TextInput
                          label="Size"
                          placeholder="e.g. 500"
                          value={dv.size}
                          onChange={(e) => updateDraftVariant(dv.key, 'size', e.currentTarget.value)}
                        />
                        <TextInput
                          label="Unit"
                          placeholder="e.g. ml"
                          value={dv.size_type}
                          onChange={(e) => updateDraftVariant(dv.key, 'size_type', e.currentTarget.value)}
                        />
                        <NumberInput
                          label="Price"
                          min={0}
                          prefix="₹ "
                          decimalScale={2}
                          value={dv.price}
                          onChange={(val) => updateDraftVariant(dv.key, 'price', typeof val === 'number' ? val : undefined)}
                        />
                        <NumberInput
                          label="Cost price"
                          min={0}
                          prefix="₹ "
                          decimalScale={2}
                          value={dv.cost_price}
                          onChange={(val) => updateDraftVariant(dv.key, 'cost_price', typeof val === 'number' ? val : undefined)}
                        />
                        <NumberInput
                          label="Wholesale price"
                          min={0}
                          prefix="₹ "
                          decimalScale={2}
                          value={dv.wholesale_price}
                          onChange={(val) => updateDraftVariant(dv.key, 'wholesale_price', typeof val === 'number' ? val : undefined)}
                        />
                        <NumberInput
                          label="MRP"
                          min={0}
                          prefix="₹ "
                          decimalScale={2}
                          value={dv.mrp_price}
                          onChange={(val) => updateDraftVariant(dv.key, 'mrp_price', typeof val === 'number' ? val : undefined)}
                        />
                        <NumberInput
                          label="Quantity on hand"
                          min={0}
                          allowDecimal={false}
                          value={dv.stock_quantity}
                          onChange={(val) => updateDraftVariant(dv.key, 'stock_quantity', typeof val === 'number' ? val : 0)}
                        />
                        <NumberInput
                          label="Low-stock alert at"
                          min={0}
                          allowDecimal={false}
                          value={dv.low_stock_threshold}
                          onChange={(val) => updateDraftVariant(dv.key, 'low_stock_threshold', typeof val === 'number' ? val : 0)}
                        />
                      </div>
                    </div>
                  ))}
                </Stack>
              </div>
            )}

            <Button
              variant="light"
              leftSection={<Plus size={16} />}
              onClick={addDraftVariant}
            >
              Add variant
            </Button>
          </Paper>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={() => router.push(backHref())}
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
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </Group>
      </form>
    </div>
  );
}
