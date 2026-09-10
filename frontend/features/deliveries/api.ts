'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MAX_FETCH } from '../products/api';
import { ordersKeys } from '../orders/api';

export type Delivery = {
  id: string;
  tenant_id: string;
  order_id: string;
  route_id: string | null;
  delivery_agent_id: string | null;
  status: string;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  delivered_lat: string | null;
  delivered_lng: string | null;
  proof_notes: string | null;
  created_at: string;
  order_ref: string | null;
  customer_name: string | null;
  delivery_address: string | null;
  delivery_lat: string | null;
  delivery_lng: string | null;
};

export const deliveriesKeys = {
  all: ['deliveries'] as const,
  list: () => [...deliveriesKeys.all, 'list'] as const,
  detail: (id: string) => [...deliveriesKeys.all, 'detail', id] as const,
  mine: () => [...deliveriesKeys.all, 'mine'] as const,
};

export function useDeliveries(routeId?: string | null) {
  return useQuery({
    queryKey: [...deliveriesKeys.list(), routeId ?? null],
    queryFn: () =>
      apiClient.get<Delivery[]>(
        routeId
          ? `/deliveries?limit=${MAX_FETCH}&route_id=${routeId}`
          : `/deliveries?limit=${MAX_FETCH}`,
      ),
  });
}

export function useMyDeliveries() {
  return useQuery({
    queryKey: deliveriesKeys.mine(),
    queryFn: () => apiClient.get<Delivery[]>(`/deliveries/me?limit=${MAX_FETCH}`),
  });
}

export type AgentLive = {
  id: string;
  full_name: string;
  email: string;
  agent_lat: string | null;
  agent_lng: string | null;
  agent_location_updated_at: string | null;
  active_deliveries: number;
};

export function useDeliveryAgents() {
  return useQuery({
    queryKey: [...deliveriesKeys.all, 'agents'] as const,
    queryFn: () => apiClient.get<AgentLive[]>('/deliveries/agents'),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export async function reportAgentLocation(
  latitude: number,
  longitude: number,
  accuracy?: number,
) {
  await apiClient.post('/deliveries/me/location', {
    latitude: String(latitude.toFixed(6)),
    longitude: String(longitude.toFixed(6)),
    accuracy,
  });
}

export const DELIVERY_STATUSES = [
  'pending_assignment',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
];

export type BulkAssignResult = {
  assigned: number;
  skipped: { delivery_id: string; reason: string }[];
};

export function useBulkAssignDelivery() {
  const qc = useQueryClient();
  return useMutation<
    BulkAssignResult,
    Error,
    { deliveryIds: string[]; agentId: string }
  >({
    mutationFn: async ({ deliveryIds, agentId }) => {
      return apiClient.post<BulkAssignResult>('/deliveries/bulk-assign', {
        delivery_ids: deliveryIds,
        delivery_agent_id: agentId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
      // Assigning pending deliveries moves the linked orders into the flow too.
      qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}
