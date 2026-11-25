'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type RecoveryEntityType =
  | 'customer'
  | 'order'
  | 'delivered_order'
  | 'khata'
  | 'payment'
  | 'product'
  | 'variant'
  | 'staff'
  | 'category';

export type RecoveryItem = {
  id: string;
  entity_type: RecoveryEntityType;
  entity_id: string;
  label: string;
  detail: Record<string, unknown>;
  depends_on: string[];
  batch_id: string;
  state: 'trashed' | 'restored' | 'purged';
  deleted_at: string;
  expires_at: string;
  purge_at: string;
  can_restore: boolean;
  blocked_by: string | null;
};

export type RecoveryList = {
  items: RecoveryItem[];
  total: number;
  counts: Record<string, number>;
  admin: boolean;
};

export const recoveryKeys = {
  all: ['recovery'] as const,
  list: (entityType?: string | null, search?: string | null, admin?: boolean) =>
    [...recoveryKeys.all, 'list', entityType ?? null, search ?? null, admin ?? false] as const,
};

export function useRecoveryItems(
  entityType?: string | null,
  search?: string | null,
  adminScope = false,
) {
  const params = new URLSearchParams({ limit: '500' });
  if (entityType) params.set('entity_type', entityType);
  if (search) params.set('search', search);
  if (adminScope) params.set('admin_scope', 'true');
  return useQuery({
    queryKey: recoveryKeys.list(entityType, search, adminScope),
    queryFn: () => apiClient.get<RecoveryList>(`/recovery?${params.toString()}`),
  });
}

export function useRestoreRecoveryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<RecoveryItem>(`/recovery/${id}/restore`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function usePermanentlyDeleteRecoveryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/recovery/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}
