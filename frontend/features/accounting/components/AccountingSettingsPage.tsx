'use client';

import { useState } from 'react';
import {
  Button,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { Gear } from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import { ApiClientError } from '@/lib/api-client';
import {
  useAccountingSettings,
  useUpdateAccountingSettings,
  type AccountingSettings,
} from '../api';
import { toIsoDate } from './StatementShell';

const OPENING_FIELDS: { key: keyof AccountingSettings; label: string }[] = [
  { key: 'opening_cash', label: 'Cash & bank' },
  { key: 'opening_receivables', label: 'Receivables' },
  { key: 'opening_inventory', label: 'Inventory' },
  { key: 'opening_other_assets', label: 'Other assets' },
  { key: 'opening_payables', label: 'Payables' },
  { key: 'opening_loans', label: 'Loans' },
  { key: 'opening_capital', label: "Owner's capital" },
];

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function AccountingSettingsPage() {
  const query = useAccountingSettings();
  const update = useUpdateAccountingSettings();
  const [edited, setEdited] = useState<Partial<AccountingSettings> | null>(null);
  const draft: Partial<AccountingSettings> = edited ?? query.data ?? {};

  const set = <K extends keyof AccountingSettings>(key: K, value: AccountingSettings[K]) => {
    setEdited((current) => ({ ...(current ?? query.data ?? {}), [key]: value }));
  };

  const save = () => {
    const payload: Partial<AccountingSettings> = {
      business_name: draft.business_name ?? null,
      fiscal_year_start_month: draft.fiscal_year_start_month,
      book_start_date: draft.book_start_date ?? null,
      currency: draft.currency,
      report_engine: draft.report_engine,
    };
    for (const field of OPENING_FIELDS) {
      (payload as Record<string, string>)[field.key] = String(draft[field.key] ?? '0');
    }
    update.mutate(payload, {
      onSuccess: () => {
        setEdited(null);
        notifications.show({
          color: 'green',
          title: 'Accounting settings saved',
          message: 'Opening balances and report engine have been updated.',
        });
      },
      onError: (error) => {
        notifications.show({
          color: 'red',
          title: 'Could not save settings',
          message: error instanceof ApiClientError ? error.message : 'Unexpected error',
        });
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Accounting Settings"
        subtitle="Choose the reporting engine and configure the opening position of the books."
        actions={<Gear size={22} className="text-[var(--muted)]" />}
      />

      {query.isLoading ? (
        <div className="text-sm text-[var(--muted)]">Loading settings…</div>
      ) : query.isError ? (
        <div className="text-sm text-danger-600">Could not load accounting settings.</div>
      ) : (
        <Stack gap="lg">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <Title order={3} className="mb-4 text-base">Books</Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Business name"
                value={draft.business_name ?? ''}
                onChange={(event) => set('business_name', event.currentTarget.value)}
              />
              <TextInput
                label="Currency"
                value={draft.currency ?? 'NPR'}
                onChange={(event) => set('currency', event.currentTarget.value.toUpperCase())}
                maxLength={3}
              />
              <NumberInput
                label="Fiscal year starts in month"
                min={1}
                max={12}
                value={draft.fiscal_year_start_month ?? 1}
                onChange={(value) => set('fiscal_year_start_month', Number(value) || 1)}
              />
              <DatePickerInput
                label="Books start date"
                placeholder="Opening balance date"
                value={toDate(draft.book_start_date)}
                onChange={(value) => set('book_start_date', toIsoDate(value as Date | null) ?? null)}
              />
              <Select
                label="Report engine"
                description="GL reports use posted journal entries. Legacy reports derive from transactions."
                data={[
                  { value: 'legacy', label: 'Legacy transaction reports' },
                  { value: 'gl', label: 'General ledger reports' },
                ]}
                value={draft.report_engine ?? 'legacy'}
                onChange={(value) => set('report_engine', (value ?? 'legacy') as AccountingSettings['report_engine'])}
                allowDeselect={false}
              />
            </SimpleGrid>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <Title order={3} className="mb-1 text-base">Opening balances</Title>
            <p className="mb-4 text-sm text-[var(--muted)]">
              These amounts post to an opening-balance voucher. Any imbalance is plugged to Opening Balance
              Equity.
            </p>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {OPENING_FIELDS.map((field) => (
                <NumberInput
                  key={field.key}
                  label={field.label}
                  min={0}
                  decimalScale={2}
                  fixedDecimalScale
                  value={Number(draft[field.key] ?? 0)}
                  onChange={(value) => set(field.key, String(value ?? 0) as never)}
                />
              ))}
            </SimpleGrid>
          </div>

          <div className="flex justify-end">
            <Button loading={update.isPending} onClick={save}>
              Save settings
            </Button>
          </div>
        </Stack>
      )}
    </div>
  );
}
