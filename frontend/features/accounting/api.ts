'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ReportEngine = 'legacy' | 'gl';

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
  cogs_basis: 'cost_price' | 'purchases' | 'gl';
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
  report_engine: ReportEngine;
};

export type Account = {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  normal_balance: 'debit' | 'credit';
  parent_id: string | null;
  is_group: boolean;
  is_system: boolean;
  is_active: boolean;
  description: string | null;
};

export type AccountInput = {
  code: string;
  name: string;
  account_type: Account['account_type'];
  normal_balance?: Account['normal_balance'];
  parent_id?: string | null;
  is_group?: boolean;
  description?: string | null;
};

export type AccountUpdateInput = {
  name?: string;
  parent_id?: string | null;
  is_active?: boolean;
  description?: string | null;
};

export type JournalLineInput = {
  account_id: string;
  debit: string;
  credit: string;
  description?: string | null;
  party_type?: string | null;
  party_id?: string | null;
};

export type JournalEntryInput = {
  entry_date: string;
  voucher_type: 'journal' | 'contra' | 'adjustment' | 'payment' | 'receipt';
  reference?: string | null;
  narration?: string | null;
  lines: JournalLineInput[];
};

export type JournalLine = {
  id: string;
  account_id: string;
  line_no: number;
  debit: string;
  credit: string;
  description: string | null;
  party_type: string | null;
  party_id: string | null;
};

export type JournalEntry = {
  id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  reference: string | null;
  narration: string | null;
  source_type: string | null;
  source_id: string | null;
  status: string;
  currency: string;
  reversal_of_id: string | null;
  created_at: string;
  lines: JournalLine[];
};

export type GLReportLine = {
  account_id: string | null;
  code: string | null;
  name: string;
  amount: string;
};

export type GLTrialBalanceRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
  closing_debit: string;
  closing_credit: string;
};

export type GLTrialBalance = {
  date_from: string | null;
  date_to: string | null;
  rows: GLTrialBalanceRow[];
  total_opening_debit: string;
  total_opening_credit: string;
  total_period_debit: string;
  total_period_credit: string;
  total_closing_debit: string;
  total_closing_credit: string;
  balanced: boolean;
};

export type GLProfitLoss = {
  date_from: string | null;
  date_to: string | null;
  income: GLReportLine[];
  expenses: GLReportLine[];
  total_income: string;
  cogs: string;
  gross_profit: string;
  operating_expenses: string;
  total_expenses: string;
  net_profit: string;
};

export type GLBalanceSheet = {
  as_of: string | null;
  assets: GLReportLine[];
  liabilities: GLReportLine[];
  equity: GLReportLine[];
  total_assets: string;
  total_liabilities: string;
  total_equity: string;
  current_earnings: string;
  difference: string;
  balanced: boolean;
};

export type GLCashFlow = {
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
  balanced: boolean;
};

export type GLDayBookLine = {
  line_no: number;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  description: string | null;
  party_type: string | null;
  party_id: string | null;
};

export type GLDayBookEntry = {
  id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  reference: string | null;
  narration: string | null;
  status: string;
  source_type: string | null;
  source_id: string | null;
  lines: GLDayBookLine[];
};

export type GLDayBook = {
  date_from: string | null;
  date_to: string | null;
  count: number;
  entries: GLDayBookEntry[];
};

export type GLLedgerLine = {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  reference: string | null;
  narration: string | null;
  description: string | null;
  debit: string;
  credit: string;
  balance: string;
};

export type GLLedger = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: string;
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  lines: GLLedgerLine[];
};

export type GLPartyStatementLine = {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  reference: string | null;
  narration: string | null;
  debit: string;
  credit: string;
  balance: string;
};

export type GLPartyStatement = {
  party_type: string;
  party_id: string | null;
  party_name: string;
  account_code: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: string;
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  lines: GLPartyStatementLine[];
};

