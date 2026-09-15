import { STATUS_LABELS } from './constants';
import type { Analysis } from './api';

export type RhythmPreview = {
  avgGapDays: number;
  nextDate: Date;
  daysUntilNext: number;
  status: 'overdue' | 'due_soon' | 'on_track';
  statusLabel: string;
};

export function predictRhythm(dates: string[]): RhythmPreview | null {
  const unique = dates
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((d, i, arr) => i === 0 || d.toDateString() !== arr[i - 1].toDateString());

  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const gap = Math.round(
      (unique[i].getTime() - unique[i - 1].getTime()) / (24 * 60 * 60 * 1000),
    );
    if (gap >= 1) gaps.push(gap);
  }
  if (gaps.length === 0) return null;

  const avgGapDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const last = unique[unique.length - 1];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(last.getTime() + avgGapDays * 24 * 60 * 60 * 1000);
  const daysUntilNext = Math.round(
    (nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  let status: RhythmPreview['status'];
  if (daysUntilNext < 0) status = 'overdue';
  else if (daysUntilNext <= Math.max(3, 0.3 * avgGapDays)) status = 'due_soon';
  else status = 'on_track';

  return {
    avgGapDays,
    nextDate,
    daysUntilNext,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
  };
}

export function buildPreviewSentence(
  dates: string[],
  currentPairStatus?: string | null,
): string {
  const preview = predictRhythm(dates);
  if (!preview) {
    return 'Enter at least two different order dates to see what this would predict.';
  }

  const gapDays = Math.round(preview.avgGapDays);
  const gapPhrase =
    gapDays >= 10
      ? `every ~${Math.max(1, Math.round(gapDays / 7))} ${
          Math.max(1, Math.round(gapDays / 7)) === 1 ? 'week' : 'weeks'
        }`
      : gapDays === 1
        ? 'about every day'
        : `every ~${gapDays} days`;

  const when = preview.nextDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const currentPart = currentPairStatus
    ? ` Today it reads “${STATUS_LABELS[currentPairStatus] ?? currentPairStatus}”. `
    : ' ';

  return `Based on this, they reorder ${gapPhrase}.${currentPart}Their next order would be forecast around ${when} → “${preview.statusLabel}”.`;
}

export function findPairStatus(
  analysis: Analysis | undefined,
  customerId: string | null,
  productId: string | null,
): string | undefined {
  if (!analysis || !customerId || !productId) return undefined;
  const customer = analysis.customers.find((c) => c.customer_id === customerId);
  return customer?.products.find((p) => p.product_id === productId)?.stock_status;
}