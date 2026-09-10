'use client';

import { useMemo, useState } from 'react';
import { Button, Drawer, Group, Select, Stack, Switch, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';
import { schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, PencilSimple } from '@phosphor-icons/react';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  PageHeader,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useUsers, staffKeys } from '../api';
import type { User } from '../api';
import { staffFormSchema, ROLES } from '../schema';
import { useRoles } from '../../roles/api';

function roleTone(role: string): string {
  if (role === 'admin' || role === 'owner') return 'bg-warning-50 text-warning-600';
  if (role === 'manager') return 'bg-brand-soft text-brand-700';
  if (role === 'accountant' || role === 'delivery' || role === 'worker') return 'bg-info-50 text-info-600';
  return 'bg-zinc-100 text-zinc-500';
}

export default function StaffPage() {
  const qc = useQueryClient();
  const usersQuery = useUsers();
  const rolesQuery = useRoles();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ field: 'full_name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const form = useForm({
    validate: schemaResolver(staffFormSchema),
    initialValues: {
      full_name: '',
      email: '',
      role: 'staff',
      password: '',
    },
  });

  const filtered = useMemo(() => {
    let rows = [...(usersQuery.data ?? [])];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter(
        (u) =>
          u.full_name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      );
    }
    if (roleFilter) rows = rows.filter((u) => u.role === roleFilter);
    const dir = sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => String(a[sort.field as keyof User] ?? '').localeCompare(String(b[sort.field as keyof User] ?? '')) * dir);
    return rows;
  }, [usersQuery.data, search, roleFilter, sort]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const roleOptions = useMemo(() => {
    const fromApi = (rolesQuery.data ?? []).map((r) => ({ value: r.code, label: r.name }));
    return fromApi.length > 0 ? fromApi : ROLES;
  }, [rolesQuery.data]);

  const openCreate = () => {
    setEditing(null);
    form.reset();
    form.setValues({ role: 'staff' });
    setDrawerOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    form.setValues({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      password: '',
    });
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form.values) => {
      if (editing) {
        await apiClient.patch(`/users/${editing.id}`, {
          full_name: values.full_name,
          role: values.role,
        });
      } else {
        await apiClient.post('/users', {
          full_name: values.full_name,
          email: values.email,
          role: values.role,
          password: values.password,
        });
      }
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: editing ? 'Staff updated' : 'Staff added',
        message: form.values.full_name,
      });
      qc.invalidateQueries({ queryKey: staffKeys.all });
      setDrawerOpen(false);
      form.reset();
      setEditing(null);
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ user, is_active }: { user: User; is_active: boolean }) => {
      await apiClient.patch(`/users/${user.id}`, { is_active });
    },
    onSuccess: (_d, vars) => {
      notifications.show({
        color: 'success',
        title: vars.is_active ? 'User activated' : 'User deactivated',
        message: vars.user.full_name,
      });
      qc.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const columns: Column<User>[] = [
    {
      key: 'full_name',
      header: 'Name',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-700">
            {u.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-zinc-800">{u.full_name}</div>
            <div className="text-xs text-zinc-400">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${roleTone(u.role)}`}>
          {u.role}
        </span>
      ),
    },
    { key: 'created_at', header: 'Joined', sortable: true, render: (u) => formatDate(u.created_at) },
    {
      key: 'is_active',
      header: 'Active',
      render: (u) => (
        <Switch
          size="sm"
          checked={u.is_active}
          onChange={(e) => toggleActiveMutation.mutate({ user: u, is_active: e.currentTarget.checked })}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
  ];

  const rowActions = [
    {
      label: 'Edit',
      icon: <PencilSimple size={16} />,
      onClick: (u: User) => openEdit(u),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Manage team members and their roles"
        actions={
          <Button leftSection={<Plus size={16} weight="bold" />} onClick={openCreate}>
            Add Staff
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search staff…"
        filterDefs={[
          {
            type: 'select',
            key: 'role',
            label: 'Role',
            placeholder: 'All roles',
            options: roleOptions,
          },
        ]}
        filterValues={{ role: roleFilter }}
        onFiltersChange={(f) => setRoleFilter((f.role as string | null) ?? null)}
        onClear={() => {
          setSearch('');
          setRoleFilter(null);
          setPage(1);
        }}
        hasActiveFilters={!!roleFilter}
      />

      <DataTable
        columns={columns}
        data={paged}
        loading={usersQuery.isLoading}
        error={usersQuery.isError}
        retry={() => usersQuery.refetch()}
        isPermissionDenied={(usersQuery.error as { status?: number } | undefined)?.status === 403}
        sortState={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        rowActions={rowActions}
        getRowId={(u) => u.id}
        minWidth={700}
        emptyTitle="No staff found"
        emptyDescription="Add your first staff member to get started."
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
          setEditing(null);
        }}
        title={editing ? 'Edit Staff' : 'Add Staff'}
        position="right"
        size="md"
      >
        <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
          <Stack gap="md">
            <TextInput label="Full name" required placeholder="Full name" {...form.getInputProps('full_name')} />
            <TextInput label="Email" required placeholder="email@company.com" {...form.getInputProps('email')} disabled={!!editing} />
            {!editing && (
              <TextInput
                label="Temporary password"
                required
                type="password"
                placeholder="Min 8 characters"
                {...form.getInputProps('password')}
              />
            )}
            <Select
              label="Role"
              data={roleOptions}
              {...form.getInputProps('role')}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {editing ? 'Save changes' : 'Add staff'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>
    </div>
  );
}