export type GLAgingRow = {
  party_id: string | null;
  party_name: string;
  current: string;
  days_31_60: string;
  days_61_90: string;
  days_over_90: string;
  total: string;
  credit_balance: string;
};

export type GLAging = {
  as_of: string;
  rows: GLAgingRow[];
  totals: GLAgingRow;
  buckets: { label: string; amount: string }[];
};

export type GLTaxSummaryLine = {
  period: string;
  output_vat: string;
  input_vat: string;
  net_payable: string;
  tds_receivable: string;
  tds_payable: string;
  net_tds: string;
};

export type GLTaxSummary = {
  date_from: string | null;
  date_to: string | null;
  output_vat: string;
  input_vat: string;
  net_payable: string;
  tds_receivable: string;
  tds_payable: string;
  net_tds: string;
  lines: GLTaxSummaryLine[];
};

export type ReconciliationLine = {
  check: string;
  gl_amount: string;
  legacy_amount: string;
  difference: string;
  status: 'matched' | 'difference' | 'informational';
  note: string | null;
};

export type Reconciliation = {
  tenant_id: string;
  date_from: string | null;
  date_to: string | null;
  transactions_total: number;
  transactions_posted: number;
  transactions_unpostable: number;
  transactions_missing: number;
  duplicate_active_entries: number;
  unbalanced_entries: number;
  lines: ReconciliationLine[];
  notes: string[];
};

export type FiscalYear = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
};

export type AccountingPeriod = {
  id: string;
  fiscal_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
};

export type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type BankAccount = {
  id: string;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  currency: string;
  gl_account_id: string;
  gl_account_code: string | null;
  gl_account_name: string | null;
  opening_balance: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BankStatementLine = {
  id: string;
  bank_account_id: string;
  statement_date: string;
  description: string | null;
  reference: string | null;
  amount: string;
  status: 'unmatched' | 'matched';
  matched_entry_id: string | null;
  matched_line_id: string | null;
  matched_at: string | null;
  matched_by: string | null;
  created_at: string;
};

export type BankAutoMatch = {
  matched: number;
  unmatched: number;
  lines: BankStatementLine[];
};

export type BankReconciliation = {
  bank_account_id: string;
  name: string;
  gl_account_id: string;
  gl_account_code: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: string;
  statement_total: string;
  statement_balance: string;
  book_balance: string;
  matched_total: string;
  unmatched_total: string;
  difference: string;
  balanced: boolean;
  lines: BankStatementLine[];
};

export type InventoryReconciliationRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string | null;
  quantity: number;
  unit_cost: string;
  value: string;
};

export type InventoryReconciliation = {
  as_of: string | null;
  gl_inventory: string;
  stock_value: string;
  difference: string;
  balanced: boolean;
  rows: InventoryReconciliationRow[];
};

