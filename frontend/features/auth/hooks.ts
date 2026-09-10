'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type MeResponse = {
  user_id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  is_superadmin: boolean;
};

export type TenantRead = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const sessionKeys = {
  all: ['session'] as const,
  me: () => [...sessionKeys.all, 'me'] as const,
  tenant: () => [...sessionKeys.all, 'tenant'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me(),
    queryFn: () => apiClient.get<MeResponse>('/auth/me'),
    retry: false,
  });
}

export function useTenant(enabled = true) {
  return useQuery({
    queryKey: sessionKeys.tenant(),
    queryFn: () => apiClient.get<TenantRead>('/tenants/me'),
    enabled,
  });
}
