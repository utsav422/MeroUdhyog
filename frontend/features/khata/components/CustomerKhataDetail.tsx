'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  ArrowLeft,
  Bank,
  CashRegister,
  CreditCard,
  DownloadSimple,
  FilePdf,
  HandCoins,
  Receipt,
  XCircle,
} from '@phosphor-icons/react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import { useSession } from '@/lib/providers';
import { formatDateTime, formatMoney } from '@/lib/format';
import { paymentMethodLabel } from '../constants';
import {
  downloadReceiptPdf,
  useCustomerKhata,
  useVoidPayment,
} from '../api';
import type { Payment } from '../api';
import RecordPaymentModal from './RecordPaymentModal';

function methodIcon(method: string) {
  const icons: Record<string, ReactNode> = {
    cash: <CashRegister size={18} weight="duotone" />,
    bank_transfer: <Bank size={18} weight="duotone" />,
    esewa: <CreditCard size={18} weight="duotone" />,
    khalti: <CreditCard size={18} weight="duotone" />,
    other: <HandCoins size={18} weight="duotone" />,
  };
  return icons[method] ?? <HandCoins size={18} weight="duotone" />;
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-700'
      : tone === 'danger'
        ? 'text-danger-700'
        : 'text-zinc-900';
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <Text fw={700} size="xl" className={`mt-1 ${toneClass}`}>
        {value}
      </Text>
      {hint && <Text size="xs" c="dimmed" className="mt-0.5">{hint}</Text>}
    </div>
  );
}

export default function CustomerKhataDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const session = useSession();
  const detailQuery = useCustomerKhata(customerId);
  const voidPayment = useVoidPayment();
  const [paymentOpen, setPaymentOpen] = useState(false);

  if (detailQuery.isLoading) return <LoadingState />;
  if (detailQuery.isError) return <ErrorState retry={() => detailQuery.refetch()} />;
  const detail = detailQuery.data;
  if (!detail) return null;

  const outstanding = Number(detail.outstanding);
  const isOwner = session?.role === 'owner';

  const voidEntry = (payment: Payment) => {
    const reason = window.prompt('Reason for voiding this payment:');
    if (reason === null || !reason.trim()) return;
    voidPayment.mutate(
      { paymentId: payment.id, reason: reason.trim() },
      {
        onSuccess: () =>
          notifications.show({
            color: 'success',
            title: 'Payment voided',
            message: 'Order balances have been restored.',
          }),
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Void failed',
            message: err instanceof Error ? err.message : 'Something went wrong',
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
            onClick={() => router.push('/khata')}
            color="gray"
          >
            Back to khata
          </Button>
        </Group>
        <PageHeader
          title={detail.customer_name}
          subtitle={
            [detail.company, detail.city, detail.phone, detail.address].filter(Boolean).join(' · ') ||
            'Customer ledger'
          }
          actions={
            <Button
              leftSection={<HandCoins size={16} weight="bold" />}
              onClick={() => setPaymentOpen(true)}
            >
              Record payment
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total billed" value={formatMoney(detail.total_billed)} hint={`${detail.orders.length} orders`} />
        <SummaryCard label="Total paid" value={formatMoney(detail.total_paid)} />
        {outstanding < 0 ? (
          <SummaryCard
            label="Customer credit"
            value={formatMoney(Math.abs(outstanding))}
            hint="Paid ahead of their orders"
            tone="success"
          />
        ) : (
          <SummaryCard label="Outstanding" value={formatMoney(outstanding)} tone={outstanding === 0 ? 'success' : 'danger'} />
        )}
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">
            Orders
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Order balances settle through khata payments.
          </Text>
        </div>
        {detail.orders.length === 0 ? (
          <EmptyState title="No orders" description="Place an order before collecting a payment." />
        ) : (
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Order</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Total</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Paid</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Balance</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Payment</Table.Th>
                <Table.Th ta="right" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.orders.map((o) => {
                const balance = Math.max(0, Number(o.total_amount) - Number(o.amount_paid));
                return (
                  <Table.Tr key={o.order_id}>
                    <Table.Td>
                      <button
                        type="button"
                        className="font-medium text-brand-700 hover:underline"
                        onClick={() => router.push(`/orders/${o.order_id}`)}
                      >
                        {o.order_ref}
                      </button>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={o.status} />
                    </Table.Td>
                    <Table.Td ta="right" className="text-zinc-700">{formatMoney(o.total_amount)}</Table.Td>
                    <Table.Td ta="right" className="text-zinc-700">{formatMoney(o.amount_paid)}</Table.Td>
                    <Table.Td ta="right" fw={600} className="text-zinc-900">{formatMoney(balance)}</Table.Td>
                    <Table.Td>
                      <StatusBadge status={o.payment_status} />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        leftSection={<FilePdf size={14} />}
                        onClick={() => router.push(`/orders/${o.order_id}/invoice`)}
                      >
                        Invoice
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">
            Payments
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Receipts are frozen at collection time and never edited — voided ones are reversed.
          </Text>
        </div>
        {detail.payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Record the first payment to start the ledger." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {detail.payments.map((p) => {
              const isVoided = p.status === 'voided';
              return (
                <div key={p.id} className={`flex flex-wrap items-center gap-4 px-6 py-4 ${isVoided ? 'opacity-60' : ''}`}>
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isVoided
                        ? 'bg-danger-50 text-danger-600'
                        : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {isVoided ? <XCircle size={18} weight="duotone" /> : methodIcon(p.method)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-800">{formatMoney(p.amount)}</span>
                      <StatusBadge status={isVoided ? 'cancelled' : 'paid'} label={isVoided ? 'Voided' : 'Active'} />
                      {p.receipt_number && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          <Receipt size={12} /> {p.receipt_number}
                        </span>
                      )}
                    </div>
                    {p.note && <Text size="xs" c="dimmed" className="mt-0.5">{p.note}</Text>}
                    {isVoided && p.void_reason && (
                      <Text size="xs" c="dimmed" className="mt-0.5">
                        Voided: {p.void_reason}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" className="mt-0.5">
                      {paymentMethodLabel(p.method)} · {formatDateTime(p.collected_at)}
                      {p.collector_name ? ` · by ${p.collector_name}` : ''}
                    </Text>
                  </div>

                  {!isVoided && (
                    <Group gap="xs">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<FilePdf size={14} />}
                        onClick={() => router.push(`/khata/receipts/${p.id}`)}
                        disabled={!p.receipt_number}
                      >
                        Receipt
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<DownloadSimple size={14} />}
                        onClick={() => void downloadReceiptPdf(p.id)}
                        disabled={!p.receipt_number}
                      >
                        Download
                      </Button>
                    </Group>
                  )}
                  {isOwner && !isVoided && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<XCircle size={14} />}
                      onClick={() => voidEntry(p)}
                      disabled={voidPayment.isPending}
                    >
                      Void
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RecordPaymentModal
        opened={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerId={detail.customer_id}
        orders={detail.orders}
      />
    </div>
  );
}