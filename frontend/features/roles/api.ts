'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type Role = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const rolesKeys = {
  all: ['roles'] as const,
  list: () => [...rolesKeys.all, 'list'] as const,
};

export function useRoles() {
  return useQuery({
    queryKey: rolesKeys.list(),
    queryFn: () => apiClient.get<Role[]>('/roles'),
  });
}

export const PERMISSIONS: { value: string; label: string }[] = [
  { value: 'manage_users', label: 'Manage users & roles' },
  { value: 'view_all', label: 'View all data' },
  { value: 'import_data', label: 'Import data' },
  { value: 'manage_settings', label: 'Manage settings' },
  { value: 'manage_catalog', label: 'Manage products & catalogue' },
  { value: 'manage_customers', label: 'Manage customers & prices' },
  { value: 'manage_transactions', label: 'Manage transactions' },
  { value: 'manage_orders', label: 'Manage orders' },
  { value: 'manage_audits', label: 'Manage audits' },
  { value: 'view_assigned_deliveries', label: 'View assigned deliveries' },
  { value: 'update_delivery_status', label: 'Update delivery status' },
  { value: 'manage_khata', label: 'Record & view customer khata' },
  { value: 'manage_bill_template', label: 'Configure bill format (receipts/invoices)' },
];
