'use client';

import Link from 'next/link';
import { SimpleGrid } from '@mantine/core';
import {
  Scales,
  ChartLineUp,
  Buildings,
  Money,
  ArrowRight,
  BookOpenText,
  BookBookmark,
  UserList,
  CalendarBlank,
  Receipt,
  ArrowsClockwise,
  Bank,
  Archive,
  CalendarCheck,
  ShieldCheck,
  SlidersHorizontal,
  Notebook,
  Files,
} from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import { useSession } from '@/lib/providers';

type OverviewItem = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  permission?: string;
  anyPermission?: string[];
};

type OverviewGroup = {
  title: string;
  description: string;
  items: OverviewItem[];
  permission?: string;
  anyPermission?: string[];
};

const GROUPS: OverviewGroup[] = [
  {
    title: 'Books & registers',
    description: 'The raw journal and the books behind every statement.',
    permission: 'view_all',
    items: [
      {
        href: '/accounting/day-book',
        title: 'Day Book',
        description: 'Posted journal entries with debit and credit lines.',
        icon: <BookOpenText size={22} weight="duotone" />,
      },
      {
        href: '/accounting/journal-entry',
        title: 'Voucher Entry',
        description: 'Post a balanced manual journal entry with debit and credit lines.',
        icon: <Notebook size={22} weight="duotone" />,
        permission: 'manage_transactions',
      },
      {
        href: '/accounting/ledger',
        title: 'Account Ledger',
        description: 'Postings and running balance for any account.',
        icon: <BookBookmark size={22} weight="duotone" />,
      },
      {
        href: '/accounting/party-statement',
        title: 'Party Statement',
        description: 'Customer receivable activity with opening and closing balances.',
        icon: <UserList size={22} weight="duotone" />,
      },
    ],
  },
  {
    title: 'Financial statements',
    description: 'Legacy or general-ledger reports, switchable in accounting settings.',
    permission: 'view_all',
    items: [
      {
        href: '/accounting/trial-balance',
        title: 'Trial Balance',
        description: 'Every account with its net debit or credit, proving the books balance.',
        icon: <Scales size={22} weight="duotone" />,
      },
      {
        href: '/accounting/profit-loss',
        title: 'Profit & Loss',
        description: 'Revenue, cost of goods sold and expenses for the period.',
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
    ],
  },
  {
    title: 'Receivables & tax',
    description: 'Who owes you, how old it is, and the VAT/TDS position.',
    permission: 'view_all',
    items: [
      {
        href: '/accounting/aging',
        title: 'Receivables Aging',
        description: 'Outstanding customer balances bucketed by age.',
        icon: <CalendarBlank size={22} weight="duotone" />,
      },
      {
        href: '/accounting/tax-summary',
        title: 'Tax Summary',
        description: 'Output VAT, input VAT, net payable and TDS balances.',
        icon: <Receipt size={22} weight="duotone" />,
      },
    ],
  },
  {
    title: 'Controls',
    description: 'Prove the ledger, reconcile cash and stock, and lock the books.',
    permission: 'view_all',
    items: [
      {
        href: '/accounting/accounts',
        title: 'Chart of Accounts',
        description: 'Add custom accounts and maintain names, groups and active status.',
        icon: <Files size={22} weight="duotone" />,
        permission: 'manage_accounting',
      },
      {
        href: '/accounting/reconciliation',
        title: 'Ledger Reconciliation',
        description: 'Compare GL balances with transaction-derived statements.',
        icon: <ArrowsClockwise size={22} weight="duotone" />,
      },
      {
        href: '/accounting/bank',
        title: 'Bank Reconciliation',
        description: 'Import statement lines and match them to journal lines.',
        icon: <Bank size={22} weight="duotone" />,
      },
      {
        href: '/accounting/inventory',
        title: 'Inventory Reconciliation',
        description: 'Compare weighted-average stock value with inventory control accounts.',
        icon: <Archive size={22} weight="duotone" />,
      },
      {
        href: '/accounting/periods',
        title: 'Fiscal Years & Periods',
        description: 'Create fiscal years and close or reopen accounting periods.',
        icon: <CalendarCheck size={22} weight="duotone" />,
        anyPermission: ['manage_accounting', 'close_period'],
      },
      {
        href: '/accounting/audit-log',
        title: 'Audit Trail',
        description: 'Posting, period and reconciliation changes with before/after data.',
        icon: <ShieldCheck size={22} weight="duotone" />,
        permission: 'view_audit',
      },
      {
        href: '/accounting/settings',
        title: 'Accounting Settings',
        description: 'Choose the report engine and set the opening position.',
        icon: <SlidersHorizontal size={22} weight="duotone" />,
        anyPermission: ['manage_accounting', 'manage_settings'],
      },
    ],
  },
];

export default function AccountingPage() {
  const session = useSession();
  const isOwner = session?.role === 'owner';
  const held = new Set(session?.permissions ?? []);
  const canSee = (permission?: string, anyPermission?: string[]) => {
    if (isOwner) return true;
    if (permission && !held.has(permission)) return false;
    if (anyPermission && !anyPermission.some((p) => held.has(p))) return false;
    return true;
  };

  const groups = GROUPS.filter((group) => canSee(group.permission, group.anyPermission))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canSee(item.permission ?? group.permission, item.anyPermission ?? group.anyPermission),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Accounting"
        subtitle="General ledger, financial statements, receivables, tax and accounting controls."
      />

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.title}>
            <div className="mb-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--foreground)]">
                {group.title}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted)]">{group.description}</p>
            </div>
            <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--foreground)]">{item.title}</span>
                      <ArrowRight
                        size={14}
                        className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{item.description}</p>
                  </div>
                </Link>
              ))}
            </SimpleGrid>
          </section>
        ))}
      </div>
    </div>
  );
}
