'use client';

import { DatePickerInput } from '@mantine/dates';
import { Button, Group } from '@mantine/core';
import { CalendarBlank, DownloadSimple, Printer, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export type DateFilters = { date_from: Date | null; date_to: Date | null };

export const EMPTY_STATEMENT_DATES: DateFilters = { date_from: null, date_to: null };

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(value: Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StatementShell({
  title,
  subtitle,
  dates,
  onDatesChange,
  onExport,
  exporting,
  children,
}: {
  title: string;
  subtitle?: string;
  dates: DateFilters;
  onDatesChange: (next: DateFilters) => void;
  onExport?: () => void;
  exporting?: boolean;
  children: ReactNode;
}) {
  const hasDates = dates.date_from !== null || dates.date_to !== null;

  return (
    <div>
      <Group
        gap="sm"
        align="center"
        wrap="wrap"
        className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5"
      >
        <DatePickerInput
          size="sm"
          clearable
          placeholder="From"
          value={dates.date_from}
          onChange={(value) => onDatesChange({ ...dates, date_from: toDate(value) })}
          leftSection={<CalendarBlank size={15} className="text-[var(--muted)]" />}
          className="w-44"
        />
        <DatePickerInput
          size="sm"
          clearable
          placeholder="To"
          value={dates.date_to}
          onChange={(value) => onDatesChange({ ...dates, date_to: toDate(value) })}
          leftSection={<CalendarBlank size={15} className="text-[var(--muted)]" />}
          className="w-44"
        />
        {hasDates && (
          <button
            type="button"
            onClick={() => onDatesChange(EMPTY_STATEMENT_DATES)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
          >
            <X size={14} />
            Clear
          </button>
        )}

        <Group gap="xs" ml="auto">
          <Button
            size="sm"
            variant="default"
            leftSection={<Printer size={15} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          {onExport && (
            <Button
              size="sm"
              variant="light"
              color="brand"
              loading={exporting}
              leftSection={<DownloadSimple size={15} />}
              onClick={onExport}
            >
              Export CSV
            </Button>
          )}
        </Group>
      </Group>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 print:border-0 print:p-0">
        <div className="mb-5 border-b border-[var(--border)] pb-4">
          <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
