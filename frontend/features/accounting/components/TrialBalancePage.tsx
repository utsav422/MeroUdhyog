'use client';

import { useState } from 'react';
import { DataTable, PageHeader, ErrorState, LoadingState } from '@/components/shared';
import type { Column } from '@/components/shared';
import { Badge } from '@mantine/core';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { downloadCsv } from '@/lib/exportCsv';
import { useTrialBalance } from '../api';
import type { TrialBalance, TrialBalanceRow } from '../api';
import StatementShell, { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

const ACCOUNT_TYPE_TONE: Record<string, string> = {
  asset: 'blue',
  liability: 'red',
  equity: 'violet',
  income: 'green',
  expense: 'orange',
};

export default function TrialBalancePage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const filters = { date_from: toIsoDate(dates.date_from), date_to: toIsoDate(dates.date_to) };
  const query = useTrialBalance(filters);
  const currency = 'NPR';
  const money = useMoney(currency);
  const data: TrialBalance | undefined = query.data;

  const columns: Column<TrialBalanceRow>[] = [
    {
      key: 'account',
      header: 'Account',
      render: (row) => (
        <div>
          <div className="font-medium text-[var(--foreground)]">{row.account}</div>
          <div className="text-xs text-[var(--muted)]">{row.code}</div>
        </div>
      ),
    },
    {
      key: 'account_type',
      header: 'Type',
      render: (row) => (
        <Badge color={ACCOUNT_TYPE_TONE[row.account_type] ?? 'gray'} variant="light" size="sm">
          {row.account_type}
        </Badge>
      ),
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      render: (row) => <span className="tabular-nums">{Number(row.debit) ? money(row.debit) : '—'}</span>,
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      render: (row) => <span className="tabular-nums">{Number(row.credit) ? money(row.credit) : '—'}</span>,
    },
  ];

  const handleExport = () => {
    const headers = ['Code', 'Account', 'Type', 'Debit', 'Credit'];
    const rows = (data?.rows ?? []).map((r) => [
      r.code,
      r.account,
      r.account_type,
      r.debit,
      r.credit,
    ]);
    rows.push(['', 'TOTAL', '', data?.total_debit ?? '', data?.total_credit ?? '']);
    downloadCsv('trial-balance.csv', headers, rows);
  };

  const subtitle = data?.as_of ? `As of ${data.as_of}` : 'All recorded transactions';

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        subtitle="Every ledger account with its net debit or credit, so the books can be proven to balance."
      />

      <StatementShell
        title="Trial Balance"
        subtitle={subtitle}
        dates={dates}
        onDatesChange={setDates}
        onExport={handleExport}
      >
        {query.isLoading ? (
          <LoadingState label="Building trial balance…" />
        ) : query.isError ? (
          <ErrorState retry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={data?.rows ?? []}
              getRowId={(row) => row.code + row.account}
              emptyTitle="No accounts"
              emptyDescription="No ledger activity in this period."
            />

            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-black/[0.03] px-4 py-3">
              <div className="flex items-center gap-2">
                {data?.balanced ? (
                  <Badge color="green" leftSection={<CheckCircle size={14} />}>
                    Balanced
                  </Badge>
                ) : (
                  <Badge color="red" leftSection={<WarningCircle size={14} />}>
                    Out of balance
                  </Badge>
                )}
              </div>
              <div className="flex gap-6 text-sm font-semibold tabular-nums">
                <span>Debit {money(data?.total_debit ?? '0')}</span>
                <span>Credit {money(data?.total_credit ?? '0')}</span>
              </div>
            </div>
          </>
        )}
      </StatementShell>
    </div>
  );
}
