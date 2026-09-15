'use client';

import { Loader } from '@mantine/core';
import { Package, WarningCircle, LockKey } from '@phosphor-icons/react';

function Frame({
  icon,
  tone,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  tone: 'neutral' | 'danger' | 'warning';
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const toneClasses =
    tone === 'danger'
      ? 'bg-danger-50 text-danger-600'
      : tone === 'warning'
        ? 'bg-warning-50 text-warning-600'
        : 'bg-black/5 text-[var(--muted)]';
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${toneClasses}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Loader size="sm" color="gray.5" />
      <p className="text-sm text-[var(--muted)]">{label}</p>
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
    <Frame
      tone="neutral"
      icon={<Package size={20} weight="light" />}
      title={title}
      description={description}
      action={action}
    />
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
    <Frame
      tone="danger"
      icon={<WarningCircle size={20} weight="light" />}
      title="Unable to load data"
      description={message}
      action={
        retry && (
          <button
            type="button"
            onClick={retry}
            className="mt-1 rounded-lg bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
          >
            Try again
          </button>
        )
      }
    />
  );
}

export function PermissionDeniedState({
  message = "You don't have permission to view or modify this resource.",
}: {
  message?: string;
}) {
  return (
    <Frame
      tone="warning"
      icon={<LockKey size={20} weight="light" />}
      title="Permission denied"
      description={message}
    />
  );
}