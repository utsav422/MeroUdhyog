'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  ArrowClockwise,
  CalendarDots,
  Check,
  DownloadSimple,
  Eye,
  FileArrowUp,
  Graph,
  Info,
  Package,
  Plus,
  Trash,
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
} from 'recharts';
import {
  ChartCard,
  ChartLegend,
  DataTable,
  EmptyState,
  KPICard,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import type { Column } from '@/components/shared';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/exportCsv';
import {
  useAnalysis,
  useClearHistory,
  useMarkContacted,
} from '../api';
import type { CustomerPrediction, ProductAggregate } from '../api';
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from '../constants';
import AddOrdersModal from './AddOrdersModal';
import type { AddOrderPreset } from './AddOrdersModal';
import CustomerPredictionCard from './CustomerPredictionCard';
import InterestBadge from './InterestBadge';
import PredictionSummary from './PredictionSummary';
import ProductPredictionCard from './ProductPredictionCard';
import RecommendationAction from './RecommendationAction';
import StatusLegend from './StatusLegend';
import TableFilterBar from './TableFilterBar';

type Restock = { label: string; caption: string; tone: string };

function restockOf(p: ProductAggregate): Restock {
  if (p.overdue_count > 0) {
    return {
      label: 'restock now',
      caption: `${p.overdue_count} customer${p.overdue_count === 1 ? '' : 's'} overdue`,
      tone: 'bg-danger-50 text-danger-700',
    };
  }
  if (p.days_until_next != null) {
    const days = Math.max(0, Math.round(p.days_until_next));
    if (days <= 7) {
      return {
        label: `in ~${days} day${days === 1 ? '' : 's'}`,
        caption: formatDate(p.next_order_date),
        tone: 'bg-warning-50 text-warning-700',
      };
    }
    return {
      label: `in ~${days} days`,
      caption: formatDate(p.next_order_date),
      tone: 'bg-success-50 text-success-700',
    };
  }
  if (p.due_soon_count > 0) {
    return { label: 'due soon', caption: 'no date yet', tone: 'bg-warning-50 text-warning-700' };
  }
  return {
    label: 'needs data',
    caption: 'no forecast yet',
    tone: 'bg-black/5 text-[var(--muted)]',
  };
}

function opportunityOf(interest: number): { label: string; hint: string; tone: string } {
  if (interest >= 60) {
    return {
      label: 'Invest',
      hint: 'Demand is strong — worth improving quality and keeping stock ready.',
      tone: 'bg-success-50 text-success-700',
    };
  }
  if (interest >= 40) {
    return {
      label: 'Hold',
      hint: 'Steady but quiet — keep the current quality until demand grows.',
      tone: 'bg-warning-50 text-warning-700',
    };
  }
  return {
    label: 'Watch',
    hint: 'Low demand — test small batches before producing more or upgrading quality.',
    tone: 'bg-black/5 text-[var(--muted)]',
  };
}

export default function PredictionsPage() {
  const analysis = useAnalysis();
  const clearHistory = useClearHistory();
  const markContacted = useMarkContacted();
  const router = useRouter();
  const [addOpened, { open: openAddModal, close: closeAdd }] = useDisclosure(false);
  const [addPreset, setAddPreset] = useState<AddOrderPreset | null>(null);
  const [highlight, setHighlight] = useState<{
    tab: 'products' | 'customers';
    id: string;
  } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [tab, setTab] = useState<'products' | 'customers' | 'trends'>('customers');
  const [productsSearch, setProductsSearch] = useState('');
  const [productsStatus, setProductsStatus] = useState('all');
  const [customersSearch, setCustomersSearch] = useState('');
  const [customersStatus, setCustomersStatus] = useState('all');
  const [contacted, setContacted] = useState<Record<string, string>>({});
  const [dataTipDismissed, setDataTipDismissed] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const openAdd = (preset?: AddOrderPreset | null) => {
    setAddPreset(preset ?? null);
    openAddModal();
  };

  const handleSaved = (info: { customerId: string | null; productId: string | null }) => {
    if (info.productId) {
      setTab('products');
      setHighlight({ tab: 'products', id: info.productId });
    } else if (info.customerId) {
      setTab('customers');
      setHighlight({ tab: 'customers', id: info.customerId });
    }
  };

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(timer);
  }, [highlight]);

  useEffect(() => {
    if (!highlight) return;
    const el = document.querySelector(
      `[data-row-id="${highlight.id}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);

  const data = analysis.data;
  const summary = data?.summary;

  const customers = useMemo(() => {
    if (!data) return [];
    return [...data.customers].sort(
      (a, b) =>
        (STATUS_ORDER[a.stock_status] ?? -1) - (STATUS_ORDER[b.stock_status] ?? -1) ||
        (b.interest_score ?? 0) - (a.interest_score ?? 0),
    );
  }, [data]);

  const products = useMemo(() => {
    if (!data) return [];
    return [...data.products].sort(
      (a, b) =>
        (STATUS_ORDER[a.stock_status] ?? -1) - (STATUS_ORDER[b.stock_status] ?? -1) ||
        (b.customer_count ?? 0) - (a.customer_count ?? 0),
    );
  }, [data]);

  const filteredCustomers = useMemo(() => {
    const query = customersSearch.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesSearch =
        !query ||
        c.customer_name.toLowerCase().includes(query) ||
        (c.customer_email ?? '').toLowerCase().includes(query);
      const matchesStatus =
        customersStatus === 'all' || c.stock_status === customersStatus;
      return matchesSearch && matchesStatus;
    });
  }, [customers, customersSearch, customersStatus]);

  const filteredProducts = useMemo(() => {
    const query = productsSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !query ||
        p.product_name.toLowerCase().includes(query) ||
        (p.sku ?? '').toLowerCase().includes(query);
      const matchesStatus =
        productsStatus === 'all' || p.stock_status === productsStatus;
      return matchesSearch && matchesStatus;
    });
  }, [products, productsSearch, productsStatus]);

  const customerStatusPie = useMemo(() => {
    if (!customers.length) return [] as { key: string; value: number }[];
    const counts = new Map<string, number>();
    for (const c of customers) {
      counts.set(c.stock_status, (counts.get(c.stock_status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }, [customers]);

  const productChartData = useMemo(
    () =>
      products.map((p) => ({
        name: (p.product_name || '—').slice(0, 14),
        'On track': p.on_track_count,
        'Due soon': p.due_soon_count,
        Overdue: p.overdue_count,
      })),
    [products],
  );

  const mostNeedyProduct = useMemo(
    () =>
      products.find((p) => p.insufficient_count > 0) ?? undefined,
    [products],
  );

  const productChartCaption = useMemo(() => {
    if (!products.length) return '';
    const urgent = products.filter(
      (p) => p.overdue_count > 0 || p.due_soon_count > 0,
    );
    const urgentCustomers = urgent.reduce(
      (s, p) => s + p.overdue_count + p.due_soon_count,
      0,
    );
    if (!urgent.length)
      return 'Every product is on schedule — nothing needs action right now.';
    return `${urgent.length} product${urgent.length === 1 ? '' : 's'} have ${urgentCustomers} customer${
      urgentCustomers === 1 ? '' : 's'
    } who need a follow-up this week.`;
  }, [products]);

  const customerChartCaption = useMemo(() => {
    if (!customers.length) return '';
    const overdue = customers.filter((c) => c.stock_status === 'overdue').length;
    const dueSoon = customers.filter((c) => c.stock_status === 'due_soon').length;
    if (overdue === 0 && dueSoon === 0)
      return 'Every customer is on schedule — nothing needs action right now.';
    const parts: string[] = [];
    if (overdue > 0) parts.push(`${overdue} overdue (call)`);
    if (dueSoon > 0) parts.push(`${dueSoon} due soon (message)`);
    return `${parts.join(' · ')} — everyone else is on track.`;
  }, [customers]);

  const toggleContacted = (customerId: string) => {
    if (contacted[customerId]) {
      setContacted((prev) => {
        const next = { ...prev };
        delete next[customerId];
        return next;
      });
      return;
    }
    markContacted.mutate(customerId);
    setContacted((prev) => ({
      ...prev,
      [customerId]: new Date().toISOString(),
    }));
  };

  const handleClear = () => {
    clearHistory.mutate(undefined, {
      onSuccess: () => setConfirmingClear(false),
    });
  };

  const handleExport = () => {
    if (tab === 'trends') return;
    if (tab === 'customers') {
      downloadCsv(
        `predictions-customers-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Customer',
          'Email',
          'Phone',
          'Status',
          'Recommendation',
          'Next order',
          'Interest',
          'Orders',
          'Products',
          'Last order',
        ],
        filteredCustomers.map((c) => [
          c.customer_name,
          c.customer_email ?? '',
          c.customer_phone ?? '',
          STATUS_LABELS[c.stock_status] ?? c.stock_status,
          c.recommendation,
          c.next_order_date ?? '',
          String(c.interest_score),
          String(c.order_count),
          String(c.product_count),
          c.last_order_date ?? '',
        ]),
      );
      return;
    }
    downloadCsv(
      `predictions-products-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Product',
        'SKU',
        'Status',
        'Estimated value',
        'Next order',
        'Interest',
        'Orders',
        'Customers',
        'Overdue',
        'Due soon',
        'On track',
        'Need data',
      ],
      filteredProducts.map((p) => [
        p.product_name,
        p.sku ?? '',
        STATUS_LABELS[p.stock_status] ?? p.stock_status,
        String(p.estimated_revenue),
        p.next_order_date ?? '',
        String(p.interest_score),
        String(p.order_count),
        String(p.customer_count),
        String(p.overdue_count),
        String(p.due_soon_count),
        String(p.on_track_count),
        String(p.insufficient_count),
      ]),
    );
  };

  const customerColumns: Column<CustomerPrediction>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <div className="min-w-0">
          <div className="font-medium text-zinc-800">{c.customer_name}</div>
          <div className="text-xs text-zinc-400">{c.customer_email}</div>
          <PredictionSummary
            customer={c}
            size="xs"
            className="mt-0.5 line-clamp-2 max-w-md"
          />
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      width: 80,
      align: 'center',
      render: (c) => c.order_count,
    },
    {
      key: 'products',
      header: 'Products',
      width: 90,
      align: 'center',
      render: (c) => c.product_count,
    },
    {
      key: 'last_order',
      header: 'Last order',
      render: (c) => formatDate(c.last_order_date),
    },
    {
      key: 'next_order',
      header: 'Next order',
      render: (c) => formatDate(c.next_order_date),
    },
    {
      key: 'interest',
      header: 'Interest',
      align: 'center',
      render: (c) => <InterestBadge score={c.interest_score} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.stock_status} />,
    },
    {
      key: 'recommendation',
      header: 'Recommended',
      render: (c) =>
        contacted[c.customer_id] ? (
          <Badge
            variant="light"
            color="gray"
            radius="sm"
            styles={{ label: { textTransform: 'none' } }}
          >
            <span className="inline-flex items-center gap-1">
              <Check size={12} weight="bold" />
              Contacted {formatDate(contacted[c.customer_id])}
            </span>
          </Badge>
        ) : (
          <RecommendationAction
            rec={c.recommendation}
            phone={c.customer_phone}
            email={c.customer_email}
          />
        ),
    },
  ];

  const productColumns: Column<ProductAggregate>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-zinc-800">{p.product_name}</div>
          {p.sku && <div className="text-xs text-zinc-400">{p.sku}</div>}
          <PredictionSummary
            product={p}
            size="xs"
            className="mt-0.5 line-clamp-2 max-w-md"
          />
        </div>
      ),
    },
    {
      key: 'customers',
      header: 'Customers',
      width: 90,
      align: 'center',
      render: (p) => p.customer_count,
    },
    {
      key: 'orders',
      header: 'Orders',
      width: 75,
      align: 'center',
      render: (p) => p.order_count,
    },
    {
      key: 'urgency',
      header: 'Restock urgency',
      render: (p) => {
        const u = restockOf(p);
        return (
          <div>
            <span
              className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${u.tone}`}
            >
              {u.label}
            </span>
            <div className="mt-0.5 text-xs text-zinc-400">{u.caption}</div>
          </div>
        );
      },
    },
    {
      key: 'value',
      header: 'Est. value',
      align: 'right',
      render: (p) => (
        <div>
          <div className="font-semibold text-zinc-800 tabular-nums">
            {formatMoney(p.estimated_revenue)}
          </div>
          <div className="text-xs text-zinc-400">lifetime estimate</div>
        </div>
      ),
    },
    {
      key: 'demand',
      header: 'Demand',
      align: 'center',
      render: (p) => (
        <div>
          <InterestBadge score={p.interest_score} />
          <div className="mt-0.5 text-xs text-zinc-400">0–100</div>
        </div>
      ),
    },
    {
      key: 'opportunity',
      header: 'Opportunity',
      render: (p) => {
        const o = opportunityOf(p.interest_score);
        return (
          <span
            title={o.hint}
            className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${o.tone}`}
          >
            {o.label}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Customers needing action',
      render: (p) => (
        <Group gap={6} wrap="wrap">
          {p.overdue_count > 0 && (
            <Badge variant="light" color="danger" radius="sm">
              {p.overdue_count} overdue
            </Badge>
          )}
          {p.due_soon_count > 0 && (
            <Badge variant="light" color="warning" radius="sm">
              {p.due_soon_count} due soon
            </Badge>
          )}
          {p.on_track_count > 0 && (
            <Badge variant="light" color="success" radius="sm">
              {p.on_track_count} on track
            </Badge>
          )}
          {p.insufficient_count > 0 && (
            <button
              type="button"
              title="Add order history for this product"
              onClick={() =>
                openAdd({
                  product: { id: p.product_id, name: p.product_name },
                })
              }
              className="rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
            >
              {p.insufficient_count} need data →
            </button>
          )}
        </Group>
      ),
    },
  ];

  const exportDisabled =
    !data ||
    tab === 'trends' ||
    (tab === 'customers' ? filteredCustomers.length === 0 : filteredProducts.length === 0);

  return (
    <div>
      <PageHeader
        title="Predictions"
        subtitle="When is each customer likely to order next, and how interested are they?"
        actions={
          <>
            <Button
              variant="default"
              leftSection={<DownloadSimple size={16} />}
              disabled={exportDisabled}
              onClick={handleExport}
            >
              Export CSV
            </Button>
            <Button
              variant="default"
              leftSection={<ArrowClockwise size={16} />}
              loading={analysis.isFetching}
              onClick={() => analysis.refetch()}
            >
              Refresh
            </Button>
            <Button leftSection={<FileArrowUp size={16} />} onClick={() => openAdd()}>
              Add order history
            </Button>
          </>
        }
      />

      {summary && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
          <KPICard
            icon={<UsersThree size={22} />}
            label="Customers to reorder"
            value={summary.due_soon_count + summary.overdue_count}
            trendLabel={`${summary.overdue_count} overdue — call · ${summary.due_soon_count} due soon — message`}
          />
          <KPICard
            icon={<CalendarDots size={22} />}
            label="Next orders in 30 days"
            value={summary.next_30_days}
            trendLabel={`${summary.next_7_days} due within 7 days — keep stock ready`}
          />
          <KPICard
            icon={<Graph size={22} />}
            label="Average interest"
            value={summary.avg_interest}
            trendLabel="0–100 · above 40 means a follow-up is worthwhile"
          />
          <KPICard
            icon={<Package size={22} />}
            label="Analysed products"
            value={summary.product_pairs}
            trendLabel={`across ${summary.customer_count} customers · open one to act`}
          />
        </SimpleGrid>
      )}

      {summary &&
        !dataTipDismissed &&
        summary.product_pairs > 0 &&
        summary.insufficient_data_count / summary.product_pairs > 0.5 && (
          <Alert
            color="blue"
            icon={<Info size={16} />}
            withCloseButton
            onClose={() => setDataTipDismissed(true)}
            title="Some predictions are still being learned"
            mb="md"
          >
            <Stack gap="sm">
              <Text size="sm">
                {summary.insufficient_data_count} of {summary.product_pairs}{' '}
                product–customer pairs don&apos;t have enough history yet to
                predict the next order. Add a few real order dates and the
                prediction switches on.
              </Text>
              {mostNeedyProduct && (
                <div>
                  <Button
                    size="xs"
                    variant="light"
                    color="brand"
                    onClick={() =>
                      openAdd({
                        product: {
                          id: mostNeedyProduct.product_id,
                          name: mostNeedyProduct.product_name,
                        },
                      })
                    }
                  >
                    Add history for those →
                  </Button>
                </div>
              )}
            </Stack>
          </Alert>
        )}

      {analysis.isLoading ? (
        <LoadingState />
      ) : analysis.isError ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <Alert color="red" title="Could not load predictions">
            <Stack gap="sm">
              <Text size="sm">
                {analysis.error instanceof Error
                  ? analysis.error.message
                  : 'Something went wrong. Please try again.'}
              </Text>
              <div>
                <Button
                  size="xs"
                  color="red"
                  variant="subtle"
                  onClick={() => analysis.refetch()}
                >
                  Retry
                </Button>
              </div>
            </Stack>
          </Alert>
        </div>
      ) : (
        <Tabs
          value={tab}
          onChange={(value) =>
            setTab((value ?? 'customers') as 'products' | 'customers' | 'trends')
          }
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="customers" leftSection={<UsersThree size={16} />}>
              By customer
            </Tabs.Tab>
            <Tabs.Tab value="products" leftSection={<Package size={16} />}>
              By product
            </Tabs.Tab>
            <Tabs.Tab value="trends" leftSection={<Graph size={16} />}>
              Trends
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="products">
            <StatusLegend />
            <TableFilterBar
              searchValue={productsSearch}
              onSearchChange={setProductsSearch}
              statusValue={productsStatus}
              onStatusChange={setProductsStatus}
              totalCount={products.length}
              filteredCount={filteredProducts.length}
              searchPlaceholder="Search products or SKUs…"
            />
            {isMobile ? (
              filteredProducts.length ? (
                <Stack gap="sm">
                  {filteredProducts.map((p) => (
                    <ProductPredictionCard key={p.product_id} product={p} />
                  ))}
                </Stack>
              ) : (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <EmptyState
                    title="No matches"
                    description="Try a different search or status filter."
                  />
                </div>
              )
            ) : (
              <DataTable
                columns={productColumns}
                data={filteredProducts}
                getRowId={(p) => p.product_id}
                minWidth={1000}
                emptyTitle={
                  productsSearch || productsStatus !== 'all'
                    ? 'No matches'
                    : 'No product predictions yet'
                }
                emptyDescription={
                  productsSearch || productsStatus !== 'all'
                    ? 'Try a different search or status filter.'
                    : 'Add order history for a product and customer, or create confirmed orders.'
                }
                rowAccent={(p) => STATUS_COLORS[p.stock_status]}
                rowClassName={(p) =>
                  highlight?.tab === 'products' && highlight.id === p.product_id
                    ? 'bg-brand-50/70'
                    : undefined
                }
                rowActions={[
                  {
                    label: 'Add order history',
                    icon: <Plus size={16} />,
                    onClick: (p) =>
                      openAdd({
                        product: {
                          id: p.product_id,
                          name: p.product_name,
                        },
                      }),
                  },
                  {
                    label: 'View details',
                    icon: <Eye size={16} />,
                    onClick: (p) =>
                      router.push(`/predictions/products/${p.product_id}`),
                  },
                ]}
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="customers">
            <StatusLegend />
            <TableFilterBar
              searchValue={customersSearch}
              onSearchChange={setCustomersSearch}
              statusValue={customersStatus}
              onStatusChange={setCustomersStatus}
              totalCount={customers.length}
              filteredCount={filteredCustomers.length}
              searchPlaceholder="Search customers…"
            />
            {isMobile ? (
              filteredCustomers.length ? (
                <Stack gap="sm">
                  {filteredCustomers.map((c) => (
                    <CustomerPredictionCard
                      key={c.customer_id}
                      customer={c}
                      contactedAt={contacted[c.customer_id] ?? null}
                      onView={(cust) =>
                        router.push(
                          `/predictions/customers/${cust.customer_id}`,
                        )
                      }
                      onToggleContacted={toggleContacted}
                    />
                  ))}
                </Stack>
              ) : (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <EmptyState
                    title="No matches"
                    description="Try a different search or status filter."
                  />
                </div>
              )
            ) : (
              <DataTable
                columns={customerColumns}
                data={filteredCustomers}
                getRowId={(c) => c.customer_id}
                minWidth={1000}
                emptyTitle={
                  customersSearch || customersStatus !== 'all'
                    ? 'No matches'
                    : 'No customer predictions yet'
                }
                emptyDescription={
                  customersSearch || customersStatus !== 'all'
                    ? 'Try a different search or status filter.'
                    : 'Add order history for a product and customer, or create confirmed orders.'
                }
                rowAccent={(c) => STATUS_COLORS[c.stock_status]}
                rowClassName={(c) =>
                  [
                    contacted[c.customer_id] ? 'opacity-60' : undefined,
                    highlight?.tab === 'customers' &&
                    highlight.id === c.customer_id
                      ? 'bg-brand-50/70'
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                rowActions={[
                  {
                    label: 'Add order history',
                    icon: <Plus size={16} />,
                    onClick: (c) =>
                      openAdd({
                        customer: {
                          id: c.customer_id,
                          name: c.customer_name,
                        },
                      }),
                  },
                  {
                    label: 'View details',
                    icon: <Eye size={16} />,
                    onClick: (c) =>
                      router.push(`/predictions/customers/${c.customer_id}`),
                  },
                  {
                    label: (c) =>
                      contacted[c.customer_id]
                        ? 'Unmark contacted'
                        : 'Mark as contacted',
                    icon: (c) =>
                      contacted[c.customer_id] ? (
                        <X size={16} />
                      ) : (
                        <Check size={16} />
                      ),
                    onClick: (c) => toggleContacted(c.customer_id),
                  },
                ]}
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="trends">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard
                title="Customers by status"
                subtitle={customerChartCaption}
                legend={
                  <ChartLegend
                    items={customerStatusPie.map((s) => ({
                      label: STATUS_LABELS[s.key] ?? s.key,
                      color: STATUS_COLORS[s.key] ?? '#f59e0b',
                    }))}
                  />
                }
              >
                {customerStatusPie.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={customerStatusPie.map((s) => ({
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
                        {customerStatusPie.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={STATUS_COLORS[entry.key] ?? '#f59e0b'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e4e7ec',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState description="No customers yet." />
                )}
              </ChartCard>

              <ChartCard
                title="Customer re-orders per product"
                subtitle={productChartCaption}
                legend={
                  <ChartLegend
                    items={[
                      { label: 'On track', color: STATUS_COLORS.on_track },
                      { label: 'Due soon', color: STATUS_COLORS.due_soon },
                      { label: 'Overdue', color: STATUS_COLORS.overdue },
                    ]}
                  />
                }
              >
                {productChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f3f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e4e7ec',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                      />
                      <Bar
                        dataKey="On track"
                        stackId="a"
                        fill={STATUS_COLORS.on_track}
                      />
                      <Bar
                        dataKey="Due soon"
                        stackId="a"
                        fill={STATUS_COLORS.due_soon}
                      />
                      <Bar
                        dataKey="Overdue"
                        stackId="a"
                        fill={STATUS_COLORS.overdue}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState description="No product predictions yet." />
                )}
              </ChartCard>
            </div>
          </Tabs.Panel>
        </Tabs>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          variant="subtle"
          color="red"
          size="xs"
          leftSection={<Trash size={14} />}
          loading={clearHistory.isPending}
          disabled={confirmingClear}
          onClick={() => setConfirmingClear(true)}
        >
          Clear added history
        </Button>
      </div>

      {confirmingClear && (
        <Alert color="red" title="Clear all added order history?" mt="md">
          <Stack gap="sm">
            <Text size="sm">
              This removes history added through this page (confirmed live
              orders are kept).
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                color="red"
                onClick={handleClear}
                loading={clearHistory.isPending}
              >
                Yes, clear it
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      <AddOrdersModal
        opened={addOpened}
        onClose={closeAdd}
        preset={addPreset}
        onSaved={handleSaved}
      />
    </div>
  );
}