function queryString(filters: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function decimal(value: string | number | null | undefined): string {
  return String(value ?? '0');
}

function glTrialBalanceToLegacy(data: GLTrialBalance): TrialBalance {
  return {
    as_of: data.date_to,
    rows: data.rows.map((row) => ({
      account: row.name,
      code: row.code,
      account_type: row.account_type as TrialBalanceRow['account_type'],
      debit: decimal(row.closing_debit),
      credit: decimal(row.closing_credit),
    })),
    total_debit: decimal(data.total_closing_debit),
    total_credit: decimal(data.total_closing_credit),
    balanced: data.balanced,
  };
}

function glProfitLossToLegacy(data: GLProfitLoss): ProfitLoss {
  const revenue = Number(data.total_income);
  return {
    date_from: data.date_from,
    date_to: data.date_to,
    revenue: decimal(data.total_income),
    cogs: decimal(data.cogs),
    gross_profit: decimal(data.gross_profit),
    operating_expenses: decimal(data.operating_expenses),
    net_profit: decimal(data.net_profit),
    gross_margin_pct: revenue ? String((Number(data.gross_profit) / revenue) * 100) : '0',
    net_margin_pct: revenue ? String((Number(data.net_profit) / revenue) * 100) : '0',
    cogs_basis: 'gl',
    lines: [
      ...data.income.map((line) => ({ label: line.name, amount: decimal(line.amount), key: line.code })),
      ...data.expenses.map((line) => ({ label: line.name, amount: decimal(line.amount), key: line.code })),
    ],
  };
}

function glBalanceSheetToLegacy(data: GLBalanceSheet): BalanceSheet {
  const mapLine = (line: GLReportLine) => ({ label: line.name, amount: decimal(line.amount) });
  return {
    as_of: data.as_of,
    assets: data.assets.map(mapLine),
    liabilities: data.liabilities.map(mapLine),
    equity: data.equity.map(mapLine),
    total_assets: decimal(data.total_assets),
    total_liabilities: decimal(data.total_liabilities),
    total_equity: decimal(data.total_equity),
    balanced: data.balanced,
    retained_earnings: decimal(data.current_earnings),
    difference: decimal(data.difference),
  };
}

function glCashFlowToLegacy(data: GLCashFlow): CashFlow {
  return {
    date_from: data.date_from,
    date_to: data.date_to,
    operating: data.operating,
    investing: data.investing,
    financing: data.financing,
    net_operating: decimal(data.net_operating),
    net_investing: decimal(data.net_investing),
    net_financing: decimal(data.net_financing),
    opening_cash: decimal(data.opening_cash),
    net_change: decimal(data.net_change),
    closing_cash: decimal(data.closing_cash),
  };
}

export const accountingKeys = {
  all: ['accounting'] as const,
  trialBalance: (f: StatementFilters, engine: ReportEngine) =>
    [...accountingKeys.all, 'trial-balance', engine, f] as const,
  profitLoss: (f: StatementFilters, engine: ReportEngine) =>
    [...accountingKeys.all, 'profit-loss', engine, f] as const,
  balanceSheet: (asOf: string, engine: ReportEngine) =>
    [...accountingKeys.all, 'balance-sheet', engine, asOf] as const,
  cashFlow: (f: StatementFilters, engine: ReportEngine) =>
    [...accountingKeys.all, 'cash-flow', engine, f] as const,
  glTrialBalance: (f: StatementFilters) => [...accountingKeys.all, 'gl', 'trial-balance', f] as const,
  glProfitLoss: (f: StatementFilters) => [...accountingKeys.all, 'gl', 'profit-loss', f] as const,
  glBalanceSheet: (asOf: string) => [...accountingKeys.all, 'gl', 'balance-sheet', asOf] as const,
  glCashFlow: (f: StatementFilters) => [...accountingKeys.all, 'gl', 'cash-flow', f] as const,
  glDayBook: (f: Record<string, string | number | undefined>) =>
    [...accountingKeys.all, 'gl', 'day-book', f] as const,
  glLedger: (accountId: string, f: StatementFilters) =>
    [...accountingKeys.all, 'gl', 'ledger', accountId, f] as const,
  glPartyStatement: (f: Record<string, string | undefined>) =>
    [...accountingKeys.all, 'gl', 'party-statement', f] as const,
  glAging: (asOf: string) => [...accountingKeys.all, 'gl', 'aging', asOf] as const,
  glTaxSummary: (f: StatementFilters) => [...accountingKeys.all, 'gl', 'tax-summary', f] as const,
  accounts: () => [...accountingKeys.all, 'accounts'] as const,
  journalEntries: (f: Record<string, string | number | undefined>) =>
    [...accountingKeys.all, 'journal-entries', f] as const,
  journalEntry: (entryId: string) =>
    [...accountingKeys.all, 'journal-entry', entryId] as const,
  reconciliation: (f: StatementFilters) => [...accountingKeys.all, 'reconciliation', f] as const,
  fiscalYears: () => [...accountingKeys.all, 'fiscal-years'] as const,
  periods: (fiscalYearId: string) => [...accountingKeys.all, 'periods', fiscalYearId] as const,
  auditLog: (f: Record<string, string | number | undefined>) =>
    [...accountingKeys.all, 'audit-log', f] as const,
  bankAccounts: () => [...accountingKeys.all, 'bank-accounts'] as const,
  bankLines: (accountId: string, f: Record<string, string | number | undefined>) =>
    [...accountingKeys.all, 'bank-lines', accountId, f] as const,
  bankReconciliation: (accountId: string, f: StatementFilters) =>
    [...accountingKeys.all, 'bank-reconciliation', accountId, f] as const,
  inventoryReconciliation: (asOf: string) =>
    [...accountingKeys.all, 'inventory-reconciliation', asOf] as const,
  settings: () => [...accountingKeys.all, 'settings'] as const,
};

export function useTrialBalance(filters: StatementFilters, engine: ReportEngine = 'legacy') {
  return useQuery({
    queryKey: accountingKeys.trialBalance(filters, engine),
    queryFn: async () =>
      engine === 'gl'
        ? glTrialBalanceToLegacy(
            await apiClient.get<GLTrialBalance>(`/accounting/gl/trial-balance${queryString(filters)}`),
          )
        : apiClient.get<TrialBalance>(`/accounting/trial-balance${queryString(filters)}`),
  });
}

export function useProfitLoss(filters: StatementFilters, engine: ReportEngine = 'legacy') {
  return useQuery({
    queryKey: accountingKeys.profitLoss(filters, engine),
    queryFn: async () =>
      engine === 'gl'
        ? glProfitLossToLegacy(
            await apiClient.get<GLProfitLoss>(`/accounting/gl/profit-loss${queryString(filters)}`),
          )
        : apiClient.get<ProfitLoss>(`/accounting/profit-loss${queryString(filters)}`),
  });
}

export function useBalanceSheet(asOf: string, engine: ReportEngine = 'legacy') {
  return useQuery({
    queryKey: accountingKeys.balanceSheet(asOf, engine),
    queryFn: async () =>
      engine === 'gl'
        ? glBalanceSheetToLegacy(
            await apiClient.get<GLBalanceSheet>(
              `/accounting/gl/balance-sheet${asOf ? `?as_of=${asOf}` : ''}`,
            ),
          )
        : apiClient.get<BalanceSheet>(
            `/accounting/balance-sheet${asOf ? `?as_of=${asOf}` : ''}`,
          ),
  });
}

export function useCashFlow(filters: StatementFilters, engine: ReportEngine = 'legacy') {
  return useQuery({
    queryKey: accountingKeys.cashFlow(filters, engine),
    queryFn: async () =>
      engine === 'gl'
        ? glCashFlowToLegacy(
            await apiClient.get<GLCashFlow>(`/accounting/gl/cash-flow${queryString(filters)}`),
          )
        : apiClient.get<CashFlow>(`/accounting/cash-flow${queryString(filters)}`),
  });
}

export function useGLTrialBalance(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.glTrialBalance(filters),
    queryFn: () => apiClient.get<GLTrialBalance>(`/accounting/gl/trial-balance${queryString(filters)}`),
  });
}

