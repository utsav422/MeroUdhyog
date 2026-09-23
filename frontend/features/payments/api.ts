'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Payment } from '../khata/api';

export type PaymentList = {
  items: Payment[];
  total: number;
  total_amount: string;
  limit: number;
  offset: number;
};

export type PaymentsFilters = {
  search: string;
  customerId: string | null;
  routeId: string | null;
  method: string | null;
  status: string | null;
  dateRange: [Date | null, Date | null];
};

export const EMPTY_PAYMENTS_FILTERS: PaymentsFilters = {
  search: '',
  customerId: null,
  routeId: null,
  method: null,
  status: null,
  dateRange: [null, null],
};

// Date kept in the user's own day, sent as a naive YYYY-MM-DD for the backend.
export function toLocalYmd(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

// Nested under ['khata'] so existing khata mutations (record/void) refresh it.
export const paymentsKeys = {
  list: (params: string) => [...['khata', 'payments'], params] as const,
};

export function usePayments(filters: PaymentsFilters, page: number, pageSize: number) {
  const params = new URLSearchParams();
  params.set('limit', String(pageSize));
  params.set('offset', String((page - 1) * pageSize));
  if (filters.customerId) params.set('customer_id', filters.customerId);
  if (filters.routeId) params.set('route_id', filters.routeId);
  if (filters.method) params.set('method', filters.method);
  if (filters.status) params.set('status', filters.status);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.dateRange[0]) params.set('date_from', toLocalYmd(filters.dateRange[0]));
  if (filters.dateRange[1]) params.set('date_to', toLocalYmd(filters.dateRange[1]));
  const query = params.toString();

  return useQuery({
    queryKey: paymentsKeys.list(query || 'all'),
    queryFn: () => apiClient.get<PaymentList>(`/khata/payments${query ? `?${query}` : ''}`),
  });
}