'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export const categoriesKeys = {
  all: ['categories'] as const,
  list: () => [...categoriesKeys.all, 'list'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: categoriesKeys.list(),
    queryFn: () => apiClient.get<Category[]>('/categories'),
  });
}
