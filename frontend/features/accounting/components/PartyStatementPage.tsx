'use client';

import { useState } from 'react';
import { Select, SimpleGrid } from '@mantine/core';
import { UserList, Coins, Scales } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useCustomers } from '@/features/customers/api';
import { useGLPartyStatement } from '../api';
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

export default function PartyStatementPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const money = useMoney('NPR');
  const customersQuery = useCustomers();
  const query = useGLPartyStatement({
    party_type: 'customer',
    party_id: partyId ?? undefined,
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
  });
  const data = query.data;

  const customers = (customersQuery.data ?? []).map((customer) => ({
    value: customer.id,
    label: customer.name,
  }));

  const rows: Row[] =
    data?.lines.map((line, index) => ({
      key: `${line.entry_id}-${index}`,
      entry_id: line.entry_id,
      entry_date: line.entry_date,
      entry_no: line.entry_no,
      voucher_type: line.voucher_type,
      reference: line.reference,
      description: line.narration,
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
      header: 'Narration',
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
      'party-statement.csv',
      ['Date', 'Entry', 'Voucher', 'Reference', 'Narration', 'Debit', 'Credit', 'Balance'],
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
        title="Party Statement"
        subtitle="Receivable activity for one customer, with opening and closing balances."
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} onExport={data ? handleExport : undefined}>
        <Select
          size="sm"
          searchable
          placeholder="Choose a customer"
          data={customers}
          value={partyId}
          onChange={setPartyId}
          leftSection={<UserList size={15} />}
          className="w-64"
          clearable
          nothingFoundMessage="No customers"
        />
      </ReportToolbar>

      {data && partyId && (
        <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md" className="mb-4">
          <KPICard
            icon={<UserList size={20} weight="duotone" />}
            label={data.party_name}
            value={Number(data.closing_balance)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Opening balance"
            value={Number(data.opening_balance)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Scales size={20} weight="duotone" />}
            label="Debits"
            value={Number(data.total_debit)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Scales size={20} weight="duotone" />}
            label="Credits"
            value={Number(data.total_credit)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={query.isLoading || customersQuery.isLoading}
        error={query.isError || customersQuery.isError}
        retry={() => {
          void query.refetch();
          void customersQuery.refetch();
        }}
        getRowId={(row) => row.key}
        emptyTitle={partyId ? 'No party activity' : 'Choose a customer'}
        emptyDescription={
          partyId
            ? `No receivable postings ${periodLabel(dates).toLowerCase()}.`
            : 'Select a customer to see their statement.'
        }
        minWidth={900}
      />

      <JournalEntryDrawer entryId={entryId} onClose={() => setEntryId(null)} />
    </div>
  );
}
