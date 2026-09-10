'use client';

import { useMemo, useState } from 'react';
import { Button, Menu, Modal, Select, Stack, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, MapPin, UserCirclePlus, CaretDown, Package, UsersThree } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { formatDateTime } from '@/lib/format';
import { useDeliveries, deliveriesKeys, useBulkAssignDelivery, DELIVERY_STATUSES } from '../api';
import type { Delivery } from '../api';
import { ordersKeys } from '../../orders/api';
import { useUsers } from '../../staff/api';
import { useRoutes } from '../../routes/api';

const ASSIGN_ACTION_STATUSES = ['pending_assignment'];
const NEXT_ACTIONS: Record<string, { label: string; status: string }> = {
  assigned: { label: 'Mark picked up', status: 'picked_up' },
  picked_up: { label: 'Start transit', status: 'in_transit' },
};

export default function DeliveriesPage() {
  const qc = useQueryClient();
  const routesQuery = useRoutes();
  const usersQuery = useUsers();

  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const deliveriesQuery = useDeliveries(activeRoute);
  const bulkAssignMutation = useBulkAssignDelivery();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ field: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [assignTarget, setAssignTarget] = useState<Delivery | null>(null);
  const [assignAgentId, setAssignAgentId] = useState<string | null>(null);
  const [bulkRouteTarget, setBulkRouteTarget] = useState<string | null>(null);
  const [bulkRouteAgentId, setBulkRouteAgentId] = useState<string | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<Delivery | null>(null);
  const [failedTarget, setFailedTarget] = useState<Delivery | null>(null);
  const [proofNotes, setProofNotes] = useState('');

  const deliveryAgents = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.role === 'delivery'),
    [usersQuery.data],
  );

  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u.full_name);
    return map;
  }, [usersQuery.data]);

  const routesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of routesQuery.data ?? []) map.set(r.id, r.name);
    return map;
  }, [routesQuery.data]);

  const routePendingMenuTargets = useMemo(() => {
    if (!activeRoute) return null;
    return {
      routeId: activeRoute,
      name: routesById.get(activeRoute) ?? 'this route',
      count: (deliveriesQuery.data ?? []).filter(
        (d) => d.route_id === activeRoute && d.status === 'pending_assignment',
      ).length,
    };
  }, [activeRoute, deliveriesQuery.data, routesById]);

  const filtered = useMemo(() => {
    let rows = [...(deliveriesQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (d) =>
          (d.order_ref ?? '').toLowerCase().includes(needle) ||
          (d.customer_name ?? '').toLowerCase().includes(needle) ||
          (d.delivery_address ?? '').toLowerCase().includes(needle),
      );
    }
    if (statusFilter) rows = rows.filter((d) => d.status === statusFilter);
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => String(a[sort.field as keyof Delivery] ?? '').localeCompare(String(b[sort.field as keyof Delivery] ?? '')) * dir);
    return rows;
  }, [deliveriesQuery.data, search, statusFilter, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const assignMutation = useMutation({
    mutationFn: async ({ delivery, agentId }: { delivery: Delivery; agentId: string }) => {
      await apiClient.patch(`/deliveries/${delivery.id}/assign`, { delivery_agent_id: agentId });
    },
    onSuccess: () => {
      notifications.show({ color: 'success', title: 'Delivery assigned', message: 'Agent updated' });
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
      // Assigning a pending delivery moves the linked order into the flow too.
      qc.invalidateQueries({ queryKey: ordersKeys.all });
      setAssignTarget(null);
      setAssignAgentId(null);
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Assign failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ delivery, status, notes }: { delivery: Delivery; status: string; notes?: string }) => {
      await apiClient.patch(`/deliveries/${delivery.id}`, {
        status,
        ...(status === 'delivered' || status === 'failed' ? { proof_notes: notes || null } : {}),
      });
    },
    onSuccess: (_data, vars) => {
      notifications.show({ color: 'success', title: `Marked ${vars.status.replace(/_/g, ' ')}`, message: 'Status updated' });
      qc.invalidateQueries({ queryKey: deliveriesKeys.all });
      setDeliverTarget(null);
      setFailedTarget(null);
      setProofNotes('');
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const applyRouteBulkAssign = () => {
    if (!bulkRouteTarget || !bulkRouteAgentId) return;
    const routeId = bulkRouteTarget;
    const ids = (deliveriesQuery.data ?? [])
      .filter((d) => d.route_id === routeId && d.status === 'pending_assignment')
      .map((d) => d.id);
    if (ids.length === 0) {
      notifications.show({
        color: 'yellow',
        title: 'Nothing to assign',
        message: 'No pending deliveries on this route',
      });
      setBulkRouteTarget(null);
      setBulkRouteAgentId(null);
      return;
    }
    bulkAssignMutation.mutate(
      { deliveryIds: ids, agentId: bulkRouteAgentId },
      {
        onSuccess: (res) => {
          notifications.show({
            color: 'success',
            title: 'Route assigned',
            message: `Assigned ${res.assigned} delivery${res.assigned === 1 ? '' : 's'}${
              res.skipped.length > 0 ? ` · skipped ${res.skipped.length}` : ''
            } to one agent`,
          });
          setBulkRouteTarget(null);
          setBulkRouteAgentId(null);
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Assign failed',
            message: error instanceof Error ? error.message : 'Something went wrong',
          }),
      },
    );
  };

  const renderActions = (d: Delivery) => {
    const assignable = ASSIGN_ACTION_STATUSES.includes(d.status);
    const next = NEXT_ACTIONS[d.status];
    const deliverable = d.status === 'in_transit';
    const failable = ['assigned', 'picked_up', 'in_transit'].includes(d.status);
    if (!assignable && !next && !deliverable && !failable) return null;
    return (
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <Button size="xs" variant="default" rightSection={<CaretDown size={14} />}>
            Actions
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {assignable && (
            <Menu.Item leftSection={<UserCirclePlus size={16} />} onClick={() => setAssignTarget(d)}>
              Assign agent
            </Menu.Item>
          )}
          {next && (
            <Menu.Item leftSection={<Package size={16} />} onClick={() => statusMutation.mutate({ delivery: d, status: next.status })}>
              {next.label}
            </Menu.Item>
          )}
          {deliverable && (
            <Menu.Item leftSection={<MapPin size={16} />} color="green" onClick={() => setDeliverTarget(d)}>
              Mark delivered
            </Menu.Item>
          )}
          {failable && (
            <Menu.Item leftSection={<MapPin size={16} />} color="red" onClick={() => setFailedTarget(d)}>
              Mark failed
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    );
  };

  const columns: Column<Delivery>[] = [
    { key: 'order_ref', header: 'Order #', sortable: true, render: (d) => d.order_ref ?? '—' },
    {
      key: 'route',
      header: 'Route',
      render: (d) =>
        d.route_id ? (
          <span className="inline-flex items-center rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {routesById.get(d.route_id) ?? '—'}
          </span>
        ) : (
          <span className="text-zinc-300">—</span>
        ),
    },
    { key: 'customer', header: 'Customer', render: (d) => d.customer_name ?? '—' },
    {
      key: 'agent',
      header: 'Agent',
      render: (d) => (d.delivery_agent_id ? agentMap.get(d.delivery_agent_id) ?? '—' : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: 'assigned_at',
      header: 'Assigned',
      render: (d) => (d.assigned_at ? formatDateTime(d.assigned_at) : '—'),
    },
    {
      key: 'delivered_at',
      header: 'Delivered',
      render: (d) => (d.delivered_at ? formatDateTime(d.delivered_at) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => renderActions(d),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Track orders from dispatch to delivery"
        actions={
          <Button leftSection={<Truck size={16} />} onClick={() => deliveriesQuery.refetch()}>
            Refresh
          </Button>
        }
      />

      <Tabs
        value={activeRoute ?? 'all'}
        onChange={(v) => {
          setActiveRoute(v === 'all' ? null : v);
          setPage(1);
          setBulkRouteAgentId(null);
        }}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="all">All routes</Tabs.Tab>
          {(routesQuery.data ?? []).map((r) => (
            <Tabs.Tab key={r.id} value={r.id}>
              {r.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {routePendingMenuTargets && routePendingMenuTargets.count > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3">
          <Text size="sm" fw={600} className="text-brand-800">
            {routePendingMenuTargets.count} pending delivery
            {routePendingMenuTargets.count === 1 ? '' : 's'} on {routePendingMenuTargets.name}
          </Text>
          <Select
            size="xs"
            w={220}
            placeholder="Assign one agent to all…"
            searchable
            data={deliveryAgents.map((u) => ({ value: u.id, label: u.full_name }))}
            value={bulkRouteAgentId}
            onChange={setBulkRouteAgentId}
          />
          <Button
            size="xs"
            leftSection={<UsersThree size={14} />}
            loading={bulkAssignMutation.isPending}
            disabled={!bulkRouteAgentId}
            onClick={() => setBulkRouteTarget(routePendingMenuTargets.routeId)}
          >
            Assign route
          </Button>
        </div>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search deliveries…"
        filterDefs={[
          {
            type: 'select',
            key: 'status',
            label: 'Status',
            placeholder: 'All statuses',
            options: DELIVERY_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
          },
        ]}
        filterValues={{ status: statusFilter }}
        onFiltersChange={(f) => setStatusFilter((f.status as string | null) ?? null)}
        onClear={() => {
          setSearch('');
          setStatusFilter(null);
          setPage(1);
        }}
        hasActiveFilters={!!statusFilter}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={deliveriesQuery.isLoading}
        error={deliveriesQuery.isError}
        retry={() => deliveriesQuery.refetch()}
        isPermissionDenied={(deliveriesQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        getRowId={(d) => d.id}
        minWidth={900}
        emptyTitle="No deliveries found"
        emptyDescription="Deliveries appear once an order is placed."
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

      <Modal
        opened={!!assignTarget}
        onClose={() => {
          setAssignTarget(null);
          setAssignAgentId(null);
        }}
        title={`Assign ${assignTarget?.order_ref ?? 'delivery'}`}
      >
        <Stack gap="md">
          <Select
            label="Delivery agent"
            placeholder="Select agent"
            searchable
            data={deliveryAgents.map((u) => ({ value: u.id, label: u.full_name }))}
            value={assignAgentId}
            onChange={setAssignAgentId}
          />
          <Button
            disabled={!assignAgentId}
            loading={assignMutation.isPending}
            onClick={() =>
              assignTarget && assignAgentId && assignMutation.mutate({ delivery: assignTarget, agentId: assignAgentId })
            }
          >
            Assign
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={!!bulkRouteTarget}
        onClose={() => {
          setBulkRouteTarget(null);
          setBulkRouteAgentId(null);
        }}
        title="Assign whole route to one agent"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Assign every pending delivery on this route to a single delivery
            agent. Deliveries already assigned are left untouched.
          </Text>
          <Select
            label="Delivery agent"
            placeholder="Select agent"
            searchable
            data={deliveryAgents.map((u) => ({ value: u.id, label: u.full_name }))}
            value={bulkRouteAgentId}
            onChange={setBulkRouteAgentId}
          />
          <Button
            disabled={!bulkRouteAgentId}
            loading={bulkAssignMutation.isPending}
            onClick={applyRouteBulkAssign}
          >
            Assign route
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={!!deliverTarget}
        onClose={() => {
          setDeliverTarget(null);
          setProofNotes('');
        }}
        title={`Mark ${deliverTarget?.order_ref ?? ''} delivered`}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Confirm the delivery has been completed. You can add proof notes below.
          </Text>
          <Textarea
            label="Proof notes"
            placeholder="Optional notes, signature or photo reference"
            value={proofNotes}
            onChange={(e) => setProofNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Button
            color="green"
            loading={statusMutation.isPending}
            onClick={() => deliverTarget && statusMutation.mutate({ delivery: deliverTarget, status: 'delivered', notes: proofNotes })}
          >
            Confirm delivered
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={!!failedTarget}
        onClose={() => {
          setFailedTarget(null);
          setProofNotes('');
        }}
        title={`Mark ${failedTarget?.order_ref ?? ''} failed`}
      >
        <Stack gap="md">
          <Textarea
            label="Reason"
            placeholder="Reason for failed delivery"
            value={proofNotes}
            onChange={(e) => setProofNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Button
            color="red"
            loading={statusMutation.isPending}
            onClick={() => failedTarget && statusMutation.mutate({ delivery: failedTarget, status: 'failed', notes: proofNotes })}
          >
            Mark failed
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
