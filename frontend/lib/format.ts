import { getDateMode, type DateMode } from '@/lib/date-mode';
import { adToBs, BS_MONTHS } from '@/lib/nepali-date';

export function formatMoney(value: string | number | null | undefined, currency = 'NPR'): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(num);
  } catch {
    return `${num}`;
  }
}

export function formatPriceUnit(
  value: string | number | null | undefined,
  unit?: string | null,
  currency = 'NPR',
): string {
  const money = formatMoney(value, currency);
  if (unit && unit.trim()) return `${money} / ${unit.trim()}`;
  return money;
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DateValue = string | number | Date | null | undefined;
type DateStyle = 'short' | 'month-day' | 'month-year' | 'compact' | 'full';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDate(value: DateValue): { date: Date; key: string } | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(dateOnly ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) return null;
  const key = dateOnly
    ? raw
    : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { date, key };
}

function resolveMode(mode?: DateMode | null): DateMode {
  return mode ?? getDateMode();
}

function adLabel(key: string, style: DateStyle): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return '—';
  if (style === 'month-day') return `${MONTHS_SHORT[month - 1]} ${day}`;
  if (style === 'month-year') return `${MONTHS_LONG[month - 1]} ${year}`;
  if (style === 'compact') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return `${WEEKDAYS_SHORT[weekday]} ${MONTHS_SHORT[month - 1]} ${day}`;
  }
  if (style === 'full') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return `${WEEKDAYS_LONG[weekday]}, ${MONTHS_LONG[month - 1]} ${day}, ${year}`;
  }
  return `${MONTHS_SHORT[month - 1]} ${day}, ${year}`;
}

function bsLabel(key: string, style: DateStyle): string {
  let bs = '';
  try {
    bs = adToBs(key);
  } catch {
    return '—';
  }
  if (!bs) return '—';
  const [year, month, day] = bs.split('-').map(Number);
  if (!year || !month || !day) return '—';
  const monthName = BS_MONTHS[month - 1] ?? `Month ${month}`;
  if (style === 'month-day') return `${monthName} ${day}`;
  if (style === 'month-year') return `${monthName} ${year}`;
  const [adYear, adMonth, adDay] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(adYear, adMonth - 1, adDay)).getUTCDay();
  if (style === 'compact') return `${WEEKDAYS_SHORT[weekday]} ${monthName} ${day}`;
  if (style === 'full') return `${WEEKDAYS_LONG[weekday]}, ${monthName} ${day}, ${year}`;
  return `${monthName} ${day}, ${year}`;
}

function formatWithStyle(value: DateValue, mode: DateMode | null, style: DateStyle): string {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return resolveMode(mode) === 'BS'
    ? bsLabel(parsed.key, style)
    : adLabel(parsed.key, style);
}

export function formatDate(value: DateValue, mode?: DateMode | null): string {
  return formatWithStyle(value, mode ?? null, 'short');
}

export function formatDateShort(value: DateValue, mode?: DateMode | null): string {
  return formatWithStyle(value, mode ?? null, 'month-day');
}

export function formatMonthYear(value: DateValue, mode?: DateMode | null): string {
  return formatWithStyle(value, mode ?? null, 'month-year');
}

export function formatDateCompact(value: DateValue, mode?: DateMode | null): string {
  return formatWithStyle(value, mode ?? null, 'compact');
}

export function formatFullDate(value: DateValue, mode?: DateMode | null): string {
  return formatWithStyle(value, mode ?? null, 'full');
}

export function formatDateTime(value: DateValue, mode?: DateMode | null): string {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  const time = parsed.date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return resolveMode(mode) === 'BS'
    ? `${bsLabel(parsed.key, 'short')} ${time}`
    : `${adLabel(parsed.key, 'short')} ${time}`;
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
