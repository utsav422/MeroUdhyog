'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  FileInput,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { PageHeader, EmptyState } from '@/components/shared';
import { UploadSimple } from '@phosphor-icons/react';
import { useUploadImport, useFetchImportErrors } from '../api';
import type { ImportBatch, ImportRowError } from '../api';

export default function ImportsPage() {
  const upload = useUploadImport();
  const fetchErrors = useFetchImportErrors();

  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [errors, setErrors] = useState<ImportRowError[]>([]);

  const handleUpload = () => {
    if (!file) return;
    setBatch(null);
    setErrors([]);
    upload.mutate(file, {
      onSuccess: (created) => {
        setBatch(created);
        if (created.error_count > 0) {
          fetchErrors.mutate(created.id, {
            onSuccess: (data) => setErrors(data),
            onError: () => setErrors([]),
          });
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Import Data"
        subtitle="Upload a CSV or XLSX file to import transactions into your ledger."
      />

      <Card className="max-w-2xl">
        <Stack gap="md">
          <FileInput
            label="Spreadsheet file"
            description="Accepts .csv and .xlsx files"
            placeholder="Choose a file"
            clearable
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            value={file}
            onChange={setFile}
          />
          <div>
            <Button
              leftSection={<UploadSimple size={16} />}
              disabled={!file || upload.isPending}
              loading={upload.isPending}
              onClick={handleUpload}
            >
              {upload.isPending ? 'Uploading…' : 'Upload and import'}
            </Button>
          </div>
          {(upload.isError || fetchErrors.isError) && (
            <Alert color="red" title="Upload failed">
              {upload.error instanceof Error ? upload.error.message : 'Something went wrong. Please try again.'}
            </Alert>
          )}
          {upload.isSuccess && upload.data && !upload.data.error_count && (
            <Alert color="success" title="Import complete">
              All {upload.data.total_rows} rows were imported successfully.
            </Alert>
          )}
        </Stack>
      </Card>

      {batch && (
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <Text fw={600} size="md">
              {batch.filename}
            </Text>
            <span className="text-xs uppercase tracking-wide text-zinc-500">{batch.status}</span>
          </div>
          <SimpleGrid cols={3}>
            <div className="text-center">
              <Text size="xl" fw={700}>
                {batch.total_rows}
              </Text>
              <Text size="xs" c="dimmed">
                Total rows
              </Text>
            </div>
            <div className="text-center">
              <Text size="xl" fw={700} c="green">
                {batch.success_count}
              </Text>
              <Text size="xs" c="dimmed">
                Imported
              </Text>
            </div>
            <div className="text-center">
              <Text size="xl" fw={700} c="red">
                {batch.error_count}
              </Text>
              <Text size="xs" c="dimmed">
                Failed
              </Text>
            </div>
          </SimpleGrid>

          {batch.error_count > 0 && (
            <div className="mt-6">
              <Text fw={600} size="sm" mb="sm">
                Row errors
              </Text>
              {fetchErrors.isPending ? (
                <EmptyState description="Loading errors…" />
              ) : errors.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No error details.
                </Text>
              ) : (
                <Stack gap="xs">
                  {errors.map((rowError) => (
                    <Alert key={rowError.id} color="red" radius="sm">
                      <Text size="sm" fw={600}>
                        Row {rowError.row_number}
                        {rowError.field ? ` · ${rowError.field}` : ''}
                      </Text>
                      <Text size="sm">{rowError.message}</Text>
                    </Alert>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
