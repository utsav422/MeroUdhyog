'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Group, Stack, Tabs, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ArrowLeft, ArrowSquareOut, Plus } from '@phosphor-icons/react';
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
import { formatDate, formatMoney } from '@/lib/format';
import { useProductPrediction } from '@/features/predictions/api';
import type { ProductCustomer, ProductDetail } from '@/features/predictions/api';
import { STATUS_COLORS } from '@/features/predictions/constants';
import AddOrdersModal from '@/features/predictions/components/AddOrdersModal';
import type { AddOrderPreset } from '@/features/predictions/components/AddOrdersModal';
import ConfidenceBadge from '@/features/predictions/components/ConfidenceBadge';
import InterestBadge from '@/features/predictions/components/InterestBadge';
import ProductOverview from '@/features/predictions/components/ProductOverview';
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
};

function CustomerTable({
  detail,
  highlightId,
  onViewCustomer,
  onAddHistory,
}: {
  detail: ProductDetail;
  highlightId: string | null;
  onViewCustomer: (customerId: string) => void;
  onAddHistory: (customer: ProductCustomer) => void;
}) {
  const columns: Column<ProductCustomer>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <div className="min-w-0">
          <div className="font-medium text-zinc-800">{c.customer_name}</div>
          <div className="text-xs text-zinc-400">{c.customer_email}</div>
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      width: 75,
      align: 'center',
      render: (c) => c.order_count,
    },
    {
      key: 'gap',
      header: 'Avg gap (days)',
      align: 'right',
      render: (c) => (c.avg_gap_days != null ? Math.round(c.avg_gap_days) : '—'),
    },
    {
      key: 'quantity',
      header: 'Avg qty',
      align: 'right',
      render: (c) => (c.avg_quantity > 0 ? Math.round(c.avg_quantity) : '—'),
    },
    {
      key: 'next_order',
      header: 'Next order',
      render: (c) => formatDate(c.next_order_date),
    },
    {
      key: 'demand',
      header: 'Demand',
      align: 'center',
      render: (c) => <InterestBadge score={c.interest_score} />,
    },
    {
      key: 'confidence',
      header: 'Confidence',
      align: 'center',
      render: (c) => <ConfidenceBadge confidence={c.confidence} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.stock_status} />,
    },
    {
      key: 'recommendation',
      header: 'Recommended',
      render: (c) => (
        <RecommendationAction
          rec={c.recommendation}
          phone={c.customer_phone}
          email={c.customer_email}
          productName={detail.product_name}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={detail.customers}
      getRowId={(c) => c.customer_id}
      minWidth={980}
      rowAccent={(c) => STATUS_COLORS[c.stock_status]}
      rowClassName={(c) =>
        highlightId === c.customer_id ? 'bg-brand-50/70' : undefined
      }
      rowActions={[
        {
          label: 'Add order history',
          icon: <Plus size={16} />,
          onClick: onAddHistory,
        },
        {
          label: 'View customer',
          icon: <ArrowSquareOut size={16} />,
          onClick: (c) => onViewCustomer(c.customer_id),
        },
      ]}
    />
  );
}

