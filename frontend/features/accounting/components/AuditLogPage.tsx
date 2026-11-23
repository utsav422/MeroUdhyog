'use client';

import { useState } from 'react';
import { Code, Modal, Select, Stack, TextInput } from '@mantine/core';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { PageHeader } from '@/components/shared';
import DataTable, { type Column } from '@/components/shared/DataTable';
import { useAuditLog, type AuditLog } from '../api';
import { formatDateTime } from '@/lib/format';
import ReportToolbar, { periodLabel } from './ReportToolbar';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';

const ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'void', label: 'Void' },
  { value: 'repost', label: 'Repost' },
  { value: 'close', label: 'Close' },
  { value: 'reopen', label: 'Reopen' },
  { value: 'match', label: 'Match' },
  { value: 'unmatch', label: 'Unmatch' },
];

export default function AuditLogPage() {
  const [dates, setDates] = useState<DateFilters>(EMPTY_STATEMENT_DATES);
  const [action, setAction] = useState<string | null>('');
  const [entityType, setEntityType] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const query = useAuditLog({
    date_from: toIsoDate(dates.date_from),
    date_to: toIsoDate(dates.date_to),
    action: action || undefined,
    entity_type: entityType.trim() || undefined,
    limit: 500,
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      header: 'When',
      render: (row) => formatDateTime(row.created_at),
      width: 180,
    },
    { key: 'action', header: 'Action', render: (row) => <span className="font-medium capitalize">{row.action}</span> },
    { key: 'entity', header: 'Entity', render: (row) => row.entity_type.replace(/_/g, ' ') },
    {
      key: 'entity_id',
      header: 'Entity ID',
      render: (row) => <span className="font-mono text-xs text-[var(--muted)]">{row.entity_id.slice(0, 8)}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-[var(--muted)]">{row.reason || '—'}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (row.actor_id ? <span className="font-mono text-xs">{row.actor_id.slice(0, 8)}</span> : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Accounting Audit Trail"
        subtitle={`Posting, period and reconciliation changes. ${periodLabel(dates)}`}
        actions={<ClockCounterClockwise size={22} className="text-[var(--muted)]" />}
      />

      <ReportToolbar dates={dates} onDatesChange={setDates}>
        <Select
          size="sm"
          data={ACTIONS}
          value={action}
          onChange={setAction}
          className="w-40"
          allowDeselect={false}
        />
        <TextInput
          size="sm"
          placeholder="Entity type"
          value={entityType}
          onChange={(event) => setEntityType(event.currentTarget.value)}
          className="w-44"
        />
      </ReportToolbar>

      <DataTable
        columns={columns}
        data={query.data ?? []}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        getRowId={(row) => row.id}
        rowActions={[
          {
            label: 'View details',
            onClick: (row) => setSelected(row),
          },
        ]}
        emptyTitle="No audit entries"
        emptyDescription="No accounting changes match these filters."
        minWidth={900}
      />

      <Modal opened={!!selected} onClose={() => setSelected(null)} title="Audit entry" size="lg">
        {selected && (
          <Stack>
            <div className="text-sm">
              <span className="font-semibold capitalize">{selected.action}</span> on{' '}
              <span className="font-mono">{selected.entity_type}</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {formatDateTime(selected.created_at)} · ID {selected.entity_id}
            </div>
            {selected.reason && (
              <div className="rounded-lg bg-black/5 p-3 text-sm">Reason: {selected.reason}</div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Before</div>
              <Code block className="max-h-56 overflow-auto">
                {JSON.stringify(selected.before, null, 2) || '—'}
              </Code>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">After</div>
              <Code block className="max-h-56 overflow-auto">
                {JSON.stringify(selected.after, null, 2) || '—'}
              </Code>
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
