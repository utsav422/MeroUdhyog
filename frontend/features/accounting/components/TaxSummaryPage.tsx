'use client';

import { useState } from 'react';
import { SimpleGrid } from '@mantine/core';
import { Receipt, Coins, ArrowsLeftRight, Percent } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useGLTaxSummary } from '../api';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type Row = {
  key: string;
  period: string;
  output_vat: string;
  input_vat: string;
  net_payable: string;
  tds_receivable: string;
  tds_payable: string;
  net_tds: string;
};

export default function TaxSummaryPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const money = useMoney('NPR');
  const query = useGLTaxSummary({
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
  });
  const data = query.data;

  const rows: Row[] =
    data?.lines.map((line) => ({
      key: line.period,
      period: line.period,
      output_vat: line.output_vat,
      input_vat: line.input_vat,
      net_payable: line.net_payable,
      tds_receivable: line.tds_receivable,
      tds_payable: line.tds_payable,
      net_tds: line.net_tds,
    })) ?? [];

  const columns: Column<Row>[] = [
    { key: 'period', header: 'Period', render: (row) => <span className="font-medium">{row.period}</span> },
    { key: 'output', header: 'Output VAT', align: 'right', render: (row) => money(row.output_vat) },
    { key: 'input', header: 'Input VAT', align: 'right', render: (row) => money(row.input_vat) },
    {
      key: 'net',
      header: 'Net VAT payable',
      align: 'right',
      render: (row) => <span className="font-semibold">{money(row.net_payable)}</span>,
    },
    { key: 'tds_receivable', header: 'TDS receivable', align: 'right', render: (row) => money(row.tds_receivable) },
    { key: 'tds_payable', header: 'TDS payable', align: 'right', render: (row) => money(row.tds_payable) },
    {
      key: 'net_tds',
      header: 'Net TDS',
      align: 'right',
      render: (row) => <span className="font-semibold">{money(row.net_tds)}</span>,
    },
  ];

  const handleExport = () => {
    downloadCsv(
      'tax-summary.csv',
      ['Period', 'Output VAT', 'Input VAT', 'Net VAT', 'TDS receivable', 'TDS payable', 'Net TDS'],
      rows.map((row) => [
        row.period,
        row.output_vat,
        row.input_vat,
        row.net_payable,
        row.tds_receivable,
        row.tds_payable,
        row.net_tds,
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title="Tax Summary"
        subtitle={`VAT and TDS position from the general ledger. ${periodLabel(dates)}`}
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} onExport={handleExport} />

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className="mb-4">
          <KPICard
            icon={<Receipt size={20} weight="duotone" />}
            label="Output VAT"
            value={Number(data.output_vat)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Input VAT"
            value={Number(data.input_vat)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Percent size={20} weight="duotone" />}
            label="Net VAT payable"
            value={Number(data.net_payable)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<ArrowsLeftRight size={20} weight="duotone" />}
            label="Net TDS"
            value={Number(data.net_tds)}
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
        emptyTitle="No tax activity"
        emptyDescription="No VAT or TDS postings in this period."
        minWidth={900}
      />
    </div>
  );
}
