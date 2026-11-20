'use client';

import { useState } from 'react';
import { TextInput } from '@mantine/core';
import { adToBs, bsToAd } from '@/lib/nepali-date';

export default function DualDateInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [dates, setDates] = useState(() => ({ ad: value, bs: adToBs(value) }));

  if (dates.ad !== value) {
    setDates({ ad: value, bs: adToBs(value) });
  }

  const bsValue = dates.ad === value ? dates.bs : adToBs(value);
  const bsInvalid = bsValue.trim() !== '' && bsToAd(bsValue) === '';

  const handleAd = (ad: string) => {
    setDates({ ad, bs: adToBs(ad) });
    onChange(ad);
  };

  const handleBs = (raw: string) => {
    const ad = raw.trim() ? bsToAd(raw) : '';
    setDates({ ad: ad || dates.ad, bs: raw });
    if (ad || !raw.trim()) onChange(ad);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <TextInput
        label={`${label} (AD)`}
        type="date"
        required={required}
        value={value}
        onChange={(event) => handleAd(event.currentTarget.value)}
      />
      <TextInput
        label={`${label} (BS)`}
        placeholder="YYYY-MM-DD"
        value={bsValue}
        error={bsInvalid ? 'Enter a valid Nepali date' : undefined}
        onChange={(event) => handleBs(event.currentTarget.value)}
      />
    </div>
  );
}
