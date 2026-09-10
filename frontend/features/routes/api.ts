'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type Route = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  cities: string[];
  agent_ids: string[];
  created_at: string;
  updated_at: string;
};

export const routesKeys = {
  all: ['routes'] as const,
  list: () => [...routesKeys.all, 'list'] as const,
};

export function useRoutes() {
  return useQuery({
    queryKey: routesKeys.list(),
    queryFn: () => apiClient.get<Route[]>('/routes'),
  });
}
