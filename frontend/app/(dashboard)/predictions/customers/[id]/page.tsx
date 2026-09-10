'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  ArrowLeft,
  CalendarDots,
  Check,
  EnvelopeSimple,
  Package,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';
import {
  ChartCard,
  ChartLegend,
  DataTable,
  EmptyState,
  LoadingState,
  StatusBadge,
} from '@/components/shared';
import type { Column } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { useCustomerPrediction, useMarkContacted } from '@/features/predictions/api';
import type { CustomerPrediction } from '@/features/predictions/api';
import {
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/features/predictions/constants';
import ConfidenceBadge from '@/features/predictions/components/ConfidenceBadge';
import InterestBadge from '@/features/predictions/components/InterestBadge';
import PredictionSummary, {
  pickTopProduct,
} from '@/features/predictions/components/PredictionSummary';
import RecommendationAction from '@/features/predictions/components/RecommendationAction';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e4e7ec',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

type ChartValue = number | string | readonly (number | string)[] | undefined;

function ProductTable({ customer }: { customer: CustomerPrediction }) {
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
      render: (p) => <StatusBadge status={p.stock_status} />,
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
    />
  );
}

export default function CustomerPredictionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const markContacted = useMarkContacted();
  const [contactedAt, setContactedAt] = useState<string | null>(null);

  const detailQuery = useCustomerPrediction(params.id);
  const customer = detailQuery.data;

  const topProduct = customer ? pickTopProduct(customer) : undefined;

  const statusPie = useMemo(() => {
    if (!customer) return [] as { key: string; value: number }[];
    const counts = new Map<string, number>();
    for (const p of customer.products) {
      counts.set(p.stock_status, (counts.get(p.stock_status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }, [customer]);

  const urgencyData = useMemo(() => {
    if (!customer) return [];
    return [...customer.products]
      .filter((p) => p.days_until_next != null)
      .map((p) => ({
        name: (p.product_name || '—').slice(0, 16),
        days: p.days_until_next! <= 0 ? 0 : Math.round(p.days_until_next!),
        status: p.stock_status,
        fullLabel: p.product_name,
      }))
      .sort((a, b) => a.days - b.days);
  }, [customer]);

  const interestData = useMemo(() => {
    if (!customer) return [];
    return [...customer.products]
      .map((p) => ({
        name: (p.product_name || '—').slice(0, 18),
        interest: p.interest_score,
        fullLabel: p.product_name,
      }))
      .sort((a, b) => b.interest - a.interest);
  }, [customer]);

  const gapData = useMemo(() => {
    if (!customer) return [];
    return customer.products
      .filter((p) => p.avg_gap_days != null)
      .map((p) => ({
        name: (p.product_name || '—').slice(0, 16),
        gap: Math.round(p.avg_gap_days!),
        status: p.stock_status,
        fullLabel: p.product_name,
      }));
  }, [customer]);

  const withData = customer?.products.filter((p) => p.order_count >= 2) ?? [];
  const withGap = customer?.products.filter((p) => p.avg_gap_days != null) ?? [];

  const avgInterest = customer?.products.length
    ? Math.round(
        customer.products.reduce((s, p) => s + p.interest_score, 0) /
          customer.products.length,
      )
    : 0;

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

      <PredictionSummary
        customer={customer}
        size="md"
        className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
      />

      <SimpleGrid cols={{ base: 2, lg: 4 }}>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Package size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>
            Products
          </Text>
          <Text fw={700} size="lg" className="mt-0.5">
            {customer.product_count}
          </Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <UsersThree size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>
            Orders
          </Text>
          <Text fw={700} size="lg" className="mt-0.5">
            {customer.order_count}
          </Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <CalendarDots size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>
            Next order
          </Text>
          <Text fw={700} size="lg" className="mt-0.5">
            {customer.next_order_date
              ? formatDate(customer.next_order_date)
              : '—'}
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            Last: {customer.last_order_date ? formatDate(customer.last_order_date) : '—'}
          </Text>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <EnvelopeSimple size={20} weight="bold" />
          </div>
          <Text size="xs" c="dimmed" fw={500}>
            Avg interest
          </Text>
          <div className="mt-1">
            <InterestBadge score={avgInterest} />
            <span className="ml-2">
              <ConfidenceBadge confidence={topProduct?.confidence ?? null} />
            </span>
          </div>
          <Text size="xs" c="dimmed" className="mt-1">
            overall
          </Text>
        </div>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Based on {customer.order_count} order
        {customer.order_count === 1 ? '' : 's'} in our records. Last order:{' '}
        {formatDate(customer.last_order_date)}.
      </Text>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Reorder urgency"
          subtitle="Predicted days until this customer's next order, per product"
        >
          {urgencyData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={urgencyData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
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
                    value: 'days',
                    position: 'insideBottomRight',
                    fontSize: 11,
                    fill: '#a1a1aa',
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: ChartValue) => [
                    `${value} days`,
                    'Next order',
                  ]}
                  labelFormatter={(label) =>
                    urgencyData.find((d) => d.name === label)?.fullLabel ?? label
                  }
                />
                <Bar dataKey="days" radius={[0, 6, 6, 0]}>
                  {urgencyData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.status] ?? '#6f4bff'}
                    />
                  ))}
                  <LabelList
                    dataKey="days"
                    position="right"
                    formatter={(v: string | number | boolean | null | undefined) => `${v}d`}
                    style={{ fontSize: 11, fill: '#71717a' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState description="No reorder timing data yet." />
          )}
        </ChartCard>

        <ChartCard
          title="Interest by product"
          subtitle="How interested this customer seems in each product (0–100)"
        >
          {interestData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={interestData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
                barCategoryGap="25%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
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
                <Bar dataKey="interest" radius={[0, 6, 6, 0]} fill="#6f4bff">
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Average reorder gap"
          subtitle="Days between orders for each product"
        >
          {gapData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gapData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
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
                    value: 'days',
                    position: 'insideBottomRight',
                    fontSize: 11,
                    fill: '#a1a1aa',
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: ChartValue) => [
                    `${value} days`,
                    'Avg gap',
                  ]}
                  labelFormatter={(label) =>
                    gapData.find((d) => d.name === label)?.fullLabel ?? label
                  }
                />
                <Bar dataKey="gap" radius={[0, 6, 6, 0]}>
                  {gapData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.status] ?? '#6f4bff'}
                    />
                  ))}
                  <LabelList
                    dataKey="gap"
                    position="right"
                    formatter={(v: string | number | boolean | null | undefined) => `${v}d`}
                    style={{ fontSize: 11, fill: '#71717a' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState description="Not enough order history to measure gaps yet." />
          )}
        </ChartCard>

        <ChartCard
          title="Products by status"
          subtitle={`${statusPie.length} products tracked for this customer`}
          legend={
            <ChartLegend
              items={statusPie.map((s) => ({
                label: STATUS_LABELS[s.key] ?? s.key,
                color: STATUS_COLORS[s.key] ?? '#6f4bff',
              }))}
            />
          }
        >
          {statusPie.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPie.map((s) => ({
                    name: STATUS_LABELS[s.key] ?? s.key,
                    value: s.value,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {statusPie.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={STATUS_COLORS[entry.key] ?? '#6f4bff'}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState description="No products yet." />
          )}
        </ChartCard>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <Text fw={600} size="md" className="text-zinc-800">
            Product predictions
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {withData.length} product{withData.length === 1 ? '' : 's'} with
            enough history, {withGap.length} with measured reorder gaps
          </Text>
        </div>
        <div className="p-4">
          <ProductTable customer={customer} />
        </div>
      </div>
    </div>
  );
}