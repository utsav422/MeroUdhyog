'use client';

import { useMemo, useState } from 'react';
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

const COLUMN_GUIDE: [string, string][] = [
  ['order_date*', 'Order date (e.g. 2026-07-15)'],
  ['quantity*', 'Quantity ordered (positive number)'],
];

export default function CsvEntryPanel() {
  const products = useProducts(true);
  const customers = useCustomers();
  const upload = useImportOrderHistory();

  const { data: productRows } = products;
  const { data: customerRows } = customers;

  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
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

  const canUpload =
    !!productId && !!customerId && !!file && upload.isPending === false;

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

  const handleUpload = () => {
    if (!productId || !customerId || !file) return;
    setResult(null);
    upload.mutate(
      {
        file,
        customerId,
        productId,
        variantId: variantId ?? undefined,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setFile(null);
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Alert
        color="blue"
        icon={<FileCsv size={18} />}
        title="Pick the product and customer, then upload the CSV"
      >
        The CSV only needs one row per order date — no product or customer
        columns. Bad rows are reported without blocking the rest.
      </Alert>

      <Group grow align="flex-start">
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
        {variants.length > 1 && (
          <Select
            label="Variant"
            placeholder="Choose a variant…"
            data={variantOptions}
            value={variantId}
            onChange={setVariantId}
          />
        )}
        <Select
          label="Customer"
          placeholder="Choose a customer…"
          searchable
          clearable
          data={
            customerRows?.map((c) => ({
              value: c.id,
              label: c.name
                + (c.email ? ` · ${c.email}` : ''),
            })) ?? []
          }
          value={customerId}
          onChange={setCustomerId}
        />
      </Group>

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
        CSV columns
      </Text>
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
        onChange={setFile}
      />

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

      {result && (
        <ScrollArea.Autosize mah={240}>
          <Stack gap="xs">
            {result.failed === 0 ? (
              <Alert color="green" title="Import complete">
                All {result.created} order{result.created === 1 ? '' : 's'}{' '}
                imported for this product and customer. Predictions will
                refresh.
              </Alert>
            ) : (
              <Alert color="yellow" title="Import finished with errors">
                {result.created} imported, {result.failed} failed.
              </Alert>
            )}
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