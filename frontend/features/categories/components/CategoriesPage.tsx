'use client';

import { useMemo, useState } from 'react';
import { Button, Drawer, Group, Stack, TextInput, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm, schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { useCategories, categoriesKeys } from '../api';
import type { Category } from '../api';
import { categoryFormSchema } from '../schema';

export default function CategoriesPage() {
  const qc = useQueryClient();
  const categoriesQuery = useCategories();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const form = useForm({
    validate: schemaResolver(categoryFormSchema),
    initialValues: {
      name: '',
      description: '',
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ category }: { category: Category }) =>
      apiClient.patch<Category>(`/categories/${category.id}`, {
        is_active: !category.is_active,
      }),
    onSuccess: (_data, vars) => {
      notifications.show({
        color: 'success',
        title: vars.category.is_active ? 'Category deactivated' : 'Category activated',
        message: vars.category.name,
      });
      qc.invalidateQueries({ queryKey: categoriesKeys.list() });
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      apiClient.post<Category>('/categories', {
        name: values.name,
        description: values.description || null,
      }),
    onSuccess: (_data, variables) => {
      notifications.show({
        color: 'success',
        title: 'Category created',
        message: variables.name,
      });
      qc.invalidateQueries({ queryKey: categoriesKeys.list() });
      setDrawerOpen(false);
      form.reset();
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Create failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const filtered = useMemo(() => {
    let rows = [...(categoriesQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.slug.toLowerCase().includes(needle),
      );
    }
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort(
      (a, b) =>
        String(a[sort.field as keyof Category] ?? '').localeCompare(
          String(b[sort.field as keyof Category] ?? ''),
        ) * dir,
    );
    return rows;
  }, [categoriesQuery.data, search, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-800">{c.name}</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
            {c.slug}
          </span>
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (c) => c.description ?? '—' },
    {
      key: 'is_active',
      header: 'Active',
      render: (c) => (
        <Switch
          size="sm"
          checked={c.is_active}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleMutation.mutate({ category: c })}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Group your products into categories. A slug is generated automatically from the name."
        actions={
          <Button
            leftSection={<Plus size={16} weight="bold" />}
            onClick={() => {
              form.reset();
              setDrawerOpen(true);
            }}
          >
            New Category
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search categories…"
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
        hasActiveFilters={false}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={categoriesQuery.isLoading}
        error={categoriesQuery.isError}
        retry={() => categoriesQuery.refetch()}
        isPermissionDenied={(categoriesQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        getRowId={(c) => c.id}
        minWidth={600}
        emptyTitle="No categories found"
        emptyDescription="Create your first category to get started."
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

      <Drawer
        opened={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          form.reset();
        }}
        title="New Category"
        position="right"
        size="md"
      >
        <form
          onSubmit={form.onSubmit((values) => createMutation.mutate(values))}
        >
          <Stack gap="md">
            <TextInput
              label="Name"
              required
              placeholder="e.g. Sauces & Condiments"
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Description"
              placeholder="Short description"
              {...form.getInputProps('description')}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create category
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>
    </div>
  );
}
