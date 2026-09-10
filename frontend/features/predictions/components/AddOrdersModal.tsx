'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useCustomers } from '@/features/customers/api';
import { useProducts } from '@/features/products/api';
import { useAddOrderHistory } from '../api';
import type { ImportResult } from '../api';
import CsvEntryPanel from './CsvEntryPanel';

type Row = { key: number; order_date: string | null; quantity: string };

function toISODate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let NEXT_KEY = 1;

export default function AddOrdersModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const products = useProducts(opened);
  const customers = useCustomers();

  const { data: productRows } = products;
  const { data: customerRows } = customers;

  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([
    { key: NEXT_KEY++, order_date: null, quantity: '1' },
  ]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedProduct = useMemo(
    () => productRows?.find((p) => p.id === productId),
    [productRows, productId],
  );

  const variants = useMemo(
    () =>
      selectedProduct?.variants.filter(
        (v) => v.is_active && (v.sku || v.name),
      ) ?? [],
    [selectedProduct],
  );

  const variantOptions = useMemo(
    () =>
      variants.map((v) => ({
        value: v.id,
        label: v.name ? `${v.name}${v.sku ? ` · ${v.sku}` : ''}` : v.sku ?? v.id,
      })),
    [variants],
  );

  const handleProductChange = (value: string | null) => {
    setProductId(value);
    const product = productRows?.find((p) => p.id === value);
    const active = product?.variants.filter((v) => v.is_active) ?? [];
    setVariantId(active.length === 1 ? active[0].id : null);
  };

  const query = useAddOrderHistory();
  const canSubmit =
    !!productId && !!customerId && rows.length > 0 && query.isPending === false;

  const handleSubmit = () => {
    if (!customerId || !productId) return;
    const validRows = rows
      .filter((r) => r.order_date && Number(r.quantity) > 0)
      .map((r) => ({ order_date: toISODate(r.order_date), quantity: r.quantity }));
    if (validRows.length === 0) return;
    setResult(null);
    query.mutate(
      {
        customer_id: customerId,
        product_id: productId,
        variant_id: variantId ?? null,
        rows: validRows,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setRows([{ key: NEXT_KEY++, order_date: null, quantity: '1' }]);
        },
      },
    );
  };

  const handleClose = () => {
    onClose();
    setProductId(null);
    setVariantId(null);
    setCustomerId(null);
    setRows([{ key: NEXT_KEY++, order_date: null, quantity: '1' }]);
    setResult(null);
  };

  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { key: NEXT_KEY++, order_date: null, quantity: '1' },
    ]);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add order history"
      size="lg"
      centered
    >
      <Tabs defaultValue="manual">
        <Tabs.List mb="md">
          <Tabs.Tab value="manual">Manual entry</Tabs.Tab>
          <Tabs.Tab value="csv">Bulk CSV</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="manual">
          <Stack gap="md">
        <Alert
          color="blue"
          icon={<UploadSimple size={18} />}
          title="Pick the product and customer, then enter order dates"
        >
          These dates are combined with confirmed orders already in your system
          to predict the next order and interest for this pair.
        </Alert>

        <Divider />
        <Text fw={600} size="sm">
          1 · Product
        </Text>
        <Group grow align="flex-start">
          <Select
            label="Product"
            placeholder="Choose a product…"
            searchable
            clearable
            data={
              productRows?.map((p) => ({
                value: p.id,
                label: p.name
                  + (p.sku ? ` · ${p.sku}` : ''),
              })) ?? []
            }
            value={productId}
            onChange={handleProductChange}
          />
          {variants.length > 1 && (
            <Select
              label="Variant"
              placeholder="Choose a variant…"
              searchable
              clearable
              data={variantOptions}
              value={variantId}
              onChange={setVariantId}
            />
          )}
        </Group>

        <Divider />
        <Text fw={600} size="sm">
          2 · Customer
        </Text>
        <Select
          label="Customer"
          placeholder="Choose a customer…"
          searchable
          clearable
          data={
            customerRows?.map((c) => ({
              value: c.id,
              label: c.name + (c.email ? ` · ${c.email}` : ''),
            })) ?? []
          }
          value={customerId}
          onChange={setCustomerId}
        />

        <Divider />
        <Group justify="space-between">
          <Text fw={600} size="sm">
            3 · Order dates
          </Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<Plus size={14} />}
            onClick={addRow}
          >
            Add date
          </Button>
        </Group>

        <ScrollArea.Autosize mah={260}>
          <Stack gap="xs">
            {rows.map((row, index) => (
              <Group key={row.key} grow align="flex-end" wrap="nowrap">
                <div className="flex items-center gap-2">
                  <Text size="xs" c="dimmed" className="w-5 text-right">
                    {index + 1}
                  </Text>
                  <DatePickerInput
                    className="flex-1"
                    placeholder="Order date"
                    clearable
                    value={row.order_date}
                    onChange={(value) => updateRow(row.key, { order_date: value })}
                  />
                </div>
                <NumberInput
                  placeholder="Quantity"
                  min={0}
                  allowDecimal={false}
                  value={row.quantity}
                  onChange={(value) => updateRow(row.key, { quantity: String(value ?? '') })}
                />
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  px={6}
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.key !== row.key))
                  }
                  aria-label="Remove row"
                >
                  <Trash size={15} />
                </Button>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>

        <Button
          leftSection={<UploadSimple size={16} />}
          loading={query.isPending}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {query.isPending ? 'Saving…' : 'Save history'}
        </Button>

        {query.isError && (
          <Alert color="red" title="Save failed">
            {query.error instanceof Error
              ? query.error.message
              : 'Something went wrong. Please try again.'}
          </Alert>
        )}

        {result && (
          <Stack gap="xs">
            {result.failed === 0 ? (
              <Alert color="green" title="Saved">
                {result.created} order date{result.created === 1 ? '' : 's'}{' '}
                added for this product and customer.
              </Alert>
            ) : (
              <Alert color="yellow" title="Saved with errors">
                {result.created} added, {result.failed} failed.
              </Alert>
            )}
            {result.errors.map((err, index) => (
              <Alert key={`${err.row}-${index}`} color="red" radius="sm">
                <Text size="sm" fw={600}>
                  Entry {err.row}
                </Text>
                <Text size="sm">{err.message}</Text>
              </Alert>
            ))}
          </Stack>
        )}
      </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="csv">
          <CsvEntryPanel />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}