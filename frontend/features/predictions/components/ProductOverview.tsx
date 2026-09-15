'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Button, Text } from '@mantine/core';
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  Timer,
  Warning,
} from '@phosphor-icons/react';
import { formatMoney } from '@/lib/format';
import type { ProductCustomer, ProductDetail } from '../api';
import { STATUS_COLORS, STATUS_EXPLAIN, STATUS_LABELS, STATUS_ORDER } from '../constants';

const STATUS_BAR_KEYS = ['overdue', 'due_soon', 'on_track', 'insufficient_data'] as const;

const HERO_META: Record<string, { chip: string; icon: ReactNode }> = {
  overdue: {
    chip: 'bg-danger-50 text-danger-700',
    icon: <Warning size={22} weight="fill" />,
  },
  due_soon: {
    chip: 'bg-warning-50 text-warning-700',
    icon: <Timer size={22} weight="fill" />,
  },
  on_track: {
    chip: 'bg-success-50 text-success-700',
    icon: <CheckCircle size={22} weight="fill" />,
  },
  insufficient_data: {
    chip: 'bg-black/5 text-[var(--muted)]',
    icon: <ChartLineUp size={22} weight="bold" />,
  },
};

function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sortByUrgency(customers: ProductCustomer[]): ProductCustomer[] {
  return [...customers].sort((a, b) => {
    const sa = STATUS_ORDER[a.stock_status] ?? -1;
    const sb = STATUS_ORDER[b.stock_status] ?? -1;
    if (sa !== sb) return sb - sa;
    const da = a.days_until_next ?? Number.MAX_SAFE_INTEGER;
    const db = b.days_until_next ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return b.interest_score - a.interest_score;
  });
}

function chipClass(status: string): string {
  if (status === 'overdue') return 'bg-danger-50 text-danger-700';
  if (status === 'due_soon') return 'bg-warning-50 text-warning-700';
  if (status === 'on_track') return 'bg-success-50 text-success-700';
  return 'bg-black/5 text-[var(--muted)]';
}

function chipText(c: ProductCustomer): string {
  if (c.order_count < 2) return 'needs data';
  if (c.days_until_next == null) return 'no date yet';
  if (c.days_until_next <= 0) return `overdue ${Math.abs(Math.round(c.days_until_next))}d`;
  if (c.stock_status === 'due_soon') return `in ~${Math.round(c.days_until_next)}d`;
  return shortDate(c.next_order_date) || `in ~${Math.round(c.days_until_next)}d`;
}

function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string | number;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-2 truncate text-2xl font-semibold leading-none tracking-tight text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-xs text-zinc-500">{caption}</div>
    </div>
  );
}

