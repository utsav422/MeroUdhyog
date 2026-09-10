'use client';

import { Card, SimpleGrid, Text } from '@mantine/core';
import { Bank, Coins, TrendUp, Scales } from '@phosphor-icons/react';
import {
  DataTable,
  PageHeader,
  LoadingState,
  EmptyState,
  ErrorState,
  KPICard,
} from '@/components/shared';
import type { Column } from '@/components/shared';
import { useFinanceTrends } from '../api';
import type { MonthlySummary } from '../api';

function monthLabel(month: string): string {
  const d = new Date(`${month}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function FinancePage() {
  const financeQuery = useFinanceTrends(6);
  const months = financeQuery.data ?? [];
  const latest = months[months.length - 1];
  const currency = latest?.currency ?? 'USD';

  const fmt = (value: string, c: string) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 2,
    }).format(Number(value));

  const monthColumns: Column<MonthlySummary>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (m) => <span className="font-medium text-zinc-800">{monthLabel(m.month)}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (m) => <span>{fmt(m.revenue, m.currency)}</span>,
    },
    {
      key: 'cogs',
      header: 'COGS',
      align: 'right',
      render: (m) => <span>{fmt(m.cogs, m.currency)}</span>,
    },
    {
      key: 'operating_expense',
      header: 'Operating',
      align: 'right',
      render: (m) => <span>{fmt(m.operating_expense, m.currency)}</span>,
    },
    {
      key: 'gross_profit',
      header: 'Gross profit',
      align: 'right',
      render: (m) => <span>{fmt(m.gross_profit, m.currency)}</span>,
    },
    {
      key: 'net_profit',
      header: 'Net profit',
      align: 'right',
      render: (m) => <span>{fmt(m.net_profit, m.currency)}</span>,
    },
    {
      key: 'transaction_count',
      header: 'Txn',
      align: 'right',
      render: (m) => m.transaction_count,
    },
  ];

  if (financeQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Finance" subtitle="Monthly revenue, cost of goods sold and profit from your transaction ledger." />
        <LoadingState label="Loading financial summaries…" />
      </div>
    );
  }

  if (financeQuery.isError) {
    return (
      <div>
        <PageHeader title="Finance" subtitle="Monthly revenue, cost of goods sold and profit from your transaction ledger." />
        <ErrorState retry={() => financeQuery.refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Monthly revenue, cost of goods sold and profit from your transaction ledger. Recalculated after every import or transaction change."
      />

      {latest ? (
        <SimpleGrid cols={4} spacing="md">
          <KPICard
            icon={<Bank size={20} weight="duotone" />}
            label={`Revenue · ${monthLabel(latest.month)}`}
            value={Number(latest.revenue)}
            prefix={`${currency} `}
            format="compact"
          />
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="COGS"
            value={Number(latest.cogs)}
            prefix={`${currency} `}
            format="compact"
          />
          <KPICard
            icon={<Scales size={20} weight="duotone" />}
            label="Operating expense"
            value={Number(latest.operating_expense)}
            prefix={`${currency} `}
            format="compact"
          />
          <KPICard
            icon={<TrendUp size={20} weight="duotone" />}
            label="Net profit"
            value={Number(latest.net_profit)}
            prefix={`${currency} `}
            format="compact"
          />
        </SimpleGrid>
      ) : null}

      <Text fw={600} size="md" mt="xl" mb="md">
        Last 6 months
      </Text>

      {months.length === 0 ? (
        <Card>
          <EmptyState
            title="No financial data yet"
            description="Add transactions or upload an import to see summaries."
          />
        </Card>
      ) : (
        <DataTable columns={monthColumns} data={months} getRowId={(m) => m.month} minWidth={800} />
      )}
    </div>
  );
}
