'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { CalendarBlank, LockKey, LockOpen, Plus } from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { ApiClientError } from '@/lib/api-client';
import {
  useClosePeriod,
  useCreateFiscalYear,
  useFiscalYears,
  usePeriods,
  useReopenPeriod,
  type AccountingPeriod,
} from '../api';
import { toIsoDate } from './StatementShell';

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function PeriodsPage() {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [generatePeriods, setGeneratePeriods] = useState(true);
  const [actionPeriod, setActionPeriod] = useState<AccountingPeriod | null>(null);
  const [actionType, setActionType] = useState<'close' | 'reopen'>('close');
  const [reason, setReason] = useState('');

  const yearsQuery = useFiscalYears();
  const years = useMemo(() => yearsQuery.data ?? [], [yearsQuery.data]);
  const activeYearId = selectedYear ?? years[0]?.id ?? '';
  const periodsQuery = usePeriods(activeYearId);
  const createFiscalYear = useCreateFiscalYear();
  const closePeriod = useClosePeriod();
  const reopenPeriod = useReopenPeriod();

  const yearOptions = useMemo(
    () => years.map((year) => ({ value: year.id, label: `${year.name} · ${year.start_date} → ${year.end_date}` })),
    [years],
  );

  const submitCreate = () => {
    const start = toIsoDate(startDate);
    const end = toIsoDate(endDate);
    if (!name.trim() || !start || !end) {
      notifications.show({ color: 'red', title: 'Missing details', message: 'Name, start and end date are required.' });
      return;
    }
    createFiscalYear.mutate(
      { name: name.trim(), start_date: start, end_date: end, generate_periods: generatePeriods },
      {
        onSuccess: (year) => {
          notifications.show({ color: 'green', title: 'Fiscal year created', message: year.name });
          setCreateOpen(false);
          setName('');
          setStartDate(null);
          setEndDate(null);
          setSelectedYear(year.id);
        },
        onError: (error) => {
          notifications.show({
            color: 'red',
            title: 'Could not create fiscal year',
            message: error instanceof ApiClientError ? error.message : 'Unexpected error',
          });
        },
      },
    );
  };

  const submitAction = () => {
    if (!actionPeriod) return;
    const payload = { periodId: actionPeriod.id, reason: reason.trim() || undefined };
    const mutation = actionType === 'close' ? closePeriod : reopenPeriod;
    mutation.mutate(payload, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          title: actionType === 'close' ? 'Period closed' : 'Period reopened',
          message: actionPeriod.name,
        });
        setActionPeriod(null);
        setReason('');
      },
      onError: (error) => {
        notifications.show({
          color: 'red',
          title: actionType === 'close' ? 'Could not close period' : 'Could not reopen period',
          message: error instanceof ApiClientError ? error.message : 'Unexpected error',
        });
      },
    });
  };

  const columns: Column<AccountingPeriod>[] = [
    { key: 'name', header: 'Period', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'start', header: 'Start', render: (row) => row.start_date },
    { key: 'end', header: 'End', render: (row) => row.end_date },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant="light" color={row.is_closed ? 'red' : 'green'}>
          {row.is_closed ? 'Closed' : 'Open'}
        </Badge>
      ),
    },
    {
      key: 'closed_at',
      header: 'Closed at',
      render: (row) => (row.closed_at ? new Date(row.closed_at).toLocaleString() : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fiscal Years & Periods"
        subtitle="Create fiscal years and lock accounting periods once they are final."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            New fiscal year
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className="mb-4">
        <Select
          label="Fiscal year"
          placeholder="Choose a fiscal year"
          data={yearOptions}
          value={activeYearId || null}
          onChange={setSelectedYear}
          leftSection={<CalendarBlank size={16} />}
          nothingFoundMessage="No fiscal years yet"
        />
        <div className="flex items-end">
          <div className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)]">
            Closing a period posts the closing entry and blocks new postings in that period. Reopening reverses
            the close and unlocks it.
          </div>
        </div>
      </SimpleGrid>

      <DataTable
        columns={columns}
        data={periodsQuery.data ?? []}
        loading={periodsQuery.isLoading || yearsQuery.isLoading}
        error={periodsQuery.isError || yearsQuery.isError}
        retry={() => {
          void periodsQuery.refetch();
          void yearsQuery.refetch();
        }}
        getRowId={(row) => row.id}
        rowActions={[
          {
            label: (row) => (row.is_closed ? 'Reopen period' : 'Close period'),
            icon: (row) => (row.is_closed ? <LockOpen size={16} /> : <LockKey size={16} />),
            onClick: (row) => {
              setActionType(row.is_closed ? 'reopen' : 'close');
              setActionPeriod(row);
              setReason('');
            },
          },
        ]}
        emptyTitle="No periods"
        emptyDescription="Create a fiscal year to generate monthly accounting periods."
        minWidth={800}
      />

      <Drawer
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        position="right"
        title="New fiscal year"
        size="md"
      >
        <Stack>
          <TextInput
            label="Name"
            placeholder="2083/84"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
          <DatePickerInput
            label="Start date"
            placeholder="Start date"
            value={startDate}
            onChange={(value) => setStartDate(toDate(value))}
            required
          />
          <DatePickerInput
            label="End date"
            placeholder="End date"
            value={endDate}
            onChange={(value) => setEndDate(toDate(value))}
            required
          />
          <Switch
            label="Generate monthly periods"
            checked={generatePeriods}
            onChange={(event) => setGeneratePeriods(event.currentTarget.checked)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createFiscalYear.isPending} onClick={submitCreate}>
              Create fiscal year
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Modal
        opened={!!actionPeriod}
        onClose={() => setActionPeriod(null)}
        title={actionType === 'close' ? 'Close period' : 'Reopen period'}
      >
        <Stack>
          <div className="text-sm text-[var(--muted)]">
            {actionType === 'close'
              ? `Close ${actionPeriod?.name ?? ''} and post its closing entry?`
              : `Reopen ${actionPeriod?.name ?? ''}?`}
          </div>
          <TextInput
            label="Reason"
            placeholder="Optional note for the audit trail"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setActionPeriod(null)}>
              Cancel
            </Button>
            <Button
              color={actionType === 'close' ? 'red' : 'green'}
              loading={closePeriod.isPending || reopenPeriod.isPending}
              onClick={submitAction}
            >
              {actionType === 'close' ? 'Close period' : 'Reopen period'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
