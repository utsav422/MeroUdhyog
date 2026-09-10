'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  Group,
  Modal,
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
import { useRoles, rolesKeys, PERMISSIONS } from '../api';
import type { Role } from '../api';
import { roleFormSchema } from '../schema';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((p) => p !== value) : [...list, value];
}

export default function RolesPage() {
  const qc = useQueryClient();
  const rolesQuery = useRoles();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const form = useForm({
    validate: schemaResolver(roleFormSchema),
    initialValues: {
      name: '',
      code: '',
      description: '',
    },
  });
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: (values: { name: string; code: string; description: string; permissions: string[] }) =>
      apiClient.post<Role>('/roles', {
        name: values.name,
        code: values.code,
        description: values.description || null,
        permissions: values.permissions,
      }),
    onSuccess: (_data, variables) => {
      notifications.show({ color: 'success', title: 'Role created', message: variables.name });
      qc.invalidateQueries({ queryKey: rolesKeys.list() });
      setCreateOpen(false);
      form.reset();
      setFormPermissions([]);
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Create failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: ({ role, permissions }: { role: Role; permissions: string[] }) =>
      apiClient.patch<Role>(`/roles/${role.id}`, { permissions }),
    onSuccess: () => {
      notifications.show({ color: 'success', title: 'Permissions updated', message: 'Role updated' });
      qc.invalidateQueries({ queryKey: rolesKeys.list() });
      setEditRole(null);
      setEditPermissions([]);
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/roles/${id}`),
    onSuccess: (_d, id) => {
      notifications.show({ color: 'success', title: 'Role deleted', message: 'Removed from tenant' });
      qc.invalidateQueries({ queryKey: rolesKeys.list() });
      void id;
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const filtered = useMemo(() => {
    let rows = [...(rolesQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.code.toLowerCase().includes(needle) ||
          (r.description ?? '').toLowerCase().includes(needle),
      );
    }
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort(
      (a, b) =>
        String(a[sort.field as keyof Role] ?? '').localeCompare(
          String(b[sort.field as keyof Role] ?? ''),
        ) * dir,
    );
    return rows;
  }, [rolesQuery.data, search, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: 'Role',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-800">{r.name}</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{r.code}</span>
          {r.is_system && <StatusBadge status="active" label="System" />}
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (r) => (
        <Text size="sm" c="dimmed">
          {r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'}
        </Text>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} />,
    },
  ];

  const rowActions = [
    {
      label: 'Edit permissions',
      icon: <Plus size={16} />,
      onClick: (r: Role) => {
        setEditRole(r);
        setEditPermissions(r.permissions);
      },
    },
    {
      label: 'Delete',
      icon: <TrashSimple size={16} />,
      color: 'red' as const,
      onClick: (r: Role) => {
        if (r.is_system) {
          notifications.show({
            color: 'warning',
            title: 'Cannot delete',
            message: 'System roles have fixed permissions and cannot be deleted.',
          });
          return;
        }
        deleteMutation.mutate(r.id);
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Roles"
        subtitle="Tenant-defined roles and permissions. Users select from these roles."
        actions={
          <Button
            leftSection={<Plus size={16} weight="bold" />}
            onClick={() => {
              form.reset();
              setFormPermissions([]);
              setCreateOpen(true);
            }}
          >
            Add Role
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search roles…"
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
        hasActiveFilters={false}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={rolesQuery.isLoading}
        error={rolesQuery.isError}
        retry={() => rolesQuery.refetch()}
        isPermissionDenied={(rolesQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        rowActions={rowActions}
        getRowId={(r) => r.id}
        minWidth={700}
        emptyTitle="No roles found"
        emptyDescription="Add your first role to define permissions."
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
        opened={createOpen}
        onClose={() => {
          setCreateOpen(false);
          form.reset();
          setFormPermissions([]);
        }}
        title="Add Role"
        position="right"
        size="md"
      >
        <form
          onSubmit={form.onSubmit((values) =>
            createMutation.mutate({ ...values, permissions: formPermissions }),
          )}
        >
          <Stack gap="md">
            <TextInput label="Name" required placeholder="e.g. Sales Rep" {...form.getInputProps('name')} />
            <TextInput
              label="Code"
              required
              placeholder="e.g. sales_rep"
              {...form.getInputProps('code')}
              onChange={(e) => form.setFieldValue('code', e.currentTarget.value.toLowerCase())}
            />
            <TextInput label="Description" placeholder="Short description" {...form.getInputProps('description')} />
            <div>
              <Text size="sm" fw={500} mb="xs">
                Permissions
              </Text>
              <Stack gap="xs">
                {PERMISSIONS.map((perm) => (
                  <Checkbox
                    key={perm.value}
                    label={perm.label}
                    checked={formPermissions.includes(perm.value)}
                    onChange={() => setFormPermissions((p) => toggle(p, perm.value))}
                  />
                ))}
              </Stack>
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Add role
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>

      <Modal
        opened={!!editRole}
        onClose={() => {
          setEditRole(null);
          setEditPermissions([]);
        }}
        title={`Edit permissions — ${editRole?.name ?? ''}`}
      >
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            System roles have fixed permissions and cannot be edited.
          </Text>
          {PERMISSIONS.map((perm) => (
            <Checkbox
              key={perm.value}
              label={perm.label}
              disabled={editRole?.is_system}
              checked={editPermissions.includes(perm.value)}
              onChange={() => setEditPermissions((p) => toggle(p, perm.value))}
            />
          ))}
          {editRole && (
            <Button
              mt="md"
              disabled={editRole.is_system}
              loading={updatePermissionsMutation.isPending}
              onClick={() =>
                updatePermissionsMutation.mutate({ role: editRole, permissions: editPermissions })
              }
            >
              Save permissions
            </Button>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
