'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type MonthlySummary = {
  tenant_id: string;
  month: string;
  currency: string;
  revenue: string;
  cogs: string;
  operating_expense: string;
  gross_profit: string;
  net_profit: string;
  gross_margin_percent: number | null;
  net_margin_percent: number | null;
  transaction_count: number;
  sale_count: number;
  purchase_count: number;
  expense_count: number;
};

export const financeKeys = {
  all: ['finance'] as const,
  trends: () => [...financeKeys.all, 'trends'] as const,
};

export function useFinanceTrends(months = 6) {
  return useQuery({
    queryKey: [...financeKeys.trends(), months] as const,
    queryFn: () =>
      apiClient.get<MonthlySummary[]>(`/finance/trends?months=${months}`),
  });
}
