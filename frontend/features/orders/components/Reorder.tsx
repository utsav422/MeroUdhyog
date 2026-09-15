'use client';

import { useRouter } from 'next/navigation';
import { Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ArrowsClockwise } from '@phosphor-icons/react';
import type { Order } from '../api';
import { useReorderOrder } from '../api';

export function canReorder(order: Order): boolean {
  return ['failed', 'cancelled'].includes(order.status);
}

export function cancelledCount(n: number | null | undefined): string {
  if (!n || n < 1) return '';
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n} times`;
}

export function reorderTooltip(order: Order): string {
  const ref = order.reorder_of_ref ?? 'the previous order';
  if (order.reorder_attempt && order.reorder_attempt >= 1) {
    return `${ref} was cancelled ${cancelledCount(order.reorder_attempt)} before this retry. The cancelled order stays on record.`;
  }
  return `${ref} is a re-order. The cancelled order stays on record.`;
}

export function ReorderBadge({ order, className = '' }: { order: Order; className?: string }) {
  if (!order.reorder_attempt || order.reorder_attempt < 1) return null;
  return (
    <Tooltip label={reorderTooltip(order)} withArrow multiline maw={240}>
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 ${className}`}
      >
        <ArrowsClockwise size={11} weight="bold" />
        reorder #{order.reorder_attempt}
      </span>
    </Tooltip>
  );
}

export function useReorder() {
  const router = useRouter();
  const mutation = useReorderOrder();

  const reorderOrder = (order: Order) => {
    if (mutation.isPending) return;
    mutation.mutate(order.id, {
      onSuccess: (created) => {
        notifications.show({
          color: 'success',
          title: 'Re-order placed',
          message: `${created.order_ref} is a new draft based on ${order.order_ref}. Review and confirm it when ready.`,
        });
        router.push(`/orders/${created.id}`);
      },
      onError: (error) =>
        notifications.show({
          color: 'red',
          title: 'Re-order failed',
          message: error instanceof Error ? error.message : 'Something went wrong',
        }),
    });
  };

  return { canReorder, reorderOrder, isPending: mutation.isPending };
}