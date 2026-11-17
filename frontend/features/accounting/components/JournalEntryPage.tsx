'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import { ApiClientError } from '@/lib/api-client';
import { useAccounts, useCreateJournalEntry, type JournalEntryInput } from '../api';
import { toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type LineDraft = {
  key: string;
  account_id: string | null;
  description: string;
  debit: string;
  credit: string;
};

let lineCounter = 0;

function blankLine(): LineDraft {
  lineCounter += 1;
  return { key: `line-${lineCounter}`, account_id: null, description: '', debit: '', credit: '' };
}

const VOUCHER_TYPES = [
  { value: 'journal', label: 'Journal' },
  { value: 'contra', label: 'Contra' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function JournalEntryPage() {
  const accountsQuery = useAccounts();
  const createEntry = useCreateJournalEntry();
  const money = useMoney('NPR');
  const [entryDate, setEntryDate] = useState<Date | null>(new Date());
  const [voucherType, setVoucherType] = useState<JournalEntryInput['voucher_type']>('journal');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine(), blankLine()]);

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((account) => account.is_active && !account.is_group)
        .map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })),
    [accountsQuery.data],
  );

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    return { debit, credit, difference: debit - credit };
  }, [lines]);

  const populatedLines = lines.filter(
    (line) => line.account_id && (Number(line.debit) > 0 || Number(line.credit) > 0),
  );
  const balanced =
    populatedLines.length >= 2 && totals.debit > 0 && Math.abs(totals.difference) < 0.005;

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const reset = () => {
    setReference('');
    setNarration('');
    setLines([blankLine(), blankLine()]);
  };

  const submit = () => {
    if (populatedLines.length < 2) {
      notifications.show({
        color: 'red',
        title: 'Add at least two lines',
        message: 'A journal entry needs at least one debit and one credit line.',
      });
      return;
    }
    if (!balanced) {
      notifications.show({
        color: 'red',
        title: 'Entry is not balanced',
        message: `Debit ${money(totals.debit)} vs credit ${money(totals.credit)}.`,
      });
      return;
    }
    const iso = toIsoDate(entryDate);
    if (!iso) {
      notifications.show({ color: 'red', title: 'Choose an entry date', message: 'An entry date is required.' });
      return;
    }
    createEntry.mutate(
      {
        entry_date: iso,
        voucher_type: voucherType,
        reference: reference.trim() || null,
        narration: narration.trim() || null,
        lines: populatedLines.map((line) => ({
          account_id: line.account_id as string,
          debit: line.debit || '0',
          credit: line.credit || '0',
          description: line.description.trim() || null,
        })),
      },
      {
        onSuccess: (entry) => {
          notifications.show({
            color: 'green',
            title: 'Journal entry posted',
            message: `${entry.entry_no} · ${money(totals.debit)}`,
          });
          reset();
        },
        onError: (error) => {
          notifications.show({
            color: 'red',
            title: 'Could not post journal entry',
            message: error instanceof ApiClientError ? error.message : 'Unexpected error',
          });
        },
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Voucher Entry"
        subtitle="Post a balanced manual journal entry. Debits and credits must agree before it can be posted."
      />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className="mb-5">
          <DatePickerInput
            label="Entry date"
            value={entryDate}
            onChange={(value) => setEntryDate(toDate(value as Date | null))}
            required
          />
          <Select
            label="Voucher type"
            data={VOUCHER_TYPES}
            value={voucherType}
            onChange={(value) =>
              setVoucherType((value ?? 'journal') as JournalEntryInput['voucher_type'])
            }
            allowDeselect={false}
          />
          <TextInput
            label="Reference"
            placeholder="Invoice, cheque or document no."
            value={reference}
            onChange={(event) => setReference(event.currentTarget.value)}
          />
          <TextInput
            label="Narration"
            placeholder="What is this entry for?"
            value={narration}
            onChange={(event) => setNarration(event.currentTarget.value)}
          />
        </SimpleGrid>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="border-b border-[var(--border)] py-2 pr-2 font-semibold">Account</th>
                <th className="border-b border-[var(--border)] px-2 py-2 font-semibold">Description</th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-right font-semibold">Debit</th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-right font-semibold">Credit</th>
                <th className="w-10 border-b border-[var(--border)] py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="border-b border-[var(--border)] py-2 pr-2 align-top">
                    <Select
                      placeholder="Choose account"
                      data={accountOptions}
                      value={line.account_id}
                      onChange={(value) => updateLine(line.key, { account_id: value })}
                      searchable
                      nothingFoundMessage="No accounts"
                    />
                  </td>
                  <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                    <TextInput
                      placeholder="Line description"
                      value={line.description}
                      onChange={(event) => updateLine(line.key, { description: event.currentTarget.value })}
                    />
                  </td>
                  <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                    <NumberInput
                      placeholder="0.00"
                      decimalScale={2}
                      fixedDecimalScale
                      min={0}
                      value={line.debit}
                      onChange={(value) =>
                        updateLine(line.key, {
                          debit: value === '' ? '' : String(value),
                          credit: value === '' ? line.credit : '',
                        })
                      }
                      hideControls
                      className="text-right"
                    />
                  </td>
                  <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                    <NumberInput
                      placeholder="0.00"
                      decimalScale={2}
                      fixedDecimalScale
                      min={0}
                      value={line.credit}
                      onChange={(value) =>
                        updateLine(line.key, {
                          credit: value === '' ? '' : String(value),
                          debit: value === '' ? line.debit : '',
                        })
                      }
                      hideControls
                      className="text-right"
                    />
                  </td>
                  <td className="border-b border-[var(--border)] py-2 text-right align-top">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove line"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                    >
                      <Trash size={16} />
                    </ActionIcon>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="py-3 pr-2">
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<Plus size={14} />}
                    onClick={() => setLines((current) => [...current, blankLine()])}
                  >
                    Add line
                  </Button>
                </td>
                <td className="px-2 py-3 text-right font-semibold tabular-nums">{money(totals.debit)}</td>
                <td className="px-2 py-3 text-right font-semibold tabular-nums">{money(totals.credit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <Group justify="space-between" mt="lg" wrap="wrap">
          <Badge
            size="lg"
            variant="light"
            color={balanced ? 'green' : 'orange'}
            leftSection={balanced ? <CheckCircle size={14} /> : <WarningCircle size={14} />}
          >
            {balanced
              ? 'Balanced'
              : `Out of balance by ${money(Math.abs(totals.difference))}`}
          </Badge>
          <Group gap="sm">
            <Button variant="default" onClick={reset}>
              Clear
            </Button>
            <Button loading={createEntry.isPending} disabled={!balanced} onClick={submit}>
              Post journal entry
            </Button>
          </Group>
        </Group>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        Manual vouchers use the next sequence number for their voucher type and are blocked when the
        entry date falls in a closed accounting period.
      </div>
    </div>
  );
}
