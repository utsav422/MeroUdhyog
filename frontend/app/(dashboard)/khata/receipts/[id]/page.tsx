'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Table, Text } from '@mantine/core';
import {
  ArrowLeft,
  DownloadSimple,
  CurrencyDollar,
  CalendarBlank,
  CurrencyCircleDollar,
  Receipt,
} from '@phosphor-icons/react';
import PdfViewer from '@/features/khata/components/PdfViewer';
import { downloadReceiptPdf, useReceipt } from '@/features/khata/api';
import { LoadingState, ErrorState, StatusBadge } from '@/components/shared';
import { formatDateTime, formatMoney } from '@/lib/format';
import { paymentMethodLabel } from '@/features/khata/constants';

export default function ReceiptViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useReceipt(params.id);

  if (isLoading) return <LoadingState label="Loading receipt…" />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="subtle"
          leftSection={<ArrowLeft size={16} />}
          onClick={() => router.back()}
          color="gray"
          mb="md"
        >
          Back
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-success-50 text-success-600">
              <Receipt size={24} weight="duotone" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Text fw={700} size="xl" className="leading-tight">
                  {data.receipt_number ?? 'Receipt'}
                </Text>
                <StatusBadge status={data.status} />
              </div>
              <Text size="sm" c="dimmed" className="mt-0.5">
                {data.customer_name ?? 'Walk-in customer'} · Collected {formatDateTime(data.collected_at)}
              </Text>
            </div>
          </div>
          <Button
            variant="default"
            leftSection={<DownloadSimple size={16} />}
            onClick={() => void downloadReceiptPdf(params.id)}
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
          <Text size="xs" c="dimmed" fw={500}>Amount collected</Text>
          <Text fw={700} size="xl" className="mt-1">{formatMoney(data.amount)}</Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CurrencyCircleDollar size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Payment method</Text>
          <Text fw={600} size="sm" className="mt-1">{paymentMethodLabel(data.method)}</Text>
          {data.collector_name && (
            <Text size="xs" c="dimmed" className="mt-0.5">Collected by {data.collector_name}</Text>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <CalendarBlank size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>Date & time</Text>
          <Text fw={600} size="sm" className="mt-1">{formatDateTime(data.collected_at)}</Text>
        </div>
      </div>

      {data.allocations.length > 0 && (
        <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-6 py-4">
            <Text fw={600} size="md" className="text-zinc-800">Payment allocations</Text>
            <Text size="xs" c="dimmed" className="mt-0.5">
              Orders settled by this receipt
            </Text>
          </div>
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">#</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Order</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Amount applied</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.allocations.map((a, idx) => (
                <Table.Tr key={a.order_id}>
                  <Table.Td>
                    <span className="text-xs text-zinc-400">{idx + 1}</span>
                  </Table.Td>
                  <Table.Td>
                    <button
                      type="button"
                      className="font-medium text-brand-700 hover:underline"
                      onClick={() => router.push(`/orders/${a.order_id}`)}
                    >
                      {a.order_ref ?? a.order_id.slice(0, 8)}
                    </button>
                  </Table.Td>
                  <Table.Td ta="right" fw={600} className="text-zinc-800">
                    {formatMoney(a.amount_applied)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {data.note && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <Text fw={600} size="sm" mb="xs" className="text-zinc-700">Note</Text>
          <Text size="sm" className="text-zinc-600">{data.note}</Text>
        </div>
      )}

      <PdfViewer url={`/khata/receipts/${params.id}/pdf`} />
    </div>
  );
}