export default function ProductPredictionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const detailQuery = useProductPrediction(params.id);
  const detail = detailQuery.data;

  const [tab, setTab] = useState<'summary' | 'customers' | 'trends'>('summary');
  const [addOpened, { open: openAddModal, close: closeAdd }] = useDisclosure(false);
  const [addPreset, setAddPreset] = useState<AddOrderPreset | null>(null);
  const [highlightCustomer, setHighlightCustomer] = useState<string | null>(null);

  const openAdd = (preset?: AddOrderPreset | null) => {
    setAddPreset(preset ?? null);
    openAddModal();
  };

  const handleSaved = (info: { customerId: string | null }) => {
    if (detail && info.customerId) {
      setTab('customers');
      setHighlightCustomer(info.customerId);
    }
  };

  const goToCustomers = () => {
    setHighlightCustomer(null);
    setTab('customers');
  };

  useEffect(() => {
    if (!highlightCustomer) return;
    const timer = setTimeout(() => setHighlightCustomer(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightCustomer]);

  useEffect(() => {
    if (!highlightCustomer) return;
    const el = document.querySelector(
      `[data-row-id="${highlightCustomer}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightCustomer]);

  const urgencyData = useMemo(() => {
    if (!detail) return [] as UrgencyPoint[];
    return [...detail.customers]
      .filter((c) => c.days_until_next != null)
      .map((c) => ({
        name: (c.customer_name || '—').slice(0, 20),
        days: c.days_until_next! <= 0 ? 0 : Math.round(c.days_until_next!),
        status: c.stock_status,
        fullLabel: c.customer_name,
      }))
      .sort((a, b) => a.days - b.days);
  }, [detail]);

  const interestData = useMemo(() => {
    if (!detail) return [];
    return [...detail.customers]
      .map((c) => ({
        name: (c.customer_name || '—').slice(0, 20),
        interest: c.interest_score,
        fullLabel: c.customer_name,
      }))
      .sort((a, b) => b.interest - a.interest);
  }, [detail]);

  const urgencyCaption = useMemo(() => {
    if (!urgencyData.length)
      return 'No reorder timing yet — add some order history to start predicting.';
    const first = urgencyData[0];
    if (first.days <= 0)
      return `${first.fullLabel} is already overdue — restock now and reach out first.`;
    if (first.status === 'due_soon')
      return `${first.fullLabel} is due within a few days — keep stock ready.`;
    return 'Every buyer is on schedule — nothing urgent right now.';
  }, [urgencyData]);

  const interestCaption = useMemo(() => {
    if (!interestData.length) return 'No demand data yet.';
    const top = interestData[0];
    return `${top.fullLabel} shows the strongest demand for this product — worth keeping on hand.`;
  }, [interestData]);

  if (detailQuery.isFetching && !detailQuery.data) {
    return <LoadingState />;
  }

  if (detailQuery.isError) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <Alert color="red" title="Could not load product prediction">
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

  if (!detail) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <EmptyState description="No detail available." />
      </div>
    );
  }

  const productPreset: AddOrderPreset = {
    product: { id: detail.product_id, name: detail.product_name },
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
                {detail.product_name}
              </Text>
              <StatusBadge status={detail.stock_status} />
            </div>
            <Text size="sm" c="dimmed" className="mt-0.5">
              {detail.sku ?? 'No SKU'}
              {detail.estimated_revenue > 0
                ? ` · Est. value ${formatMoney(detail.estimated_revenue)}`
                : ''}
            </Text>
          </div>
          <Group gap="sm">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<ArrowSquareOut size={15} />}
              onClick={() => router.push(`/products/${detail.product_id}`)}
            >
              Open in Products
            </Button>
            <Button
              variant="default"
              size="sm"
              leftSection={<Plus size={15} />}
              onClick={() => openAdd(productPreset)}
            >
              Add order history
            </Button>
          </Group>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(value) =>
          setTab((value ?? 'summary') as 'summary' | 'customers' | 'trends')
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
          <Tabs.Tab value="customers">Customers</Tabs.Tab>
          <Tabs.Tab value="trends">Trends</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="summary">
          <ProductOverview detail={detail} onViewCustomer={goToCustomers} />
        </Tabs.Panel>

        <Tabs.Panel value="customers">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Everyone who buys this product, with their own forecast. The
              recommendation column starts from this product&apos;s prediction;
              use “View customer” for their full profile.
            </Text>
            <CustomerTable
              detail={detail}
              highlightId={highlightCustomer}
              onViewCustomer={(customerId) =>
                router.push(`/predictions/customers/${customerId}`)
              }
              onAddHistory={(c) =>
                openAdd({
                  customer: { id: c.customer_id, name: c.customer_name },
                  product: {
                    id: detail.product_id,
                    name: detail.product_name,
                  },
                })
              }
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="trends">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              When customers of this product are likely to reorder, and who is
              most interested. The summary tab says it in plain words.
            </Text>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Reorder urgency by customer" subtitle={urgencyCaption}>
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
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(label) =>
                          urgencyData.find((d) => d.name === label)?.fullLabel ?? label
                        }
                        formatter={(value: ChartValue) => [`~${value} days`, 'Next order']}
                      />
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

              <ChartCard title="Demand by customer" subtitle={interestCaption}>
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
                          value: 'demand score',
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
                        labelFormatter={(label) =>
                          interestData.find((d) => d.name === label)?.fullLabel ?? label
                        }
                        formatter={(value: ChartValue) => [`${value}`, 'Demand']}
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
                  <EmptyState description="No demand data yet." />
                )}
              </ChartCard>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <AddOrdersModal opened={addOpened} onClose={closeAdd} preset={addPreset} onSaved={handleSaved} />
    </div>
  );
}