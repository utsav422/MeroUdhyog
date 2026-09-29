'use client';

import { useMemo, useState } from 'react';
import { Button, Group } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
  ArrowUUpLeft,
  ArrowUpRight,
  BookBookmark,
  FileArrowDown,
  Plus,
  SunHorizon,
  MoonStars,
  TrendUp,
  Factory,
} from '@phosphor-icons/react';
import {
  FilterBar,
  PaginationBar,
  PageHeader,
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
import { computeDayMetrics, localDayKey } from '../ledgerMetrics';

export default function TodayLedgerPage() {
  const router = useRouter();
  const productsQuery = useProducts();

  const [productId, setProductId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('product');
  });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [modalOpen, setModalOpen] = useState(false);

  const today = toDateParam(new Date()) ?? new Date().toISOString().slice(0, 10);
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    [],
  );

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

  const scopeParams: LedgerParams = useMemo(
    () => ({
      limit: 500,
      product_id: productId,
      variant_id: variantId,
      date_from: today,
      date_to: today,
    }),
    [productId, variantId, today],
  );

  const tableParams: LedgerParams = useMemo(
    () => ({ ...scopeParams, reason }),
    [scopeParams, reason],
  );

  const scopeQuery = useLedgerMovements(scopeParams);
  const tableQuery = useLedgerMovements(tableParams);
  const scopeRows = scopeQuery.data ?? [];
  const rows = tableQuery.data ?? [];

  const dayMetrics = useMemo(
    () => computeDayMetrics(scopeRows, liveStockByVariant),
    [scopeRows, liveStockByVariant],
  );
  const metricsByVariantDay = useMemo(
    () => new Map(dayMetrics.map((dm) => [`${dm.variant_id}::${dm.day}`, dm])),
    [dayMetrics],
  );
  const dayMetricsOf = (m: StockMovement) =>
    metricsByVariantDay.get(`${m.variant_id}::${localDayKey(m.created_at)}`);

  const summary = useMemo(() => {
    let added = 0;
    let produced = 0;
    let sold = 0;
    let returned = 0;
    for (const m of scopeRows) {
      if (m.reason === 'stock_in') added += m.quantity;
      else if (m.reason === 'production') produced += Math.abs(m.quantity);
      else if (m.reason === 'order') sold += Math.abs(m.quantity);
      else if (m.reason === 'cancelled') returned += Math.abs(m.quantity);
    }
    const net = added - produced - sold + returned;
    return { added, produced, sold, returned, net, closing: currentStock, opening: currentStock - net };
  }, [scopeRows, currentStock]);

  const sorted = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const result = needle
      ? rows.filter(
          (m) =>
            m.product_name.toLowerCase().includes(needle) ||
            (m.variant_name ?? '').toLowerCase().includes(needle),
        )
      : rows;
    return sortLedgerMovements(result, sort);
  }, [rows, search, sort]);

  const groups = useMemo(
    () => buildLedgerGroups(sorted, metricsByVariantDay),
    [sorted, metricsByVariantDay],
  );

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, page, pageSize]);

  const filterValues: Filters = useMemo(
    () => ({ product: productId, variant: variantId, reason }),
    [productId, variantId, reason],
  );

  const hasActiveFilters = !!productId || !!variantId || !!reason;

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

  const handleExport = () => {
    downloadCsv(
      `stock-ledger-${today}.csv`,
      ['Date', 'Day', 'Product', 'Variant', 'Type', 'Opening', 'Added', 'Sold', 'Production / damaged', 'Closing'],
      rows.map((m) => {
        const dm = dayMetricsOf(m);
        return [
          formatDateTime(m.created_at),
          dm?.label ?? 'Today',
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

  const scopeHint = variantId ? 'This variant · today' : focusProduct ? 'This product · today' : 'All products · today';
  const reasonHint = reason ? 'Type filter applies to the list below' : 'Today';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Today's Stock Ledger"
        subtitle={todayLabel}
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
              disabled={rows.length === 0}
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StatCard
          icon={<SunHorizon size={22} weight="bold" />}
          label="Opening stock"
          value={summary.opening}
          color="bg-brand-50 text-brand-600"
          hint={`At start of day · ${reasonHint}`}
        />
        <StatCard
          icon={<Plus size={22} weight="bold" />}
          label="Stock added"
          value={summary.added}
          color="bg-success-50 text-success-600"
          hint={scopeHint}
        />
        <StatCard
          icon={<Factory size={22} weight="bold" />}
          label="Used in production"
          value={summary.produced}
          color="bg-accent-50 text-accent-600"
          hint="Today"
        />
        <StatCard
          icon={<TrendUp size={22} weight="bold" />}
          label="Sold"
          value={summary.sold}
          color="bg-warning-50 text-warning-600"
          hint="Today"
        />
        <StatCard
          icon={<ArrowUUpLeft size={22} weight="bold" />}
          label="Returned"
          value={summary.returned}
          color="bg-black/5 text-[var(--muted)]"
          hint="Cancelled / returned"
        />
        <StatCard
          icon={<ArrowUpRight size={22} weight="bold" />}
          label="Net change"
          value={summary.net >= 0 ? `+${summary.net}` : summary.net}
          color={
            summary.net > 0
              ? 'bg-success-50 text-success-600'
              : summary.net < 0
                ? 'bg-danger-50 text-danger-600'
                : 'bg-black/5 text-[var(--muted)]'
          }
          hint="Today, all types"
        />
        <StatCard
          icon={<MoonStars size={22} weight="bold" />}
          label="Closing stock"
          value={summary.closing}
          color="bg-brand-50 text-brand-600"
          hint="Now (live)"
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
          ]}
          filterValues={filterValues}
          onFiltersChange={(f) => {
            setProductId((f.product as string | null) ?? null);
            setVariantId((f.variant as string | null) ?? null);
            setReason((f.reason as string | null) ?? null);
            setPage(1);
          }}
          onClear={() => {
            setProductId(null);
            setVariantId(null);
            setReason(null);
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
          isPermissionDenied={(tableQuery.error as { status?: number } | null)?.status === 403}
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          onViewProduct={(id) => router.push(`/products/${id}`)}
          minWidth={880}
          emptyTitle="No movements today"
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Nothing moved in or out of stock today yet.'
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