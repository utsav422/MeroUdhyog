'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Group, Text } from '@mantine/core';
import { ArrowLeft } from '@phosphor-icons/react';
import { useOrder } from '@/features/orders/api';
import OrderForm from '@/features/orders/components/OrderForm';
import { LoadingState, ErrorState } from '@/components/shared';

export default function EditOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useOrder(params.id);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <Group justify="space-between">
        <div>
          <Text fw={700} size="xl">Edit {data.order_ref}</Text>
          <Text size="sm" c="dimmed" className="mt-0.5">
            Update the order details below
          </Text>
        </div>
        <Button
          variant="subtle"
          leftSection={<ArrowLeft size={16} />}
          onClick={() => router.push(`/orders/${data.id}`)}
          color="gray"
        >
          Back to order
        </Button>
      </Group>
      <OrderForm order={data} onDone={() => router.push(`/orders/${data.id}`)} />
    </div>
  );
}
