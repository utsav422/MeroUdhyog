'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, Text } from '@mantine/core';
import {
  ArrowLeft,
  DownloadSimple,
  CurrencyDollar,
  CalendarBlank,
  CurrencyCircleDollar,
  Receipt,
} from '@phosphor-icons/react';
import PdfViewer from '@/features/khata/components/PdfViewer';
import BillDocument, { toBillDocumentDate } from '@/features/khata/components/BillDocument';
import {
  downloadReceiptPdf,
  useBillTemplate,
  useDefaultBillLayout,
  useReceipt,
} from '@/features/khata/api';
import { LoadingState, ErrorState, StatusBadge } from '@/components/shared';
import { formatDateTime, formatMoney } from '@/lib/format';
import { paymentMethodLabel } from '@/features/khata/constants';

export default function ReceiptViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useReceipt(params.id);
  const templateQuery = useBillTemplate();
  const defaultLayout = useDefaultBillLayout('receipt');

  if (isLoading) return <LoadingState label="Loading receipt…" />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  const template = templateQuery.data;
  const layout = defaultLayout.layout;

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

      <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Text fw={600} size="sm" className="text-zinc-800">Receipt</Text>
            <Text size="xs" c="dimmed">
              Uses your default receipt layout
              {defaultLayout.preset ? ` (${defaultLayout.preset.name})` : ''}.
            </Text>
          </div>
        </div>
        {!layout || !template ? (
          <div className="flex justify-center">
            <Skeleton height={340} w="100%" maw={420} radius="lg" />
          </div>
        ) : (
          <div className="flex justify-center">
            <BillDocument
              docType="receipt"
              branding={{
                business_name: template.business_name,
                tax_id: template.tax_id,
                address: template.address,
                phone: template.phone,
                email: template.email,
                footer_note: template.footer_note,
              }}
              logo={template.logo?.data_url ?? null}
              signature={template.signature?.data_url ?? null}
              layout={layout}
              data={{
                number: data.receipt_number ?? '—',
                date: toBillDocumentDate(data.collected_at),
                customer_name: data.customer_name,
                customer_phone: null,
                customer_address: null,
                status: null,
                payment_status: null,
                note: data.note,
                collected_by: data.collector_name,
                method: paymentMethodLabel(data.method),
                items: [],
                allocations: data.allocations.map((a) => ({
                  ref: a.order_ref ?? a.order_id.slice(0, 8),
                  amount: a.amount_applied,
                })),
                total_amount: data.amount,
                amount_paid: null,
              }}
            />
          </div>
        )}
      </div>

      <PdfViewer url={`/khata/receipts/${params.id}/pdf`} />
    </div>
  );
}
