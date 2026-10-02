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
      {/* min-w-0 lets the title shrink instead of forcing the actions off
          screen when both are on one line. */}
      <div className="min-w-0 flex-1">
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
        // Must wrap: Button labels are nowrap, so a 3-button row overflows a
        // phone viewport rather than breaking onto a second line.
        <Group gap="xs" wrap="wrap" justify="flex-end" className="max-w-full">
          {actions}
        </Group>
      )}
    </Group>
  );
}