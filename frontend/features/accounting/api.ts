'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type StatementFilters = {
  date_from?: string;
  date_to?: string;
  customer_id?: string;
  min_amount?: string;
  max_amount?: string;
};

export type TrialBalanceRow = {
  account: string;
  code: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  debit: string;
  credit: string;
};

export type TrialBalance = {
  as_of: string | null;
  rows: TrialBalanceRow[];
  total_debit: string;
  total_credit: string;
  balanced: boolean;
};

export type PLLine = { label: string; amount: string; key: string | null };

export type ProfitLoss = {
  date_from: string | null;
  date_to: string | null;
  revenue: string;
  cogs: string;
  gross_profit: string;
  operating_expenses: string;
  net_profit: string;
  gross_margin_pct: string;
  net_margin_pct: string;
  cogs_basis: 'cost_price' | 'purchases';
  lines: PLLine[];
};

export type BalanceSheetLine = { label: string; amount: string };

export type BalanceSheet = {
  as_of: string | null;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  total_assets: string;
  total_liabilities: string;
  total_equity: string;
  balanced: boolean;
  retained_earnings: string;
  difference: string;
};

export type CashFlowLine = { label: string; amount: string };

export type CashFlow = {
  date_from: string | null;
  date_to: string | null;
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  net_operating: string;
  net_investing: string;
  net_financing: string;
  opening_cash: string;
  net_change: string;
  closing_cash: string;
};

export type AccountingSettings = {
  business_name: string | null;
  fiscal_year_start_month: number;
  book_start_date: string | null;
  opening_cash: string;
  opening_receivables: string;
  opening_inventory: string;
  opening_other_assets: string;
  opening_payables: string;
  opening_loans: string;
  opening_capital: string;
  currency: string;
};

function queryString(filters: StatementFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const accountingKeys = {
  all: ['accounting'] as const,
  trialBalance: (f: StatementFilters) => [...accountingKeys.all, 'trial-balance', f] as const,
  profitLoss: (f: StatementFilters) => [...accountingKeys.all, 'profit-loss', f] as const,
  balanceSheet: (asOf: string) => [...accountingKeys.all, 'balance-sheet', asOf] as const,
  cashFlow: (f: StatementFilters) => [...accountingKeys.all, 'cash-flow', f] as const,
  settings: () => [...accountingKeys.all, 'settings'] as const,
};

export function useTrialBalance(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.trialBalance(filters),
    queryFn: () => apiClient.get<TrialBalance>(`/accounting/trial-balance${queryString(filters)}`),
  });
}

export function useProfitLoss(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.profitLoss(filters),
    queryFn: () => apiClient.get<ProfitLoss>(`/accounting/profit-loss${queryString(filters)}`),
  });
}

export function useBalanceSheet(asOf: string) {
  return useQuery({
    queryKey: accountingKeys.balanceSheet(asOf),
    queryFn: () =>
      apiClient.get<BalanceSheet>(`/accounting/balance-sheet${asOf ? `?as_of=${asOf}` : ''}`),
  });
}

export function useCashFlow(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.cashFlow(filters),
    queryFn: () => apiClient.get<CashFlow>(`/accounting/cash-flow${queryString(filters)}`),
  });
}

export function useAccountingSettings() {
  return useQuery({
    queryKey: accountingKeys.settings(),
    queryFn: () => apiClient.get<AccountingSettings>('/accounting/settings'),
  });
}

export function useUpdateAccountingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<AccountingSettings>) =>
      apiClient.put<AccountingSettings>('/accounting/settings', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(accountingKeys.settings(), data);
      void queryClient.invalidateQueries({ queryKey: accountingKeys.all });
    },
  });
}
