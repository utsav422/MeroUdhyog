'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { ordersKeys } from '../orders/api';

export type KhataCustomerSummary = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  company: string | null;
  city: string | null;
  total_billed: string;
  total_paid: string;
  outstanding: string;
  order_count: number;
  last_payment_date: string | null;
  last_payment_amount: string | null;
};

export type KhataOrder = {
  order_id: string;
  order_ref: string;
  created_at: string;
  status: string;
  total_amount: string;
  amount_paid: string;
  payment_status: string;
};

export type PaymentAllocation = {
  order_id: string;
  order_ref: string | null;
  amount_applied: string;
};

export type Payment = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  amount: string;
  method: string;
  collected_by: string | null;
  collector_name: string | null;
  collected_at: string;
  note: string | null;
  receipt_number: string | null;
  status: string;
  voided_at: string | null;
  void_reason: string | null;
  allocations: PaymentAllocation[];
};

export type CustomerKhataDetail = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  address: string | null;
  total_billed: string;
  total_paid: string;
  outstanding: string;
  orders: KhataOrder[];
  payments: Payment[];
};

export type RecordPaymentInput = {
  customer_id: string;
  amount: string;
  method: string;
  collected_at?: string | null;
  note?: string | null;
  allocations?: { order_id: string; amount: string }[] | null;
  generate_receipt?: boolean;
};

export type Receipt = {
  id: string;
  receipt_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  amount: string;
  method: string;
  collected_at: string;
  note: string | null;
  collector_name: string | null;
  status: string;
  voided_at: string | null;
  void_reason: string | null;
  snapshot: Record<string, unknown> | null;
  allocations: PaymentAllocation[];
};

export type InvoiceItem = {
  product_name: string;
  variant_name: string | null;
  unit: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
};

export type Invoice = {
  invoice_number: string;
  order_id: string;
  order_ref: string;
  created_at: string;
  status: string;
  payment_status: string;
  total_amount: string;
  amount_paid: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  items: InvoiceItem[];
  snapshot: Record<string, unknown> | null;
};

export type ImageAsset = { mime: string; data_url: string };

export type BillLayoutAlign = 'left' | 'center' | 'right';

export type BillLayoutBlock = {
  id: string;
  label: string;
  applies: string[];
  alignable: boolean;
  enabled: Record<string, boolean>;
  align: BillLayoutAlign;
};

export type BillLayout = { blocks: BillLayoutBlock[] };

export type BillTemplate = {
  business_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  footer_note: string | null;
  invoice_number_prefix: string;
  receipt_number_prefix: string;
  next_invoice_number: number;
  next_receipt_number: number;
  logo: ImageAsset | null;
  signature: ImageAsset | null;
  layout: BillLayout;
};

export type BillTemplateUpdate = {
  business_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  footer_note?: string | null;
  invoice_number_prefix?: string | null;
  receipt_number_prefix?: string | null;
  layout?: BillLayout | null;
};

export const khataKeys = {
  all: ['khata'] as const,
  customers: () => [...khataKeys.all, 'customers'] as const,
  customer: (id: string) => [...khataKeys.all, 'customers', id] as const,
  receipt: (id: string) => [...khataKeys.all, 'receipts', id] as const,
  template: () => [...khataKeys.all, 'template'] as const,
  invoice: (orderId: string) => [...khataKeys.all, 'invoice', orderId] as const,
};

export function useKhataCustomers() {
  return useQuery({
    queryKey: khataKeys.customers(),
    queryFn: () => apiClient.get<KhataCustomerSummary[]>('/khata/customers'),
  });
}

export function useCustomerKhata(id: string | null, enabled = true) {
  return useQuery({
    queryKey: khataKeys.customer(id ?? ''),
    queryFn: () => apiClient.get<CustomerKhataDetail>(`/khata/customers/${id}`),
    enabled: enabled && !!id,
  });
}

export function useReceipt(id: string) {
  return useQuery({
    queryKey: khataKeys.receipt(id),
    queryFn: () => apiClient.get<Receipt>(`/khata/receipts/${id}`),
    enabled: !!id,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => apiClient.post<Payment>('/khata/payments', input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: khataKeys.customers() });
      qc.invalidateQueries({ queryKey: khataKeys.customer(variables.customer_id) });
      qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiClient.post<Payment>(`/khata/payments/${paymentId}/void`, { reason }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: khataKeys.all });
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      void variables;
    },
  });
}

export function useBillTemplate() {
  return useQuery({
    queryKey: khataKeys.template(),
    queryFn: () => apiClient.get<BillTemplate>('/khata/settings/bill-template'),
  });
}

export function useUpdateBillTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillTemplateUpdate) =>
      apiClient.put<BillTemplate>('/khata/settings/bill-template', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: khataKeys.template() }),
  });
}

export function useUploadTemplateImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: 'logo' | 'signature'; file: File }) =>
      apiClient.upload<BillTemplate>(`/khata/settings/bill-template/${kind}`, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: khataKeys.template() }),
  });
}

export function downloadReceiptPdf(receiptId: string) {
  return apiClient.download(`/khata/receipts/${receiptId}/pdf`, `receipt-${receiptId.slice(0, 8)}.pdf`);
}

export function downloadInvoicePdf(orderId: string) {
  return apiClient.download(`/khata/orders/${orderId}/invoice/pdf`, `invoice-${orderId.slice(0, 8)}.pdf`);
}