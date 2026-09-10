'use client';

import { Group, Text } from '@mantine/core';
import { STATUS_COLORS, STATUS_EXPLAIN, STATUS_LABELS } from '../constants';

export default function StatusLegend() {
  return (
    <Group gap="xl" wrap="wrap" className="mb-3">
      {Object.entries(STATUS_LABELS).map(([key, label]) => (
        <div key={key} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[key] ?? '#6f4bff' }}
          />
          <Text size="xs" c="dimmed">
            <span className="font-medium text-zinc-700">{label}</span>
            {' — '}
            {STATUS_EXPLAIN[key]}
          </Text>
        </div>
      ))}
    </Group>
  );
}