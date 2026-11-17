'use client';

import { useState } from 'react';
import { Select } from '@mantine/core';
import { PageHeader } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useGLDayBook } from '../api';
import JournalEntryDrawer from './JournalEntryDrawer';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type Row = {
  key: string;
  entry_id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  account: string;
  description: string | null;
  debit: string;
  credit: string;
  status: string;
};

const VOUCHER_TYPES = [
  { value: '', label: 'All vouchers' },
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'expense', label: 'Expenses' },
  { value: 'receipt', label: 'Receipts' },
  { value: 'payment', label: 'Payments' },
  { value: 'journal', label: 'Journals' },
  { value: 'opening', label: 'Opening' },
  { value: 'closing', label: 'Closing' },
  { value: 'reversal', label: 'Reversals' },
];

export default function DayBookPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const [voucherType, setVoucherType] = useState<string | null>('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const money = useMoney('NPR');
  const query = useGLDayBook({
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
    voucher_type: voucherType || undefined,
  });
  const data = query.data;

  const rows: Row[] =
    data?.entries.flatMap((entry) =>
      entry.lines.map((line) => ({
        key: `${entry.id}-${line.line_no}`,
        entry_id: entry.id,
        entry_no: entry.entry_no,
        entry_date: entry.entry_date,
        voucher_type: entry.voucher_type,
        account: `${line.account_code} · ${line.account_name}`,
        description: line.description ?? entry.narration ?? entry.reference,
        debit: line.debit,
        credit: line.credit,
        status: entry.status,
      })),
    ) ?? [];

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
    { key: 'account', header: 'Account', render: (row) => row.account },
    {
      key: 'description',
      header: 'Description',
      render: (row) => <span className="text-[var(--muted)]">{row.description || '—'}</span>,
    },
    { key: 'debit', header: 'Debit', align: 'right', render: (row) => (Number(row.debit) ? money(row.debit) : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (row) => (Number(row.credit) ? money(row.credit) : '—') },
  ];

  const handleExport = () => {
    downloadCsv(
      'day-book.csv',
      ['Date', 'Entry', 'Voucher', 'Account', 'Description', 'Debit', 'Credit', 'Status'],
      rows.map((row) => [
        row.entry_date,
        row.entry_no,
        row.voucher_type,
        row.account,
        row.description ?? '',
        row.debit,
        row.credit,
        row.status,
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title="Day Book"
        subtitle={`Posted journal entries and their lines. ${periodLabel(dates)}${data ? ` · ${data.count} entries` : ''}`}
      />

      <ReportToolbar
        dates={dates}
        onDatesChange={setDates}
        onExport={handleExport}
      >
        <Select
          size="sm"
          data={VOUCHER_TYPES}
          value={voucherType}
          onChange={setVoucherType}
          className="w-44"
          allowDeselect={false}
        />
      </ReportToolbar>

      <DataTable
        columns={columns}
        data={rows}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.key}
        sectionBy={(row) => row.entry_no}
        emptyTitle="No entries in this period"
        emptyDescription="Adjust the dates or post a transaction to populate the day book."
        minWidth={900}
      />

      <JournalEntryDrawer entryId={entryId} onClose={() => setEntryId(null)} />
    </div>
  );
}
