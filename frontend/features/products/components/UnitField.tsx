'use client';

import { useId } from 'react';

export const UNIT_OPTIONS = [
  'unit',
  'carton',
  'box',
  'crate',
  'piece',
  'packet',
  'dozen',
  'bag',
  'sack',
  'tin',
  'jar',
  'bottle',
  'set',
  'roll',
  'kg',
  'g',
  '5kg',
  '10kg',
  '25kg',
  'litre',
  'ml',
];

const CUSTOM = '__custom__';
const NONE = '__none__';

type UnitFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  compact?: boolean;
};

/**
 * Unit picker for product pricing (e.g. "per carton", "per 5kg").
 *
 * Renders a dropdown of common units plus a "Custom…" entry that reveals a
 * free-text input, so the unit is both selectable and editable.
 */
export default function UnitField({
  value,
  onChange,
  label,
  placeholder = 'e.g. per carton',
  allowEmpty = true,
  className = '',
  selectClassName = '',
  inputClassName = '',
  compact = false,
}: UnitFieldProps) {
  const inputId = useId();
  const unit = value?.trim() ?? '';
  const isPreset = UNIT_OPTIONS.includes(unit);
  const isCustom = !isPreset && unit !== '';
  const showCustomInput = isCustom || (unit === '' && !allowEmpty);

  const selectValue = isPreset ? unit : isCustom || showCustomInput ? CUSTOM : NONE;

  const handleSelect = (next: string) => {
    if (next === NONE) {
      onChange('');
    } else if (next === CUSTOM) {
      if (unit === '' || isPreset) onChange('');
    } else {
      onChange(next);
    }
  };

  const baseSelect =
    'w-full rounded-lg border border-zinc-300 bg-white text-sm text-zinc-800 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50';
  const baseInput =
    'w-full rounded-lg border border-zinc-300 bg-white text-sm text-zinc-800 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50';

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          {label}
        </label>
      )}
      <select
        id={label ? inputId : undefined}
        value={selectValue}
        onChange={(e) => handleSelect(e.currentTarget.value)}
        className={`${baseSelect} ${compact ? 'h-7 px-2' : 'h-9 px-3'} ${selectClassName}`}
      >
        {allowEmpty && <option value={NONE}>None</option>}
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {showCustomInput && (
        <div className={compact ? 'mt-1' : 'mt-1.5'}>
          <input
            type="text"
            placeholder={placeholder}
            value={unit}
            onChange={(e) => onChange(e.currentTarget.value)}
            className={`${baseInput} ${compact ? 'h-7 px-2' : 'h-9 px-3'} ${inputClassName}`}
          />
        </div>
      )}
    </div>
  );
}