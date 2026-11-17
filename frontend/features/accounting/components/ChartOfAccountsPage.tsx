'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Group,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PencilSimple, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { ApiClientError } from '@/lib/api-client';
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  type Account,
  type AccountInput,
  type AccountUpdateInput,
} from '../api';

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

const NORMAL_BALANCE: Record<Account['account_type'], Account['normal_balance']> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  income: 'credit',
};

export default function ChartOfAccountsPage() {
  const query = useAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>('');
  const [showInactive, setShowInactive] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<Account['account_type']>('expense');
  const [normalBalance, setNormalBalance] = useState<Account['normal_balance']>('debit');
  const [parentId, setParentId] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [description, setDescription] = useState('');

  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [editDescription, setEditDescription] = useState('');

  const accounts = useMemo(() => query.data ?? [], [query.data]);
  const filtered = accounts.filter(
    (account) =>
      (!typeFilter || account.account_type === typeFilter) &&
      (showInactive || account.is_active),
  );

  const parentOptions = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            account.is_group &&
            account.account_type === accountType &&
            account.id !== editing?.id,
        )
        .map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })),
    [accounts, accountType, editing?.id],
  );

  const editParentOptions = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            account.is_group &&
            account.account_type === editing?.account_type &&
            account.id !== editing?.id,
        )
        .map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })),
    [accounts, editing?.account_type, editing?.id],
  );

  const notifyError = (title: string, error: unknown) => {
    notifications.show({
      color: 'red',
      title,
      message: error instanceof ApiClientError ? error.message : 'Unexpected error',
    });
  };

  const resetCreate = () => {
    setCode('');
    setName('');
    setAccountType('expense');
    setNormalBalance('debit');
    setParentId(null);
    setIsGroup(false);
    setDescription('');
  };

  const submitCreate = () => {
    if (!code.trim() || !name.trim()) {
      notifications.show({ color: 'red', title: 'Missing details', message: 'Code and name are required.' });
      return;
    }
    const payload: AccountInput = {
      code: code.trim(),
      name: name.trim(),
      account_type: accountType,
      normal_balance: normalBalance,
      parent_id: parentId,
      is_group: isGroup,
      description: description.trim() || null,
    };
    createAccount.mutate(payload, {
      onSuccess: (account) => {
        notifications.show({ color: 'green', title: 'Account created', message: `${account.code} · ${account.name}` });
        setCreateOpen(false);
        resetCreate();
      },
      onError: (error) => notifyError('Could not create account', error),
    });
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setEditName(account.name);
    setEditParentId(account.parent_id);
    setEditActive(account.is_active);
    setEditDescription(account.description ?? '');
  };

  const submitEdit = () => {
    if (!editing) return;
    const payload: AccountUpdateInput = {
      name: editName.trim(),
      description: editDescription.trim() || null,
    };
    if (!editing.is_system) {
      payload.parent_id = editParentId;
      payload.is_active = editActive;
    }
    updateAccount.mutate(
      { accountId: editing.id, payload },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Account updated', message: 'The chart of accounts has been updated.' });
          setEditing(null);
        },
        onError: (error) => notifyError('Could not update account', error),
      },
    );
  };

  const toggleActive = (account: Account) => {
    updateAccount.mutate(
      { accountId: account.id, payload: { is_active: !account.is_active } },
      {
        onSuccess: () =>
          notifications.show({
            color: 'green',
            title: account.is_active ? 'Account deactivated' : 'Account activated',
            message: `${account.code} · ${account.name}`,
          }),
        onError: (error) => notifyError('Could not change account status', error),
      },
    );
  };

  const columns: Column<Account>[] = [
    { key: 'code', header: 'Code', render: (row) => <span className="font-mono font-medium">{row.code}</span>, width: 90 },
    { key: 'name', header: 'Account', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span className="capitalize">{row.account_type}</span>,
    },
    {
      key: 'normal',
      header: 'Normal side',
      render: (row) => <span className="capitalize">{row.normal_balance}</span>,
    },
    {
      key: 'group',
      header: 'Group',
      render: (row) => (row.is_group ? <Badge variant="light" color="brand">Group</Badge> : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant="light" color={row.is_active ? 'green' : 'gray'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'system',
      header: 'System',
      render: (row) => (row.is_system ? 'Yes' : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Maintain the accounts and groups used by the general ledger."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            New account
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <Select
          label="Account type"
          data={[{ value: '', label: 'All types' }, ...ACCOUNT_TYPES]}
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-48"
          allowDeselect={false}
          leftSection={<SlidersHorizontal size={15} />}
        />
        <Switch
          label="Show inactive"
          checked={showInactive}
          onChange={(event) => setShowInactive(event.currentTarget.checked)}
          className="pb-2"
        />
        <div className="ml-auto pb-2 text-sm text-[var(--muted)]">
          {filtered.length} of {accounts.length} accounts
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.id}
        rowClassName={(row) => (row.is_active ? undefined : 'opacity-60')}
        rowActions={[
          {
            label: 'Edit account',
            icon: <PencilSimple size={16} />,
            onClick: openEdit,
          },
          {
            label: (row) => (row.is_active ? 'Deactivate' : 'Activate'),
            show: (row) => !row.is_system,
            onClick: toggleActive,
          },
        ]}
        emptyTitle="No accounts"
        emptyDescription="Adjust the filters or add a custom account."
        minWidth={900}
      />

      <Drawer opened={createOpen} onClose={() => setCreateOpen(false)} position="right" title="New account" size="md">
        <Stack>
          <TextInput label="Code" value={code} onChange={(event) => setCode(event.currentTarget.value)} required />
          <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          <Select
            label="Account type"
            data={ACCOUNT_TYPES}
            value={accountType}
            onChange={(value) => {
              const next = (value ?? 'expense') as Account['account_type'];
              setAccountType(next);
              setNormalBalance(NORMAL_BALANCE[next]);
              setParentId(null);
            }}
            allowDeselect={false}
          />
          <Select
            label="Normal balance"
            data={[
              { value: 'debit', label: 'Debit' },
              { value: 'credit', label: 'Credit' },
            ]}
            value={normalBalance}
            onChange={(value) => setNormalBalance((value ?? 'debit') as Account['normal_balance'])}
            allowDeselect={false}
          />
          <Select
            label="Parent group"
            placeholder="No parent"
            data={parentOptions}
            value={parentId}
            onChange={setParentId}
            clearable
            searchable
            nothingFoundMessage="No matching groups"
          />
          <Switch
            label="Group account (cannot be posted to)"
            checked={isGroup}
            onChange={(event) => setIsGroup(event.currentTarget.checked)}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            minRows={2}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createAccount.isPending} onClick={submitCreate}>
              Create account
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer opened={!!editing} onClose={() => setEditing(null)} position="right" title="Edit account" size="md">
        {editing && (
          <Stack>
            <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{editing.code}</span> · {editing.account_type} ·{' '}
              {editing.normal_balance} balance
            </div>
            <TextInput label="Name" value={editName} onChange={(event) => setEditName(event.currentTarget.value)} required />
            <Select
              label="Parent group"
              placeholder="No parent"
              data={editParentOptions}
              value={editParentId}
              onChange={setEditParentId}
              clearable
              searchable
              disabled={editing.is_system}
              nothingFoundMessage="No matching groups"
            />
            <Switch
              label="Active"
              checked={editActive}
              onChange={(event) => setEditActive(event.currentTarget.checked)}
              disabled={editing.is_system}
            />
            <Textarea
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.currentTarget.value)}
              minRows={2}
            />
            {editing.is_system && (
              <div className="text-xs text-[var(--muted)]">
                System accounts can be renamed but cannot be deactivated or moved.
              </div>
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button loading={updateAccount.isPending} onClick={submitEdit}>
                Save changes
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </div>
  );
}
