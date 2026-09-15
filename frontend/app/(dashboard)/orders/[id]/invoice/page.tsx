'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Table, Text } from '@mantine/core';
import {
  ArrowLeft,
  DownloadSimple,
  CurrencyDollar,
  Package,
  User,
  FilePdf,
} from '@phosphor-icons/react';
import PdfViewer from '@/features/khata/components/PdfViewer';
import { downloadInvoicePdf } from '@/features/khata/api';
import { useOrder } from '@/features/orders/api';
import { LoadingState, ErrorState, StatusBadge } from '@/components/shared';
import { formatMoney, formatPriceUnit, formatDateTime } from '@/lib/format';

export default function InvoiceViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useOrder(params.id);

  if (isLoading) return <LoadingState label="Loading invoice…" />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  const balance = Math.max(0, Number(data.total_amount) - Number(data.amount_paid));
  const itemCount = data.items.reduce((s, it) => s + Number(it.quantity), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="subtle"
          leftSection={<ArrowLeft size={16} />}
          onClick={() => router.push(`/orders/${params.id}`)}
          color="gray"
          mb="md"
        >
          Back to order
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <FilePdf size={24} weight="duotone" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Text fw={700} size="xl" className="leading-tight">
                  Invoice · {data.order_ref}
                </Text>
                <StatusBadge status={data.status} />
                <StatusBadge status={data.payment_status} />
              </div>
              <Text size="sm" c="dimmed" className="mt-0.5">
                Created {formatDateTime(data.created_at)}
              </Text>
            </div>
          </div>
          <Button
            variant="default"
            leftSection={<DownloadSimple size={16} />}
            onClick={() => void downloadInvoicePdf(params.id)}
          >
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-700">
            <CurrencyDollar size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Total amount</Text>
          <Text fw={700} size="xl" className="mt-1">{formatMoney(data.total_amount)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {formatMoney(data.amount_paid)} paid
          </Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Package size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Items</Text>
          <Text fw={700} size="xl" className="mt-1">{itemCount} units</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">{data.items.length} line items</Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <User size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Balance due</Text>
          <Text fw={700} size="xl" className="mt-1">{formatMoney(balance)}</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {data.payment_status === 'paid' ? 'Paid in full' : 'Outstanding'}
          </Text>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">Line items</Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Products billed on this invoice
          </Text>
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
              <Table.Tr key={idx}>
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
                  {formatPriceUnit(it.unit_price, it.unit)}
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
            <Text size="sm" c="dimmed">Total ({itemCount} units)</Text>
            <Text fw={700} size="lg" className="text-zinc-800">{formatMoney(data.total_amount)}</Text>
          </div>
        </div>
      </div>

      {data.notes && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <Text fw={600} size="sm" mb="xs" className="text-zinc-700">Notes</Text>
          <Text size="sm" className="text-zinc-600">{data.notes}</Text>
        </div>
      )}

      <PdfViewer url={`/khata/orders/${params.id}/invoice/pdf`} />
    </div>
  );
}
