'use client';

import { useState } from 'react';
import { Select, SimpleGrid } from '@mantine/core';
import { BookOpenText, Coins, Scales } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useAccounts, useGLLedger } from '../api';
import JournalEntryDrawer from './JournalEntryDrawer';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type Row = {
  key: string;
  entry_id: string;
  entry_date: string;
  entry_no: string;
  voucher_type: string;
  reference: string | null;
  description: string | null;
  debit: string;
  credit: string;
  balance: string;
};

export default function LedgerPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const money = useMoney('NPR');
  const accountsQuery = useAccounts();
  const query = useGLLedger(accountId, {
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
  });
  const data = query.data;

  const accounts = (accountsQuery.data ?? [])
    .filter((account) => !account.is_group)
    .map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }));

  const rows: Row[] =
    data?.lines.map((line, index) => ({
      key: `${line.entry_id}-${index}`,
      entry_id: line.entry_id,
      entry_date: line.entry_date,
      entry_no: line.entry_no,
      voucher_type: line.voucher_type,
      reference: line.reference,
      description: line.description ?? line.narration,
      debit: line.debit,
      credit: line.credit,
      balance: line.balance,
    })) ?? [];

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Date', render: (row) => row.entry_date, width: 110 },
    {
      key: 'entry',
      header: 'Entry',
      render: (row) => (
        <button
          type="button"
          onClick={() => setEntryId(row.entry_id)}
          className="font-medium text-brand-700 hover:underline"
        >
          {row.entry_no}
        </button>
      ),
    },
    { key: 'type', header: 'Voucher', render: (row) => <span className="capitalize">{row.voucher_type}</span> },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    {
      key: 'description',
      header: 'Description',
      render: (row) => <span className="text-[var(--muted)]">{row.description || '—'}</span>,
    },
    { key: 'debit', header: 'Debit', align: 'right', render: (row) => (Number(row.debit) ? money(row.debit) : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (row) => (Number(row.credit) ? money(row.credit) : '—') },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className="font-medium">{money(row.balance)}</span>,
    },
  ];

  const handleExport = () => {
    downloadCsv(
      'ledger.csv',
      ['Date', 'Entry', 'Voucher', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
      rows.map((row) => [
        row.entry_date,
        row.entry_no,
        row.voucher_type,
        row.reference ?? '',
        row.description ?? '',
        row.debit,
        row.credit,
        row.balance,
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title="Account Ledger"
        subtitle="Every posting to a single account, with a running balance."
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} onExport={data ? handleExport : undefined}>
        <Select
          size="sm"
          searchable
          placeholder="Choose an account"
          data={accounts}
          value={accountId}
          onChange={setAccountId}
          leftSection={<BookOpenText size={15} />}
          className="w-72"
          nothingFoundMessage="No accounts"
        />
      </ReportToolbar>

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className="mb-4">
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Opening balance"
            value={Number(data.opening_balance)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<BookOpenText size={20} weight="duotone" />}
            label="Debits / Credits"
            value={Number(data.total_debit) - Number(data.total_credit)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Scales size={20} weight="duotone" />}
            label="Closing balance"
            value={Number(data.closing_balance)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={query.isLoading || accountsQuery.isLoading}
        error={query.isError || accountsQuery.isError}
        retry={() => {
          void query.refetch();
          void accountsQuery.refetch();
        }}
        getRowId={(row) => row.key}
        emptyTitle={accountId ? 'No postings for this account' : 'Choose an account'}
        emptyDescription={
          accountId
            ? `No ledger lines ${periodLabel(dates).toLowerCase()}.`
            : 'Select an account above to see its ledger.'
        }
        minWidth={900}
      />

      <JournalEntryDrawer entryId={entryId} onClose={() => setEntryId(null)} />
    </div>
  );
}
