'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ImportBatch = {
  id: string;
  tenant_id: string;
  status: string;
  filename: string | null;
  total_rows: number;
  success_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
};

export type ImportRowError = {
  id: string;
  batch_id: string;
  row_number: number;
  field: string | null;
  message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
};

export function useUploadImport() {
  return useMutation({
    mutationFn: (file: File) =>
      apiClient.upload<ImportBatch>('/imports/upload', file),
  });
}

export function useFetchImportErrors() {
  return useMutation({
    mutationFn: (batchId: string) =>
      apiClient.get<ImportRowError[]>(`/imports/${batchId}/errors`),
  });
}
