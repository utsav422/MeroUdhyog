'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Badge,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  PencilSimple,
  Package,
  Tag,
  TrendUp,
  StackSimple,
  CurrencyDollar,
  FileCsv,
  TrashSimple,
} from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  StockBar,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { formatMoney, formatPriceUnit } from '@/lib/format';
import ProductsImportModal from './ProductsImportModal';
import {
  useProducts,
  useCategories,
  productsKeys,
  defaultVariantPrice,
} from '../api';
import type { Product } from '../api';

function moneyOf(product: Product): string {
  const first = product.variants[0];
  if (!first) return '0';
  return defaultVariantPrice(first);
}

function ProductStatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <Text size="xs" c="var(--muted)" fw={500}>{label}</Text>
        <Text fw={700} size="xl" c="var(--foreground)" className="leading-tight">{value}</Text>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const productsQuery = useProducts();
  const categoriesQuery = useCategories();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importOpen, setImportOpen] = useState(false);

  const allProducts = productsQuery.data ?? [];
  const allCategories = categoriesQuery.data ?? [];

  const stats = useMemo(() => {
    const total = allProducts.length;
    const active = allProducts.filter((p) => p.is_active).length;
    const inactive = total - active;
    const totalVariants = allProducts.reduce((s, p) => s + p.variants.length, 0);
    const totalValue = allProducts.reduce(
      (s, p) => s + p.variants.reduce((vs, v) => vs + Number(defaultVariantPrice(v) || 0), 0),
      0,
    );
    const avgPrice = total > 0 ? totalValue / total : 0;
    return { total, active, inactive, totalVariants, avgPrice };
  }, [allProducts]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const product of allProducts) {
      const catId = product.category_id ?? 'uncategorized';
      const cur = map.get(catId) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += product.variants.reduce((s, v) => s + Number(defaultVariantPrice(v) || 0), 0);
      map.set(catId, cur);
    }
    const result = [...map.entries()]
      .map(([catId, data]) => ({
        id: catId,
        name: allCategories.find((c) => c.id === catId)?.name ?? 'Uncategorized',
        count: data.count,
        value: Math.round(data.value),
      }))
      .sort((a, b) => b.count - a.count);
    return result;
  }, [allProducts, allCategories]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCategories) map.set(c.id, c.name);
    return map;
  }, [allCategories]);

  const filtered = useMemo(() => {
    let rows = [...allProducts];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.sku ?? '').toLowerCase().includes(needle),
      );
    }
    if (categoryFilter) {
      rows = rows.filter((p) => p.category_id === categoryFilter);
    }
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.field as keyof Product];
      const bv = b[sort.field as keyof Product];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
    return rows;
  }, [allProducts, search, categoryFilter, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/products/${id}`),
    onSuccess: () => {
      notifications.show({ color: 'success', title: 'Product deleted', message: 'Removed from catalogue' });
      qc.invalidateQueries({ queryKey: productsKeys.list() });
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const errorStatus = (productsQuery.error as ApiClientError | null)?.status;
  const isPermissionDenied = errorStatus === 403;

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Package size={18} weight="duotone" />
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push(`/products/${p.id}`)}
              className="block truncate text-sm font-semibold text-[var(--foreground)] hover:text-brand-700"
            >
              {p.name}
            </button>
            {p.description && (
              <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{p.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (p) => (
        <span className="rounded-lg bg-black/5 px-2 py-0.5 font-mono text-xs text-[var(--muted)]">
          {p.sku ?? '—'}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => (
        <Badge
          variant="light"
          color={p.category_id ? 'brand' : 'gray'}
          radius="sm"
          styles={{ label: { textTransform: 'none', fontWeight: 500 } }}
        >
          {p.category_id ? categoryMap.get(p.category_id) ?? '—' : 'Uncategorized'}
        </Badge>
      ),
    },
    {
      key: 'variants',
      header: 'Variants',
      align: 'center',
      render: (p) => (
        <span className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
          <StackSimple size={12} />
          {p.variants.length}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (p) => {
        if (p.variants.length === 0) return <span className="text-[var(--muted)]/40">—</span>;
        const total = p.variants.reduce((s, v) => s + (v.stock_quantity || 0), 0);
        const threshold = Math.min(...p.variants.map((v) => v.low_stock_threshold ?? 5));
        return <StockBar stock={total} threshold={threshold} />;
      },
    },
    {
      key: 'unit_cost',
      header: 'Price',
      align: 'right',
      sortable: true,
      render: (p) => (
        <span className="font-semibold text-[var(--foreground)]">
          {formatPriceUnit(moneyOf(p), p.variants[0]?.unit)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            p.is_active
              ? 'bg-success-50 text-success-700'
              : 'bg-black/5 text-[var(--muted)]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-success-500' : 'bg-[var(--muted)]'}`} />
          {p.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  const rowActions = [
    {
      label: 'View details',
      icon: <Package size={16} />,
      onClick: (p: Product) => router.push(`/products/${p.id}`),
    },
    {
      label: 'Edit',
      icon: <PencilSimple size={16} />,
      onClick: (p: Product) => router.push(`/products/${p.id}/edit`),
    },
    {
      label: 'Delete',
      icon: <TrashSimple size={16} />,
      color: 'red',
      onClick: (p: Product) => {
        if (window.confirm(`Delete "${p.name}"? This does not affect past orders.`)) {
          deleteMutation.mutate(p.id);
        }
      },
    },
  ];

  const hasActiveFilters = !!categoryFilter;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalogue and pricing"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              leftSection={<FileCsv size={16} weight="bold" />}
              onClick={() => setImportOpen(true)}
            >
              Import CSV
            </Button>
            <Button
              leftSection={<Plus size={16} weight="bold" />}
              onClick={() => router.push('/products/new')}
              className="shadow-sm shadow-brand-200"
            >
              New Product
            </Button>
          </div>
        }
      />

      <ProductsImportModal opened={importOpen} onClose={() => setImportOpen(false)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProductStatCard
          icon={<Package size={22} weight="bold" />}
          label="Total products"
          value={stats.total}
          color="bg-brand-50 text-brand-600"
        />
        <ProductStatCard
          icon={<TrendUp size={22} weight="bold" />}
          label="Active"
          value={stats.active}
          color="bg-success-50 text-success-600"
        />
        <ProductStatCard
          icon={<Tag size={22} weight="bold" />}
          label="Categories"
          value={allCategories.length}
          color="bg-accent-50 text-accent-600"
        />
        <ProductStatCard
          icon={<CurrencyDollar size={22} weight="bold" />}
          label="Avg. price"
          value={formatMoney(stats.avgPrice)}
          color="bg-brand-50 text-brand-600"
        />
      </div>

      {categoryStats.length > 0 && (
        <div>
          <Text fw={600} size="sm" mb="sm" c="var(--foreground)">Categories</Text>
          <div className="flex flex-wrap gap-2">
            {categoryStats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  categoryFilter === cat.id
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="text-xs">{cat.name}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or SKU…"
          filterDefs={[
            {
              type: 'select',
              key: 'category',
              label: 'Category',
              placeholder: 'All categories',
              options: (allCategories).map((c) => ({
                value: c.id,
                label: c.name,
              })),
            },
          ]}
          filterValues={{ category: categoryFilter }}
          onFiltersChange={(f) => setCategoryFilter((f.category as string | null) ?? null)}
          onClear={() => {
            setSearch('');
            setCategoryFilter(null);
            setPage(1);
          }}
          hasActiveFilters={hasActiveFilters}
        />

        <DataTable
          columns={columns}
          data={paged}
          loading={productsQuery.isLoading}
          error={productsQuery.isError}
          retry={() => productsQuery.refetch()}
          isPermissionDenied={isPermissionDenied}
          sortState={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          rowActions={rowActions}
          getRowId={(p) => p.id}
          minWidth={860}
          emptyTitle="No products found"
          emptyDescription={
            search || categoryFilter
              ? 'Try adjusting your filters.'
              : 'Create your first product to get started.'
          }
        />

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
