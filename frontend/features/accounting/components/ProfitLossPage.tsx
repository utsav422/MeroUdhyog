'use client';

import { useState } from 'react';
import { SimpleGrid } from '@mantine/core';
import { Bank, Coins, TrendUp, Percent } from '@phosphor-icons/react';
import { PageHeader, KPICard, ErrorState, LoadingState } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { useProfitLoss } from '../api';
import StatementShell, { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { AmountRow, StatementSection, useMoney } from './StatementRows';

export default function ProfitLossPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const filters = { date_from: toIsoDate(dates.date_from), date_to: toIsoDate(dates.date_to) };
  const query = useProfitLoss(filters);
  const money = useMoney('NPR');
  const data = query.data;

  const handleExport = () => {
    const rows = (data?.lines ?? []).map((l) => [l.label, l.amount]);
    downloadCsv('profit-and-loss.csv', ['Line', 'Amount'], rows);
  };

  const period =
    dates.date_from || dates.date_to
      ? `${toIsoDate(dates.date_from) ?? 'start'} → ${toIsoDate(dates.date_to) ?? 'today'}`
      : 'All time';

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle="Revenue, cost of goods sold and expenses for the period — cost of making versus selling price."
      />

      {data && (
        <SimpleGrid cols={4} spacing="md" className="mb-4">
          <KPICard
            icon={<Bank size={20} weight="duotone" />}
            label="Revenue"
            value={Number(data.revenue)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Coins size={20} weight="duotone" />}
            label="Cost of Goods Sold"
            value={Number(data.cogs)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<TrendUp size={20} weight="duotone" />}
            label="Net Profit"
            value={Number(data.net_profit)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<Percent size={20} weight="duotone" />}
            label="Net Margin"
            value={Number(data.net_margin_pct)}
            prefix=""
            trend={undefined}
          />
        </SimpleGrid>
      )}

      <StatementShell
        title="Profit & Loss Statement"
        subtitle={period}
        dates={dates}
        onDatesChange={setDates}
        onExport={handleExport}
      >
        {query.isLoading ? (
          <LoadingState label="Computing profit & loss…" />
        ) : query.isError ? (
          <ErrorState retry={() => query.refetch()} />
        ) : (
          <>
            <StatementSection title="Income">
              <AmountRow label="Revenue (Sales)" amount={money(data?.revenue ?? '0')} />
            </StatementSection>

            <StatementSection
              title="Cost of Sales"
              footer={
                <AmountRow
                  label="Gross Profit"
                  amount={money(data?.gross_profit ?? '0')}
                  strong
                />
              }
            >
              <AmountRow
                label={`Cost of Goods Sold${
                  data?.cogs_basis === 'purchases' ? ' (from purchases)' : ''
                }`}
                amount={money(data?.cogs ?? '0')}
                muted
              />
            </StatementSection>

            <StatementSection title="Operating Expenses">
              <AmountRow
                label="Operating Expenses"
                amount={money(data?.operating_expenses ?? '0')}
                muted
              />
            </StatementSection>

            <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
              <span className="text-sm font-bold uppercase tracking-wide text-brand-800">
                Net Profit
              </span>
              <span className="tabular-nums text-base font-bold text-brand-800">
                {money(data?.net_profit ?? '0')}
              </span>
            </div>

            <p className="mt-4 text-xs text-[var(--muted)]">
              Gross margin {Number(data?.gross_margin_pct ?? 0).toFixed(1)}% · Net margin{' '}
              {Number(data?.net_margin_pct ?? 0).toFixed(1)}% · COGS basis:{' '}
              {data?.cogs_basis === 'cost_price' ? 'variant cost price' : 'purchases'}
            </p>
          </>
        )}
      </StatementShell>
    </div>
  );
}
