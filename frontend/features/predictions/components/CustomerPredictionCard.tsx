'use client';

import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { Check, X } from '@phosphor-icons/react';
import type { CustomerPrediction } from '../api';
import { STATUS_COLORS } from '../constants';
import { StatusBadge } from '@/components/shared';
import { formatDate } from '@/lib/format';
import ConfidenceBadge from './ConfidenceBadge';
import InterestBadge from './InterestBadge';
import PredictionSummary, { pickTopProduct } from './PredictionSummary';
import RecommendationAction from './RecommendationAction';

export default function CustomerPredictionCard({
  customer,
  contactedAt,
  onView,
  onToggleContacted,
}: {
  customer: CustomerPrediction;
  contactedAt?: string | null;
  onView: (customer: CustomerPrediction) => void;
  onToggleContacted: (customerId: string) => void;
}) {
  const top = pickTopProduct(customer);
  return (
    <Card
      padding="md"
      radius="md"
      withBorder
      className="cursor-pointer transition-shadow hover:shadow-md"
      style={{
        borderLeft: `4px solid ${STATUS_COLORS[customer.stock_status] ?? '#6f4bff'}`,
      }}
      onClick={() => onView(customer)}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <div className="min-w-0">
            <Text fw={600} truncate>
              {customer.customer_name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {customer.customer_email ?? customer.customer_phone ?? ''}
            </Text>
          </div>
          <StatusBadge status={customer.stock_status} />
        </Group>

        <PredictionSummary customer={customer} size="sm" />

        <Group justify="space-between" wrap="wrap">
          <Group gap={6}>
            <InterestBadge score={customer.interest_score} />
            <ConfidenceBadge confidence={top?.confidence} />
          </Group>
          <div onClick={(event) => event.stopPropagation()}>
            {contactedAt ? (
              <Badge
                variant="light"
                color="gray"
                radius="sm"
                styles={{ label: { textTransform: 'none' } }}
              >
                <span className="inline-flex items-center gap-1">
                  <Check size={12} weight="bold" />
                  Contacted {formatDate(contactedAt)}
                </span>
              </Badge>
            ) : (
              <RecommendationAction
                rec={customer.recommendation}
                phone={customer.customer_phone}
                email={customer.customer_email}
                productName={top?.product_name}
              />
            )}
          </div>
        </Group>

        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            Next order:{' '}
            {customer.next_order_date ? formatDate(customer.next_order_date) : '—'}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={contactedAt ? <X size={13} /> : <Check size={13} />}
            onClick={(event) => {
              event.stopPropagation();
              onToggleContacted(customer.customer_id);
            }}
          >
            {contactedAt ? 'Unmark' : 'Mark as contacted'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}