'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiClient } from '@/lib/api-client';

type SoftDeleteInput = {
  path: string;
  label: string;
  successTitle?: string;
};

export function useSoftDelete() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ path }: SoftDeleteInput) => apiClient.delete<void>(path),
    onSuccess: (_data, input) => {
      notifications.show({
        color: 'success',
        title: input.successTitle ?? 'Moved to Recovery',
        message: `${input.label} can be restored from Recovery for 2 days.`,
      });
      qc.invalidateQueries();
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const remove = (input: SoftDeleteInput) => {
    const ok = window.confirm(
      `Move "${input.label}" to Recovery? You can restore it within 2 days.`,
    );
    if (ok) mutation.mutate(input);
  };

  return { remove, isPending: mutation.isPending };
}
