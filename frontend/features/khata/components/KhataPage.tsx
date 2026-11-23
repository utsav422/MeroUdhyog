'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Text } from '@mantine/core';
import { BookOpen, Plus } from '@phosphor-icons/react';
import {
  CreditLimitBar,
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
} from '@/components/shared';
import type { Column, SortState, DateRangeValue, Filters } from '@/components/shared';
import { EMPTY_DATE_RANGE, dateRangeToApi } from '@/components/shared';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useCustomers } from '../../customers/api';
import { useKhataCustomers } from '../api';
import type { KhataCustomerSummary } from '../api';

export default function KhataPage() {
  const router = useRouter();
  const customersQuery = useCustomers();
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [balanceFilter, setBalanceFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const dateRange = dateRangeToApi(dateFilter);
  const khataQuery = useKhataCustomers({
    search,
    city: cityFilter,
    balanceStatus: balanceFilter,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  });

  const [sort, setSort] = useState<SortState>({ field: 'customer_name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    for (const customer of customersQuery.data ?? []) {
      if (customer.city?.trim()) cities.add(customer.city.trim());
    }
    return [...cities].sort().map((city) => ({ value: city, label: city }));
  }, [customersQuery.data]);

  const filtered = useMemo(() => {
    const rows = [...(khataQuery.data ?? [])];
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sort.field === 'outstanding') {
        return (Number(a.outstanding) - Number(b.outstanding)) * dir;
      }
      return String(a[sort.field as keyof KhataCustomerSummary] ?? '').localeCompare(
        String(b[sort.field as keyof KhataCustomerSummary] ?? ''),
      ) * dir;
    });
    return rows;
  }, [khataQuery.data, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const columns: Column<KhataCustomerSummary>[] = [
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <BookOpen size={16} weight="duotone" />
          </div>
          <div className="min-w-0">
            <Link
              href={`/khata/${c.customer_id}`}
              className="truncate font-medium text-zinc-800 hover:text-brand-700"
            >
              {c.customer_name}
            </Link>
            <div className="truncate text-xs text-zinc-400">
              {[c.company, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
            </div>
            <div className="truncate text-xs text-zinc-400">
              {[c.city, c.address].filter(Boolean).join(', ') || 'No address'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'order_count',
      header: 'Orders',
      sortable: true,
      render: (c) => <Text size="sm" c="dimmed">{c.order_count}</Text>,
    },
    {
      key: 'total_billed',
      header: 'Billed',
      sortable: true,
      render: (c) => <Text size="sm" className="text-zinc-700">{formatMoney(c.total_billed)}</Text>,
    },
    {
      key: 'total_paid',
      header: 'Paid',
      sortable: true,
      render: (c) => <Text size="sm" className="text-zinc-700">{formatMoney(c.total_paid)}</Text>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      sortable: true,
      render: (c) => {
        const value = Number(c.outstanding);
        if (value < 0) {
          return (
            <Text size="sm" fw={600} className="text-success-700">
              {formatMoney(Math.abs(value))} in credit
            </Text>
          );
        }
        return <Text size="sm" fw={600} className="text-zinc-900">{formatMoney(value)}</Text>;
      },
    },
    {
      key: 'credit_utilization',
      header: 'Credit limit',
      sortable: true,
      render: (c) => <CreditLimitBar figures={c} compact />,
    },
    {
      key: 'last_payment_date',
      header: 'Last payment',
      sortable: true,
      render: (c) =>
        c.last_payment_date ? (
          <div>
            <Text size="sm" className="text-zinc-700">{formatDateTime(c.last_payment_date)}</Text>
            <Text size="xs" c="dimmed">{formatMoney(c.last_payment_amount)}</Text>
          </div>
        ) : (
          <Text size="sm" c="dimmed">No payments yet</Text>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Khata"
        subtitle="Customer ledger — running balances, payments and receipts."
        actions={
          <Button
            leftSection={<Plus size={16} weight="bold" />}
            onClick={() => router.push('/customers')}
          >
            New customer
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by name, phone, company, city…"
        filterDefs={[
          {
            type: 'select' as const,
            key: 'city',
            label: 'City',
            placeholder: 'Any city',
            options: cityOptions,
          },
          {
            type: 'select' as const,
            key: 'balance',
            label: 'Balance',
            placeholder: 'Any balance',
            options: [
              { value: 'outstanding', label: 'Outstanding' },
              { value: 'credit', label: 'In credit' },
              { value: 'settled', label: 'Settled' },
            ],
          },
          {
            type: 'rangedate' as const,
            key: 'range',
            label: 'Last payment',
          },
        ]}
        filterValues={
          {
            city: cityFilter,
            balance: balanceFilter,
            range: dateFilter,
          } as Filters
        }
        onFiltersChange={(filters) => {
          setCityFilter((filters.city as string | null) ?? null);
          setBalanceFilter((filters.balance as string | null) ?? null);
          setDateFilter((filters.range as DateRangeValue) ?? EMPTY_DATE_RANGE);
          setPage(1);
        }}
        onClear={() => {
          setSearch('');
          setCityFilter(null);
          setBalanceFilter(null);
          setDateFilter(EMPTY_DATE_RANGE);
          setPage(1);
        }}
        hasActiveFilters={
          !!search || !!cityFilter || !!balanceFilter || dateFilter.mode !== 'all'
        }
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={khataQuery.isLoading}
        error={khataQuery.isError}
        retry={() => khataQuery.refetch()}
        isPermissionDenied={(khataQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        getRowId={(c) => c.customer_id}
        minWidth={1060}
        emptyTitle="No customers yet"
        emptyDescription="Khata balances appear here as soon as customers place orders."
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
  );
}