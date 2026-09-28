import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  href: string | null;
  items: SearchHit[];
}

export function useGlobalSearch(q: string, limit = 5) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['search', 'global', trimmed, limit],
    queryFn: () =>
      apiClient.get<SearchGroup[]>(
        `/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
      ),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}