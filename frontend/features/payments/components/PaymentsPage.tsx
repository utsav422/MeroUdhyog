'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Text } from '@mantine/core';
import {
  Bank,
  BookOpen,
  CashRegister,
  CreditCard,
  FilePdf,
  HandCoins,
  Receipt,
} from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PageHeader,
  PaginationBar,
  StatusBadge,
} from '@/components/shared';
import type { Column, FilterDef, Filters, RowAction } from '@/components/shared';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { useCustomers } from '../../customers/api';
import { useRoutes } from '../../routes/api';
import { PAYMENT_METHODS, paymentMethodLabel } from '../../khata/constants';
import { usePayments, EMPTY_PAYMENTS_FILTERS } from '../api';
import type { PaymentsFilters } from '../api';
import type { Payment } from '../../khata/api';

const METHOD_ICONS: Record<string, ReactNode> = {
  cash: <CashRegister size={18} weight="duotone" />,
  bank_transfer: <Bank size={18} weight="duotone" />,
  esewa: <CreditCard size={18} weight="duotone" />,
  khalti: <CreditCard size={18} weight="duotone" />,
  other: <HandCoins size={18} weight="duotone" />,
};

function methodIcon(method: string) {
  return METHOD_ICONS[method] ?? <HandCoins size={18} weight="duotone" />;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <Text size="xs" c="dimmed" fw={500}>{label}</Text>
      <Text fw={700} size="xl" className="mt-1 text-zinc-900">{value}</Text>
      {hint && <Text size="xs" c="dimmed" className="mt-0.5">{hint}</Text>}
    </div>
  );
}

export default function PaymentsPage() {
  const router = useRouter();
  const customersQuery = useCustomers();
  const routesQuery = useRoutes();

  const [filters, setFilters] = useState<PaymentsFilters>(EMPTY_PAYMENTS_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const paymentsQuery = usePayments(filters, page, pageSize);

  const customerOptions = useMemo(
    () =>
      (customersQuery.data ?? [])
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [customersQuery.data],
  );
  const routeOptions = useMemo(
    () =>
      (routesQuery.data ?? [])
        .map((r) => ({ value: r.id, label: r.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [routesQuery.data],
  );

  const filterDefs = useMemo<FilterDef[]>(
    () => [
      { type: 'daterange', key: 'dateRange', label: 'Payment date' },
      {
        type: 'select',
        key: 'customerId',
        label: 'Customer',
        placeholder: 'Any customer',
        options: customerOptions,
      },
      {
        type: 'select',
        key: 'routeId',
        label: 'Route',
        placeholder: 'Any route',
        options: routeOptions,
      },
      {
        type: 'select',
        key: 'method',
        label: 'Method',
        placeholder: 'Any method',
        options: PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label })),
      },
      {
        type: 'select',
        key: 'status',
        label: 'Status',
        placeholder: 'Any status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'voided', label: 'Voided' },
        ],
      },
    ],
    [customerOptions, routeOptions],
  );

  const filterValues: Filters = {
    customerId: filters.customerId,
    routeId: filters.routeId,
    method: filters.method,
    status: filters.status,
    dateRange: filters.dateRange,
  };

  const hasActiveFilters =
    !!filters.customerId ||
    !!filters.routeId ||
    !!filters.method ||
    !!filters.status ||
    filters.dateRange.some(Boolean);

  const data = paymentsQuery.data;
  const total = data?.total ?? 0;

  const rowActions: RowAction<Payment>[] = [
    {
      label: 'View receipt',
      icon: <FilePdf size={16} />,
      show: (p) => !!p.receipt_number,
      onClick: (p) => router.push(`/khata/receipts/${p.id}`),
    },
    {
      label: 'Customer ledger',
      icon: <BookOpen size={16} />,
      show: (p) => !!p.customer_id,
      onClick: (p) => router.push(`/khata/${p.customer_id}`),
    },
  ];

  const columns: Column<Payment>[] = [
    {
      key: 'collected_at',
      header: 'Collected',
      render: (p) => (
        <div>
          <Text size="sm" className="text-zinc-700">{formatDateTime(p.collected_at)}</Text>
          {p.receipt_number ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              <Receipt size={12} /> {p.receipt_number}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (p) =>
        p.customer_id && p.customer_name ? (
          <Link
            href={`/khata/${p.customer_id}`}
            className="truncate font-medium text-zinc-800 hover:text-brand-700"
          >
            {p.customer_name}
          </Link>
        ) : (
          <Text size="sm" c="dimmed">—</Text>
        ),
    },
    {
      key: 'orders',
      header: 'Paid to orders',
      render: (p) => {
        const allocs = p.allocations ?? [];
        if (allocs.length === 0) return <Text size="sm" c="dimmed">—</Text>;
        const visible = allocs.slice(0, 3);
        const extra = allocs.length - visible.length;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {visible.map((a) => (
              <Link
                key={a.order_id}
                href={`/orders/${a.order_id}`}
                className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                {a.order_ref ?? 'Order'}
              </Link>
            ))}
            {extra > 0 && (
              <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                +{extra} more
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (
        <span className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <span className="text-[var(--muted)]">{methodIcon(p.method)}</span>
          {paymentMethodLabel(p.method)}
        </span>
      ),
    },
    {
      key: 'collector_name',
      header: 'Collected by',
      render: (p) => <Text size="sm" className="text-zinc-700">{p.collector_name ?? '—'}</Text>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (p) => (
        <Text
          size="sm"
          fw={600}
          className={p.status === 'voided' ? 'text-zinc-400 line-through' : 'text-zinc-900'}
        >
          {formatMoney(p.amount)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Collection history across all customers — every payment applied to orders."
      />

      <FilterBar
        searchValue={filters.search}
        onSearchChange={(v) => {
          setFilters((f) => ({ ...f, search: v }));
          setPage(1);
        }}
        searchPlaceholder="Search by customer, collector or receipt…"
        filterDefs={filterDefs}
        filterValues={filterValues}
        onFiltersChange={(values) => {
          setFilters((f) => ({
            ...f,
            customerId: (values.customerId as string | null) ?? null,
            routeId: (values.routeId as string | null) ?? null,
            method: (values.method as string | null) ?? null,
            status: (values.status as string | null) ?? null,
            dateRange: (values.dateRange as [Date | null, Date | null]) ?? [null, null],
          }));
          setPage(1);
        }}
        onClear={() => {
          setFilters(EMPTY_PAYMENTS_FILTERS);
          setPage(1);
        }}
        hasActiveFilters={hasActiveFilters}
      />

      {!paymentsQuery.isLoading && data && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Collected" value={formatMoney(data.total_amount)} hint="Sum of the payments shown" />
          <StatCard label="Payments" value={formatNumber(total)} hint="Count matching the current filters" />
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={paymentsQuery.isLoading}
        error={paymentsQuery.isError}
        retry={() => paymentsQuery.refetch()}
        isPermissionDenied={(paymentsQuery.error as { status?: number } | undefined)?.status === 403}
        getRowId={(p) => p.id}
        rowActions={rowActions}
        minWidth={960}
        emptyTitle="No payments found"
        emptyDescription="Recorded payments from the khata ledger appear here."
      />

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}