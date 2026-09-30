'use client';

import { useMemo, useState } from 'react';
import { Button, Group, Text, Tooltip } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookBookmark,
  FileArrowDown,
  Minus,
  Package,
  Plus,
  TrendUp,
  Factory,
  WarningDiamond,
} from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
} from '@/components/shared';
import type { Column, SortState, Filters } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { useAllProducts, useLedgerMovements } from '../api';
import type { LedgerParams } from '../api';
import {
  MOVEMENT_FILTER_OPTIONS,
  buildStockAsOfRows,
  sortStockAsOfRows,
  sumStockAsOf,
} from '../stockAsOf';
import type { MovementFilter, StockAsOfRow } from '../stockAsOf';
import { localDayKey } from '../ledgerMetrics';
import StockMovementModal from './StockMovementModal';
import StatCard from './StatCard';
import MetricCell from './MetricCell';

/** Flow columns that are worth reading at a glance; a zero reads as a dash. */
function FlowCell({ value, tone }: { value: number; tone: 'success' | 'warning' | 'brand' | 'muted' }) {
  if (value === 0) return <MetricCell value={0} tone="muted" />;
  return <MetricCell value={value} tone={tone} />;
}

export default function TodayLedgerPage() {
  const router = useRouter();

  // FilterBar already debounces typing before it calls onSearchChange, so this
  // state is the settled term that goes to the backend.
  const [searchInput, setSearchInput] = useState('');
  const [productId, setProductId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('product');
  });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [movement, setMovement] = useState<MovementFilter>('all');
  const [sort, setSort] = useState<SortState>({ field: 'product', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);

  const today = localDayKey(new Date());
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  // Two catalogue reads: the unfiltered one feeds the Product / Variant
  // dropdowns (they must always list everything so you can navigate away from
  // a search), the searched one is what the ledger rows are built from.
  const catalogQuery = useAllProducts();
  const productsQuery = useAllProducts(searchInput);

  const allProducts = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const focusProduct = productId ? allProducts.find((p) => p.id === productId) : null;

  const variantFilterOptions = useMemo(
    () => {
      const source = focusProduct ? [focusProduct] : allProducts;
      return source.flatMap((p) =>
        p.variants.map((v) => ({
          value: v.id,
          label: `${p.name} · ${v.name || 'Default'}`,
        })),
      );
    },
    [allProducts, focusProduct],
  );

  // Product and variant scope is pushed to the backend so the movements
  // payload shrinks with the filter. The catalogue is narrowed to the same
  // scope, otherwise the out-of-scope variants would be listed with their
  // movement hidden and report opening === closing.
  const ledgerProducts = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const scopedProducts = useMemo(() => {
    if (productId) {
      const product = ledgerProducts.find((p) => p.id === productId);
      if (!product) return [];
      if (!variantId) return [product];
      return [{ ...product, variants: product.variants.filter((v) => v.id === variantId) }];
    }
    if (variantId) {
      return ledgerProducts
        .map((p) => ({ ...p, variants: p.variants.filter((v) => v.id === variantId) }))
        .filter((p) => p.variants.length > 0);
    }
    return ledgerProducts;
  }, [ledgerProducts, productId, variantId]);

  const movementParams: LedgerParams = useMemo(
    () => ({
      limit: 500,
      product_id: productId,
      variant_id: variantId,
      date_from: today,
      date_to: today,
    }),
    [productId, variantId, today],
  );
  const movementsQuery = useLedgerMovements(movementParams);
  const movements = useMemo(() => movementsQuery.data ?? [], [movementsQuery.data]);

  const allRows = useMemo(
    () => buildStockAsOfRows(scopedProducts, movements, today),
    [scopedProducts, movements, today],
  );

  const totals = useMemo(() => sumStockAsOf(allRows), [allRows]);

  // The text search is resolved by the backend against product name, product
  // SKU and variant name/SKU. The movement toggle has no server equivalent —
  // "no movement today" is the absence of rows, which this endpoint cannot
  // express — so it is the one filter resolved client-side.
  const visible = useMemo(() => {
    const rows =
      movement === 'moved'
        ? allRows.filter((r) => r.movementCount > 0)
        : movement === 'unchanged'
          ? allRows.filter((r) => r.movementCount === 0)
          : allRows;
    return sortStockAsOfRows(rows, sort);
  }, [allRows, movement, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, page, pageSize]);

  const columns: Column<StockAsOfRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: 'Product',
        sortable: true,
        render: (r) => (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push(`/products/${r.productId}`)}
              className="block max-w-[220px] truncate text-left text-sm font-semibold text-[var(--foreground)] hover:text-brand-700"
            >
              {r.productName}
            </button>
            <div className="truncate text-xs text-[var(--muted)]">
              {r.sku ? <span className="font-mono">{r.sku}</span> : <span>No SKU</span>}
            </div>
          </div>
        ),
      },
      {
        key: 'variant',
        header: 'Variant',
        sortable: true,
        render: (r) => (
          <div className="min-w-0">
            <div className="truncate text-sm text-[var(--foreground)]">
              {r.variantName || 'Default'}
            </div>
            <div className="truncate text-xs text-[var(--muted)]">
              {r.unit ? `per ${r.unit}` : '—'}
            </div>
          </div>
        ),
      },
      {
        key: 'opening',
        header: 'Opening',
        align: 'right',
        sortable: true,
        render: (r) => <MetricCell value={r.opening} />,
      },
      {
        key: 'added',
        header: 'Added',
        align: 'right',
        sortable: true,
        render: (r) => <FlowCell value={r.added} tone="success" />,
      },
      {
        key: 'sold',
        header: 'Sold',
        align: 'right',
        sortable: true,
        render: (r) => <FlowCell value={r.sold} tone="warning" />,
      },
      {
        key: 'used',
        header: 'Product use / Damaged',
        align: 'right',
        sortable: true,
        render: (r) => <FlowCell value={r.used} tone="brand" />,
      },
      {
        key: 'closing',
        header: 'Closing',
        align: 'right',
        sortable: true,
        render: (r) => <MetricCell value={r.closing} tone="strong" />,
      },
    ],
    [router],
  );

  const filterValues: Filters = useMemo(
    () => ({ product: productId, variant: variantId, movement }),
    [productId, variantId, movement],
  );

  const hasActiveFilters = !!productId || !!variantId || movement !== 'all';

  const scopeHint = variantId
    ? 'Selected variant'
    : focusProduct
      ? 'Selected product'
      : `${totals.variants} variant${totals.variants === 1 ? '' : 's'}`;

  const handleExport = () => {
    downloadCsv(
      `stock-as-of-${today}.csv`,
      [
        'Product',
        'SKU',
        'Variant',
        'Unit',
        'Opening',
        'Added',
        'Sold',
        'Product use / Damaged',
        'Closing',
        'Movements',
      ],
      visible.map((r) => [
        r.productName,
        r.sku ?? '',
        r.variantName ?? '',
        r.unit ?? '',
        r.opening,
        r.added,
        r.sold,
        r.used,
        r.closing,
        r.movementCount,
      ]),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock as of Today"
        subtitle={`${todayLabel} · opening, movement and closing for every product`}
        actions={
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<BookBookmark size={16} weight="bold" />}
              onClick={() => router.push('/products/ledger')}
            >
              Full ledger
            </Button>
            <Button
              variant="default"
              leftSection={<FileArrowDown size={16} weight="bold" />}
              onClick={handleExport}
              disabled={visible.length === 0}
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
          icon={<Plus size={22} weight="bold" />}
          label="Stock added"
          value={totals.added}
          color="bg-success-50 text-success-600"
          hint={scopeHint}
        />
        <StatCard
          icon={<TrendUp size={22} weight="bold" />}
          label="Sold"
          value={totals.sold}
          color="bg-warning-50 text-warning-600"
          hint={scopeHint}
        />
        <StatCard
          icon={<Factory size={22} weight="bold" />}
          label="Product use / damaged"
          value={totals.used}
          color="bg-accent-50 text-accent-600"
          hint={scopeHint}
        />
        <StatCard
          icon={<ArrowUpRight size={22} weight="bold" />}
          label="Net change"
          value={totals.net >= 0 ? `+${totals.net}` : totals.net}
          color={
            totals.net > 0
              ? 'bg-success-50 text-success-600'
              : totals.net < 0
                ? 'bg-danger-50 text-danger-600'
                : 'bg-black/5 text-[var(--muted)]'
          }
          hint="Today, all types"
        />
      </div>

      <div>
        <FilterBar
          searchValue={searchInput}
          onSearchChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          searchPlaceholder="Search by product, variant or SKU…"
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
              key: 'movement',
              label: 'Movement',
              placeholder: 'All variants',
              options: MOVEMENT_FILTER_OPTIONS,
            },
          ]}
          filterValues={filterValues}
          onFiltersChange={(f) => {
            setProductId((f.product as string | null) ?? null);
            setVariantId((f.variant as string | null) ?? null);
            setMovement((f.movement as MovementFilter) ?? 'all');
            setPage(1);
          }}
          onClear={() => {
            setProductId(null);
            setVariantId(null);
            setMovement('all');
            setSearchInput('');
            setPage(1);
          }}
          hasActiveFilters={hasActiveFilters}
        />

        {totals.variants > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Package size={14} />
            <span>
              Showing {visible.length} of {allRows.length} variant
              {allRows.length === 1 ? '' : 's'} in scope · {totals.moved} moved today
            </span>
            {totals.unchanged > 0 && (
              <Tooltip label="Opening equals closing for these — nothing came in or went out today.">
                <span className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-0.5 font-medium">
                  <Minus size={11} />
                  {totals.unchanged} with no movement
                </span>
              </Tooltip>
            )}
            {totals.closing === 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-danger-50 px-2 py-0.5 font-medium text-danger-700">
                <WarningDiamond size={11} />
                Nothing left in stock
              </span>
            )}
          </div>
        )}

        <DataTable<StockAsOfRow>
          columns={columns}
          data={paged}
          loading={productsQuery.isLoading || movementsQuery.isLoading}
          error={productsQuery.isError || movementsQuery.isError}
          retry={() => {
            void productsQuery.refetch();
            void movementsQuery.refetch();
          }}
          isPermissionDenied={
            (movementsQuery.error as { status?: number } | null)?.status === 403 ||
            (productsQuery.error as { status?: number } | null)?.status === 403
          }
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          rowActions={[
            {
              label: 'View product',
              icon: <Package size={16} />,
              onClick: (r) => router.push(`/products/${r.productId}`),
            },
          ]}
          getRowId={(r) => r.key}
          rowClassName={(r) => (r.isActive ? undefined : 'opacity-50')}
          minWidth={1040}
          emptyTitle="No products found"
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Create a product to start tracking stock.'
          }
        />

        {visible.some((r) => !r.isActive) && (
          <Text size="xs" c="var(--muted)" className="mt-2">
            Dimmed rows are inactive products or variants.
          </Text>
        )}

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={visible.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <StockMovementModal opened={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
