'use client';

import { useState } from 'react';
import { SimpleGrid } from '@mantine/core';
import { ArrowsLeftRight, Bank, TrendDown, TrendUp } from '@phosphor-icons/react';
import { PageHeader, KPICard, ErrorState, LoadingState } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { useCashFlow } from '../api';
import StatementShell, { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { AmountRow, StatementSection, useMoney } from './StatementRows';

export default function CashFlowPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const filters = { date_from: toIsoDate(dates.date_from), date_to: toIsoDate(dates.date_to) };
  const query = useCashFlow(filters);
  const money = useMoney('NPR');
  const data = query.data;

  const handleExport = () => {
    const rows: (string | number)[][] = [];
    for (const l of data?.operating ?? []) rows.push(['Operating', l.label, l.amount]);
    for (const l of data?.investing ?? []) rows.push(['Investing', l.label, l.amount]);
    for (const l of data?.financing ?? []) rows.push(['Financing', l.label, l.amount]);
    rows.push(['', 'Net change in cash', data?.net_change ?? '0']);
    rows.push(['', 'Closing cash', data?.closing_cash ?? '0']);
    downloadCsv('cash-flow.csv', ['Section', 'Line', 'Amount'], rows);
  };

  const period =
    dates.date_from || dates.date_to
      ? `${toIsoDate(dates.date_from) ?? 'start'} → ${toIsoDate(dates.date_to) ?? 'today'}`
      : 'All time';

  return (
    <div>
      <PageHeader
        title="Cash Flow Statement"
        subtitle="Cash actually collected and paid out in the period, split into operating, investing and financing activities."
      />

      {data && (
        <SimpleGrid cols={4} spacing="md" className="mb-4">
          <KPICard
            icon={<Bank size={20} weight="duotone" />}
            label="Opening cash"
            value={Number(data.opening_cash)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<TrendUp size={20} weight="duotone" />}
            label="Net change"
            value={Number(data.net_change)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<ArrowsLeftRight size={20} weight="duotone" />}
            label="Operating"
            value={Number(data.net_operating)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<TrendDown size={20} weight="duotone" />}
            label="Closing cash"
            value={Number(data.closing_cash)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <StatementShell
        title="Cash Flow Statement"
        subtitle={period}
        dates={dates}
        onDatesChange={setDates}
        onExport={handleExport}
      >
        {query.isLoading ? (
          <LoadingState label="Computing cash flow…" />
        ) : query.isError ? (
          <ErrorState retry={() => query.refetch()} />
        ) : (
          <>
            <StatementSection title="Operating Activities">
              {(data?.operating ?? []).map((l) => (
                <AmountRow key={l.label} label={l.label} amount={money(l.amount)} />
              ))}
            </StatementSection>

            <StatementSection title="Investing Activities">
              {(data?.investing ?? []).length === 0 ? (
                <AmountRow label="None recorded" amount={money('0')} muted />
              ) : (
                (data?.investing ?? []).map((l) => (
                  <AmountRow key={l.label} label={l.label} amount={money(l.amount)} />
                ))
              )}
            </StatementSection>

            <StatementSection title="Financing Activities">
              {(data?.financing ?? []).length === 0 ? (
                <AmountRow label="None recorded" amount={money('0')} muted />
              ) : (
                (data?.financing ?? []).map((l) => (
                  <AmountRow key={l.label} label={l.label} amount={money(l.amount)} />
                ))
              )}
            </StatementSection>

            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Total label="Opening Cash" amount={money(data?.opening_cash ?? '0')} />
              <Total label="Net Change" amount={money(data?.net_change ?? '0')} />
              <Total label="Closing Cash" amount={money(data?.closing_cash ?? '0')} highlight />
            </div>
          </>
        )}
      </StatementShell>
    </div>
  );
}

function Total({ label, amount, highlight }: { label: string; amount: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight ? 'border-brand-200 bg-brand-50' : 'border-[var(--border)]'
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 text-base font-bold tabular-nums text-[var(--foreground)]">{amount}</div>
    </div>
  );
}
