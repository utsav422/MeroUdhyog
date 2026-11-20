import NepaliDate from 'nepali-date-converter';

const NEPALI_DIGITS = /[०-९]/g;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeDigits(value: string): string {
  return value.replace(NEPALI_DIGITS, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
}

function normalizeAdDate(value: string): string | null {
  const parts = normalizeDigits(value.trim()).split(/[-/]/);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function normalizeBsDate(value: string): string | null {
  const parts = normalizeDigits(value.trim()).split(/[-/\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 32) return null;
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

export function isValidAdDate(value: string): boolean {
  return normalizeAdDate(value) !== null;
}

export function adToBs(value: string): string {
  const normalized = normalizeAdDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  return new NepaliDate(new Date(year, month - 1, day)).format('YYYY-MM-DD');
}

export function bsToAd(value: string): string {
  const normalized = normalizeBsDate(value);
  if (!normalized) return '';
  try {
    const bs = NepaliDate.parse(normalized);
    if (bs.format('YYYY-MM-DD') !== normalized) return '';
    const ad = bs.toJsDate();
    return `${String(ad.getFullYear()).padStart(4, '0')}-${pad(ad.getMonth() + 1)}-${pad(ad.getDate())}`;
  } catch {
    return '';
  }
}
