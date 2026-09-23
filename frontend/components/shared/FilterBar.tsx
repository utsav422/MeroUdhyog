'use client';

import { useEffect, useRef } from 'react';
import { Group, MultiSelect, SegmentedControl, Select, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

export type FilterDef =
  | { type: 'select'; key: string; label: string; options: { value: string; label: string }[]; placeholder?: string }
  | { type: 'multiselect'; key: string; label: string; options: { value: string; label: string }[]; placeholder?: string }
  | { type: 'date'; key: string; label: string }
  | { type: 'daterange'; key: string; label: string }
  | { type: 'rangedate'; key: string; label: string };

export type DateRangeValue = {
  mode: 'all' | 'today' | 'range';
  from: Date | null;
  to: Date | null;
};

export const EMPTY_DATE_RANGE: DateRangeValue = { mode: 'all', from: null, to: null };

export function dateInRange(
  ts: string | Date | null | undefined,
  value: DateRangeValue,
): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (value.mode === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return t >= start.getTime() && t <= end.getTime();
  }
  if (value.mode === 'range' && value.from && value.to) {
    const start = new Date(value.from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(value.to);
    end.setHours(23, 59, 59, 999);
    return t >= start.getTime() && t <= end.getTime();
  }
  return true;
}

export type Filters = Record<
  string,
  string | string[] | [Date | null, Date | null] | DateRangeValue | null
>;

export default function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filterDefs,
  filterValues,
  onFiltersChange,
  onClear,
  hasActiveFilters,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterDefs?: FilterDef[];
  filterValues?: Filters;
  onFiltersChange?: (filters: Filters) => void;
  onClear?: () => void;
  hasActiveFilters?: boolean;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSearch = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  const localFilters = filterDefs ?? [];

  return (
    <Group
      gap="sm"
      align="center"
      wrap="wrap"
      className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5"
    >
      <TextInput
        placeholder={searchPlaceholder}
        defaultValue={searchValue}
        leftSection={<MagnifyingGlass size={16} className="text-[var(--muted)]" />}
        onChange={(e) => handleSearch(e.currentTarget.value)}
        className="w-64"
        size="sm"
      />

      {localFilters.length > 0 && <div className="h-6 w-px bg-[var(--border)]" />}

      {localFilters.map((def) => {
        if (def.type === 'select') {
          return (
            <Select
              key={def.key}
              size="sm"
              placeholder={def.placeholder ?? def.label}
              clearable
              data={def.options}
              value={(filterValues?.[def.key] as string) ?? null}
              onChange={(value) =>
                onFiltersChange?.({ ...filterValues, [def.key]: value ?? null })
              }
              className="w-44"
            />
          );
        }
        if (def.type === 'multiselect') {
          return (
            <MultiSelect
              key={def.key}
              size="sm"
              placeholder={def.placeholder ?? def.label}
              data={def.options}
              value={(filterValues?.[def.key] as string[]) ?? []}
              onChange={(value) =>
                onFiltersChange?.({ ...filterValues, [def.key]: value })
              }
              className="w-48"
            />
          );
        }
        if (def.type === 'date') {
          return (
            <DatePickerInput
              key={def.key}
              size="sm"
              placeholder={def.label}
              onChange={(value) =>
                onFiltersChange?.({ ...filterValues, [def.key]: value })
              }
              className="w-48"
            />
          );
        }
        if (def.type === 'daterange') {
          return (
            <DatePickerInput
              key={def.key}
              size="sm"
              type="range"
              clearable
              placeholder={def.label}
              value={(filterValues?.[def.key] as [Date | null, Date | null] | undefined) ?? [null, null]}
              onChange={(value) => {
                const next = { ...filterValues, [def.key]: value } as Filters;
                onFiltersChange?.(next);
              }}
              className="w-64"
            />
          );
        }
        if (def.type === 'rangedate') {
          const value = (filterValues?.[def.key] as DateRangeValue | undefined) ?? EMPTY_DATE_RANGE;
          return (
            <Group key={def.key} gap={6} wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={value.mode}
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'today', label: 'Today' },
                  { value: 'range', label: 'Range' },
                ]}
                onChange={(mode) =>
                  onFiltersChange?.({
                    ...filterValues,
                    [def.key]: { ...value, mode: mode as DateRangeValue['mode'] },
                  } as Filters)
                }
              />
              {value.mode === 'range' && (
                <DatePickerInput
                  size="sm"
                  type="range"
                  clearable
                  placeholder={def.label}
                  value={[value.from, value.to]}
                  onChange={(range) => {
                    const [from, to] = range as [Date | null, Date | null];
                    onFiltersChange?.({
                      ...filterValues,
                      [def.key]: { mode: 'range', from, to } as DateRangeValue,
                    } as Filters);
                  }}
                  className="w-64"
                />
              )}
            </Group>
          );
        }
        return null;
      })}

      {(hasActiveFilters || searchValue) && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
        >
          <X size={14} />
          Clear filters
        </button>
      )}
    </Group>
  );
}