'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MAX_FETCH } from '../products/api';
import type { Order } from '../orders/api';

export type Customer = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_number: string | null;
  pan_no: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  route_id: string | null;
  latitude: string | null;
  longitude: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerPrice = {
  id: string;
  tenant_id: string;
  customer_id: string;
  variant_id: string;
  price: string;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  contact_number?: string | null;
  pan_no?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  route_id?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  notes?: string | null;
};

export const customersKeys = {
  all: ['customers'] as const,
  list: () => [...customersKeys.all, 'list'] as const,
  detail: (id: string) => [...customersKeys.all, 'detail', id] as const,
  prices: (id: string) => [...customersKeys.all, 'prices', id] as const,
  orders: (id: string) => [...customersKeys.all, 'orders', id] as const,
};

export function useCustomers(routeId?: string | null) {
  return useQuery({
    queryKey: [...customersKeys.list(), routeId ?? null],
    queryFn: () =>
      apiClient.get<Customer[]>(
        routeId
          ? `/customers?limit=${MAX_FETCH}&route_id=${routeId}`
          : `/customers?limit=${MAX_FETCH}`,
      ),
  });
}

export function useCustomer(id: string | null, enabled = true) {
  return useQuery({
    queryKey: customersKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<Customer>(`/customers/${id}`),
    enabled: enabled && !!id,
  });
}

export function useCustomerPrices(customerId: string | null, enabled = true) {
  return useQuery({
    queryKey: customersKeys.prices(customerId ?? ''),
    queryFn: () => apiClient.get<CustomerPrice[]>(`/customers/${customerId}/prices`),
    enabled: enabled && !!customerId,
  });
}

export function useCustomerOrders(customerId: string | null, enabled = true) {
  return useQuery({
    queryKey: customersKeys.orders(customerId ?? ''),
    queryFn: () =>
      apiClient.get<Order[]>(`/orders?limit=${MAX_FETCH}&customer_id=${customerId}`),
    enabled: enabled && !!customerId,
  });
}
