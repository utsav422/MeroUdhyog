'use client';

import { DatePickerInput } from '@mantine/dates';
import { Button, Group } from '@mantine/core';
import { CalendarBlank, DownloadSimple, Printer, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { type DateFilters, EMPTY_STATEMENT_DATES, toIsoDate } from './StatementShell';

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function ReportToolbar({
  dates,
  onDatesChange,
  asOf = false,
  onExport,
  exporting,
  children,
}: {
  dates: DateFilters;
  onDatesChange: (next: DateFilters) => void;
  asOf?: boolean;
  onExport?: () => void;
  exporting?: boolean;
  children?: ReactNode;
}) {
  const hasDates = dates.date_from !== null || dates.date_to !== null;

  return (
    <Group
      gap="sm"
      align="center"
      wrap="wrap"
      className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5"
    >
      {asOf ? (
        <DatePickerInput
          size="sm"
          clearable
          placeholder="As of date"
          value={dates.date_to}
          onChange={(value) => onDatesChange({ date_from: null, date_to: toDate(value) })}
          leftSection={<CalendarBlank size={15} className="text-[var(--muted)]" />}
          className="w-48"
        />
      ) : (
        <>
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
        </>
      )}

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

      {children}

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
  );
}

export function periodLabel(dates: DateFilters, asOf = false): string {
  if (asOf) return toIsoDate(dates.date_to) ? `As of ${toIsoDate(dates.date_to)}` : 'As of today';
  const from = toIsoDate(dates.date_from);
  const to = toIsoDate(dates.date_to);
  if (!from && !to) return 'All time';
  return `${from ?? 'start'} → ${to ?? 'today'}`;
}
