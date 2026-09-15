'use client';

import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { ProductAggregate } from '../api';
import { STATUS_COLORS } from '../constants';
import { StatusBadge } from '@/components/shared';
import InterestBadge from './InterestBadge';
import PredictionSummary from './PredictionSummary';
import RecommendationAction from './RecommendationAction';

export default function ProductPredictionCard({
  product,
}: {
  product: ProductAggregate;
}) {
  return (
    <Card
      padding="md"
      radius="md"
      withBorder
      style={{
        borderLeft: `4px solid ${STATUS_COLORS[product.stock_status] ?? '#f59e0b'}`,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <div className="min-w-0">
            <Text fw={600} truncate>
              {product.product_name}
            </Text>
            {product.sku && (
              <Text size="xs" c="dimmed" truncate>
                {product.sku}
              </Text>
            )}
          </div>
          <StatusBadge status={product.stock_status} />
        </Group>

        <PredictionSummary product={product} size="sm" />

        <Group gap={6} wrap="wrap">
          {product.overdue_count > 0 && (
            <Badge variant="light" color="danger" radius="sm">
              {product.overdue_count} overdue
            </Badge>
          )}
          {product.due_soon_count > 0 && (
            <Badge variant="light" color="warning" radius="sm">
              {product.due_soon_count} due soon
            </Badge>
          )}
          {product.on_track_count > 0 && (
            <Badge variant="light" color="success" radius="sm">
              {product.on_track_count} on track
            </Badge>
          )}
          {product.insufficient_count > 0 && (
            <Badge variant="light" color="gray" radius="sm">
              {product.insufficient_count} need data
            </Badge>
          )}
        </Group>

        <Group justify="space-between" wrap="wrap">
          <Group gap={6}>
            <InterestBadge score={product.interest_score} />
            <Text size="xs" c="dimmed">
              {product.customer_count} customers
            </Text>
          </Group>
          <div onClick={(event) => event.stopPropagation()}>
            <RecommendationAction
              rec={product.recommendation}
              phone={null}
              email={null}
            />
          </div>
        </Group>
      </Stack>
    </Card>
  );
}