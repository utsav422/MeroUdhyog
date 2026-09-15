'use client';

import { SegmentedControl } from '@mantine/core';

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
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
          {legend && <div className="mt-2">{legend}</div>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {showToggle && periodValue !== undefined && onPeriodChange && (
            <SegmentedControl
              size="xs"
              value={periodValue}
              onChange={onPeriodChange}
              data={periodToggle.map((o) => ({ value: o.value, label: o.label }))}
            />
          )}
        </div>
      </div>
      <div className="min-h-[240px] w-full">{children}</div>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
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