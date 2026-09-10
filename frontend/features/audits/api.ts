'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AuditRun = {
  id: string;
  tenant_id: string;
  status: string;
  scope_month: string | null;
  triggered_by: string | null;
  total_findings: number;
  created_at: string;
  completed_at: string | null;
};

export type AuditFinding = {
  id: string;
  tenant_id: string;
  run_id: string;
  rule_code: string;
  severity: string;
  transaction_id: string | null;
  message: string;
  evidence: Record<string, unknown> | null;
  is_resolved: boolean;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export const auditsKeys = {
  all: ['audits'] as const,
  runs: () => [...auditsKeys.all, 'runs'] as const,
  findings: (runId: string) => [...auditsKeys.all, 'findings', runId] as const,
};

export function useAuditRuns() {
  return useQuery({
    queryKey: auditsKeys.runs(),
    queryFn: () => apiClient.get<AuditRun[]>('/audits/runs'),
  });
}

export function useAuditFindings(runId: string) {
  return useQuery({
    queryKey: auditsKeys.findings(runId ?? ''),
    queryFn: () =>
      apiClient.get<AuditFinding[]>(`/audits/findings${runId ? `?run_id=${runId}` : ''}`),
    enabled: true,
  });
}
