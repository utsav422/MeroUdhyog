'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  FileInput,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DownloadSimple,
  FileCsv,
  UploadSimple,
} from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { productsKeys } from '../api';

type ImportRowError = { row: number; message: string };
type ImportResult = { created: number; failed: number; errors: ImportRowError[] };

const REQUIRED_COLUMNS: [string, string][] = [
  ['name*', 'Product name'],
  ['variant*', 'Variant name'],
  ['price*', 'Selling price'],
];

const OPTIONAL_COLUMNS: [string, string][] = [
  ['sku', 'Variant SKU (must be unique)'],
  ['description', 'Product description'],
  ['category', 'Category name (matched by name)'],
  ['size', 'Size / weight'],
  ['size_type', 'Size unit (e.g. g, kg, ml)'],
  ['wholesale_price', 'Wholesale price (to resellers)'],
  ['cost_price', 'Cost of making'],
  ['mrp_price', 'Maximum retail price'],
  ['stock_quantity', 'Units in stock (default 0)'],
  ['low_stock_threshold', 'Low-stock alert level (default 5)'],
  ['currency', 'Currency code (default USD)'],
];

function ColumnList({ items }: { items: [string, string][] }) {
  return (
    <div>
      {items.map(([column, description]) => (
        <div key={column} className="flex items-baseline gap-2 py-1 text-sm">
          <code className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
            {column}
          </code>
          <span className="text-xs text-zinc-400">{description}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProductsImportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: (selected: File) =>
      apiClient.upload<ImportResult>('/products/import', selected),
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
      if (data.created > 0) {
        qc.invalidateQueries({ queryKey: productsKeys.list() });
      }
    },
  });

  const handleDownloadSample = async () => {
    setDownloading(true);
    try {
      await apiClient.download('/products/import/sample', 'product-import-sample.csv');
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setFile(null);
    setResult(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import products from CSV"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Alert
          color="blue"
          icon={<FileCsv size={18} />}
          title="Bulk create products"
        >
          Upload a CSV file to create multiple products at once. Columns
          marked with{' '}
          <Text span fw={600}>
            *
          </Text>{' '}
          are required. Rows that fail are reported without blocking the rest.
        </Alert>

        <div>
          <Text fw={600} size="sm" mb="xs">
            Columns
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <ColumnList items={REQUIRED_COLUMNS} />
            <ColumnList items={OPTIONAL_COLUMNS} />
          </SimpleGrid>
        </div>

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
            product-import-sample.csv
          </Text>
        </div>

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
          disabled={!file}
          onClick={() => file && upload.mutate(file)}
        >
          {upload.isPending ? 'Uploading…' : 'Upload and create products'}
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
                  All {result.created} product{result.created === 1 ? '' : 's'}{' '}
                  created successfully.
                </Alert>
              ) : (
                <Alert color="yellow" title="Import finished with errors">
                  {result.created} created, {result.failed} failed.
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
    </Modal>
  );
}