'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MAX_FETCH } from '../products/api';

export type User = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_superadmin: boolean;
  created_at: string;
};

export type UserInput = {
  email: string;
  password?: string;
  full_name: string;
  role?: string;
};

export type UserUpdateInput = {
  full_name?: string;
  role?: string;
  is_active?: boolean;
};

export const staffKeys = {
  all: ['staff'] as const,
  list: () => [...staffKeys.all, 'list'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => apiClient.get<User[]>(`/users?limit=${MAX_FETCH}`),
  });
}
