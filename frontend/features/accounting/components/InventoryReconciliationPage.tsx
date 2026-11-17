'use client';

import { useState } from 'react';
import { SimpleGrid } from '@mantine/core';
import { Archive, CheckCircle, Coins, WarningCircle } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { downloadCsv } from '@/lib/exportCsv';
import { useInventoryReconciliation, type InventoryReconciliationRow } from '../api';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

export default function InventoryReconciliationPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const money = useMoney('NPR');
  const asOf = toIsoDate(dates.date_to) ?? '';
  const query = useInventoryReconciliation(asOf);
  const data = query.data;

  const columns: Column<InventoryReconciliationRow>[] = [
    { key: 'product', header: 'Product', render: (row) => <span className="font-medium">{row.product_name}</span> },
    { key: 'variant', header: 'Variant', render: (row) => row.variant_name },
    { key: 'sku', header: 'SKU', render: (row) => row.sku || '—' },
    { key: 'quantity', header: 'Qty', align: 'right', render: (row) => row.quantity },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (row) => money(row.unit_cost) },
    {
      key: 'value',
      header: 'Stock value',
      align: 'right',
      render: (row) => <span className="font-semibold">{money(row.value)}</span>,
    },
  ];

  const handleExport = () => {
    downloadCsv(
      'inventory-reconciliation.csv',
      ['Product', 'Variant', 'SKU', 'Quantity', 'Unit cost', 'Value'],
      (data?.rows ?? []).map((row) => [
        row.product_name,
        row.variant_name,
        row.sku ?? '',
        row.quantity,
        row.unit_cost,
        row.value,
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title="Inventory Reconciliation"
        subtitle={`Compare stock value at weighted-average cost with the inventory control accounts. ${periodLabel(dates, true)}`}
      />

      <ReportToolbar dates={dates} onDatesChange={setDates} asOf onExport={data ? handleExport : undefined} />

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className="mb-4">
          <KPICard
            icon={<Archive size={20} weight="duotone" />}
            label="GL inventory"
            value={Number(data.gl_inventory)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Stock value"
            value={Number(data.stock_value)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={data.balanced ? <CheckCircle size={20} weight="duotone" /> : <WarningCircle size={20} weight="duotone" />}
            label={data.balanced ? 'Balanced' : 'Difference'}
            value={Number(data.difference)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.variant_id}
        emptyTitle="No stock on hand"
        emptyDescription="There are no variants with inventory to reconcile."
        minWidth={800}
      />
    </div>
  );
}
