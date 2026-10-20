'use client';

import Link from 'next/link';
import { SimpleGrid } from '@mantine/core';
import {
  Scales,
  ChartLineUp,
  Buildings,
  Money,
  ArrowRight,
} from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';

const STATEMENTS = [
  {
    href: '/accounting/trial-balance',
    title: 'Trial Balance',
    description: 'Every account with its net debit or credit, proving the books balance.',
    icon: <Scales size={22} weight="duotone" />,
  },
  {
    href: '/accounting/profit-loss',
    title: 'Profit & Loss',
    description: 'Revenue, cost of goods sold and expenses — cost of making vs selling price.',
    icon: <ChartLineUp size={22} weight="duotone" />,
  },
  {
    href: '/accounting/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities and equity with configurable opening balances.',
    icon: <Buildings size={22} weight="duotone" />,
  },
  {
    href: '/accounting/cash-flow',
    title: 'Cash Flow Statement',
    description: 'Cash collected and paid, split into operating, investing and financing.',
    icon: <Money size={22} weight="duotone" />,
  },
];

export default function AccountingPage() {
  return (
    <div>
      <PageHeader
        title="Accounting"
        subtitle="Financial statements derived from your transaction ledger, orders and inventory."
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {STATEMENTS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--foreground)]">{s.title}</span>
                <ArrowRight
                  size={14}
                  className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5"
                />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{s.description}</p>
            </div>
          </Link>
        ))}
      </SimpleGrid>
    </div>
  );
}
