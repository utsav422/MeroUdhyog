'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  FileInput,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { DownloadSimple, FileCsv, UploadSimple } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { useCustomers } from '@/features/customers/api';
import { useProducts } from '@/features/products/api';
import { useImportOrderHistory } from '../api';
import type { ImportResult } from '../api';
import { buildPreviewSentence } from '../preview';
import type { AddOrderPreset } from './AddOrdersModal';

const COLUMN_GUIDE: [string, string][] = [
  ['order_date*', 'Order date (e.g. 2026-07-15)'],
  ['quantity*', 'Quantity ordered (positive number)'],
];

function parseCsvDates(file: File): Promise<string[]> {
  return file
    .text()
    .then((content) =>
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.split(','))
        .map((cols) => cols[0]?.trim() ?? '')
        .filter((d) => d.length > 0 && !/order_date/i.test(d)),
    )
    .catch(() => []);
}

export default function CsvEntryPanel({
  preset,
  onSaved,
  pairStatus,
}: {
  preset?: AddOrderPreset | null;
  onSaved: (info: { customerId: string | null; productId: string | null }) => void;
  pairStatus?: string | null;
}) {
  const products = useProducts(true);
  const customers = useCustomers();
  const upload = useImportOrderHistory();

  const hasPresetProduct = !!preset?.product;
  const hasPresetCustomer = !!preset?.customer;

  const { data: productRows } = products;
  const { data: customerRows } = customers;

  const [productId, setProductId] = useState<string | null>(preset?.product?.id ?? null);
  const [variantId, setVariantId] = useState<string | null>(preset?.variant?.id ?? null);
  const [customerId, setCustomerId] = useState<string | null>(preset?.customer?.id ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parsedDates, setParsedDates] = useState<string[]>([]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    parseCsvDates(file).then((dates) => {
      if (!cancelled) setParsedDates(dates);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

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

  const canUpload =
    !!productId && !!customerId && !!file && upload.isPending === false;

  const handleFileChange = (next: File | null) => {
    setFile(next);
    setParsedDates([]);
  };

  const handleDownloadSample = async () => {
    setDownloading(true);
    try {
      await apiClient.download(
        '/predictions/import/sample',
        'order-history-import-sample.csv',
      );
    } finally {
      setDownloading(false);
    }
  };

  const effectiveVariantId =
    variantId ?? (variants.length === 1 ? variants[0].id : undefined);

  const handleUpload = () => {
    if (!productId || !customerId || !file) return;
    setResult(null);
    upload.mutate(
      {
        file,
        customerId,
        productId,
        variantId: effectiveVariantId,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          if (data.failed === 0) {
            onSaved({ customerId, productId });
          } else {
            setFile(null);
          }
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Alert color="blue" icon={<FileCsv size={18} />} title="Upload the CSV">
        The CSV only needs one row per order date — no product or customer
        columns. Bad rows are reported without blocking the rest.
      </Alert>

      {(!hasPresetProduct || !hasPresetCustomer || variants.length > 1) && (
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
              data={variantOptions}
              value={variantId}
              onChange={setVariantId}
            />
          )}
          {!hasPresetCustomer && (
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
          )}
        </Group>
      )}

      <Divider />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="default"
          leftSection={<DownloadSimple size={16} />}
          loading={downloading}
          onClick={handleDownloadSample}
        >
          Download sample file
        </Button>
        <Text size="xs" c="dimmed">
          order-history-import-sample.csv
        </Text>
      </div>

      <Text fw={600} size="sm">
        CSV format
      </Text>
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <div className="bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span className="mr-3 font-mono">order_date, quantity</span>
          <span className="font-mono text-zinc-400">→ 2025-01-14, 3</span>
        </div>
      </div>
      <Stack gap={2}>
        {COLUMN_GUIDE.map(([column, description]) => (
          <div key={column} className="flex items-baseline gap-2 py-1 text-sm">
            <code className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
              {column}
            </code>
            <span className="text-xs text-zinc-400">{description}</span>
          </div>
        ))}
      </Stack>

      <FileInput
        label="Choose CSV file"
        description="Accepts .csv files"
        placeholder="Select a file…"
        accept=".csv,text/csv"
        clearable
        value={file}
        onChange={handleFileChange}
      />

      {parsedDates.length >= 2 && (
        <Alert color="green" radius="sm">
          <Text size="sm">{buildPreviewSentence(parsedDates, pairStatus)}</Text>
        </Alert>
      )}
      {file && parsedDates.length > 0 && parsedDates.length < 2 && (
        <Alert color="gray" radius="sm">
          <Text size="sm">
            Found only one date — we need at least two different dates in the
            file to preview a prediction.
          </Text>
        </Alert>
      )}

      <Button
        leftSection={<UploadSimple size={16} />}
        loading={upload.isPending}
        disabled={!canUpload}
        onClick={handleUpload}
      >
        {upload.isPending ? 'Uploading…' : 'Upload and import'}
      </Button>

      {upload.isError && (
        <Alert color="red" title="Import failed">
          {upload.error instanceof Error
            ? upload.error.message
            : 'Something went wrong. Please try again.'}
        </Alert>
      )}

      {result && result.failed > 0 && (
        <ScrollArea.Autosize mah={240}>
          <Stack gap="xs">
            <Alert color="yellow" title="Import finished with errors">
              {result.created} imported, {result.failed} failed.
            </Alert>
            {result.errors.map((rowError, index) => (
              <Alert key={`${rowError.row}-${index}`} color="red" radius="sm">
                <Text size="sm" fw={600}>
                  Row {rowError.row}
                </Text>
                <Text size="sm">{rowError.message}</Text>
              </Alert>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}