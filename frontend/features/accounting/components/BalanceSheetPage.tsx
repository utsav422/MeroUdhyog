'use client';

import { useState } from 'react';
import { Badge, Button, Drawer, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { CheckCircle, Gear, WarningCircle } from '@phosphor-icons/react';
import { PageHeader, ErrorState, LoadingState } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import {
  useAccountingSettings,
  useBalanceSheet,
  useUpdateAccountingSettings,
} from '../api';
import type { AccountingSettings } from '../api';
import StatementShell, { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { AmountRow, StatementSection, useMoney } from './StatementRows';

const OPENING_FIELDS: { key: keyof AccountingSettings; label: string }[] = [
  { key: 'opening_cash', label: 'Opening cash & bank' },
  { key: 'opening_receivables', label: 'Opening receivables' },
  { key: 'opening_inventory', label: 'Opening inventory' },
  { key: 'opening_other_assets', label: 'Opening other assets' },
  { key: 'opening_payables', label: 'Opening payables' },
  { key: 'opening_loans', label: 'Opening loans' },
  { key: 'opening_capital', label: "Opening owner's capital" },
];

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const iso = toIsoDate(asOf.date_to) ?? '';
  const query = useBalanceSheet(iso);
  const settingsQuery = useAccountingSettings();
  const updateSettings = useUpdateAccountingSettings();
  const money = useMoney('NPR');
  const data = query.data;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});

  const openDrawer = () => {
    const s = settingsQuery.data;
    if (s) {
      setDraft(
        Object.fromEntries(OPENING_FIELDS.map((f) => [f.key, Number(s[f.key] ?? 0)])),
      );
    }
    setDrawerOpen(true);
  };

  const save = () => {
    const payload: Partial<AccountingSettings> = {};
    for (const f of OPENING_FIELDS) {
      (payload as Record<string, string>)[f.key] = String(draft[f.key] ?? 0);
    }
    updateSettings.mutate(payload, { onSuccess: () => setDrawerOpen(false) });
  };

  const handleExport = () => {
    const rows: (string | number)[][] = [];
    for (const line of data?.assets ?? []) rows.push(['Asset', line.label, line.amount]);
    for (const line of data?.liabilities ?? []) rows.push(['Liability', line.label, line.amount]);
    for (const line of data?.equity ?? []) rows.push(['Equity', line.label, line.amount]);
    rows.push(['', 'Total Assets', data?.total_assets ?? '0']);
    rows.push(['', 'Total Liabilities + Equity', String(Number(data?.total_liabilities ?? 0) + Number(data?.total_equity ?? 0))]);
    downloadCsv('balance-sheet.csv', ['Section', 'Line', 'Amount'], rows);
  };

  return (
    <div>
      <PageHeader
        title="Balance Sheet"
        subtitle="Assets, liabilities and equity as of a date. Set opening balances so the sheet opens from a known position."
        actions={
          <Button variant="light" color="brand" leftSection={<Gear size={16} />} onClick={openDrawer}>
            Opening balances
          </Button>
        }
      />

      <StatementShell
        title="Balance Sheet"
        subtitle={data?.as_of ? `As of ${data.as_of}` : 'Current position'}
        dates={asOf}
        onDatesChange={setAsOf}
        onExport={handleExport}
      >
        {query.isLoading ? (
          <LoadingState label="Building balance sheet…" />
        ) : query.isError ? (
          <ErrorState retry={() => query.refetch()} />
        ) : (
          <>
            <StatementSection title="Assets">
              {(data?.assets ?? []).map((line) => (
                <AmountRow key={line.label} label={line.label} amount={money(line.amount)} />
              ))}
            </StatementSection>

            <StatementSection title="Liabilities">
              {(data?.liabilities ?? []).map((line) => (
                <AmountRow key={line.label} label={line.label} amount={money(line.amount)} />
              ))}
            </StatementSection>

            <StatementSection title="Equity">
              {(data?.equity ?? []).map((line) => (
                <AmountRow key={line.label} label={line.label} amount={money(line.amount)} />
              ))}
            </StatementSection>

            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Total label="Total Assets" amount={money(data?.total_assets ?? '0')} />
              <Total label="Total Liabilities" amount={money(data?.total_liabilities ?? '0')} />
              <Total label="Total Equity" amount={money(data?.total_equity ?? '0')} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-black/[0.03] px-4 py-3">
              {data?.balanced ? (
                <Badge color="green" leftSection={<CheckCircle size={14} />}>
                  Balanced
                </Badge>
              ) : (
                <Badge color="orange" leftSection={<WarningCircle size={14} />}>
                  Difference {money(data?.difference ?? '0')}
                </Badge>
              )}
              <Text size="xs" c="var(--muted)">
                Assets = Liabilities + Equity
              </Text>
            </div>
          </>
        )}
      </StatementShell>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Opening balances"
        position="right"
        size="md"
      >
        <Text size="xs" c="var(--muted)" mb="md">
          State the position as of the day your books open. Positive values are entered on the
          normal side (assets & receivables as debit, payables, loans and capital as credit).
        </Text>
        <Stack gap="sm">
          {OPENING_FIELDS.map((f) => (
            <NumberInput
              key={f.key}
              label={f.label}
              value={draft[f.key] ?? 0}
              onChange={(v) => setDraft((d) => ({ ...d, [f.key]: Number(v) || 0 }))}
              thousandSeparator=","
              decimalScale={2}
              min={0}
              leftSection="Rs"
            />
          ))}
          <TextInput label="Business name" value={settingsQuery.data?.business_name ?? ''} readOnly />
          <Button
            mt="sm"
            color="brand"
            loading={updateSettings.isPending}
            onClick={save}
            disabled={updateSettings.isPending}
          >
            Save opening balances
          </Button>
        </Stack>
      </Drawer>
    </div>
  );
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 text-base font-bold tabular-nums text-[var(--foreground)]">{amount}</div>
    </div>
  );
}
