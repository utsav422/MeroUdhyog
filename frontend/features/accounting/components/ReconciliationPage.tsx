'use client';

import { useState } from 'react';
import { Alert, SimpleGrid } from '@mantine/core';
import { CheckCircle, WarningCircle, Receipt, ListChecks } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { useReconciliation } from '../api';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type Row = {
  key: string;
  check: string;
  gl_amount: string;
  legacy_amount: string;
  difference: string;
  status: string;
  note: string | null;
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'matched'
      ? 'bg-success-50 text-success-700'
      : status === 'difference'
        ? 'bg-danger-50 text-danger-700'
        : 'bg-black/5 text-[var(--muted)]';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}>
      {status}
    </span>
  );
}

export default function ReconciliationPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const money = useMoney('NPR');
  const query = useReconciliation({
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
  });
  const data = query.data;

  const rows: Row[] =
    data?.lines.map((line, index) => ({
      key: `${line.check}-${index}`,
      check: line.check,
      gl_amount: line.gl_amount,
      legacy_amount: line.legacy_amount,
      difference: line.difference,
      status: line.status,
      note: line.note,
    })) ?? [];

  const columns: Column<Row>[] = [
    { key: 'check', header: 'Check', render: (row) => <span className="font-medium">{row.check}</span> },
    { key: 'gl', header: 'GL amount', align: 'right', render: (row) => money(row.gl_amount) },
    { key: 'legacy', header: 'Legacy amount', align: 'right', render: (row) => money(row.legacy_amount) },
    {
      key: 'difference',
      header: 'Difference',
      align: 'right',
      render: (row) => (
        <span className={Number(row.difference) ? 'font-semibold text-danger-600' : 'text-[var(--muted)]'}>
          {money(row.difference)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'note',
      header: 'Note',
      render: (row) => <span className="text-[var(--muted)]">{row.note || '—'}</span>,
    },
  ];

  const coreDifferences = (data?.lines ?? []).filter(
    (line) => line.status === 'difference',
  ).length;

  return (
    <div>
      <PageHeader
        title="Ledger Reconciliation"
        subtitle={`Compare general-ledger balances with the transaction-derived statements. ${periodLabel(dates)}`}
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} />

      {data && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className="mb-4">
            <KPICard
              icon={<Receipt size={20} weight="duotone" />}
              label="Transactions"
              value={data.transactions_total}
              format="number"
            />
            <KPICard
              icon={<ListChecks size={20} weight="duotone" />}
              label="Posted"
              value={data.transactions_posted}
              format="number"
            />
            <KPICard
              icon={<WarningCircle size={20} weight="duotone" />}
              label="Missing postings"
              value={data.transactions_missing}
              format="number"
            />
            <KPICard
              icon={<CheckCircle size={20} weight="duotone" />}
              label="Core differences"
              value={coreDifferences}
              format="number"
            />
          </SimpleGrid>

          {data.notes.length > 0 && (
            <Alert
              color="blue"
              variant="light"
              className="mb-4"
              title="Reconciliation notes"
              icon={<CheckCircle size={18} />}
            >
              <ul className="list-disc pl-4 text-sm">
                {data.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Alert>
          )}
        </>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.key}
        emptyTitle="No reconciliation checks"
        emptyDescription="No ledger activity found for this period."
        minWidth={900}
      />
    </div>
  );
}
