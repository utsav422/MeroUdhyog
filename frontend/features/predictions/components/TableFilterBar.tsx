'use client';

import { useEffect, useRef, useState } from 'react';
import { Group, SegmentedControl, Text, TextInput } from '@mantine/core';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { STATUS_LABELS } from '../constants';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export default function TableFilterBar({
  searchValue,
  onSearchChange,
  statusValue,
  onStatusChange,
  totalCount,
  filteredCount,
  searchPlaceholder,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusValue: string;
  onStatusChange: (value: string) => void;
  totalCount: number;
  filteredCount: number;
  searchPlaceholder?: string;
}) {
  const [local, setLocal] = useState(searchValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setLocal(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearchChange(value), 300);
  };

  const filtersActive = searchValue.length > 0 || statusValue !== 'all';

  return (
    <Group gap="sm" align="center" wrap="wrap" className="mb-3">
      <TextInput
        size="sm"
        placeholder={searchPlaceholder ?? 'Search…'}
        value={local}
        onChange={(event) => handleChange(event.currentTarget.value)}
        leftSection={
          <MagnifyingGlass size={15} className="text-zinc-400" />
        }
        rightSection={
          local ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => handleChange('')}
              className="text-zinc-400 transition-colors hover:text-zinc-700"
            >
              <X size={14} />
            </button>
          ) : null
        }
        className="w-64"
      />
      <SegmentedControl
        size="sm"
        value={statusValue}
        onChange={onStatusChange}
        data={STATUS_OPTIONS}
      />
      {filtersActive && (
        <button
          type="button"
          onClick={() => {
            handleChange('');
            onStatusChange('all');
          }}
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          Clear filters
        </button>
      )}
      <Text size="xs" c="dimmed" className="ml-auto">
        Showing {filteredCount} of {totalCount}
      </Text>
    </Group>
  );
}