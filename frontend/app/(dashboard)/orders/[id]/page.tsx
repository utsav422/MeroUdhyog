'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Group, Table, Text, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  ArrowLeft,
  PencilSimple,
  CheckCircle,
  CurrencyDollar,
  MapPin,
  User,
  Package,
  Copy,
  Truck,
} from '@phosphor-icons/react';
import { useOrder, itemCount, useOrderStatusUpdate, useAssignDelivery, useUpdateDeliveryStatus, useDeliveryForOrder } from '@/features/orders/api';
import { useCustomers } from '@/features/customers/api';
import { useUsers } from '@/features/staff/api';
import { LoadingState, ErrorState, StatusBadge } from '@/components/shared';
import { formatMoney, formatDateTime } from '@/lib/format';

// The order timeline up to "ready" is all the staff control manually; from
// "assigned" onward the linked delivery drives the order status.
const STATUS_TIMELINE = ['draft', 'confirmed', 'ready', 'assigned', 'picked_up', 'in_transit', 'delivered'];
// Next valid step for each order status (matches backend transitions)
const NEXT_STATUS: Record<string, string> = {
  draft: 'confirmed',
  confirmed: 'ready',
};
const DELIVERY_TRANSITIONS: Record<string, string> = {
  pending_assignment: 'assigned',
  assigned: 'picked_up',
  picked_up: 'in_transit',
};
const DELIVERY_MANAGED_STATUSES = ['assigned', 'picked_up', 'in_transit', 'in_delivery', 'failed'];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useOrder(params.id);
  const customersQuery = useCustomers();
  const usersQuery = useUsers();
  const { delivery } = useDeliveryForOrder(params.id);

  const statusMutation = useOrderStatusUpdate();
  const assignMutation = useAssignDelivery();
  const deliveryStatusMutation = useUpdateDeliveryStatus();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  const customer = customersQuery.data?.find((c) => c.id === data.customer_id);
  const timelineStatus = data.status === 'in_delivery' ? 'in_transit' : data.status;
  const currentStepIndex = STATUS_TIMELINE.indexOf(timelineStatus);
  const itemsCount = itemCount(data);

  const deliveryAgents = (usersQuery.data ?? []).filter((u) => u.role === 'delivery');
  const nextStatus = NEXT_STATUS[data.status];
  const cancelable = ![
    'delivered',
    'cancelled',
    'failed',
    'assigned',
    'picked_up',
    'in_transit',
    'in_delivery',
  ].includes(data.status);
  const canAssignDelivery =
    !!delivery && delivery.status === 'pending_assignment';
  const nextDeliveryStep = delivery ? DELIVERY_TRANSITIONS[delivery.status] : undefined;

  const advanceStatus = () => {
    if (!nextStatus) return;
    statusMutation.mutate(
      { orderId: data.id, status: nextStatus },
      {
        onSuccess: (res) => {
          const isReady = nextStatus === 'ready';
          notifications.show({
            color: 'success',
            title: isReady ? 'Order marked ready' : `Marked ${nextStatus.replace(/_/g, ' ')}`,
            message:
              isReady && res?.deliveryCreated
                ? 'Delivery has been created and will appear in the Deliveries section.'
                : isReady
                  ? 'The order already had a delivery.'
                  : 'Order status updated',
          });
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Update failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  const cancelOrder = () => {
    statusMutation.mutate(
      { orderId: data.id, status: 'cancelled' },
      {
        onSuccess: () =>
          notifications.show({ color: 'success', title: 'Order cancelled', message: 'Status updated' }),
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Cancel failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  const assignAgent = (agentId: string | null) => {
    if (!delivery || !agentId) return;
    assignMutation.mutate(
      { deliveryId: delivery.id, agentId },
      {
        onSuccess: () =>
          notifications.show({ color: 'success', title: 'Agent assigned', message: 'Delivery assigned' }),
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Assign failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  const advanceDelivery = () => {
    if (!delivery || !nextDeliveryStep) return;
    deliveryStatusMutation.mutate(
      { deliveryId: delivery.id, status: nextDeliveryStep },
      {
        onSuccess: () =>
          notifications.show({
            color: 'success',
            title: `Marked ${nextDeliveryStep.replace(/_/g, ' ')}`,
            message: 'Delivery status updated',
          }),
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Update failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Group mb="md">
          <Button
            variant="subtle"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => router.push('/orders')}
            color="gray"
          >
            Back to orders
          </Button>
        </Group>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Text fw={700} size="xl" className="leading-tight">
                {data.order_ref}
              </Text>
              <StatusBadge status={data.status} />
              <StatusBadge status={data.payment_status} />
            </div>
            <Text size="sm" c="dimmed" className="mt-1">
              Created {formatDateTime(data.created_at)}
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nextStatus && (
              <Button
                color="brand"
                loading={statusMutation.isPending}
                onClick={advanceStatus}
              >
                Mark {nextStatus.replace(/_/g, ' ')}
                {nextStatus === 'ready' && ' + create delivery'}
              </Button>
            )}
            {cancelable && (
              <Button variant="default" color="red" onClick={cancelOrder}>
                Cancel order
              </Button>
            )}
            {data.status !== 'failed' && (
              <Button variant="default" leftSection={<PencilSimple size={16} />} onClick={() => router.push(`/orders/${data.id}/edit`)}>
                Edit order
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <User size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Customer</Text>
          <Text fw={600} size="sm" className="mt-0.5">{customer?.name ?? 'Walk-in'}</Text>
          {customer?.phone && (
            <Text size="xs" c="dimmed" className="mt-0.5">{customer.phone}</Text>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Package size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Items</Text>
          <Text fw={600} size="sm" className="mt-0.5">{itemsCount} units</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">{data.items.length} line items</Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CurrencyDollar size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total amount</Text>
          <Text fw={700} size="lg" className="mt-0.5">{formatMoney(data.total_amount)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {data.payment_status === 'paid' ? 'Paid in full' : 'Pending payment'}
          </Text>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <MapPin size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Delivery</Text>
          <Text fw={600} size="sm" className="mt-0.5">
            {data.delivery_address ? 'Address set' : 'No address'}
          </Text>
          {data.delivery_address && (
            <Text size="xs" c="dimmed" className="mt-0.5 line-clamp-2">{data.delivery_address}</Text>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <Text fw={600} size="sm" mb="md" className="text-zinc-700">
          Order progress
        </Text>
        <div className="flex items-center gap-0">
          {STATUS_TIMELINE.map((step, i) => {
            const isActive = i <= currentStepIndex && data.status !== 'cancelled';
            const isCurrent = i === currentStepIndex;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                      isActive
                        ? isCurrent
                          ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-200'
                          : 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-zinc-200 bg-white text-zinc-300'
                    }`}
                  >
                    {isActive && !isCurrent ? (
                      <CheckCircle size={16} weight="fill" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium capitalize ${isCurrent ? 'text-brand-700' : isActive ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {step.replace(/_/g, ' ')}
                  </span>
                </div>
                {i < STATUS_TIMELINE.length - 1 && (
                  <div className={`mx-2 h-0.5 flex-1 rounded-full ${isActive && i < currentStepIndex ? 'bg-emerald-500' : 'bg-zinc-100'}`} />
                )}
              </div>
            );
          })}
        </div>
        {data.status === 'cancelled' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
            <span className="text-xs font-semibold text-red-600">This order has been cancelled</span>
          </div>
        )}
        {data.status === 'failed' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
            <span className="text-xs font-semibold text-red-600">This delivery failed and was not completed</span>
          </div>
        )}
        {DELIVERY_MANAGED_STATUSES.includes(data.status) && data.status !== 'failed' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5">
            <Truck size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              This order is in the delivery pipeline — the delivery agent drives its status from here on.
            </span>
          </div>
        )}
      </div>

      {delivery && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Truck size={18} className="text-zinc-500" />
            <Text fw={600} size="sm" className="text-zinc-700">Delivery</Text>
            <StatusBadge status={delivery.status} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} className="mb-1 tracking-wider">Assigned agent</Text>
              {canAssignDelivery ? (
                <Select
                  placeholder="Select delivery agent"
                  searchable
                  data={deliveryAgents.map((u) => ({ value: u.id, label: u.full_name }))}
                  onChange={assignAgent}
                  disabled={assignMutation.isPending}
                />
              ) : delivery.delivery_agent_id ? (
                <Text size="sm" className="text-zinc-700">
                  {usersQuery.data?.find((u) => u.id === delivery.delivery_agent_id)?.full_name ?? 'Unknown'}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">Not assigned</Text>
              )}
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} className="mb-1 tracking-wider">Assigned</Text>
              <Text size="sm" className="text-zinc-700">
                {delivery.assigned_at ? formatDateTime(delivery.assigned_at) : '—'}
              </Text>
            </div>
          </div>
          {nextDeliveryStep && (
            <Button
              className="mt-4"
              leftSection={<Package size={16} />}
              loading={deliveryStatusMutation.isPending}
              onClick={advanceDelivery}
            >
              Mark {nextDeliveryStep.replace(/_/g, ' ')}
            </Button>
          )}
        </div>
      )}

      {data.delivery_address && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={18} className="text-zinc-500" />
            <Text fw={600} size="sm" className="text-zinc-700">Delivery address</Text>
          </div>
          <Text size="sm" className="text-zinc-600">{data.delivery_address}</Text>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Text fw={600} size="md" className="text-zinc-800">Line items</Text>
              <Text size="xs" c="dimmed" className="mt-0.5">{data.items.length} products in this order</Text>
            </div>
            <div className="flex items-center gap-2">
              <Copy size={14} className="text-zinc-400" />
              <Text size="xs" c="dimmed">Order ID: {data.id.slice(0, 8)}…</Text>
            </div>
          </div>
        </div>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="text-zinc-400">
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">#</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Product</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider">Variant</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Qty</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Unit price</Table.Th>
              <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((it, idx) => (
              <Table.Tr key={it.id}>
                <Table.Td>
                  <span className="text-xs text-zinc-400">{idx + 1}</span>
                </Table.Td>
                <Table.Td>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Package size={14} weight="duotone" />
                    </div>
                    <span className="font-medium text-zinc-800">{it.product_name}</span>
                  </div>
                </Table.Td>
                <Table.Td>
                  <span className="text-zinc-500">{it.variant_name ?? '—'}</span>
                </Table.Td>
                <Table.Td ta="right">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {it.quantity}
                  </span>
                </Table.Td>
                <Table.Td ta="right" className="text-zinc-600">
                  {formatMoney(it.unit_price)}
                </Table.Td>
                <Table.Td ta="right" fw={600} className="text-zinc-800">
                  {formatMoney(it.amount)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <div className="border-t border-zinc-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <Text size="sm" c="dimmed">
              Total ({itemsCount} units)
            </Text>
            <Text fw={700} size="lg" className="text-zinc-800">
              {formatMoney(data.total_amount)}
            </Text>
          </div>
        </div>
      </div>

      {data.notes && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <Text fw={600} size="sm" mb="sm" className="text-zinc-700">Notes</Text>
          <Text size="sm" className="text-zinc-600">{data.notes}</Text>
        </div>
      )}
    </div>
  );
}
