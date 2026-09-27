'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import {
  FileArrowDown,
  Plus,
  StackSimple,
  TrendUp,
  Warehouse,
  Factory,
} from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  DateRangeValue,
  EMPTY_DATE_RANGE,
} from '@/components/shared';
import type { Column, SortState, Filters } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { formatDateTime } from '@/lib/format';
import {
  useProducts,
  useLedgerMovements,
  useAdjustStock,
  toDateParam,
} from '../api';
import type { StockMovement, LedgerParams } from '../api';

const REASON_META: Record<
  string,
  { label: string; classes: string }
> = {
  stock_in: { label: 'Stock added', classes: 'bg-success-50 text-success-700' },
  production: { label: 'Production used', classes: 'bg-brand-50 text-brand-700' },
  order: { label: 'Sold', classes: 'bg-warning-50 text-warning-700' },
  cancelled: { label: 'Cancelled / returned', classes: 'bg-black/5 text-[var(--muted)]' },
};

const REASON_OPTIONS = [
  { value: 'stock_in', label: 'Stock added' },
  { value: 'production', label: 'Production used' },
  { value: 'order', label: 'Sold' },
  { value: 'cancelled', label: 'Cancelled / returned' },
];

function ReasonBadge({ reason }: { reason: string }) {
  const meta = REASON_META[reason] ?? { label: reason, classes: 'bg-black/5 text-[var(--muted)]' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <Text size="xs" c="var(--muted)" fw={500}>{label}</Text>
      <Text fw={700} size="lg" className="mt-0.5">{value}</Text>
      {hint && (
        <Text size="xs" c="var(--muted)" className="mt-0.5">{hint}</Text>
      )}
    </div>
  );
}

function MovementModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { data: productsData } = useProducts();
  const adjust = useAdjustStock();
  const allProducts = productsData ?? [];

  const [mode, setMode] = useState<'stock_in' | 'production'>('stock_in');
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const productsWithVariants = allProducts.filter((p) => p.variants.length > 0);
  const selectedProduct = allProducts.find((p) => p.id === productId);
  const variantOptions = (selectedProduct?.variants ?? []).map((v) => ({
    value: v.id,
    label: v.name || 'Default',
  }));
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === variantId);

  const submit = () => {
    if (!variantId) {
      notifications.show({
        color: 'red',
        title: 'Variant required',
        message: 'Choose the product variant to record.',
      });
      return;
    }
    if (!quantity || quantity <= 0) {
      notifications.show({
        color: 'red',
        title: 'Invalid quantity',
        message: 'Quantity must be a positive number.',
      });
      return;
    }
    adjust.mutate(
      { variant_id: variantId, quantity, reason: mode },
      {
        onSuccess: (movement) => {
          notifications.show({
            color: 'success',
            title: mode === 'stock_in' ? 'Stock added' : 'Production used',
            message: `${Math.abs(movement.quantity)} unit${Math.abs(movement.quantity) === 1 ? '' : 's'} recorded for ${movement.variant_name ?? movement.product_name}.`,
          });
          setProductId(null);
          setVariantId(null);
          setQuantity(1);
          onClose();
        },
        onError: (error) => {
          notifications.show({
            color: 'red',
            title: 'Could not record movement',
            message: error instanceof Error ? error.message : 'Something went wrong',
          });
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Record stock movement"
      size="md"
      centered
    >
      <Group gap="sm" mb="md">
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => setMode(value as 'stock_in' | 'production')}
          data={[
            { value: 'stock_in', label: 'Add stock' },
            { value: 'production', label: 'Use in production' },
          ]}
        />
      </Group>

      <Select
        label="Product"
        placeholder="Select a product"
        searchable
        clearable
        data={productsWithVariants.map((p) => ({ value: p.id, label: p.name }))}
        value={productId}
        onChange={(value) => {
          setProductId(value);
          setVariantId(null);
        }}
        className="mb-3"
      />
      <Select
        label="Variant"
        placeholder={productId ? 'Select a variant' : 'Choose a product first'}
        searchable
        clearable
        disabled={!productId || variantOptions.length === 0}
        data={variantOptions}
        value={variantId}
        onChange={setVariantId}
        className="mb-3"
      />
      <NumberInput
        label="Quantity"
        description={
          mode === 'stock_in' ? 'Units being added to stock' : 'Units consumed as raw material'
        }
        min={1}
        allowDecimal={false}
        value={quantity}
        onChange={(val) => setQuantity(Number(val) > 0 ? Number(val) : 0)}
        className="mb-4"
      />

      {selectedVariant && (
        <Text size="xs" c="var(--muted)" className="mb-4">
          Current stock: <span className="font-semibold text-[var(--foreground)]">{selectedVariant.stock_quantity}</span>{' '}
          (low-stock alert at {selectedVariant.low_stock_threshold})
        </Text>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="default" onClick={onClose} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button
          leftSection={
            mode === 'stock_in' ? <Plus size={16} weight="bold" /> : <Factory size={16} weight="bold" />
          }
          loading={adjust.isPending}
          onClick={submit}
        >
          {mode === 'stock_in' ? 'Add to stock' : 'Use in production'}
        </Button>
      </div>
    </Modal>
  );
}

export default function StockLedgerPage() {
  const router = useRouter();
  const productsQuery = useProducts();

  const [productId, setProductId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('product');
  });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [modalOpen, setModalOpen] = useState(false);

  const allProducts = productsQuery.data ?? [];
  const focusProduct = productId ? allProducts.find((p) => p.id === productId) : null;
  const allVariants = useMemo(() => allProducts.flatMap((p) => p.variants), [allProducts]);
  const focusVariants = variantId
    ? allVariants.filter((v) => v.id === variantId)
    : focusProduct
      ? focusProduct.variants
      : allVariants;

  const currentStock = focusVariants.reduce((s, v) => s + (v.stock_quantity ?? 0), 0);

  const ledgerParams: LedgerParams = useMemo(
    () => ({
      limit: 500,
      product_id: productId,
      variant_id: variantId,
      reason,
      date_from: toDateParam(dateRange.mode === 'range' ? dateRange.from : null),
      date_to: toDateParam(dateRange.mode === 'range' ? dateRange.to : null),
    }),
    [productId, variantId, reason, dateRange],
  );

  const movementsQuery = useLedgerMovements(ledgerParams);
  const movements = movementsQuery.data ?? [];

  const stats = useMemo(() => {
    let added = 0;
    let produced = 0;
    let sold = 0;
    for (const m of movements) {
      if (m.reason === 'stock_in') added += m.quantity;
      else if (m.reason === 'production') produced += Math.abs(m.quantity);
      else if (m.reason === 'order') sold += Math.abs(m.quantity);
    }
    return { added, produced, sold };
  }, [movements]);

  const sorted = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? movements.filter(
          (m) =>
            m.product_name.toLowerCase().includes(needle) ||
            (m.variant_name ?? '').toLowerCase().includes(needle),
        )
      : [...movements];
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sort.field === 'quantity') {
        return (a.quantity - b.quantity) * dir;
      }
      if (sort.field === 'product_name') {
        return a.product_name.localeCompare(b.product_name) * dir;
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });
    return rows;
  }, [movements, search, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const filterValues: Filters = useMemo(
    () => ({
      product: productId,
      variant: variantId,
      reason,
      range: dateRange,
    }),
    [productId, variantId, reason, dateRange],
  );

  const hasActiveFilters =
    !!productId || !!variantId || !!reason || dateRange.mode !== 'all';

  const variantFilterOptions = useMemo(() => {
    const source = focusProduct ? focusProduct.variants : allVariants;
    return source.map((v) => ({ value: v.id, label: v.name || 'Default' }));
  }, [focusProduct, allVariants]);

  const handleExport = () => {
    downloadCsv(
      `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Product', 'Variant', 'Type', 'Quantity', 'Order ID', 'Running balance'],
      movements.map((m) => [
        formatDateTime(m.created_at),
        m.product_name,
        m.variant_name ?? '',
        REASON_META[m.reason]?.label ?? m.reason,
        m.quantity,
        m.order_id ?? '',
        m.running_balance,
      ]),
    );
  };

  const columns: Column<StockMovement>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      render: (m) => (
        <div>
          <div className="text-sm font-medium text-[var(--foreground)]">
            {formatDateTime(m.created_at)}
          </div>
        </div>
      ),
    },
    {
      key: 'product_name',
      header: 'Product',
      sortable: true,
      render: (m) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(`/products/${m.product_id}`)}
            className="block truncate text-sm font-semibold text-[var(--foreground)] hover:text-brand-700"
          >
            {m.product_name}
          </button>
          {m.variant_name && (
            <div className="truncate text-xs text-[var(--muted)]">{m.variant_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Type',
      render: (m) => <ReasonBadge reason={m.reason} />,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      sortable: true,
      render: (m) => (
        <span
          className={`font-mono text-sm font-bold ${
            m.quantity >= 0 ? 'text-success-600' : 'text-danger-500'
          }`}
        >
          {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
        </span>
      ),
    },
    {
      key: 'order_id',
      header: 'Order',
      align: 'center',
      render: (m) =>
        m.order_id ? (
          <span className="rounded-lg bg-black/5 px-2 py-0.5 font-mono text-xs text-[var(--muted)]">
            {m.order_id.slice(0, 8)}
          </span>
        ) : (
          <span className="text-[var(--muted)]/40">—</span>
        ),
    },
    {
      key: 'running_balance',
      header: 'Running balance',
      align: 'right',
      render: (m) => (
        <span className="font-mono text-sm font-semibold text-[var(--foreground)]">
          {m.running_balance}
        </span>
      ),
    },
  ];

  const rowActions = [
    {
      label: 'View product',
      icon: <StackSimple size={16} />,
      onClick: (m: StockMovement) => router.push(`/products/${m.product_id}`),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock Ledger"
        subtitle="Every time stock is added, used in production, or sold"
        actions={
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<FileArrowDown size={16} weight="bold" />}
              onClick={handleExport}
              disabled={movements.length === 0}
            >
              Export
            </Button>
            <Button
              leftSection={<Plus size={16} weight="bold" />}
              onClick={() => setModalOpen(true)}
            >
              Record movement
            </Button>
          </Group>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Warehouse size={22} weight="bold" />}
          label="Units in stock"
          value={currentStock}
          color="bg-brand-50 text-brand-600"
          hint={variantId ? 'Selected variant' : focusProduct ? 'Selected product' : 'All products'}
        />
        <StatCard
          icon={<Plus size={22} weight="bold" />}
          label="Stock added"
          value={stats.added}
          color="bg-success-50 text-success-600"
          hint="In current view"
        />
        <StatCard
          icon={<Factory size={22} weight="bold" />}
          label="Used in production"
          value={stats.produced}
          color="bg-accent-50 text-accent-600"
          hint="In current view"
        />
        <StatCard
          icon={<TrendUp size={22} weight="bold" />}
          label="Sold"
          value={stats.sold}
          color="bg-warning-50 text-warning-600"
          hint="In current view"
        />
      </div>

      <div>
        <FilterBar
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search by product or variant…"
          filterDefs={[
            {
              type: 'select',
              key: 'product',
              label: 'Product',
              placeholder: 'All products',
              options: allProducts.map((p) => ({ value: p.id, label: p.name })),
            },
            {
              type: 'select',
              key: 'variant',
              label: 'Variant',
              placeholder: 'All variants',
              options: variantFilterOptions,
            },
            {
              type: 'select',
              key: 'reason',
              label: 'Type',
              placeholder: 'All types',
              options: REASON_OPTIONS,
            },
            {
              type: 'rangedate',
              key: 'range',
              label: 'Filter by date',
            },
          ]}
          filterValues={filterValues}
          onFiltersChange={(f) => {
            setProductId((f.product as string | null) ?? null);
            setVariantId((f.variant as string | null) ?? null);
            setReason((f.reason as string | null) ?? null);
            setDateRange((f.range as DateRangeValue) ?? EMPTY_DATE_RANGE);
            setPage(1);
          }}
          onClear={() => {
            setProductId(null);
            setVariantId(null);
            setReason(null);
            setDateRange(EMPTY_DATE_RANGE);
            setSearch('');
            setPage(1);
          }}
          hasActiveFilters={hasActiveFilters}
        />

        <DataTable
          columns={columns}
          data={paged}
          loading={movementsQuery.isLoading}
          error={movementsQuery.isError}
          retry={() => movementsQuery.refetch()}
          isPermissionDenied={
            (movementsQuery.error as { status?: number } | null)?.status === 403
          }
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          rowActions={rowActions}
          getRowId={(m) => m.id}
          minWidth={820}
          emptyTitle="No stock movements"
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Movements appear here as stock is added, produced, or sold.'
          }
        />

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={sorted.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <MovementModal opened={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}