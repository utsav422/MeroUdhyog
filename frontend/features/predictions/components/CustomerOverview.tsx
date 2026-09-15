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
import type { CustomerPrediction, PredictionProduct } from '../api';
import { STATUS_COLORS, STATUS_EXPLAIN, STATUS_LABELS, STATUS_ORDER } from '../constants';

type Counts = {
  on_track: number;
  due_soon: number;
  overdue: number;
  insufficient_data: number;
};

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

function statusCounts(customer: CustomerPrediction): Counts {
  const counts: Counts = { on_track: 0, due_soon: 0, overdue: 0, insufficient_data: 0 };
  for (const p of customer.products) {
    if (p.stock_status === 'on_track') counts.on_track += 1;
    else if (p.stock_status === 'due_soon') counts.due_soon += 1;
    else if (p.stock_status === 'overdue') counts.overdue += 1;
    else counts.insufficient_data += 1;
  }
  return counts;
}

function shortDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sortByUrgency(products: PredictionProduct[]): PredictionProduct[] {
  return [...products].sort((a, b) => {
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

function chipText(p: PredictionProduct): string {
  if (p.order_count < 2) return 'needs data';
  if (p.days_until_next == null) return 'no date yet';
  if (p.days_until_next <= 0) return `overdue ${Math.abs(Math.round(p.days_until_next))}d`;
  if (p.stock_status === 'due_soon') return `in ~${Math.round(p.days_until_next)}d`;
  return shortDate(p.next_order_date) || `in ~${Math.round(p.days_until_next)}d`;
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

export default function CustomerOverview({
  customer,
  onViewProducts,
}: {
  customer: CustomerPrediction;
  onViewProducts?: (productId?: string) => void;
}) {
  const counts = statusCounts(customer);
  const total = customer.products.length;

  const primary =
    STATUS_BAR_KEYS.find((key) => counts[key] > 0) ?? 'insufficient_data';
  const hero = HERO_META[primary];

  const priority = useMemo(
    () => sortByUrgency(customer.products).slice(0, 4),
    [customer],
  );
  const withData = useMemo(
    () => customer.products.filter((p) => p.order_count >= 2),
    [customer],
  );

  const gaps = withData
    .map((p) => p.avg_gap_days)
    .filter((g): g is number => g != null && g > 0);
  const avgGap = gaps.length
    ? Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length)
    : null;

  const present = STATUS_BAR_KEYS.filter((key) => counts[key] > 0);
  const lastOrder = shortDate(customer.last_order_date);

  const daysText =
    customer.days_until_next == null
      ? 'no prediction yet'
      : customer.days_until_next <= 0
        ? `overdue by ${Math.abs(Math.round(customer.days_until_next))}d`
        : `in ~${Math.round(customer.days_until_next)}d`;

  const confident =
    withData.filter((p) => p.confidence === 'high' || p.confidence === 'medium').length;
  let pattern: string;
  if (withData.length >= 2 && confident === withData.length) {
    pattern =
      'Most orders land within a few days of the expected date — timings are fairly reliable.';
  } else if (withData.length >= 2) {
    pattern = 'Ordering has varied a bit, so timings are harder to predict.';
  } else if (withData.length === 1) {
    pattern = 'Only one product has enough history to judge a pattern so far.';
  } else {
    pattern = 'Add real order dates and the prediction switches on automatically.';
  }

  let headline: string;
  let support: string;
  const first = priority[0];
  if (total === 0) {
    headline = 'No products to predict yet';
    support = 'Predictions appear here once this customer has products with order history.';
  } else if (counts.overdue > 0) {
    const n = counts.overdue;
    headline = `${n} of ${total} product${total === 1 ? '' : 's'} ${
      n === 1 ? 'is' : 'are'
    } past ${n === 1 ? 'its' : 'their'} reorder window`;
    support = first
      ? `A call this week usually lands overdue reorders — start with ${first.product_name}.`
      : 'A call this week usually turns these around.';
  } else if (counts.due_soon > 0) {
    const n = counts.due_soon;
    headline = `${n} of ${total} product${total === 1 ? '' : 's'} ${
      n === 1 ? 'is' : 'are'
    } due to reorder soon`;
    support = first
      ? `Next up: ${first.product_name}${
          first.days_until_next != null
            ? ` is expected in ~${Math.round(first.days_until_next)} days`
            : ''
        } — a quick message could land it.`
      : 'A quick message could land the next order.';
  } else if (counts.on_track > 0) {
    const n = total - counts.insufficient_data;
    headline = "Everything's on schedule";
    support = `All ${n} product${n === 1 ? '' : 's'} with history follow a predictable cadence${
      counts.insufficient_data > 0
        ? `, and ${counts.insufficient_data} more ${
            counts.insufficient_data === 1 ? 'needs' : 'need'
          } order history to predict`
        : ''
    }.`;
  } else {
    headline = 'Needs a little more history';
    support = `Once real order dates are added, the prediction for ${customer.customer_name} switches on automatically.`;
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
            How it&apos;s going
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${hero.chip}`}
            >
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
          label="Orders on file"
          value={customer.order_count}
          caption={lastOrder ? `Last ${lastOrder}` : 'No orders yet'}
        />
        <Stat
          label="Products tracked"
          value={customer.product_count}
          caption={`${withData.length} with enough history`}
        />
        <Stat
          label="Avg reorder gap"
          value={avgGap ?? '—'}
          caption={avgGap != null ? 'between orders, on average' : 'needs more history'}
        />
        <Stat
          label="Next order expected"
          value={shortDate(customer.next_order_date) || '—'}
          caption={daysText}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-3">
          <Text fw={600} size="sm" className="text-[var(--foreground)]">
            Where things stand
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            How the {total === 1 ? 'product' : 'products'} split across prediction status.
          </Text>

          {total > 0 ? (
            <>
              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                {present.map((key, index) => (
                  <div
                    key={key}
                    className={`h-full ${
                      index === 0 ? 'rounded-l-full' : ''
                    } ${index === present.length - 1 ? 'rounded-r-full' : ''}`}
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
                  Adding real order dates moves items out of “needs data” and switches
                  their prediction on.
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Nothing to measure yet — products will appear here once added.
            </p>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2">
          <Text fw={600} size="sm" className="text-[var(--foreground)]">
            Focus first
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Ordered by urgency — tap a row to open it in Products.
          </Text>

          <div className="mt-3 flex-1">
            {priority.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No products yet, so there&apos;s nothing to focus on.
              </p>
            ) : (
              <div className="flex flex-col">
                {priority.map((p) => (
                  <button
                    key={p.product_id}
                    type="button"
                    onClick={() => onViewProducts?.(p.product_id)}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-zinc-50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: STATUS_COLORS[p.stock_status] ?? '#f59e0b',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-800">
                        {p.product_name}
                      </span>
                      <span className="block text-xs text-zinc-400">
                        {p.order_count >= 2
                          ? p.avg_gap_days != null
                            ? `every ~${Math.round(p.avg_gap_days)}d · ${Math.round(
                                p.avg_quantity,
                              )} units`
                            : `${p.order_count} orders · ${Math.round(p.avg_quantity)} units`
                          : 'no order history yet'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${chipClass(
                        p.stock_status,
                      )}`}
                    >
                      {chipText(p)}
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
            {onViewProducts && (
              <Button
                variant="subtle"
                size="xs"
                color="gray"
                rightSection={<ArrowRight size={14} />}
                onClick={() => onViewProducts()}
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