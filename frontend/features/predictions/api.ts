'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type PredictionProduct = {
  product_id: string;
  product_name: string;
  sku: string | null;
  variant_id: string | null;
  variant_name: string | null;
  order_count: number;
  last_order_date: string | null;
  avg_gap_days: number | null;
  median_gap_days: number | null;
  next_order_date: string | null;
  days_until_next: number | null;
  interest_score: number;
  avg_quantity: number;
  quantity_trend: string;
  stock_status: string;
  days_of_stock: number | null;
  confidence: string;
  recommendation: string;
};

export type CustomerPrediction = {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  order_count: number;
  product_count: number;
  last_order_date: string | null;
  next_order_date: string | null;
  days_until_next: number | null;
  interest_score: number;
  stock_status: string;
  recommendation: string;
  products: PredictionProduct[];
};

export type AnalysisSummary = {
  customer_count: number;
  product_pairs: number;
  overdue_count: number;
  due_soon_count: number;
  on_track_count: number;
  insufficient_data_count: number;
  avg_interest: number;
  next_7_days: number;
  next_30_days: number;
};

export type ProductAggregate = {
  product_id: string;
  product_name: string;
  sku: string | null;
  variant_id: string | null;
  variant_name: string | null;
  customer_count: number;
  order_count: number;
  last_order_date: string | null;
  next_order_date: string | null;
  days_until_next: number | null;
  avg_quantity: number;
  interest_score: number;
  stock_status: string;
  recommendation: string;
  overdue_count: number;
  due_soon_count: number;
  on_track_count: number;
  insufficient_count: number;
};

export type Analysis = {
  generated_at: string;
  tenant_avg_gap_days: number | null;
  summary: AnalysisSummary;
  customers: CustomerPrediction[];
  products: ProductAggregate[];
};

export type CustomerDetail = CustomerPrediction;

export type HistoryRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  product_id: string;
  product_name: string;
  sku: string | null;
  variant_id: string | null;
  variant_name: string | null;
  order_date: string;
  quantity: string;
  source: string;
  created_at: string;
};

export type ImportRowError = { row: number; message: string };
export type ImportResult = { created: number; failed: number; errors: ImportRowError[] };

export type OrderHistoryRowInput = { order_date: string; quantity: string };
export type AddOrderHistoryInput = {
  customer_id: string;
  product_id: string;
  variant_id?: string | null;
  rows: OrderHistoryRowInput[];
};

export const predictionsKeys = {
  all: ['predictions'] as const,
  analysis: () => [...predictionsKeys.all, 'analysis'] as const,
  customer: (id: string) => [...predictionsKeys.all, 'customer', id] as const,
};

export function useAnalysis(enabled = true) {
  return useQuery({
    queryKey: predictionsKeys.analysis(),
    queryFn: () => apiClient.get<Analysis>('/predictions/analysis'),
    enabled,
  });
}

export function useCustomerPrediction(id: string | null, enabled = true) {
  return useQuery({
    queryKey: predictionsKeys.customer(id ?? ''),
    queryFn: () => apiClient.get<CustomerDetail>(`/predictions/customers/${id}`),
    enabled: enabled && !!id,
  });
}

export function useAddOrderHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddOrderHistoryInput) =>
      apiClient.post<ImportResult>('/predictions/history', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: predictionsKeys.all });
    },
  });
}

export function useImportOrderHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      file: File;
      customerId: string;
      productId: string;
      variantId?: string;
    }) =>
      apiClient.uploadForm<ImportResult>('/predictions/import', payload.file, {
        customer_id: payload.customerId,
        product_id: payload.productId,
        ...(payload.variantId
          ? { variant_id: payload.variantId }
          : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: predictionsKeys.all });
    },
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>('/predictions/history'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: predictionsKeys.all });
    },
  });
}

/**
 * Optimistically flags a customer as "contacted" in the predictions dashboard.
 *
 * The backend endpoint POST /predictions/customers/{id}/contacted is NOT
 * implemented yet — the mutation below only records the flag in the UI's local
 * state (see PredictionsPage's `contacted` map). When the endpoint exists,
 * replace the mutationFn with:
 *
 *   apiClient.post<void>(`/predictions/customers/${customerId}/contacted`)
 *
 * and keep the analysis refetch so the next prediction cycle reflects it.
 */
export function useMarkContacted() {
  return useMutation({
    mutationFn: (customerId: string) => {
      void customerId;
      return Promise.resolve();
    },
  });
}