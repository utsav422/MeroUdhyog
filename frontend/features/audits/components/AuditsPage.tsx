'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlayCircle } from '@phosphor-icons/react';
import {
  DataTable,
  PageHeader,
} from '@/components/shared';
import type { Column } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { useAuditRuns, useAuditFindings, auditsKeys } from '../api';
import type { AuditFinding, AuditRun } from '../api';

const SEVERITY_TONE: Record<string, string> = {
  low: 'gray',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
};

function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AuditsPage() {
  const qc = useQueryClient();
  const runsQuery = useAuditRuns();
  const [runFilter, setRunFilter] = useState('');
  const [scope, setScope] = useState('');

  const findingsQuery = useAuditFindings(runFilter);
  const runs = runsQuery.data ?? [];

  const triggerMutation = useMutation({
    mutationFn: () =>
      apiClient.post<AuditRun>('/audits/runs', { scope_month: scope || null }),
  });

  const trigger = () => {
    triggerMutation.mutate(undefined, {
      onSuccess: (run) => {
        qc.invalidateQueries({ queryKey: auditsKeys.runs() });
        setRunFilter(run.id);
        setScope('');
        notifications.show({ color: 'success', title: 'Audit run started', message: 'Findings will appear shortly.' });
      },
      onError: (error) =>
        notifications.show({
          color: 'red',
          title: 'Run failed',
          message: error instanceof Error ? error.message : 'Something went wrong',
        }),
    });
  };

  const resolveMutation = useMutation({
    mutationFn: ({ finding, resolved }: { finding: AuditFinding; resolved: boolean }) =>
      apiClient.patch<AuditFinding>(
        `/audits/findings/${finding.id}/resolve`,
        { resolved, note: resolved ? 'Reviewed via dashboard' : null },
      ),
    onSuccess: () => {
      notifications.show({ color: 'success', title: 'Finding updated', message: 'Status saved' });
      qc.invalidateQueries({ queryKey: auditsKeys.findings(runFilter ?? '') });
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const columns: Column<AuditFinding>[] = [
    {
      key: 'rule_code',
      header: 'Rule',
      render: (f) => <span className="font-mono text-xs font-medium">{f.rule_code}</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (f) => (
        <Badge variant="light" color={SEVERITY_TONE[f.severity] ?? 'gray'} radius="sm">
          {f.severity}
        </Badge>
      ),
    },
    { key: 'message', header: 'Finding', render: (f) => <Text size="sm">{f.message}</Text> },
    {
      key: 'evidence',
      header: 'Evidence',
      render: (f) => <span className="font-mono text-xs text-zinc-500">{f.evidence ? JSON.stringify(f.evidence) : '—'}</span>,
    },
    { key: 'created_at', header: 'Created', render: (f) => dateTime(f.created_at) },
    {
      key: 'is_resolved',
      header: 'Status',
      render: (f) => (
        <Badge variant="light" color={f.is_resolved ? 'green' : 'gray'} radius="sm">
          {f.is_resolved ? 'Resolved' : 'Open'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (f) =>
        f.is_resolved ? (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => resolveMutation.mutate({ finding: f, resolved: false })}
          >
            Reopen
          </Button>
        ) : (
          <Button
            size="xs"
            variant="subtle"
            color="green"
            onClick={() => resolveMutation.mutate({ finding: f, resolved: true })}
          >
            Resolve
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audits"
        subtitle="Deterministic checks over your transaction ledger. Each run produces findings with evidence you can review, waive or resolve."
      />

      <Card className="max-w-2xl" mb="xl">
        <Text fw={600} size="md" mb="sm">
          Run a new audit
        </Text>
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Text size="sm" fw={500} component="label" htmlFor="audit-month">
            Month scope (optional)
          </Text>
          <input
            id="audit-month"
            type="month"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          />
          <Button
            leftSection={<PlayCircle size={16} />}
            loading={triggerMutation.isPending}
            onClick={trigger}
          >
            {triggerMutation.isPending ? 'Auditing…' : 'Run audit'}
          </Button>
        </Group>
      </Card>

      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
        <Text fw={600} size="md">
          Findings
        </Text>
        <Select
          size="sm"
          placeholder="All findings"
          clearable
          data={runs.map((run) => ({
            value: run.id,
            label: `${dateTime(run.created_at)} · ${run.total_findings} finding${run.total_findings === 1 ? '' : 's'} · ${run.status}`,
          }))}
          value={runFilter || null}
          onChange={(v) => setRunFilter(v ?? '')}
          className="w-80"
        />
      </Group>

      <DataTable
        columns={columns}
        data={findingsQuery.data ?? []}
        loading={findingsQuery.isLoading}
        error={findingsQuery.isError}
        retry={() => findingsQuery.refetch()}
        isPermissionDenied={(findingsQuery.error as { status?: number } | undefined)?.status === 403}
        getRowId={(f) => f.id}
        minWidth={950}
        emptyTitle="No findings to show"
        emptyDescription="Run an audit or pick a past run to see findings."
      />
    </div>
  );
}
