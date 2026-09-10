'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm, schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrashSimple } from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { useRoutes, routesKeys } from '../api';
import type { Route } from '../api';
import { useUsers } from '../../staff/api';
import { routeFormSchema } from '../schema';

export default function RoutesPage() {
  const qc = useQueryClient();
  const routesQuery = useRoutes();
  const usersQuery = useUsers();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const form = useForm({
    validate: schemaResolver(routeFormSchema),
    initialValues: {
      name: '',
      cities: '',
      description: '',
      agent_id: '',
    },
  });

  const agents = useMemo(() => {
    const list = usersQuery.data ?? [];
    return list.filter((u) => u.role === 'delivery' && u.is_active);
  }, [usersQuery.data]);

  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.full_name);
    return map;
  }, [agents]);

  const createMutation = useMutation({
    mutationFn: (values: { name: string; cities: string; description: string; agent_id: string }) =>
      apiClient.post<Route>('/routes', {
        name: values.name,
        description: values.description || null,
        cities: values.cities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        agent_ids: values.agent_id ? [values.agent_id] : [],
      }),
    onSuccess: (_data, variables) => {
      notifications.show({ color: 'success', title: 'Route created', message: variables.name });
      qc.invalidateQueries({ queryKey: routesKeys.list() });
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/routes/${id}`),
    onSuccess: () => {
      notifications.show({ color: 'success', title: 'Route deleted', message: 'Removed from tenant' });
      qc.invalidateQueries({ queryKey: routesKeys.list() });
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const filtered = useMemo(() => {
    let rows = [...(routesQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.cities.some((c) => c.toLowerCase().includes(needle)),
      );
    }
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort(
      (a, b) =>
        String(a[sort.field as keyof Route] ?? '').localeCompare(
          String(b[sort.field as keyof Route] ?? ''),
        ) * dir,
    );
    return rows;
  }, [routesQuery.data, search, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const columns: Column<Route>[] = [
    { key: 'name', header: 'Route', sortable: true, render: (r) => <span className="font-medium text-zinc-800">{r.name}</span> },
    { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
    { key: 'cities', header: 'Cities', render: (r) => r.cities.join(', ') || '—' },
    {
      key: 'agents',
      header: 'Agents',
      render: (r) =>
        r.agent_ids.filter((id) => agentMap.has(id)).map((id) => agentMap.get(id)).join(', ') || '—',
    },
    { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ];

  const rowActions = [
    {
      label: 'Delete',
      icon: <TrashSimple size={16} />,
      color: 'red' as const,
      onClick: (r: Route) => deleteMutation.mutate(r.id),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Delivery Routes"
        subtitle="Define routes by city and assign delivery agents. Orders route to an agent automatically based on the customer's city."
        actions={
          <Button
            leftSection={<Plus size={16} weight="bold" />}
            onClick={() => {
              form.reset();
              setDrawerOpen(true);
            }}
          >
            Add Route
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search routes…"
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
        hasActiveFilters={false}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={routesQuery.isLoading}
        error={routesQuery.isError}
        retry={() => routesQuery.refetch()}
        isPermissionDenied={(routesQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        rowActions={rowActions}
        getRowId={(r) => r.id}
        minWidth={800}
        emptyTitle="No routes found"
        emptyDescription="Add your first route to start assigning deliveries."
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
        title="Add Route"
        position="right"
        size="md"
      >
        <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack gap="md">
            <TextInput label="Name" required placeholder="e.g. Kathmandu Valley" {...form.getInputProps('name')} />
            <TextInput
              label="Cities (comma separated)"
              placeholder="e.g. Kathmandu, Lalitpur"
              {...form.getInputProps('cities')}
            />
            <TextInput label="Description" placeholder="Short description" {...form.getInputProps('description')} />
            {agents.length > 0 ? (
              <Select
                label="Delivery agent"
                placeholder="No agent"
                clearable
                data={agents.map((a) => ({ value: a.id, label: a.full_name }))}
                {...form.getInputProps('agent_id')}
              />
            ) : (
              <Text size="sm" c="dimmed">
                No active delivery agents yet. Add a delivery agent under Staff.
              </Text>
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Add route
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>
    </div>
  );
}
