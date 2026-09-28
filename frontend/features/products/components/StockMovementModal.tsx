'use client';

import { useState } from 'react';
import { Button, Group, Modal, NumberInput, SegmentedControl, Select, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Factory, Plus } from '@phosphor-icons/react';
import { useAdjustStock, useProducts } from '../api';

export default function StockMovementModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { data: productsData } = useProducts();
  const adjust = useAdjustStock();
  const allProducts = productsData ?? [];

  const [mode, setMode] = useState<'stock_in' | 'production'>('stock_in');
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const productsWithVariants = allProducts.filter((p) => p.variants.length > 0);
  const selectedProduct = allProducts.find((p) => p.id === productId);
  const variantOptions = (selectedProduct?.variants ?? []).map((v) => ({
    value: v.id,
    label: `${v.name || 'Default'} · ${selectedProduct?.name ?? 'Product'}`,
  }));
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === variantId);

  const submit = () => {
    if (!variantId) {
      notifications.show({
        color: 'red',
        title: 'Variant required',
        message: 'Choose the product variant to record.',
      });
      return;
    }
    if (!quantity || quantity <= 0) {
      notifications.show({
        color: 'red',
        title: 'Invalid quantity',
        message: 'Quantity must be a positive number.',
      });
      return;
    }
    adjust.mutate(
      { variant_id: variantId, quantity, reason: mode },
      {
        onSuccess: (movement) => {
          notifications.show({
            color: 'success',
            title: mode === 'stock_in' ? 'Stock added' : 'Production used',
            message: `${Math.abs(movement.quantity)} unit${Math.abs(movement.quantity) === 1 ? '' : 's'} recorded for ${movement.variant_name ?? movement.product_name}.`,
          });
          setProductId(null);
          setVariantId(null);
          setQuantity(1);
          onClose();
        },
        onError: (error) => {
          notifications.show({
            color: 'red',
            title: 'Could not record movement',
            message: error instanceof Error ? error.message : 'Something went wrong',
          });
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Record stock movement"
      size="md"
      centered
    >
      <Group gap="sm" mb="md">
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => setMode(value as 'stock_in' | 'production')}
          data={[
            { value: 'stock_in', label: 'Add stock' },
            { value: 'production', label: 'Use in production' },
          ]}
        />
      </Group>

      <Select
        label="Product"
        placeholder="Select a product"
        searchable
        clearable
        data={productsWithVariants.map((p) => ({ value: p.id, label: p.name }))}
        value={productId}
        onChange={(value) => {
          setProductId(value);
          setVariantId(null);
        }}
        className="mb-3"
      />
      <Select
        label="Variant"
        placeholder={productId ? 'Select a variant' : 'Choose a product first'}
        searchable
        clearable
        disabled={!productId || variantOptions.length === 0}
        data={variantOptions}
        value={variantId}
        onChange={setVariantId}
        className="mb-3"
      />
      <NumberInput
        label="Quantity"
        description={
          mode === 'stock_in' ? 'Units being added to stock' : 'Units consumed as raw material'
        }
        min={1}
        allowDecimal={false}
        value={quantity}
        onChange={(val) => setQuantity(Number(val) > 0 ? Number(val) : 0)}
        className="mb-4"
      />

      {selectedVariant && (
        <Text size="xs" c="var(--muted)" className="mb-4">
          Current stock:{' '}
          <span className="font-semibold text-[var(--foreground)]">
            {selectedVariant.stock_quantity}
          </span>{' '}
          (low-stock alert at {selectedVariant.low_stock_threshold})
        </Text>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="default" onClick={onClose} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button
          leftSection={
            mode === 'stock_in' ? <Plus size={16} weight="bold" /> : <Factory size={16} weight="bold" />
          }
          loading={adjust.isPending}
          onClick={submit}
        >
          {mode === 'stock_in' ? 'Add to stock' : 'Use in production'}
        </Button>
      </div>
    </Modal>
  );
}