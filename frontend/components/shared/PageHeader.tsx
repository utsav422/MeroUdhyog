'use client';

import { Group, Text } from '@mantine/core';

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Group
      justify="space-between"
      align="flex-end"
      wrap="wrap"
      gap="sm"
      className="mb-6 border-b border-[var(--border)] pb-5"
    >
      <div>
        <Text fw={700} size="xl" c="var(--foreground)" className="leading-tight tracking-tight">
          {title}
        </Text>
        {subtitle && (
          <Text size="sm" className="mt-1 text-[var(--muted)]">
            {subtitle}
          </Text>
        )}
      </div>
      {actions && (
        <Group gap="xs" wrap="nowrap">
          {actions}
        </Group>
      )}
    </Group>
  );
}