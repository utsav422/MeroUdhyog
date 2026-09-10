'use client';

import { useMemo } from 'react';
import { Text } from '@mantine/core';
import type {
  CustomerPrediction,
  PredictionProduct,
  ProductAggregate,
} from '../api';

/**
 * Plain-language summaries for the predictions dashboard.
 *
 * HOW TO EDIT THESE SENTENCES
 * ---------------------------
 * This module is the single source of truth for the one-line explanation
 * shown under each row and at the top of the customer detail modal.
 * - Keep sentences human: never surface raw `interest_score` / `confidence`
 *   numbers or internal field names here. Time spans are fine ("~3 weeks").
 * - Rules currently applied:
 *   · gap > 10 days  -> "every ~N weeks" ; otherwise "every N days"
 *   · "fairly consistent about it" only when confidence == high
 *   · "pattern has varied a bit"    only when confidence == medium
 *   · quantity trend is mentioned only when quantity_trend is "up"/"down"
 *   · recommendations are worded as suggestions ("worth a call / a message")
 *   · insufficient history (< 2 orders) gets its own short sentence
 */

export type SummaryInput = {
  kind: 'customer' | 'product';
  subject: string;
  stock_status: string;
  order_count: number;
  avg_gap_days: number | null;
  avg_quantity: number | null;
  quantity_trend: string | null;
  confidence: string | null;
  productName: string | null;
  recommendation: string;
  days_until_next: number | null;
  next_order_date: string | null;
};

function cadencePhrase(gapDays: number): string {
  if (gapDays >= 10) {
    const weeks = Math.max(1, Math.round(gapDays / 7));
    return weeks === 1 ? 'about a week' : `every ~${weeks} weeks`;
  }
  const days = Math.max(1, Math.round(gapDays));
  return days === 1 ? 'about every day' : `every ${days}–${days + 1} days`;
}

function prettyDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function expectedPhrase(
  daysUntilNext: number | null,
  nextOrderDate: string | null,
): string {
  if (daysUntilNext != null) {
    if (daysUntilNext <= 0) return 'today';
    if (daysUntilNext === 1) return 'tomorrow';
    return `in about ${Math.round(daysUntilNext)} days`;
  }
  const when = prettyDate(nextOrderDate);
  return when ? `around ${when}` : 'soon';
}

export function buildPredictionSentence(input: SummaryInput): string {
  const target =
    input.kind === 'customer'
      ? (input.productName ?? 'their usual products')
      : input.subject;

  if (input.stock_status === 'insufficient_data' || input.order_count < 2) {
    if (input.kind === 'customer') {
      const n = input.order_count;
      return `${input.subject} has only placed ${n} order${
        n === 1 ? '' : 's'
      } for ${target} so far — there isn't enough order history yet to predict the next order.`;
    }
    return `Not enough order history for ${target} yet to predict a reliable reorder date.`;
  }

  const parts: string[] = [];

  if (input.avg_gap_days != null && input.avg_gap_days > 0) {
    let cadence = `${input.subject} usually reorders ${target} ${cadencePhrase(
      input.avg_gap_days,
    )}`;
    if (input.confidence === 'high') {
      cadence += ' and is fairly consistent about it';
    } else if (input.confidence === 'medium') {
      cadence += ' though their ordering pattern has varied a bit';
    }
    parts.push(`${cadence}.`);
  } else {
    parts.push(`${input.subject} reorders ${target} on a regular basis.`);
  }

  const quantity =
    input.avg_quantity != null && input.avg_quantity > 0
      ? `, typically ordering around ${Math.round(input.avg_quantity)} units at a time`
      : '';
  const trend =
    input.quantity_trend === 'up'
      ? '. Their order sizes have been trending up lately'
      : input.quantity_trend === 'down'
        ? '. Their order sizes have been trending down lately'
        : '';

  if (input.stock_status === 'overdue') {
    const past =
      input.days_until_next != null && input.days_until_next < 0
        ? `It's already about ${Math.round(
            Math.abs(input.days_until_next),
          )} days past ${
            input.kind === 'customer' ? 'their' : 'the'
          } usual reorder window${quantity}`
        : `Their usual reorder window has passed${quantity}`;
    const action =
      input.recommendation === 'message' ? 'worth a message' : 'worth a call';
    parts.push(`${past}${trend} — this looks overdue and ${action}.`);
  } else if (input.stock_status === 'due_soon') {
    const action =
      input.recommendation === 'message'
        ? 'a quick message could help it land'
        : 'a quick check-in could help it land';
    parts.push(
      `Their next order is expected ${expectedPhrase(
        input.days_until_next,
        input.next_order_date,
      )}${quantity}${trend} — ${action}.`,
    );
  } else {
    parts.push(
      `Their next order is expected ${expectedPhrase(
        input.days_until_next,
        input.next_order_date,
      )}${quantity}${trend} — no action needed right now.`,
    );
  }

  return parts.join(' ');
}

export function pickTopProduct(
  customer: CustomerPrediction,
): PredictionProduct | undefined {
  if (!customer.products.length) return undefined;
  return [...customer.products].sort(
    (a, b) => b.interest_score - a.interest_score,
  )[0];
}

export function customerSummaryInput(
  customer: CustomerPrediction,
): SummaryInput {
  const top = pickTopProduct(customer);
  return {
    kind: 'customer',
    subject: customer.customer_name,
    stock_status: customer.stock_status,
    order_count: customer.order_count,
    avg_gap_days: top?.avg_gap_days ?? null,
    avg_quantity: top?.avg_quantity ?? null,
    quantity_trend: top?.quantity_trend ?? null,
    confidence: top?.confidence ?? null,
    productName: top?.product_name ?? null,
    recommendation: customer.recommendation,
    days_until_next: customer.days_until_next,
    next_order_date: customer.next_order_date,
  };
}

export function productSummaryInput(product: ProductAggregate): SummaryInput {
  return {
    kind: 'product',
    subject: product.product_name,
    stock_status: product.stock_status,
    order_count: product.order_count,
    avg_gap_days: null,
    avg_quantity: product.avg_quantity,
    quantity_trend: null,
    confidence: null,
    productName: null,
    recommendation: product.recommendation,
    days_until_next: product.days_until_next,
    next_order_date: product.next_order_date,
  };
}

export default function PredictionSummary({
  customer,
  product,
  size = 'sm',
  className,
}: {
  customer?: CustomerPrediction;
  product?: ProductAggregate;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sentence = useMemo(() => {
    if (customer) return buildPredictionSentence(customerSummaryInput(customer));
    if (product) return buildPredictionSentence(productSummaryInput(product));
    return '';
  }, [customer, product]);

  if (!sentence) return null;

  return (
    <Text size={size} c="dimmed" className={className}>
      {sentence}
    </Text>
  );
}