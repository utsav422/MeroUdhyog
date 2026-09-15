'use client';

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
  const formatted = formatValue(value, prefix, format === 'compact');

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </div>
        {typeof trend === 'number' && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              trendDirection === 'up'
                ? 'bg-success-50 text-success-700'
                : 'bg-danger-50 text-danger-700'
            }`}
          >
            {trendDirection === 'up' ? (
              <ArrowUpRight size={12} weight="bold" />
            ) : (
              <ArrowDownRight size={12} weight="bold" />
            )}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <p className="mt-3 text-2xl font-semibold leading-none tracking-tight text-[var(--foreground)]">
        {formatted}
      </p>
      <p className="mt-1.5 text-sm text-[var(--muted)]">{label}</p>
      {trendLabel && (
        <p className="mt-2 text-xs text-[var(--muted)]/80">{trendLabel}</p>
      )}
    </div>
  );
}