export function useGLProfitLoss(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.glProfitLoss(filters),
    queryFn: () => apiClient.get<GLProfitLoss>(`/accounting/gl/profit-loss${queryString(filters)}`),
  });
}

export function useGLBalanceSheet(asOf: string) {
  return useQuery({
    queryKey: accountingKeys.glBalanceSheet(asOf),
    queryFn: () =>
      apiClient.get<GLBalanceSheet>(`/accounting/gl/balance-sheet${asOf ? `?as_of=${asOf}` : ''}`),
  });
}

export function useGLCashFlow(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.glCashFlow(filters),
    queryFn: () => apiClient.get<GLCashFlow>(`/accounting/gl/cash-flow${queryString(filters)}`),
  });
}

export function useGLDayBook(filters: {
  date_from?: string;
  date_to?: string;
  voucher_type?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: accountingKeys.glDayBook(filters),
    queryFn: () => apiClient.get<GLDayBook>(`/accounting/gl/day-book${queryString(filters)}`),
  });
}

export function useGLLedger(accountId: string | null, filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.glLedger(accountId ?? '', filters),
    queryFn: () =>
      apiClient.get<GLLedger>(`/accounting/gl/ledger/${accountId}${queryString(filters)}`),
    enabled: !!accountId,
  });
}

