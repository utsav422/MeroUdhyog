'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Divider, Modal, ScrollArea, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  CloudArrowUp,
  DownloadSimple,
  FileCsv,
  HandsClapping,
  List,
  UserPlus,
  Users,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { customersKeys } from '../api';

type ImportRowError = { row: number; message: string };
type ImportResult = { created: number; failed: number; errors: ImportRowError[] };

const STEPS = [
  { n: 1, label: 'Download the sample' },
  { n: 2, label: 'Fill in your customers' },
  { n: 3, label: 'Upload and create' },
];

const REQUIRED_COLUMNS: [string, string][] = [['name*', 'Customer name']];

const OPTIONAL_COLUMNS: [string, string][] = [
  ['email', 'Email address (must be unique)'],
  ['phone', 'Primary phone'],
  ['contact_number', 'Alternate contact'],
  ['tax_id', 'Tax / GST number'],
  ['company', 'Company or business'],
  ['address', 'Street address'],
  ['city', 'City'],
  ['latitude', 'Map latitude (-90 to 90)'],
  ['longitude', 'Map longitude (-180 to 180)'],
  ['notes', 'Free-form notes'],
];

function ColumnPill({ column, description, required }: { column: string; description: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <code
        className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
          required
            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
            : 'bg-zinc-100 text-zinc-600'
        }`}
      >
        {column}
      </code>
      <span className={`truncate text-xs ${required ? 'text-brand-700/80' : 'text-zinc-400'}`}>
        {description}
      </span>
    </div>
  );
}

export default function CustomersImportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: (selected: File) =>
      apiClient.upload<ImportResult>('/customers/import', selected),
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
      if (data.created > 0) {
        qc.invalidateQueries({ queryKey: customersKeys.list() });
      }
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setResult(null);
    }
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setResult(null);
  };

  const handleDownloadSample = async () => {
    setDownloading(true);
    try {
      await apiClient.download('/customers/import/sample', 'customer-import-sample.csv');
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setFile(null);
    setResult(null);
  };

  const createdAt = result ? result.created + result.failed : 0;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="xl"
      centered
      radius="xl"
      padding={0}
      withCloseButton={false}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handlePick}
      />

      <div className="relative max-h-[80vh] overflow-y-auto">
        {/* Hero header */}
        <div
          className="px-6 pb-5 pt-6 text-white sm:px-8"
          style={{
            background:
              'linear-gradient(120deg, #f97316 0%, #ea580c 55%, #7c3aed 120%)',
          }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 shadow-lg backdrop-blur">
                <Users size={22} weight="duotone" />
              </div>
              <div>
                <Text fw={700} size="lg" className="leading-tight">
                  Import customers
                </Text>
                <Text size="sm" c="white" opacity={0.85}>
                  Bulk-create customers from a CSV file
                </Text>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <ol className="flex items-center gap-6 text-sm">
            {STEPS.map((step, index) => (
              <li key={step.n} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-orange-600">
                  {step.n}
                </span>
                <span className="whitespace-nowrap text-white/90">{step.label}</span>
                {index < STEPS.length - 1 && (
                  <span className="ml-2 h-px w-6 bg-white/30" />
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 py-5 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Column legend */}
            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <List size={16} className="text-brand-600" />
                Column guide
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                  Required
                </div>
                <div className="mb-3">
                  {REQUIRED_COLUMNS.map(([c, d]) => (
                    <ColumnPill key={c} column={c} description={d} required />
                  ))}
                </div>
                <Divider className="mb-3" />
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Optional
                </div>
                {OPTIONAL_COLUMNS.map(([c, d]) => (
                  <ColumnPill key={c} column={c} description={d} />
                ))}
              </div>
              <button
                type="button"
                onClick={handleDownloadSample}
                className="mt-4 flex w-full items-center justify-between rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                <div className="flex items-center gap-2.5">
                  <DownloadSimple size={18} weight="bold" className="text-brand-600" />
                  <div>
                    <div className="text-sm font-semibold text-brand-700">
                      {downloading ? 'Preparing…' : 'Download sample file'}
                    </div>
                    <div className="text-xs text-zinc-400">customer-import-sample.csv</div>
                  </div>
                </div>
                <FileCsv size={20} className="text-brand-400" />
              </button>
            </div>

            {/* Upload panel */}
            <div className="lg:col-span-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <CloudArrowUp size={16} className="text-brand-600" />
                Upload your file
              </div>

              {file ? (
                <div className="flex items-center justify-between rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                      <FileCsv size={20} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-800">
                        {file.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {(file.size / 1024).toFixed(1)} KB · Ready to import
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setResult(null);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-zinc-400 shadow-sm transition-colors hover:text-danger-500"
                    aria-label="Remove file"
                  >
                    <X size={15} weight="bold" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
                    dragging
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-zinc-200 bg-zinc-50/60 hover:border-brand-300 hover:bg-brand-50/40'
                  }`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                    <CloudArrowUp size={26} weight="duotone" />
                  </div>
                  <Text fw={600} size="md" className="text-zinc-700">
                    Click to choose or drag &amp; drop
                  </Text>
                  <Text size="sm" c="dimmed">
                    a <code className="rounded bg-zinc-100 px-1 font-mono text-xs">.csv</code> file
                    with your customer list
                  </Text>
                </div>
              )}

              <Button
                fullWidth
                size="md"
                radius="xl"
                mt="md"
                leftSection={<UserPlus size={18} weight="bold" />}
                loading={upload.isPending}
                disabled={!file}
                onClick={() => file && upload.mutate(file)}
                className="bg-gradient-to-r from-orange-500 to-brand-600 shadow-md shadow-brand-200 disabled:from-zinc-300 disabled:to-zinc-300"
              >
                {upload.isPending ? 'Creating customers…' : 'Create customers from CSV'}
              </Button>

              {upload.isError && (
                <Alert color="red" title="Import failed" mt="md" radius="lg">
                  {upload.error instanceof Error
                    ? upload.error.message
                    : 'Something went wrong. Please try again.'}
                </Alert>
              )}

              {result && createdAt > 0 && (
                <div className="mt-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-success-100 bg-success-50/70 p-4">
                      <div className="flex items-center gap-2 text-success-600">
                        <CheckCircle size={18} weight="duotone" />
                        <Text fw={700} size="xl" className="leading-none">
                          {result.created}
                        </Text>
                      </div>
                      <Text size="xs" c="dimmed" mt={6}>
                        Customers created
                      </Text>
                    </div>
                    <div className="rounded-2xl border border-danger-100 bg-danger-50/60 p-4">
                      <div className="flex items-center gap-2 text-danger-500">
                        <WarningCircle size={18} weight="duotone" />
                        <Text fw={700} size="xl" className="leading-none">
                          {result.failed}
                        </Text>
                      </div>
                      <Text size="xs" c="dimmed" mt={6}>
                        Rows failed
                      </Text>
                    </div>
                  </div>

                  {result.errors.length > 0 && (
                    <div className="mt-4">
                      <Text size="xs" fw={600} className="mb-2 uppercase tracking-wide text-zinc-400">
                        Fix these rows and re-upload
                      </Text>
                      <ScrollArea.Autosize mah={200}>
                        <div className="space-y-2 pr-2">
                          {result.errors.map((rowError, index) => (
                            <div
                              key={`${rowError.row}-${index}`}
                              className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2"
                            >
                              <Text size="xs" fw={700} className="text-danger-500">
                                Row {rowError.row}
                              </Text>
                              <Text size="sm" className="text-zinc-600">
                                {rowError.message}
                              </Text>
                            </div>
                          ))}
                        </div>
                      </ScrollArea.Autosize>
                    </div>
                  )}

                  {result.failed === 0 && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700">
                      <HandsClapping size={18} weight="duotone" />
                      All {result.created} customers were imported successfully.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}