'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MAX_FETCH } from '../products/api';
import { deliveriesKeys, useDeliveries } from '../deliveries/api';
import type { Delivery } from '../deliveries/api';

export type { Delivery }; 

export function useDeliveryForOrder(orderId: string | null) {
  const deliveriesQuery = useDeliveries();
  const delivery: Delivery | undefined = (deliveriesQuery.data ?? []).find(
    (d) => d.order_id === orderId,
  );
  return { delivery, isLoading: deliveriesQuery.isLoading };
}

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
};

export type Order = {
  id: string;
  tenant_id: string;
  order_ref: string;
  customer_id: string | null;
  route_id: string | null;
  route_name: string | null;
  status: string;
  payment_status: string;
  total_amount: string;
  delivery_address: string | null;
  delivery_lat: string | null;
  delivery_lng: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  items: OrderItem[];
  delivery_created?: boolean | null;
};

export type OrderItemInput = {
  product_id: string;
  variant_id: string;
  quantity: string;
};

export type OrderInput = {
  customer_id?: string | null;
  delivery_address?: string | null;
  notes?: string | null;
  items: OrderItemInput[];
};

export const ordersKeys = {
  all: ['orders'] as const,
  list: () => [...ordersKeys.all, 'list'] as const,
  detail: (id: string) => [...ordersKeys.all, 'detail', id] as const,
};

export function useOrders(routeId?: string | null) {
  return useQuery({
    queryKey: [...ordersKeys.list(), routeId ?? null],
    queryFn: () =>
      apiClient.get<Order[]>(
        routeId
          ? `/orders?limit=${MAX_FETCH}&route_id=${routeId}`
          : `/orders?limit=${MAX_FETCH}`,
      ),
  });
}

export function useOrder(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ordersKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<Order>(`/orders/${id}`),
    enabled: enabled && !!id,
  });
}

export function itemCount(order: Order): number {
  return order.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
}

export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'ready',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
] as const;

// Mirrors backend/app/modules/orders/service.py STATUS_TRANSITIONS.
// The order's own workflow stops at "ready"; everything after that step is
// driven by the linked delivery.
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['cancelled'],
  in_delivery: [],
  assigned: [],
  picked_up: [],
  in_transit: [],
  delivered: [],
  failed: [],
  cancelled: [],
};

export function nextOrderStatuses(status: string): string[] {
  return ORDER_TRANSITIONS[status] ?? [];
}

// Order -> delivery mapping used when an order becomes ready
export function useOrderStatusUpdate() {
  const qc = useQueryClient();
  return useMutation<{ deliveryCreated: boolean }, Error, { orderId: string; status: string }>({
    mutationFn: async ({ orderId, status }) => {
      const updated = await apiClient.patch<Order>(`/orders/${orderId}`, { status });
      // The backend pushes ready orders into the delivery pipeline; reflect
      // whether a new delivery record was created.
      return { deliveryCreated: status === 'ready' && updated.delivery_created === true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
    },
  });
}

export type BulkOrderStatusResult = {
  updated: number;
  skipped: { order_id: string; reason: string }[];
};

export function useBulkOrderStatusUpdate() {
  const qc = useQueryClient();
  return useMutation<BulkOrderStatusResult, Error, { orderIds: string[]; status: string }>({
    mutationFn: async ({ orderIds, status }) => {
      return apiClient.post<BulkOrderStatusResult>('/orders/bulk-status', {
        order_ids: orderIds,
        status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
    },
  });
}

export function useCreateDeliveryForOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const created = await apiClient.post(`/deliveries/from-order/${orderId}`);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
    },
  });
}

export function useAssignDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, agentId }: { deliveryId: string; agentId: string }) => {
      await apiClient.patch(`/deliveries/${deliveryId}/assign`, { delivery_agent_id: agentId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliveryId,
      status,
      notes,
    }: {
      deliveryId: string;
      status: string;
      notes?: string;
    }) => {
      await apiClient.patch(`/deliveries/${deliveryId}`, {
        status,
        ...(status === 'delivered' || status === 'failed' ? { proof_notes: notes || null } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
      // Delivery status drives the linked order status; refresh orders too.
      qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}
