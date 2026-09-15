'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Group, Stack, Tabs, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ArrowLeft, Check, Plus, X } from '@phosphor-icons/react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import {
  ChartCard,
  DataTable,
  EmptyState,
  LoadingState,
  StatusBadge,
} from '@/components/shared';
import type { Column } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { useCustomerPrediction, useMarkContacted } from '@/features/predictions/api';
import type { CustomerPrediction, PredictionProduct } from '@/features/predictions/api';
import { STATUS_COLORS, STATUS_LABELS } from '@/features/predictions/constants';
import AddOrdersModal from '@/features/predictions/components/AddOrdersModal';
import type { AddOrderPreset } from '@/features/predictions/components/AddOrdersModal';
import ConfidenceBadge from '@/features/predictions/components/ConfidenceBadge';
import CustomerOverview from '@/features/predictions/components/CustomerOverview';
import InterestBadge from '@/features/predictions/components/InterestBadge';
import { pickTopProduct } from '@/features/predictions/components/PredictionSummary';
import RecommendationAction from '@/features/predictions/components/RecommendationAction';

const TOOLTIP_STYLE: CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e4e7ec',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

type ChartValue = number | string | readonly (number | string)[] | undefined;

type UrgencyPoint = {
  name: string;
  days: number;
  status: string;
  fullLabel: string;
  gap: number | null;
};

function UrgencyTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: unknown[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0] as { payload?: unknown };
  const d = raw.payload as UrgencyPoint | undefined;
  if (!d) return null;
  return (
    <div style={TOOLTIP_STYLE} className="bg-white px-3 py-2 text-xs">
      <div className="font-semibold text-zinc-800">{d.fullLabel}</div>
      <div className="mt-1 text-zinc-600">
        Next order: {d.days <= 0 ? 'overdue already' : `in ~${d.days} days`}
        {d.gap != null && ` · usually every ~${Math.round(d.gap)} days`}
      </div>
      <div className="mt-1 text-zinc-500">
        Status: {STATUS_LABELS[d.status] ?? d.status}
      </div>
    </div>
  );
}

function ProductTable({
  customer,
  highlightId,
  onAddHistory,
}: {
  customer: CustomerPrediction;
  highlightId: string | null;
  onAddHistory: (product: PredictionProduct) => void;
}) {
  const columns: Column<CustomerPrediction['products'][number]>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <div>
          <div className="font-medium text-zinc-800">{p.product_name}</div>
          {p.sku && <div className="text-xs text-zinc-400">{p.sku}</div>}
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      width: 70,
      align: 'center',
      render: (p) => p.order_count,
    },
    {
      key: 'gap',
      header: 'Avg gap (days)',
      align: 'right',
      render: (p) => (p.avg_gap_days != null ? Math.round(p.avg_gap_days) : '—'),
    },
    {
      key: 'quantity',
      header: 'Avg qty',
      align: 'right',
      render: (p) =>
        p.avg_quantity > 0 ? Math.round(p.avg_quantity) : '—',
    },
    {
      key: 'next_order',
      header: 'Next order',
      render: (p) => formatDate(p.next_order_date),
    },
    {
      key: 'interest',
      header: 'Interest',
      align: 'center',
      render: (p) => <InterestBadge score={p.interest_score} />,
    },
    {
      key: 'confidence',
      header: 'Confidence',
      align: 'center',
      render: (p) => <ConfidenceBadge confidence={p.confidence} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Stack gap={4}>
          <StatusBadge status={p.stock_status} />
          {p.stock_status === 'insufficient_data' && (
            <button
              type="button"
              onClick={() => onAddHistory(p)}
              className="self-start text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Add history →
            </button>
          )}
        </Stack>
      ),
    },
    {
      key: 'recommendation',
      header: 'Recommended',
      render: (p) => (
        <RecommendationAction
          rec={p.recommendation}
          phone={customer.customer_phone}
          email={customer.customer_email}
          productName={p.product_name}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={customer.products}
      getRowId={(p) => p.product_id}
      minWidth={940}
      rowAccent={(p) => STATUS_COLORS[p.stock_status]}
      rowClassName={(p) =>
        highlightId === p.product_id ? 'bg-brand-50/70' : undefined
      }
      rowActions={[
        {
          label: 'Add order history',
          icon: <Plus size={16} />,
          onClick: onAddHistory,
        },
      ]}
    />
  );
}

