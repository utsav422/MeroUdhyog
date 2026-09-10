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
    <Group justify="space-between" align="flex-end" wrap="wrap" mb="lg">
      <div>
        <Text fw={700} size="xl" className="leading-tight">
          {title}
        </Text>
        {subtitle && (
          <Text size="sm" c="dimmed" className="mt-0.5">
            {subtitle}
          </Text>
        )}
      </div>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
