'use client';

import { Card, Group, SegmentedControl, Text } from '@mantine/core';

export type PeriodToggleOption = {
  value: string;
  label: string;
};

export default function ChartCard({
  title,
  subtitle,
  periodToggle,
  periodValue,
  onPeriodChange,
  legend,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  periodToggle?: PeriodToggleOption[];
  periodValue?: string;
  onPeriodChange?: (value: string) => void;
  legend?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showToggle = periodToggle && periodToggle.length > 0;
  return (
    <Card className="flex flex-col gap-4">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text fw={600} size="md">
            {title}
          </Text>
          {subtitle && (
            <Text size="xs" c="dimmed" className="mt-0.5">
              {subtitle}
            </Text>
          )}
          {legend && <div className="mt-2">{legend}</div>}
        </div>
        <Group gap="sm" wrap="nowrap">
          {action}
          {showToggle && periodValue !== undefined && onPeriodChange && (
            <SegmentedControl
              size="xs"
              value={periodValue}
              onChange={onPeriodChange}
              data={periodToggle.map((o) => ({ value: o.value, label: o.label }))}
            />
          )}
        </Group>
      </Group>
      <div className="min-h-[240px] w-full">{children}</div>
    </Card>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
