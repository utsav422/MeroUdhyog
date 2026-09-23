'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AppNotification = {
  id: string;
  tenant_id: string;
  recipient_user_id: string | null;
  recipient_roles: string[] | null;
  category: string;
  title: string;
  message: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

export const notificationCategoryLabels: Record<string, string> = {
  stock: 'Inventory',
  order: 'Orders',
  delivery: 'Deliveries',
  payment: 'Payments',
  prediction: 'Predictions',
  system: 'System',
};

export const notificationsKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationsKeys.all, 'list'] as const,
  count: () => [...notificationsKeys.all, 'count'] as const,
};

export function useNotifications(limit = 50, pollMs = 30_000) {
  return useQuery({
    queryKey: [...notificationsKeys.list(), limit],
    queryFn: () =>
      apiClient.get<AppNotification[]>(`/notifications?limit=${limit}`),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}

export function useUnreadCount(pollMs = 30_000) {
  return useQuery({
    queryKey: notificationsKeys.count(),
    queryFn: () =>
      apiClient.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}

/**
 * Keeps the drawer's list in lockstep with the badge: whenever the polled
 * unread count changes, the list is invalidated immediately so new alerts
 * appear in the open drawer without a manual refresh.
 */
export function useSyncNotificationsWithCount(count: number) {
  const qc = useQueryClient();
  const prev = useRef(count);
  useEffect(() => {
    if (prev.current !== count) {
      prev.current = count;
      qc.invalidateQueries({ queryKey: notificationsKeys.list() });
    }
  }, [count, qc]);
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.post<AppNotification>(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsKeys.count() });
      qc.invalidateQueries({ queryKey: notificationsKeys.list() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ updated: number }, Error>({
    mutationFn: () => apiClient.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsKeys.count() });
      qc.invalidateQueries({ queryKey: notificationsKeys.list() });
    },
  });
}

export function usePushPublicKey() {
  return useQuery({
    queryKey: [...notificationsKeys.all, 'push-public-key'] as const,
    queryFn: () =>
      apiClient.get<{ public_key: string | null; enabled: boolean }>(
        '/notifications/push/public-key',
      ),
    staleTime: 5 * 60_000,
  });
}