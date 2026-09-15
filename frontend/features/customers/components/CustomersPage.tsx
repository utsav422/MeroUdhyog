'use client';

import { useMemo, useState } from 'react';
import { Button, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { Plus, PencilSimple, Package, FileCsv } from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { formatMoney } from '@/lib/format';
import CustomersImportModal from './CustomersImportModal';
import { useCustomers } from '../api';
import type { Customer } from '../api';

export default function CustomersPage() {
  const router = useRouter();
  const customersQuery = useCustomers();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = [...(customersQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.company ?? '').toLowerCase().includes(needle) ||
          (c.city ?? '').toLowerCase().includes(needle),
      );
    }
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.field as keyof Customer] ?? '';
      const bv = b[sort.field as keyof Customer] ?? '';
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [customersQuery.data, search, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/customers/${c.id}`)}
            className="text-left font-medium text-zinc-800 hover:text-brand-700"
          >
            {c.name}
            {c.company ? <div className="text-xs font-normal text-zinc-400">{c.company}</div> : null}
          </button>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (c) => (
        <div className="text-sm">
          <div>{c.email || '—'}</div>
          {c.phone && <div className="text-xs text-zinc-400">{c.phone}</div>}
        </div>
      ),
    },
    { key: 'city', header: 'City', sortable: true, render: (c) => c.city || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            c.is_active
              ? 'bg-success-50 text-success-700'
              : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${c.is_active ? 'bg-success-500' : 'bg-zinc-400'}`} />
          {c.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  const rowActions = [
    {
      label: 'View details',
      icon: <Package size={16} />,
      onClick: (c: Customer) => router.push(`/customers/${c.id}`),
    },
    {
      label: 'Edit',
      icon: <PencilSimple size={16} />,
      onClick: (c: Customer) => router.push(`/customers/${c.id}/edit`),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        subtitle="Manage customers and their custom pricing"
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
              onClick={() => router.push('/customers/new')}
              className="shadow-sm shadow-brand-200"
            >
              New Customer
            </Button>
          </div>
        }
      />

      <CustomersImportModal opened={importOpen} onClose={() => setImportOpen(false)} />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customers…"
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={customersQuery.isLoading}
        error={customersQuery.isError}
        retry={() => customersQuery.refetch()}
        isPermissionDenied={(customersQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        rowActions={rowActions}
        getRowId={(c) => c.id}
        minWidth={700}
        emptyTitle="No customers found"
        emptyDescription="Create your first customer to get started."
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
