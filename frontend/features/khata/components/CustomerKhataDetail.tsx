'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Select, Table, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  ArrowLeft,
  Bank,
  CashRegister,
  CreditCard,
  DownloadSimple,
  FilePdf,
  HandCoins,
  ArrowsOut,
  Truck,
  XCircle,
} from '@phosphor-icons/react';
import {
  CreditLimitBar,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PaginationBar,
  PageHeader,
  ResponsiveTable,
  StatusBadge,
} from '@/components/shared';
import type { DateRangeValue, Filters } from '@/components/shared';
import { EMPTY_DATE_RANGE, dateRangeToApi } from '@/components/shared';
import { useSession } from '@/lib/providers';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { PAYMENT_METHODS, paymentMethodLabel } from '../constants';
import {
  downloadReceiptPdf,
  useCustomerKhata,
  useVoidPayment,
} from '../api';
import type { Payment } from '../api';
import RecordPaymentModal from './RecordPaymentModal';
import DirectDeliveryModal from './DirectDeliveryModal';
import LedgerTable from './LedgerTable';
import PdfPreviewModal from './PdfPreviewModal';

function methodIcon(method: string) {
  const icons: Record<string, ReactNode> = {
    cash: <CashRegister size={18} weight="duotone" />,
    bank_transfer: <Bank size={18} weight="duotone" />,
    esewa: <CreditCard size={18} weight="duotone" />,
    khalti: <CreditCard size={18} weight="duotone" />,
    cheque: <Bank size={18} weight="duotone" />,
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
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerDate, setLedgerDate] = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const [ledgerType, setLedgerType] = useState<string | null>(null);
  const [ledgerMethod, setLedgerMethod] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<string | null>('ledger');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const ledgerRange = dateRangeToApi(ledgerDate);
  const detailQuery = useCustomerKhata(customerId, {
    dateFrom: ledgerRange.from,
    dateTo: ledgerRange.to,
    entryType: ledgerType,
    method: ledgerMethod,
    search: ledgerSearch,
    ledgerLimit: ledgerPageSize,
    ledgerOffset: (ledgerPage - 1) * ledgerPageSize,
  });
  const voidPayment = useVoidPayment();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [directDeliveryOpen, setDirectDeliveryOpen] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{
    orderId: string;
    orderRef: string;
  } | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    paymentId: string;
    receiptNumber: string | null;
  } | null>(null);

  if (detailQuery.isLoading) return <LoadingState />;
  if (detailQuery.isError) return <ErrorState retry={() => detailQuery.refetch()} />;
  const detail = detailQuery.data;
  if (!detail) return null;

  const outstanding = Number(detail.outstanding);
  const isOwner = session?.role === 'owner';
  const visiblePayments = detail.payments.filter((p) =>
    !paymentStatusFilter ||
    (paymentStatusFilter === 'voided' ? p.status === 'voided' : p.status !== 'voided'),
  );

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
            <Group gap="sm">
              <Button
                variant="light"
                leftSection={<Truck size={16} weight="bold" />}
                onClick={() => setDirectDeliveryOpen(true)}
              >
                Add past delivery
              </Button>
              <Button
                leftSection={<HandCoins size={16} weight="bold" />}
                onClick={() => setPaymentOpen(true)}
              >
                Record payment
              </Button>
            </Group>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total billed" value={formatMoney(detail.total_billed)} hint={`${detail.orders.length} orders`} />
        <SummaryCard label="Total paid" value={formatMoney(detail.total_paid)} />
        <SummaryCard
          label="Last delivery"
          value={detail.last_delivered_at ? formatDate(detail.last_delivered_at) : '—'}
          hint={detail.last_delivered_at ? formatDateTime(detail.last_delivered_at) : 'No delivered orders yet'}
        />
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

      <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text fw={600} size="sm" className="text-zinc-700">Credit limit</Text>
            <Text size="xs" c="dimmed" className="mt-0.5">
              {detail.credit_limit
                ? detail.credit_available && Number(detail.credit_available) > 0
                  ? `${formatMoney(detail.credit_available)} of headroom left before new orders need confirmation.`
                  : 'Fully used — new orders will need confirmation before saving.'
                : 'No limit set — orders are never blocked.'}
            </Text>
          </div>
          {detail.credit_limit && (
            <Text fw={700} size="lg" className="tabular-nums">
              {formatMoney(detail.credit_limit)}
            </Text>
          )}
        </div>
        <CreditLimitBar figures={detail} className="mt-4" />
      </div>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="ledger">Ledger ({detail.ledger_total})</Tabs.Tab>
          <Tabs.Tab value="orders">Orders ({detail.orders.length})</Tabs.Tab>
          <Tabs.Tab value="payments">Payments ({detail.payments.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="ledger" pt="md">
      <Group justify="flex-end" mb="xs">
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<ArrowsOut size={14} />}
          onClick={() => setLedgerExpanded(true)}
        >
          Maximize table
        </Button>
      </Group>
      <FilterBar
        searchValue={ledgerSearch}
        onSearchChange={(value) => {
          setLedgerSearch(value);
          setLedgerPage(1);
        }}
        searchPlaceholder="Search ledger by reference or receipt…"
        filterDefs={[
          {
            type: 'select' as const,
            key: 'entryType',
            label: 'Entry type',
            placeholder: 'All entries',
            options: [
              { value: 'invoice', label: 'Invoices' },
              { value: 'payment', label: 'Payments' },
            ],
          },
          {
            type: 'select' as const,
            key: 'method',
            label: 'Payment method',
            placeholder: 'Any method',
            options: PAYMENT_METHODS,
          },
          {
            type: 'rangedate' as const,
            key: 'date',
            label: 'Entry date',
          },
        ]}
        filterValues={
          {
            entryType: ledgerType,
            method: ledgerMethod,
            date: ledgerDate,
          } as Filters
        }
        onFiltersChange={(filters) => {
          setLedgerType((filters.entryType as string | null) ?? null);
          setLedgerMethod((filters.method as string | null) ?? null);
          setLedgerDate((filters.date as DateRangeValue) ?? EMPTY_DATE_RANGE);
          setLedgerPage(1);
        }}
        onClear={() => {
          setLedgerSearch('');
          setLedgerType(null);
          setLedgerMethod(null);
          setLedgerDate(EMPTY_DATE_RANGE);
          setLedgerPage(1);
        }}
        hasActiveFilters={
          !!ledgerSearch || !!ledgerType || !!ledgerMethod || ledgerDate.mode !== 'all'
        }
      />

      <LedgerTable
        ledger={detail.ledger}
        customerName={detail.customer_name}
        onOpenInvoice={(orderId) => {
          const order = detail.orders.find((o) => o.order_id === orderId);
          setInvoicePreview({ orderId, orderRef: order?.order_ref ?? '' });
        }}
        onOpenReceipt={(paymentId) => {
          const payment = detail.payments.find((p) => p.id === paymentId);
          setReceiptPreview({ paymentId, receiptNumber: payment?.receipt_number ?? null });
        }}
      />

      <PaginationBar
        page={ledgerPage}
        pageSize={ledgerPageSize}
        total={detail.ledger_total}
        onPageChange={setLedgerPage}
        onPageSizeChange={(size) => {
          setLedgerPageSize(size);
          setLedgerPage(1);
        }}
      />
        </Tabs.Panel>

        <Tabs.Panel value="orders" pt="md">
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <Text fw={600} size="md" className="text-zinc-800">
              Orders
            </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Order balances settle through khata payments.
          </Text>
          </div>
        </div>
        <div className="px-6 pt-4">
          <Select
            size="sm"
            placeholder="All statuses"
            data={[...new Set(detail.orders.map((o) => o.status))].map((status) => ({
              value: status,
              label: status.replace(/_/g, ' '),
            }))}
            value={orderStatusFilter}
            onChange={setOrderStatusFilter}
            clearable
            w={200}
          />
        </div>
        {detail.orders.length === 0 ? (
          <EmptyState title="No orders" description="Place an order before collecting a payment." />
        ) : (
          <ResponsiveTable minWidth={640}>
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Order</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Delivered</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Total</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Paid</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Balance</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Payment</Table.Th>
                <Table.Th ta="right" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.orders
                .filter((o) => !orderStatusFilter || o.status === orderStatusFilter)
                .map((o) => {
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
                      <div className="flex flex-col gap-1">
                        <Text size="xs" className="text-zinc-600">
                          {o.delivered_at ? formatDate(o.delivered_at) : formatDate(o.created_at)}
                        </Text>
                        {o.source === 'khata_direct' && (
                          <Text size="xs" fw={600} className="text-brand-700">Direct</Text>
                        )}
                      </div>
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
                        onClick={() => setInvoicePreview({ orderId: o.order_id, orderRef: o.order_ref })}
                      >
                        Invoice
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </ResponsiveTable>
        )}
      </div>
        </Tabs.Panel>

        <Tabs.Panel value="payments" pt="md">
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <Text fw={600} size="md" className="text-zinc-800">
              Payments
            </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Receipts are frozen at collection time and never edited — voided ones are reversed.
          </Text>
          </div>
        </div>
        <div className="px-6 pt-4">
          <Select
            size="sm"
            placeholder="All payments"
            data={[
              { value: 'active', label: 'Active' },
              { value: 'voided', label: 'Voided' },
            ]}
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
            clearable
            w={200}
          />
        </div>
        {visiblePayments.length === 0 ? (
          <EmptyState title="No payments yet" description="Record the first payment to start the ledger." />
        ) : (
          <ResponsiveTable minWidth={760}>
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Date</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Amount</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Method</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Receipt</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Collected by</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Status</Table.Th>
                <Table.Th ta="right" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visiblePayments.map((p) => {
                const isVoided = p.status === 'voided';
                return (
                  <Table.Tr key={p.id} className={isVoided ? 'opacity-60' : undefined}>
                    <Table.Td className="whitespace-nowrap text-zinc-600">
                      {formatDateTime(p.collected_at)}
                    </Table.Td>
                    <Table.Td fw={600} className="text-zinc-900">{formatMoney(p.amount)}</Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        {isVoided ? <XCircle size={14} /> : methodIcon(p.method)}
                        <span>{paymentMethodLabel(p.method)}</span>
                      </Group>
                      {p.note && <Text size="xs" c="dimmed">{p.note}</Text>}
                      {isVoided && p.void_reason && (
                        <Text size="xs" c="dimmed">Voided: {p.void_reason}</Text>
                      )}
                    </Table.Td>
                    <Table.Td className="text-zinc-600">{p.receipt_number ?? '—'}</Table.Td>
                    <Table.Td className="text-zinc-600">{p.collector_name ?? '—'}</Table.Td>
                    <Table.Td>
                      <StatusBadge
                        status={isVoided ? 'cancelled' : 'paid'}
                        label={isVoided ? 'Voided' : 'Active'}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {!isVoided && (
                          <>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              leftSection={<FilePdf size={14} />}
                              onClick={() =>
                                setReceiptPreview({ paymentId: p.id, receiptNumber: p.receipt_number })
                              }
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
                          </>
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
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </ResponsiveTable>
        )}
      </div>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={ledgerExpanded}
        onClose={() => setLedgerExpanded(false)}
        title={`${detail.customer_name} · Ledger`}
        fullScreen
        transitionProps={{ transition: 'fade', duration: 150 }}
      >
        <LedgerTable
          ledger={detail.ledger}
          customerName={detail.customer_name}
          onOpenInvoice={(orderId) => {
            const order = detail.orders.find((o) => o.order_id === orderId);
            setLedgerExpanded(false);
            setInvoicePreview({ orderId, orderRef: order?.order_ref ?? '' });
          }}
          onOpenReceipt={(paymentId) => {
            const payment = detail.payments.find((p) => p.id === paymentId);
            setLedgerExpanded(false);
            setReceiptPreview({ paymentId, receiptNumber: payment?.receipt_number ?? null });
          }}
        />
      </Modal>

      <RecordPaymentModal
        opened={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerId={detail.customer_id}
        orders={detail.orders}
      />

      <DirectDeliveryModal
        opened={directDeliveryOpen}
        onClose={() => setDirectDeliveryOpen(false)}
        customerId={detail.customer_id}
        customerName={detail.customer_name}
        creditLimit={detail.credit_limit}
        creditAvailable={detail.credit_available}
        onRecorded={() => void detailQuery.refetch()}
      />

      <PdfPreviewModal
        opened={!!invoicePreview}
        onClose={() => setInvoicePreview(null)}
        url={invoicePreview ? `/khata/orders/${invoicePreview.orderId}/invoice/pdf` : ''}
        title={invoicePreview ? `Invoice · ${invoicePreview.orderRef}` : 'Invoice'}
        subtitle={invoicePreview ? invoicePreview.orderRef : undefined}
        fallbackName={`invoice-${invoicePreview?.orderId.slice(0, 8) ?? 'preview'}.pdf`}
      />
      <PdfPreviewModal
        opened={!!receiptPreview}
        onClose={() => setReceiptPreview(null)}
        url={receiptPreview ? `/khata/receipts/${receiptPreview.paymentId}/pdf` : ''}
        title={receiptPreview?.receiptNumber ?? 'Receipt'}
        subtitle={receiptPreview ? 'Printable receipt' : undefined}
        fallbackName={`receipt-${receiptPreview?.paymentId.slice(0, 8) ?? 'preview'}.pdf`}
      />
    </div>
  );
}