export function useGLPartyStatement(filters: {
  party_type?: string;
  party_id?: string;
  date_from?: string;
  date_to?: string;
}) {
  return useQuery({
    queryKey: accountingKeys.glPartyStatement(filters),
    queryFn: () =>
      apiClient.get<GLPartyStatement>(`/accounting/gl/party-statement${queryString(filters)}`),
  });
}

export function useGLAging(asOf: string) {
  return useQuery({
    queryKey: accountingKeys.glAging(asOf),
    queryFn: () => apiClient.get<GLAging>(`/accounting/gl/aging${asOf ? `?as_of=${asOf}` : ''}`),
  });
}

export function useGLTaxSummary(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.glTaxSummary(filters),
    queryFn: () => apiClient.get<GLTaxSummary>(`/accounting/gl/tax-summary${queryString(filters)}`),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: accountingKeys.accounts(),
    queryFn: () => apiClient.get<Account[]>('/accounting/accounts'),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AccountInput) => apiClient.post<Account>('/accounting/accounts', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.accounts() });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, payload }: { accountId: string; payload: AccountUpdateInput }) =>
      apiClient.patch<Account>(`/accounting/accounts/${accountId}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.accounts() });
    },
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: JournalEntryInput) =>
      apiClient.post<JournalEntry>('/accounting/journal-entries', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.all });
    },
  });
}

export function useJournalEntry(entryId: string | null) {
  return useQuery({
    queryKey: accountingKeys.journalEntry(entryId ?? ''),
    queryFn: () => apiClient.get<JournalEntry>(`/accounting/journal-entries/${entryId}`),
    enabled: !!entryId,
  });
}

export function useJournalEntries(filters: {
  limit?: number;
  offset?: number;
  voucher_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}) {
  return useQuery({
    queryKey: accountingKeys.journalEntries(filters),
    queryFn: () => apiClient.get<JournalEntry[]>(`/accounting/journal-entries${queryString(filters)}`),
  });
}

export function useReconciliation(filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.reconciliation(filters),
    queryFn: () => apiClient.get<Reconciliation>(`/accounting/reconciliation${queryString(filters)}`),
  });
}

export function useFiscalYears() {
  return useQuery({
    queryKey: accountingKeys.fiscalYears(),
    queryFn: () => apiClient.get<FiscalYear[]>('/accounting/fiscal-years'),
  });
}

export function usePeriods(fiscalYearId = '') {
  return useQuery({
    queryKey: accountingKeys.periods(fiscalYearId),
    queryFn: () =>
      apiClient.get<AccountingPeriod[]>(
        `/accounting/periods${fiscalYearId ? `?fiscal_year_id=${fiscalYearId}` : ''}`,
      ),
  });
}

export function useCreateFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      start_date: string;
      end_date: string;
      generate_periods?: boolean;
    }) => apiClient.post<FiscalYear>('/accounting/fiscal-years', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.fiscalYears() });
      void queryClient.invalidateQueries({ queryKey: [...accountingKeys.all, 'periods'] });
    },
  });
}

export function useClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, reason }: { periodId: string; reason?: string }) =>
      apiClient.post<AccountingPeriod>(`/accounting/periods/${periodId}/close`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...accountingKeys.all, 'periods'] });
      void queryClient.invalidateQueries({ queryKey: accountingKeys.fiscalYears() });
    },
  });
}

export function useReopenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, reason }: { periodId: string; reason?: string }) =>
      apiClient.post<AccountingPeriod>(`/accounting/periods/${periodId}/reopen`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...accountingKeys.all, 'periods'] });
      void queryClient.invalidateQueries({ queryKey: accountingKeys.fiscalYears() });
    },
  });
}

export function useAuditLog(filters: {
  limit?: number;
  offset?: number;
  entity_type?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
}) {
  return useQuery({
    queryKey: accountingKeys.auditLog(filters),
    queryFn: () => apiClient.get<AuditLog[]>(`/accounting/audit-log${queryString(filters)}`),
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: accountingKeys.bankAccounts(),
    queryFn: () => apiClient.get<BankAccount[]>('/accounting/bank-accounts'),
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      bank_name?: string | null;
      account_number?: string | null;
      currency?: string;
      gl_account_id: string;
      opening_balance?: string;
      is_active?: boolean;
    }) => apiClient.post<BankAccount>('/accounting/bank-accounts', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.bankAccounts() });
    },
  });
}

export function useBankStatementLines(
  accountId: string,
  filters: { status?: string; date_from?: string; date_to?: string; limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: accountingKeys.bankLines(accountId, filters),
    queryFn: () =>
      apiClient.get<BankStatementLine[]>(
        `/accounting/bank-accounts/${accountId}/statement-lines${queryString(filters)}`,
      ),
    enabled: !!accountId,
  });
}

export function useImportBankStatementLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      lines,
    }: {
      accountId: string;
      lines: Array<{
        statement_date: string;
        description?: string | null;
        reference?: string | null;
        amount: string;
      }>;
    }) =>
      apiClient.post<BankStatementLine[]>(
        `/accounting/bank-accounts/${accountId}/statement-lines`,
        { lines },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-lines', variables.accountId],
      });
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-reconciliation', variables.accountId],
      });
    },
  });
}

export function useAutoMatchBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, dateWindowDays = 3 }: { accountId: string; dateWindowDays?: number }) =>
      apiClient.post<BankAutoMatch>(`/accounting/bank-accounts/${accountId}/auto-match`, {
        date_window_days: dateWindowDays,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-lines', variables.accountId],
      });
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-reconciliation', variables.accountId],
      });
    },
  });
}

export function useMatchBankStatementLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, journalLineId }: { lineId: string; journalLineId: string }) =>
      apiClient.post<BankStatementLine>(`/accounting/bank-statement-lines/${lineId}/match`, {
        journal_line_id: journalLineId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...accountingKeys.all, 'bank-lines'] });
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-reconciliation'],
      });
    },
  });
}

export function useUnmatchBankStatementLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) =>
      apiClient.post<BankStatementLine>(`/accounting/bank-statement-lines/${lineId}/unmatch`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...accountingKeys.all, 'bank-lines'] });
      void queryClient.invalidateQueries({
        queryKey: [...accountingKeys.all, 'bank-reconciliation'],
      });
    },
  });
}

export function useBankReconciliation(accountId: string, filters: StatementFilters) {
  return useQuery({
    queryKey: accountingKeys.bankReconciliation(accountId, filters),
    queryFn: () =>
      apiClient.get<BankReconciliation>(
        `/accounting/bank-accounts/${accountId}/reconciliation${queryString(filters)}`,
      ),
    enabled: !!accountId,
  });
}

export function useInventoryReconciliation(asOf: string) {
  return useQuery({
    queryKey: accountingKeys.inventoryReconciliation(asOf),
    queryFn: () =>
      apiClient.get<InventoryReconciliation>(
        `/accounting/inventory/reconciliation${asOf ? `?as_of=${asOf}` : ''}`,
      ),
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