export default function CustomerPredictionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const markContacted = useMarkContacted();
  const [contactedAt, setContactedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<'summary' | 'products' | 'trends'>('summary');
  const [addOpened, { open: openAddModal, close: closeAdd }] = useDisclosure(false);
  const [addPreset, setAddPreset] = useState<AddOrderPreset | null>(null);
  const [highlightProduct, setHighlightProduct] = useState<string | null>(null);

  const detailQuery = useCustomerPrediction(params.id);
  const customer = detailQuery.data;

  const topProduct = customer ? pickTopProduct(customer) : undefined;

  const openAdd = (preset?: AddOrderPreset | null) => {
    setAddPreset(preset ?? null);
    openAddModal();
  };

  const handleSaved = (info: { customerId: string | null; productId: string | null }) => {
    if (customer && info.productId) {
      setTab('products');
      setHighlightProduct(info.productId);
    }
  };

  const goToProduct = (productId?: string) => {
    setHighlightProduct(productId ?? null);
    setTab('products');
  };

  useEffect(() => {
    if (!highlightProduct) return;
    const timer = setTimeout(() => setHighlightProduct(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightProduct]);

  useEffect(() => {
    if (!highlightProduct) return;
    const el = document.querySelector(
      `[data-row-id="${highlightProduct}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightProduct]);

  const urgencyData = useMemo(() => {
    if (!customer) return [] as UrgencyPoint[];
    return [...customer.products]
      .filter((p) => p.days_until_next != null)
      .map((p) => ({
        name: (p.product_name || '—').slice(0, 20),
        days: p.days_until_next! <= 0 ? 0 : Math.round(p.days_until_next!),
        status: p.stock_status,
        fullLabel: p.product_name,
        gap: p.avg_gap_days,
      }))
      .sort((a, b) => a.days - b.days);
  }, [customer]);

  const interestData = useMemo(() => {
    if (!customer) return [];
    return [...customer.products]
      .map((p) => ({
        name: (p.product_name || '—').slice(0, 20),
        interest: p.interest_score,
        fullLabel: p.product_name,
      }))
      .sort((a, b) => b.interest - a.interest);
  }, [customer]);

  const urgencyCaption = useMemo(() => {
    if (!urgencyData.length)
      return 'No reorder timing yet — add some order history to start predicting.';
    const first = urgencyData[0];
    if (first.days <= 0)
      return `${first.fullLabel} is already overdue — chase it first.`;
    if (first.status === 'due_soon')
      return `${first.fullLabel} is due within a few days — a quick message could land it.`;
    return 'Every product is on schedule — nothing urgent right now.';
  }, [urgencyData]);

  const interestCaption = useMemo(() => {
    if (!interestData.length) return 'No interest data yet.';
    const top = interestData[0];
    return `${top.fullLabel} is the biggest opportunity — interest weighs what they buy, how often, and how regularly.`;
  }, [interestData]);

  const withData = customer?.products.filter((p) => p.order_count >= 2) ?? [];
  const withGap = customer?.products.filter((p) => p.avg_gap_days != null) ?? [];

  const toggleContacted = () => {
    if (contactedAt) {
      setContactedAt(null);
      return;
    }
    markContacted.mutate(customer!.customer_id);
    setContactedAt(new Date().toISOString());
  };

  if (detailQuery.isFetching && !detailQuery.data) {
    return <LoadingState />;
  }

  if (detailQuery.isError) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <Alert color="red" title="Could not load predictions">
          <Stack gap="sm">
            <Text size="sm">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Something went wrong.'}
            </Text>
            <div>
              <Button
                size="xs"
                color="red"
                variant="subtle"
                onClick={() => detailQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </Stack>
        </Alert>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <EmptyState description="No detail available." />
      </div>
    );
  }

  const customerPreset: AddOrderPreset = {
    customer: { id: customer.customer_id, name: customer.customer_name },
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-4">
          <Button
            variant="subtle"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => router.push('/predictions')}
            color="gray"
          >
            Back to predictions
          </Button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Text fw={700} size="xl" className="leading-tight">
                {customer.customer_name}
              </Text>
              <StatusBadge status={customer.stock_status} />
            </div>
            <Text size="sm" c="dimmed" className="mt-0.5">
              {customer.customer_email ?? customer.customer_phone ?? 'No contact'}
            </Text>
          </div>
          <Group gap="sm">
            <RecommendationAction
              rec={customer.recommendation}
              phone={customer.customer_phone}
              email={customer.customer_email}
              productName={topProduct?.product_name}
            />
            <Button
              variant="default"
              size="sm"
              leftSection={<Plus size={15} />}
              onClick={() => openAdd(customerPreset)}
            >
              Add order history
            </Button>
            <Button
              variant="default"
              size="sm"
              leftSection={
                contactedAt ? <X size={15} /> : <Check size={15} />
              }
              color={contactedAt ? 'gray' : 'brand'}
              onClick={toggleContacted}
            >
              {contactedAt
                ? `Contacted ${formatDate(contactedAt)}`
                : 'Mark as contacted'}
            </Button>
          </Group>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(value) =>
          setTab((value ?? 'summary') as 'summary' | 'products' | 'trends')
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
          <Tabs.Tab value="products">Products</Tabs.Tab>
          <Tabs.Tab value="trends">Trends</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="summary">
          <CustomerOverview customer={customer} onViewProducts={goToProduct} />
        </Tabs.Panel>

        <Tabs.Panel value="products">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              {withData.length} product{withData.length === 1 ? '' : 's'} with
              enough history, {withGap.length} with measured reorder gaps —
              use “Add order history” on any row to add more dates.
            </Text>
            <ProductTable
              customer={customer}
              highlightId={highlightProduct}
              onAddHistory={(p) =>
                openAdd({
                  customer: {
                    id: customer.customer_id,
                    name: customer.customer_name,
                  },
                  product: { id: p.product_id, name: p.product_name },
                })
              }
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="trends">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              A deeper look at when {customer.customer_name} is likely to reorder
              each product. The summary tab says it in plain words — this is the
              detail behind it.
            </Text>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Reorder urgency" subtitle={urgencyCaption}>
                {urgencyData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={urgencyData}
                      layout="vertical"
                      margin={{ top: 10, right: 42, left: 0, bottom: 10 }}
                      barCategoryGap="25%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: 'days until next order',
                          position: 'insideBottomRight',
                          fontSize: 11,
                          fill: '#a1a1aa',
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<UrgencyTooltipContent />} />
                      <Bar dataKey="days" radius={[0, 6, 6, 0]}>
                        {urgencyData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[entry.status] ?? '#f59e0b'}
                          />
                        ))}
                        <LabelList
                          dataKey="days"
                          position="right"
                          formatter={(v: string | number | boolean | null | undefined) =>
                            `${v}d`
                          }
                          style={{ fontSize: 11, fill: '#71717a' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState description="No reorder timing data yet." />
                )}
              </ChartCard>

              <ChartCard title="Interest by product" subtitle={interestCaption}>
                {interestData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={interestData}
                      layout="vertical"
                      margin={{ top: 10, right: 42, left: 0, bottom: 10 }}
                      barCategoryGap="25%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: 'interest score',
                          position: 'insideBottomRight',
                          fontSize: 11,
                          fill: '#a1a1aa',
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: ChartValue) => [`${value}`, 'Interest']}
                        labelFormatter={(label) =>
                          interestData.find((d) => d.name === label)?.fullLabel ??
                          label
                        }
                      />
                      <Bar dataKey="interest" radius={[0, 6, 6, 0]} fill="#f59e0b">
                        <LabelList
                          dataKey="interest"
                          position="right"
                          style={{ fontSize: 11, fill: '#71717a' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState description="No interest data yet." />
                )}
              </ChartCard>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <AddOrdersModal
        opened={addOpened}
        onClose={closeAdd}
        preset={addPreset}
        onSaved={handleSaved}
      />
    </div>
  );
}