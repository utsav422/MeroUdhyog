'use client';

import { Card, Group, Text, ThemeIcon } from '@mantine/core';
import { ArrowDownRight, ArrowUpRight } from '@phosphor-icons/react';

function formatValue(value: number, prefix = '', compact = false): string {
  if (compact) {
    return (
      prefix +
      new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)
    );
  }
  return prefix + new Intl.NumberFormat('en-US').format(value);
}

export default function KPICard({
  icon,
  label,
  value,
  prefix = '',
  trend,
  trendLabel,
  trendDirection = 'up',
  format = 'number',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prefix?: string;
  trend?: number;
  trendLabel?: string;
  trendDirection?: 'up' | 'down';
  format?: 'number' | 'currency' | 'compact';
}) {
  const displayMode = format;
  const formatted = formatValue(value, prefix, displayMode === 'compact');

  return (
    <Card className="flex flex-col gap-3">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </div>
        {typeof trend === 'number' && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              trendDirection === 'up'
                ? 'bg-success-50 text-success-600'
                : 'bg-danger-50 text-danger-600'
            }`}
          >
            {trendDirection === 'up' ? (
              <ArrowUpRight size={14} weight="bold" />
            ) : (
              <ArrowDownRight size={14} weight="bold" />
            )}
            {trend}%
          </div>
        )}
      </Group>
      <div>
        <Text size="sm" c="dimmed" fw={500}>
          {label}
        </Text>
        <Text size="xl" fw={700} className="mt-0.5 leading-tight">
          {formatted}
        </Text>
        {trendLabel && (
          <Text size="xs" c="dimmed" className="mt-0.5">
            {trendLabel}
          </Text>
        )}
      </div>
    </Card>
  );
}