export default function ProductOverview({
  detail,
  onViewCustomer,
}: {
  detail: ProductDetail;
  onViewCustomer?: (customerId?: string) => void;
}) {
  const counts = {
    overdue: detail.overdue_count,
    due_soon: detail.due_soon_count,
    on_track: detail.on_track_count,
    insufficient_data: detail.insufficient_count,
  };
  const total = detail.customer_count;

  const primary =
    STATUS_BAR_KEYS.find((key) => counts[key] > 0) ?? 'insufficient_data';
  const hero = HERO_META[primary];

  const focus = useMemo(() => sortByUrgency(detail.customers).slice(0, 4), [detail]);
  const withData = detail.customers.filter((c) => c.order_count >= 2);
  const confident = withData.filter((c) => c.confidence === 'high' || c.confidence === 'medium');

  const daysText =
    detail.days_until_next == null
      ? 'no forecast yet'
      : detail.days_until_next <= 0
        ? `overdue by ${Math.abs(Math.round(detail.days_until_next))}d`
        : `in ~${Math.round(detail.days_until_next)}d`;

  const present = STATUS_BAR_KEYS.filter((key) => counts[key] > 0);
  const money = formatMoney(detail.estimated_revenue);

  let pattern: string;
  if (withData.length >= 2 && confident.length === withData.length) {
    pattern = 'Most buyers order within a few days of the expected date — timing is reliable.';
  } else if (withData.length >= 2) {
    pattern = 'Buying cadence varies a bit, so timings are harder to predict.';
  } else if (withData.length === 1) {
    pattern = 'Only one customer has enough history to judge a pattern so far.';
  } else {
    pattern = 'Add real order dates for this product and the prediction switches on.';
  }

  let headline: string;
  let support: string;
  const first = focus[0];
  if (total === 0) {
    headline = 'No buyer data yet';
    support = 'Once customers order this product, its forecast and value appear here.';
  } else if (counts.overdue > 0) {
    const n = counts.overdue;
    headline = `${n} of ${total} customer${total === 1 ? '' : 's'} ${
      n === 1 ? 'is' : 'are'
    } overdue on this product`;
    support = `Est. ${money} lifetime value · restock now and follow up with ${
      first ? first.customer_name : 'the late buyer'
    } first.`;
  } else if (counts.due_soon > 0) {
    const n = counts.due_soon;
    headline = `${n} of ${total} customer${total === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} due to reorder soon`;
    support = `Keep stock ready for the next order and reach out — this product has brought in an est. ${money}.`;
  } else if (counts.on_track > 0) {
    const n = total - counts.insufficient_data;
    headline = "Every customer's on schedule";
    support = `All ${n} regular buyer${n === 1 ? '' : 's'} follow a predictable cadence${
      counts.insufficient_data > 0
        ? `, and ${counts.insufficient_data} more need order history`
        : ''
    }. This product is worth an est. ${money}.`;
  } else {
    headline = 'Needs order history';
    support = 'Add real order dates for this product and its forecast and value switch on.';
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: STATUS_COLORS[primary] ?? '#f59e0b' }}
        />
        <div className="pl-4 sm:pl-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Owner view
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${hero.chip}`}>
              {hero.icon}
            </div>
            <div>
              <div className="text-xl font-semibold leading-snug tracking-tight text-[var(--foreground)] sm:text-2xl">
                {headline}
              </div>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600">
                {support}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Customers buying"
          value={total}
          caption={`${withData.length} with enough history`}
        />
        <Stat
          label="Orders on file"
          value={detail.order_count}
          caption={detail.last_order_date ? `Last ${shortDate(detail.last_order_date)}` : 'No orders yet'}
        />
        <Stat
          label="Est. value"
          value={money}
          caption="lifetime estimate across customers"
        />
        <Stat
          label="Next order expected"
          value={shortDate(detail.next_order_date) || '—'}
          caption={daysText}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-3">
          <Text fw={600} size="sm" className="text-[var(--foreground)]">
            Where things stand
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            How the {total === 1 ? 'buyer' : 'buyers'} split across prediction status.
          </Text>

          {total > 0 ? (
            <>
              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                {present.map((key, index) => (
                  <div
                    key={key}
                    className={`h-full ${index === 0 ? 'rounded-l-full' : ''} ${
                      index === present.length - 1 ? 'rounded-r-full' : ''
                    }`}
                    style={{
                      width: `${(counts[key] / total) * 100}%`,
                      backgroundColor: STATUS_COLORS[key] ?? '#f59e0b',
                    }}
                  />
                ))}
              </div>

              <div className="mt-4">
                {present.map((key) => (
                  <div key={key} className="flex items-center gap-3 border-b border-zinc-50 py-2 last:border-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[key] ?? '#f59e0b' }}
                    />
                    <Text size="sm" fw={500} className="w-28 text-zinc-700">
                      {STATUS_LABELS[key]}
                    </Text>
                    <Text size="xs" c="dimmed" className="flex-1">
                      {STATUS_EXPLAIN[key]}
                    </Text>
                    <Text size="sm" fw={600} className="tabular-nums text-zinc-800">
                      {counts[key]}
                    </Text>
                  </div>
                ))}
              </div>

              {counts.insufficient_data > 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Adding real order dates moves buyers out of “needs data” and switches
                  their forecast on.
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Nothing to measure yet — buyers will appear here once orders come in.
            </p>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2">
          <Text fw={600} size="sm" className="text-[var(--foreground)]">
            Focus first
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Ordered by urgency — tap a buyer to open their profile.
          </Text>

          <div className="mt-3 flex-1">
            {focus.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No buyers yet, so there&apos;s nothing to focus on.
              </p>
            ) : (
              <div className="flex flex-col">
                {focus.map((c) => (
                  <button
                    key={c.customer_id}
                    type="button"
                    onClick={() => onViewCustomer?.(c.customer_id)}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-zinc-50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: STATUS_COLORS[c.stock_status] ?? '#f59e0b',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-800">
                        {c.customer_name}
                      </span>
                      <span className="block text-xs text-zinc-400">
                        {c.order_count >= 2
                          ? c.avg_gap_days != null
                            ? `every ~${Math.round(c.avg_gap_days)}d · ${Math.round(c.avg_quantity)} units`
                            : `${c.order_count} orders · ${Math.round(c.avg_quantity)} units`
                          : 'no order history yet'}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${chipClass(c.stock_status)}`}>
                      {chipText(c)}
                    </span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
            <p className="text-xs text-zinc-500">{pattern}</p>
            {onViewCustomer && (
              <Button
                variant="subtle"
                size="xs"
                color="gray"
                rightSection={<ArrowRight size={14} />}
                onClick={() => onViewCustomer()}
                className="shrink-0"
              >
                View all
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}