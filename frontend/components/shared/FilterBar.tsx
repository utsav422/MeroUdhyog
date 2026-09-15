'use client';

import { useEffect, useRef } from 'react';
import { Group, MultiSelect, Select, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

export type FilterDef =
  | { type: 'select'; key: string; label: string; options: { value: string; label: string }[]; placeholder?: string }
  | { type: 'multiselect'; key: string; label: string; options: { value: string; label: string }[]; placeholder?: string }
  | { type: 'date'; key: string; label: string };

export type Filters = Record<string, string | string[] | [Date | null, Date | null] | null>;

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