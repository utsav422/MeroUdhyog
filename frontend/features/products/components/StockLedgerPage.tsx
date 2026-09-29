'use client';

import { useMemo, useState } from 'react';
import { Button, Group } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
  CalendarBlank,
  FileArrowDown,
  Plus,
  TrendUp,
  Warehouse,
  Factory,
} from '@phosphor-icons/react';
import {
  FilterBar,
  PaginationBar,
  PageHeader,
  DateRangeValue,
  EMPTY_DATE_RANGE,
} from '@/components/shared';
import type { SortState, Filters } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { formatDateTime } from '@/lib/format';
import { useProducts, useLedgerMovements, toDateParam } from '../api';
import type { StockMovement, LedgerParams } from '../api';
import StockMovementModal from './StockMovementModal';
import StatCard from './StatCard';
import StockLedgerTable, {
  buildLedgerGroups,
  sortLedgerMovements,
} from './StockLedgerTable';
import { REASON_META, REASON_OPTIONS } from './reasonMeta';
import { computeDayMetrics, dayLabel, localDayKey } from '../ledgerMetrics';

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

  const liveStockByVariant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of focusVariants) map[v.id] = v.stock_quantity ?? 0;
    return map;
  }, [focusVariants]);

  const rangeDates = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const date =
      dateRange.mode === 'range'
        ? dateRange.from
        : dateRange.mode === 'today'
          ? today
          : dateRange.mode === 'yesterday'
            ? yesterday
            : null;
    const dateTo =
      dateRange.mode === 'range'
        ? dateRange.to
        : dateRange.mode === 'today'
          ? today
          : dateRange.mode === 'yesterday'
            ? yesterday
            : null;
    return { date, dateTo };
  }, [dateRange]);

  const metricsParams: LedgerParams = useMemo(
    () => ({
      limit: 500,
      product_id: productId,
      variant_id: variantId,
    }),
    [productId, variantId],
  );

  const tableParams: LedgerParams = useMemo(
    () => ({
      limit: 500,
      product_id: productId,
      variant_id: variantId,
      reason,
      date_from: toDateParam(rangeDates.date),
      date_to: toDateParam(rangeDates.dateTo),
    }),
    [productId, variantId, reason, rangeDates],
  );

  const metricsQuery = useLedgerMovements(metricsParams);
  const tableQuery = useLedgerMovements(tableParams);
  const metricsRows = metricsQuery.data ?? [];
  const movements = tableQuery.data ?? [];

  const dayMetrics = useMemo(
    () => computeDayMetrics(metricsRows, liveStockByVariant),
    [metricsRows, liveStockByVariant],
  );
  const metricsByVariantDay = useMemo(
    () => new Map(dayMetrics.map((dm) => [`${dm.variant_id}::${dm.day}`, dm])),
    [dayMetrics],
  );

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
      : movements;
    return sortLedgerMovements(rows, sort);
  }, [movements, search, sort]);

  const groups = useMemo(
    () => buildLedgerGroups(sorted, metricsByVariantDay),
    [sorted, metricsByVariantDay],
  );

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, page, pageSize]);

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
    if (focusProduct) {
      return focusProduct.variants.map((v) => ({
        value: v.id,
        label: `${focusProduct.name} · ${v.name || 'Default'}`,
      }));
    }
    return allProducts.flatMap((p) =>
      p.variants.map((v) => ({ value: v.id, label: `${p.name} · ${v.name || 'Default'}` })),
    );
  }, [focusProduct, allProducts]);

  const variantDayKey = (m: StockMovement) => `${m.variant_id}::${localDayKey(m.created_at)}`;
  const dayMetricsOf = (m: StockMovement) => metricsByVariantDay.get(variantDayKey(m));

  const handleExport = () => {
    downloadCsv(
      `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Day', 'Product', 'Variant', 'Type', 'Opening', 'Added', 'Sold', 'Production / damaged', 'Closing'],
      movements.map((m) => {
        const dm = metricsByVariantDay.get(variantDayKey(m));
        return [
          formatDateTime(m.created_at),
          dm?.label ?? dayLabel(localDayKey(m.created_at)),
          m.product_name,
          m.variant_name ?? '',
          REASON_META[m.reason]?.label ?? m.reason,
          dm?.opening ?? 0,
          dm?.added ?? 0,
          dm?.sold ?? 0,
          (dm?.produced ?? 0) + (dm?.damaged ?? 0),
          dm?.closing ?? 0,
        ];
      }),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock Ledger"
        subtitle="Every time stock is added, used in production, or sold"
        actions={
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<CalendarBlank size={16} weight="bold" />}
              onClick={() => router.push('/products/ledger/today')}
            >
              Today&apos;s summary
            </Button>
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

        <StockLedgerTable
          groups={paged}
          loading={tableQuery.isLoading}
          error={tableQuery.isError}
          retry={() => tableQuery.refetch()}
          isPermissionDenied={
            (tableQuery.error as { status?: number } | null)?.status === 403
          }
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          onViewProduct={(id) => router.push(`/products/${id}`)}
          minWidth={900}
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
          total={groups.length}
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