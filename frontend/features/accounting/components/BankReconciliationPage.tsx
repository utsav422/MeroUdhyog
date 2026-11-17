'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { Bank, CheckCircle, Plus, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { PageHeader, KPICard } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { ApiClientError } from '@/lib/api-client';
import {
  useAccounts,
  useAutoMatchBankAccount,
  useBankAccounts,
  useBankReconciliation,
  useBankStatementLines,
  useCreateBankAccount,
  useImportBankStatementLines,
  useMatchBankStatementLine,
  useUnmatchBankStatementLine,
  type BankStatementLine,
} from '../api';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';
import { useMoney } from './StatementRows';

type DraftLine = {
  statement_date: string;
  description: string;
  reference: string;
  amount: string;
};

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function BankReconciliationPage() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);
  const [journalLineId, setJournalLineId] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [lineDate, setLineDate] = useState<Date | null>(null);
  const [lineDescription, setLineDescription] = useState('');
  const [lineReference, setLineReference] = useState('');
  const [lineAmount, setLineAmount] = useState<string | number>('');

  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [glAccountId, setGlAccountId] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState<string | number>(0);

  const money = useMoney('NPR');
  const accountsQuery = useAccounts();
  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((account) => !account.is_group && account.account_type === 'asset')
        .map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })),
    [accountsQuery.data],
  );

  const bankAccountsQuery = useBankAccounts();
  const bankAccounts = bankAccountsQuery.data ?? [];
  const activeAccountId = selectedAccount ?? bankAccounts[0]?.id ?? '';
  const accountOptions = bankAccounts.map((account) => ({
    value: account.id,
    label: account.account_number ? `${account.name} · ${account.account_number}` : account.name,
  }));

  const linesQuery = useBankStatementLines(activeAccountId, {
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
    limit: 1000,
  });
  const reconciliationQuery = useBankReconciliation(activeAccountId, {
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
  });

  const createAccount = useCreateBankAccount();
  const importLines = useImportBankStatementLines();
  const autoMatch = useAutoMatchBankAccount();
  const matchLineMutation = useMatchBankStatementLine();
  const unmatchLine = useUnmatchBankStatementLine();

  const data = reconciliationQuery.data;

  const notifyError = (title: string, error: unknown) => {
    notifications.show({
      color: 'red',
      title,
      message: error instanceof ApiClientError ? error.message : 'Unexpected error',
    });
  };

  const submitAccount = () => {
    if (!name.trim() || !glAccountId) {
      notifications.show({ color: 'red', title: 'Missing details', message: 'Name and GL account are required.' });
      return;
    }
    createAccount.mutate(
      {
        name: name.trim(),
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        gl_account_id: glAccountId,
        opening_balance: String(openingBalance || 0),
      },
      {
        onSuccess: (account) => {
          notifications.show({ color: 'green', title: 'Bank account created', message: account.name });
          setCreateOpen(false);
          setName('');
          setBankName('');
          setAccountNumber('');
          setGlAccountId(null);
          setOpeningBalance(0);
          setSelectedAccount(account.id);
        },
        onError: (error) => notifyError('Could not create bank account', error),
      },
    );
  };

  const addDraftLine = () => {
    const iso = toIsoDate(lineDate);
    if (!iso || !lineAmount || Number(lineAmount) === 0) {
      notifications.show({
        color: 'red',
        title: 'Invalid line',
        message: 'Enter a date and a non-zero signed amount.',
      });
      return;
    }
    setDraftLines((current) => [
      ...current,
      {
        statement_date: iso,
        description: lineDescription.trim(),
        reference: lineReference.trim(),
        amount: String(lineAmount),
      },
    ]);
    setLineDate(null);
    setLineDescription('');
    setLineReference('');
    setLineAmount('');
  };

  const submitImport = () => {
    if (!activeAccountId || draftLines.length === 0) return;
    importLines.mutate(
      {
        accountId: activeAccountId,
        lines: draftLines.map((line) => ({
          statement_date: line.statement_date,
          description: line.description || null,
          reference: line.reference || null,
          amount: line.amount,
        })),
      },
      {
        onSuccess: (lines) => {
          notifications.show({
            color: 'green',
            title: 'Statement imported',
            message: `${lines.length} line${lines.length === 1 ? '' : 's'} added.`,
          });
          setDraftLines([]);
          setImportOpen(false);
        },
        onError: (error) => notifyError('Could not import statement', error),
      },
    );
  };

  const submitMatch = () => {
    if (!matchLine || !journalLineId.trim()) return;
    matchLineMutation.mutate(
      { lineId: matchLine.id, journalLineId: journalLineId.trim() },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Statement line matched', message: 'The statement line is now linked to the journal line.' });
          setMatchLine(null);
          setJournalLineId('');
        },
        onError: (error) => notifyError('Could not match line', error),
      },
    );
  };

  const columns: Column<BankStatementLine>[] = [
    { key: 'date', header: 'Date', render: (row) => row.statement_date, width: 110 },
    {
      key: 'description',
      header: 'Description',
      render: (row) => <span className="font-medium">{row.description || '—'}</span>,
    },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className={Number(row.amount) < 0 ? 'font-semibold text-danger-600' : 'font-semibold text-success-700'}>
          {money(row.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant="light" color={row.status === 'matched' ? 'green' : 'gray'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'matched',
      header: 'Matched entry',
      render: (row) => (
        <span className="font-mono text-xs text-[var(--muted)]">
          {row.matched_entry_id ? row.matched_entry_id.slice(0, 8) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        subtitle={`Match imported statement lines against GL cash/bank postings. ${periodLabel(dates)}`}
        actions={
          <Group gap="xs">
            <Button variant="light" leftSection={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              New bank account
            </Button>
            <Button
              variant="default"
              leftSection={<UploadSimple size={16} />}
              onClick={() => setImportOpen(true)}
              disabled={!activeAccountId}
            >
              Import statement
            </Button>
          </Group>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className="mb-4">
        <Select
          label="Bank account"
          placeholder={bankAccounts.length ? 'Choose an account' : 'Create a bank account first'}
          data={accountOptions}
          value={activeAccountId || null}
          onChange={setSelectedAccount}
          leftSection={<Bank size={16} />}
          nothingFoundMessage="No bank accounts"
        />
        <div className="flex items-end">
          <Button
            variant="light"
            color="brand"
            leftSection={<CheckCircle size={16} />}
            loading={autoMatch.isPending}
            disabled={!activeAccountId}
            onClick={() =>
              activeAccountId &&
              autoMatch.mutate(
                { accountId: activeAccountId },
                {
                  onSuccess: (result) =>
                    notifications.show({
                      color: result.unmatched ? 'yellow' : 'green',
                      title: 'Auto-match complete',
                      message: `${result.matched} matched, ${result.unmatched} unmatched.`,
                    }),
                  onError: (error) => notifyError('Auto-match failed', error),
                },
              )
            }
          >
            Auto-match (3-day window)
          </Button>
        </div>
      </SimpleGrid>

      {!bankAccountsQuery.isLoading && bankAccounts.length === 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
          <Bank size={28} className="mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-sm font-semibold">No bank accounts yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create a bank account and map it to a GL asset account to start reconciling.
          </p>
        </div>
      )}

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className="mb-4">
          <KPICard
            icon={<Bank size={20} weight="duotone" />}
            label="Book balance"
            value={Number(data.book_balance)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<CheckCircle size={20} weight="duotone" />}
            label="Statement balance"
            value={Number(data.statement_balance)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={<WarningCircle size={20} weight="duotone" />}
            label="Unmatched"
            value={Number(data.unmatched_total)}
            prefix="Rs "
            format="compact"
          />
          <KPICard
            icon={data.balanced ? <CheckCircle size={20} weight="duotone" /> : <WarningCircle size={20} weight="duotone" />}
            label={data.balanced ? 'Reconciled' : 'Difference'}
            value={Number(data.difference)}
            prefix="Rs "
            format="compact"
          />
        </SimpleGrid>
      )}

      <ReportToolbar dates={dates} onDatesChange={setDates} />

      <DataTable
        columns={columns}
        data={linesQuery.data ?? []}
        loading={linesQuery.isLoading || bankAccountsQuery.isLoading}
        error={linesQuery.isError || bankAccountsQuery.isError}
        retry={() => {
          void linesQuery.refetch();
          void bankAccountsQuery.refetch();
        }}
        getRowId={(row) => row.id}
        rowActions={[
          {
            label: 'Match to journal line',
            show: (row) => row.status !== 'matched',
            onClick: (row) => {
              setMatchLine(row);
              setJournalLineId('');
            },
          },
          {
            label: 'Unmatch',
            color: 'red',
            show: (row) => row.status === 'matched',
            onClick: (row) =>
              unmatchLine.mutate(row.id, {
                onSuccess: () => notifications.show({ color: 'green', title: 'Statement line unmatched', message: 'The statement line is available to match again.' }),
                onError: (error) => notifyError('Could not unmatch line', error),
              }),
          },
        ]}
        emptyTitle="No statement lines"
        emptyDescription="Import a bank statement to begin matching."
        minWidth={900}
      />

      <Drawer opened={createOpen} onClose={() => setCreateOpen(false)} position="right" title="New bank account" size="md">
        <Stack>
          <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          <TextInput label="Bank name" value={bankName} onChange={(event) => setBankName(event.currentTarget.value)} />
          <TextInput
            label="Account number"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.currentTarget.value)}
          />
          <Select
            label="GL account"
            description="Use the cash/bank control account this statement belongs to."
            data={accounts}
            value={glAccountId}
            onChange={setGlAccountId}
            searchable
            required
            nothingFoundMessage="No asset accounts"
          />
          <NumberInput
            label="Opening balance"
            decimalScale={2}
            fixedDecimalScale
            value={openingBalance}
            onChange={setOpeningBalance}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createAccount.isPending} onClick={submitAccount}>
              Create account
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer opened={importOpen} onClose={() => setImportOpen(false)} position="right" title="Import statement lines" size="lg">
        <Stack>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="mb-2 text-sm font-semibold">Add a line</div>
            <Stack gap="xs">
              <DatePickerInput
                label="Statement date"
                value={lineDate}
                onChange={(value) => setLineDate(toDate(value))}
              />
              <TextInput
                label="Description"
                value={lineDescription}
                onChange={(event) => setLineDescription(event.currentTarget.value)}
              />
              <TextInput
                label="Reference"
                value={lineReference}
                onChange={(event) => setLineReference(event.currentTarget.value)}
              />
              <NumberInput
                label="Amount (positive deposit, negative withdrawal)"
                decimalScale={2}
                fixedDecimalScale
                value={lineAmount}
                onChange={setLineAmount}
              />
              <Button variant="light" onClick={addDraftLine}>
                Add line
              </Button>
            </Stack>
          </div>

          {draftLines.length > 0 && (
            <div className="rounded-xl border border-[var(--border)]">
              {draftLines.map((line, index) => (
                <div key={`${line.statement_date}-${index}`} className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-sm last:border-0">
                  <div>
                    <div className="font-medium">{line.description || 'Statement line'}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {line.statement_date} {line.reference ? `· ${line.reference}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{money(line.amount)}</span>
                    <button
                      type="button"
                      className="text-xs text-danger-600"
                      onClick={() => setDraftLines((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button loading={importLines.isPending} disabled={draftLines.length === 0} onClick={submitImport}>
              Import {draftLines.length || ''} line{draftLines.length === 1 ? '' : 's'}
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Modal opened={!!matchLine} onClose={() => setMatchLine(null)} title="Match statement line">
        <Stack>
          <div className="text-sm text-[var(--muted)]">
            {matchLine?.statement_date} · {money(matchLine?.amount ?? '0')} · {matchLine?.description || 'Statement line'}
          </div>
          <TextInput
            label="Journal line ID"
            description="Copy the ID from the day book or ledger line to match manually."
            value={journalLineId}
            onChange={(event) => setJournalLineId(event.currentTarget.value)}
            placeholder="UUID"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMatchLine(null)}>
              Cancel
            </Button>
            <Button loading={matchLineMutation.isPending} onClick={submitMatch}>
              Match line
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
