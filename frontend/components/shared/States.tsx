'use client';

import { Loader, Text, ThemeIcon } from '@mantine/core';
import { Package, WarningCircle, LockKey } from '@phosphor-icons/react';

export function LoadingState({
  label = 'Loading…',
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Loader size="sm" color="gray.5" />
      <Text size="sm" c="dimmed">
        {label}
      </Text>
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description = 'No records match your current filters.',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <ThemeIcon variant="light" color="gray" radius="xl" size={48}>
        <Package size={22} weight="light" />
      </ThemeIcon>
      <div>
        <Text fw={600} size="md">
          {title}
        </Text>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message = 'Something went wrong while loading this data.',
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <ThemeIcon variant="light" color="danger" radius="xl" size={48}>
        <WarningCircle size={22} weight="light" />
      </ThemeIcon>
      <div>
        <Text fw={600} size="md">
          Unable to load data
        </Text>
        <Text size="sm" c="dimmed">
          {message}
        </Text>
      </div>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-1 rounded-lg bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function PermissionDeniedState({
  message = "You don't have permission to view or modify this resource.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <ThemeIcon variant="light" color="warning" radius="xl" size={48}>
        <LockKey size={22} weight="light" />
      </ThemeIcon>
      <div>
        <Text fw={600} size="md">
          Permission denied
        </Text>
        <Text size="sm" c="dimmed">
          {message}
        </Text>
      </div>
    </div>
  );
}
