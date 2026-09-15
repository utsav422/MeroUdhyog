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
  Text,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { FileCsv, PencilSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useCustomers } from '@/features/customers/api';
import { useProducts } from '@/features/products/api';
import { useAddOrderHistory, useAnalysis } from '../api';
import type { ImportResult } from '../api';
import { buildPreviewSentence, findPairStatus } from '../preview';
import CsvEntryPanel from './CsvEntryPanel';

export type AddOrderPreset = {
  customer?: { id: string; name: string };
  product?: { id: string; name: string };
  variant?: { id: string; name: string };
};

type Row = { key: number; order_date: string | null; quantity: string };
type Mode = 'choose' | 'manual' | 'csv';

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

function AddOrderFlow({
  onClose,
  preset,
  onSaved,
}: {
  onClose: () => void;
  preset?: AddOrderPreset | null;
  onSaved?: (info: { customerId: string | null; productId: string | null }) => void;
}) {
  const analysis = useAnalysis(true);
  const products = useProducts(true);
  const customers = useCustomers();

  const hasPresetProduct = !!preset?.product;
  const hasPresetCustomer = !!preset?.customer;

  const [mode, setMode] = useState<Mode>('choose');
  const [productId, setProductId] = useState<string | null>(preset?.product?.id ?? null);
  const [variantId, setVariantId] = useState<string | null>(preset?.variant?.id ?? null);
  const [customerId, setCustomerId] = useState<string | null>(preset?.customer?.id ?? null);
  const [rows, setRows] = useState<Row[]>([
    { key: NEXT_KEY++, order_date: null, quantity: '1' },
  ]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: productRows } = products;
  const { data: customerRows } = customers;

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

  const dates = useMemo(
    () =>
      rows
        .map((r) => toISODate(r.order_date))
        .filter((d) => d.length > 0)
        .sort(),
    [rows],
  );

  const currentPairStatus = useMemo(
    () => findPairStatus(analysis.data, customerId, productId),
    [analysis.data, customerId, productId],
  );

  const canSubmit =
    !!productId && !!customerId && rows.length > 0 && query.isPending === false;

  const effectiveVariantId =
    variantId ?? (variants.length === 1 ? variants[0].id : undefined);

  const handleClose = () => {
    onClose();
  };

  const handleSave = (info: { customerId: string | null; productId: string | null }) => {
    onSaved?.(info);
    handleClose();
  };

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
        variant_id: effectiveVariantId ?? null,
        rows: validRows,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          if (data.failed === 0) {
            handleSave({ customerId, productId });
          } else {
            setRows([{ key: NEXT_KEY++, order_date: null, quantity: '1' }]);
          }
        },
      },
    );
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

  const context =
    hasPresetProduct && hasPresetCustomer
      ? `Adding history for ${preset!.customer!.name} and ${preset!.product!.name}.`
      : hasPresetProduct
        ? `Adding history for ${preset!.product!.name} — pick the customer below.`
        : hasPresetCustomer
          ? `Adding history for ${preset!.customer!.name} — pick the product below.`
          : 'Pick the product and customer, then enter order dates.';

  return (
    <Stack gap="md">
      {mode === 'choose' ? (
        <>
          <Alert
            color="blue"
            icon={<UploadSimple size={18} />}
            title={context}
          >
            These dates join the confirmed orders already on file. Once we can
            spot a reorder rhythm, the prediction switches on.
          </Alert>
          <Divider />
          <Text fw={600} size="sm">
            How many past orders are you adding?
          </Text>
          <Group grow align="stretch">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <PencilSimple size={20} weight="bold" />
              </div>
              <Text fw={600} size="sm" className="mt-3">
                A few orders
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                Type 1–5 order dates by hand. Best for topping up a single
                customer or product.
              </Text>
            </button>
            <button
              type="button"
              onClick={() => setMode('csv')}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                <FileCsv size={20} weight="bold" />
              </div>
              <Text fw={600} size="sm" className="mt-3">
                Many orders
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                6+ dates? Upload a CSV instead — we&apos;ll report bad rows
                without blocking the good ones.
              </Text>
            </button>
          </Group>
        </>
      ) : (
        <Stack gap="md">
          <button
            type="button"
            onClick={() => setMode('choose')}
            className="self-start text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
          >
            ← Change entry method
          </button>

          {mode === 'manual' ? (
            <>
              <Alert color="blue" icon={<UploadSimple size={18} />} title={context} />

{!hasPresetProduct && (
                <>
                  <Divider />
                  <Text fw={600} size="sm">
                    1 · Product
                  </Text>
                </>
              )}
              <Group grow align="flex-start">
                {!hasPresetProduct && (
                  <Select
                    label="Product"
                    placeholder="Choose a product…"
                    searchable
                    clearable
                    data={
                      productRows?.map((p) => ({
                        value: p.id,
                        label: p.name + (p.sku ? ` · ${p.sku}` : ''),
                      })) ?? []
                    }
                    value={productId}
                    onChange={handleProductChange}
                  />
                )}
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

              {!hasPresetCustomer && (
                <>
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
                </>
              )}

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

              <ScrollArea.Autosize mah={240}>
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
                          onChange={(value) =>
                            updateRow(row.key, { order_date: value })
                          }
                        />
                      </div>
                      <NumberInput
                        placeholder="Quantity"
                        min={0}
                        allowDecimal={false}
                        value={row.quantity}
                        onChange={(value) =>
                          updateRow(row.key, { quantity: String(value ?? '') })
                        }
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        size="sm"
                        px={6}
                        disabled={rows.length === 1}
                        onClick={() =>
                          setRows((prev) =>
                            prev.filter((r) => r.key !== row.key),
                          )
                        }
                        aria-label="Remove row"
                      >
                        <Trash size={15} />
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>

              {dates.length >= 2 && (
                <Alert color="green" radius="sm">
                  <Text size="sm">{buildPreviewSentence(dates, currentPairStatus)}</Text>
                </Alert>
              )}

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

              {result && result.failed > 0 && (
                <Stack gap="xs">
                  <Alert color="yellow" title="Saved with errors">
                    {result.created} added, {result.failed} failed.
                  </Alert>
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
            </>
          ) : (
            <CsvEntryPanel preset={preset} onSaved={handleSave} pairStatus={currentPairStatus} />
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default function AddOrdersModal({
  opened,
  onClose,
  preset,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  preset?: AddOrderPreset | null;
  onSaved?: (info: { customerId: string | null; productId: string | null }) => void;
}) {
  const titleParts = [
    preset?.customer?.name && ` for ${preset.customer.name}`,
    preset?.product?.name && ` — ${preset.product.name}`,
  ].filter(Boolean);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Add order history${titleParts.join('')}`}
      size="lg"
      centered
    >
      {opened && (
        <AddOrderFlow onClose={onClose} preset={preset} onSaved={onSaved} />
      )}
    </Modal>
  );
}