'use client';

import { useState } from 'react';
import { SimpleGrid } from '@mantine/core';
import { ClockCounterClockwise, Coins, Scales, Users } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useGLAging } from '../api';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type Row = {
  key: string;
  party_name: string;
  current: string;
  days_31_60: string;
  days_61_90: string;
  days_over_90: string;
  total: string;
  credit_balance: string;
};

export default function AgingPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const money = useMoney('NPR');
  const asOf = toIsoDate(dates.date_to) ?? '';
  const query = useGLAging(asOf);
  const data = query.data;

  const rows: Row[] =
    data?.rows.map((row, index) => ({
      key: row.party_id ?? `party-${index}`,
      party_name: row.party_name,
      current: row.current,
      days_31_60: row.days_31_60,
      days_61_90: row.days_61_90,
      days_over_90: row.days_over_90,
      total: row.total,
      credit_balance: row.credit_balance,
    })) ?? [];

  const columns: Column<Row>[] = [
    { key: 'party', header: 'Party', render: (row) => <span className="font-medium">{row.party_name}</span> },
    { key: 'current', header: 'Current', align: 'right', render: (row) => money(row.current) },
    { key: 'days_31_60', header: '31–60 days', align: 'right', render: (row) => money(row.days_31_60) },
    { key: 'days_61_90', header: '61–90 days', align: 'right', render: (row) => money(row.days_61_90) },
    { key: 'days_over_90', header: '90+ days', align: 'right', render: (row) => money(row.days_over_90) },
    {
      key: 'total',
      header: 'Total receivable',
      align: 'right',
      render: (row) => <span className="font-semibold">{money(row.total)}</span>,
    },
    {
      key: 'credit',
      header: 'Credit balance',
      align: 'right',
      render: (row) => (Number(row.credit_balance) ? money(row.credit_balance) : '—'),
    },
  ];

  const handleExport = () => {
    downloadCsv(
      'receivables-aging.csv',
      ['Party', 'Current', '31-60', '61-90', '90+', 'Total', 'Credit balance'],
      rows.map((row) => [
        row.party_name,
        row.current,
        row.days_31_60,
        row.days_61_90,
        row.days_over_90,
        row.total,
        row.credit_balance,
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title="Receivables Aging"
        subtitle={`Outstanding customer balances by age. ${periodLabel(dates, true)}`}
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} asOf onExport={handleExport} />

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className="mb-4">
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Total receivable"
            value={Number(data.totals.total)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<ClockCounterClockwise size={20} weight="duotone" />}
            label="Current"
            value={Number(data.totals.current)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Users size={20} weight="duotone" />}
            label="31–90 days"
            value={Number(data.totals.days_31_60) + Number(data.totals.days_61_90)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Scales size={20} weight="duotone" />}
            label="90+ days"
            value={Number(data.totals.days_over_90)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.key}
        emptyTitle="No outstanding receivables"
        emptyDescription="Every customer balance is settled as of this date."
        minWidth={900}
      />
    </div>
  );
}
