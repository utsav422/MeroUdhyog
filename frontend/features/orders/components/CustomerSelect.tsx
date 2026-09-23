'use client';

import { Select } from '@mantine/core';
import type { SelectProps } from '@mantine/core';
import { Check } from '@phosphor-icons/react';
import { useCustomers } from '../../customers/api';

type CustomerSelectProps = Omit<SelectProps, 'data' | 'value' | 'onChange' | 'renderOption'> & {
  value?: string | null;
  onChange?: (value: string | null) => void;
};

export default function CustomerSelect({
  value,
  onChange,
  ...props
}: CustomerSelectProps) {
  const customersQuery = useCustomers();
  const customers = customersQuery.data ?? [];

  return (
    <Select
      {...props}
      searchable
      clearable
      placeholder="Select customer"
      data={customers.map((c) => ({ value: c.id, label: c.name }))}
      value={value ?? null}
      onChange={(v) => onChange?.(v ?? null)}
      renderOption={({ option, checked }) => {
        const c = customers.find((x) => x.id === option.value);
        return (
          <div className="flex w-full items-center justify-between gap-3 py-0.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-zinc-800">{option.label}</span>
              {c?.city || c?.address ? (
                <span className="truncate text-xs text-zinc-400">
                  {[c.city, c.address].filter(Boolean).join(', ')}
                </span>
              ) : null}
            </div>
            {checked && (
              <Check
                size={14}
                weight="bold"
                className="shrink-0 text-brand-600"
                aria-hidden
              />
            )}
          </div>
        );
      }}
    />
  );
}