'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { sessionKeys } from '@/features/auth/hooks';

export type UserProfile = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_superadmin: boolean;
  is_email_verified: boolean;
  latitude: number | string | null;
  longitude: number | string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ProfileUpdate = {
  full_name?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
};

function syncProfileCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  profile: UserProfile,
) {
  queryClient.setQueryData(profileKeys.me(), profile);
  queryClient.invalidateQueries({ queryKey: sessionKeys.me() });
}

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: () => apiClient.get<UserProfile>('/users/me'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) =>
      apiClient.patch<UserProfile>('/users/me', input),
    onSuccess: (profile) => syncProfileCaches(queryClient, profile),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiClient.upload<UserProfile>('/users/me/avatar', file),
    onSuccess: (profile) => syncProfileCaches(queryClient, profile),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>('/users/me/avatar'),
    onSuccess: () => {
      queryClient.setQueryData<UserProfile | undefined>(
        profileKeys.me(),
        (current) => (current ? { ...current, avatar_url: null } : current),
      );
      queryClient.invalidateQueries({ queryKey: profileKeys.me() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.me() });
    },
  });
}
