'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Text, TextInput } from '@mantine/core';
import { adToBs, bsToAd } from '@/lib/nepali-date';

export default function NepaliDateField({
  label,
  value,
  onChange,
  required = false,
  extra,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(() => ({ value, bs: adToBs(value) }));

  if (draft.value !== value) {
    setDraft({ value, bs: adToBs(value) });
  }

  const bsValue = draft.value === value ? draft.bs : adToBs(value);
  const bsInvalid = bsValue.trim() !== '' && bsToAd(bsValue) === '';

  const handleAd = (ad: string) => {
    setDraft({ value: ad, bs: adToBs(ad) });
    onChange(ad);
  };

  const handleBs = (raw: string) => {
    setDraft({ value: draft.value, bs: raw });
    if (!raw.trim()) {
      onChange('');
      return;
    }
    const ad = bsToAd(raw);
    if (ad) onChange(ad);
  };

  return (
    <div>
      <Text size="sm" fw={600} className="mb-2 text-zinc-700">
        {label}
      </Text>
      <div className={`grid grid-cols-1 gap-3 ${extra ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <TextInput
          label="Date (AD)"
          type="date"
          required={required}
          value={value}
          onChange={(event) => handleAd(event.currentTarget.value)}
        />
        <TextInput
          label="Date (BS)"
          placeholder="YYYY-MM-DD"
          value={bsValue}
          error={bsInvalid ? 'Invalid BS date' : undefined}
          onChange={(event) => handleBs(event.currentTarget.value)}
        />
        {extra}
      </div>
    </div>
  );
}
