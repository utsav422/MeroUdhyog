'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  ArrowCounterClockwise,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  DataTable,
  PageHeader,
  PaginationBar,
} from '@/components/shared';
import type { Column, SortState } from '@/components/shared';
import { useMe } from '@/features/auth/hooks';
import {
  usePermanentlyDeleteRecoveryItem,
  useRestoreRecoveryItem,
  useRecoveryItems,
} from '../api';
import type { RecoveryEntityType, RecoveryItem } from '../api';

const TABS: { value: RecoveryEntityType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'order', label: 'Orders' },
  { value: 'delivered_order', label: 'Delivered' },
  { value: 'khata', label: 'Khata' },
  { value: 'payment', label: 'Payments' },
  { value: 'product', label: 'Products' },
  { value: 'variant', label: 'Variants' },
  { value: 'staff', label: 'Staff' },
  { value: 'category', label: 'Categories' },
];

const TYPE_LABELS: Record<RecoveryEntityType, string> = {
  customer: 'Customer',
  order: 'Order',
  delivered_order: 'Delivered order',
  khata: 'Khata',
  payment: 'Payment',
  product: 'Product',
  variant: 'Variant',
  staff: 'Staff',
  category: 'Category',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function RecoveryPage() {
  const me = useMe();
  const [tab, setTab] = useState<RecoveryEntityType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'deleted_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toDelete, setToDelete] = useState<RecoveryItem | null>(null);

  const adminScope = Boolean(me.data?.is_superadmin);
  const query = useRecoveryItems(tab === 'all' ? null : tab, search || null, adminScope);
  const restore = useRestoreRecoveryItem();
  const permanentDelete = usePermanentlyDeleteRecoveryItem();

  const rows = useMemo(() => {
    const list = [...(query.data?.items ?? [])];
    const dir = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sort.field as keyof RecoveryItem];
      const bv = b[sort.field as keyof RecoveryItem];
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
    return list;
  }, [query.data?.items, sort]);

  const paged = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  const columns: Column<RecoveryItem>[] = [
    {
      key: 'label',
      header: 'Item',
      sortable: true,
      render: (item) => (
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {item.label}
          </Text>
          <Text size="xs" c="dimmed">
            {Object.values(item.detail ?? {})
              .filter((v) => typeof v === 'string' && v)
              .slice(0, 3)
              .join(' · ')}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'entity_type',
      header: 'Type',
      sortable: true,
      render: (item) => (
        <Badge variant="light">{TYPE_LABELS[item.entity_type] ?? item.entity_type}</Badge>
      ),
    },
    {
      key: 'deleted_at',
      header: 'Deleted',
      sortable: true,
      render: (item) => formatDate(item.deleted_at),
    },
    {
      key: 'expires_at',
      header: 'Recoverable until',
      sortable: true,
      render: (item) => formatDate(item.expires_at),
    },
    {
      key: 'blocked_by',
      header: 'Status',
      render: (item) =>
        item.blocked_by ? (
          <Text size="xs" c="orange">
            {item.blocked_by}
          </Text>
        ) : (
          <Badge color="green" variant="light">
            Ready
          </Badge>
        ),
    },
  ];

  const confirmPermanentDelete = async () => {
    if (!toDelete) return;
    try {
      await permanentDelete.mutateAsync(toDelete.id);
      notifications.show({
        color: 'red',
        title: 'Deleted permanently',
        message: `${toDelete.label} cannot be recovered.`,
      });
      setToDelete(null);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Recovery"
        subtitle="Restored records return to their original page. Regular users can recover for 2 days; backend admins keep records for 7 days."
      />

      <Tabs value={tab} onChange={(value) => { setTab(value as RecoveryEntityType | 'all'); setPage(1); }}>
        <Tabs.List>
          {TABS.map((item) => (
            <Tabs.Tab key={item.value} value={item.value}>
              {item.label}
              {query.data?.counts?.[item.value] ? ` (${query.data.counts[item.value]})` : ''}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <div className="mt-4 mb-3">
        <TextInput
          value={search}
          onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }}
          placeholder="Search recovered records…"
          w={320}
          maxLength={120}
        />
      </div>

      <div>
        <DataTable
          columns={columns}
          data={paged}
          loading={query.isLoading}
          error={query.isError}
          retry={() => query.refetch()}
          isPermissionDenied={(query.error as { status?: number } | undefined)?.status === 403}
          sortState={sort}
          onSortChange={(next) => { setSort(next); setPage(1); }}
          getRowId={(item) => item.id}
          minWidth={900}
          emptyTitle="Nothing in recovery"
          emptyDescription="Deleted customers, orders, khata entries and catalog records appear here."
          rowActions={[
            {
              label: 'Restore',
              icon: <ArrowCounterClockwise size={16} />,
              color: 'green',
              show: (item) => item.can_restore,
              onClick: async (item) => {
                try {
                  await restore.mutateAsync(item.id);
                  notifications.show({
                    color: 'success',
                    title: 'Restored',
                    message: `${item.label} is back in the app.`,
                  });
                } catch (error) {
                  notifications.show({
                    color: 'red',
                    title: 'Restore failed',
                    message: error instanceof Error ? error.message : 'Something went wrong',
                  });
                }
              },
            },
            {
              label: 'Delete permanently',
              icon: <Trash size={16} />,
              color: 'red',
              show: (item) => item.can_restore,
              onClick: (item) => setToDelete(item),
            },
          ]}
        />
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal
        opened={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete permanently?"
        centered
      >
        <Stack gap="sm">
          <Alert color="red" icon={<WarningCircle size={18} />}>
            This will permanently remove <b>{toDelete?.label}</b> and everything that depends on it.
            This action cannot be undone.
          </Alert>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button color="red" loading={permanentDelete.isPending} onClick={confirmPermanentDelete}>
              Delete permanently
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
