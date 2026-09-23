'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  Bicycle,
  ChartLine,
  Check,
  CurrencyInr,
  Package,
  Receipt,
  Sparkle,
} from '@phosphor-icons/react';
import {
  notificationCategoryLabels,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useSyncNotificationsWithCount,
  useUnreadCount,
  type AppNotification,
} from '@/features/notifications/api';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  stock: <Package size={16} />,
  order: <Receipt size={16} />,
  delivery: <Bicycle size={16} />,
  payment: <CurrencyInr size={16} />,
  prediction: <ChartLine size={16} />,
  system: <Sparkle size={16} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  stock: 'yellow',
  order: 'brand',
  delivery: 'violet',
  payment: 'green',
  prediction: 'grape',
  system: 'gray',
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function groupLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(today) - startOfDay(date)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

function NotificationCard({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
}) {
  const label = notificationCategoryLabels[notification.category] ?? 'System';
  const icon = CATEGORY_ICONS[notification.category] ?? CATEGORY_ICONS.system;
  const color = CATEGORY_COLORS[notification.category] ?? 'gray';

  return (
    <UnstyledButton
      onClick={() => onOpen(notification)}
      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
        notification.is_read
          ? 'border-zinc-200/80 bg-white'
          : 'border-brand-200 bg-brand-50/60'
      }`}
    >
      <Group justify="space-between" align="flex-start" gap="sm">
        <Group gap={8}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: `var(--mantine-color-${color}-6)` }}
          >
            {icon}
          </div>
          <Text size="xs" fw={600} c="dimmed" className="uppercase tracking-wide">
            {label}
          </Text>
        </Group>
        <Group gap={6} align="center">
          {!notification.is_read && <Badge size="xs" color="brand" variant="filled" />}
          <Text size="xs" c="dimmed" className="shrink-0">
            {formatTime(notification.created_at)}
          </Text>
        </Group>
      </Group>
      <Text size="sm" fw={600} mt={6} lh={1.35}>
        {notification.title}
      </Text>
      {notification.message && (
        <Text size="xs" c="dimmed" mt={2} lh={1.5} className="line-clamp-2">
          {notification.message}
        </Text>
      )}
    </UnstyledButton>
  );
}

export function NotificationsDrawer({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: notifications = [], isLoading } = useNotifications(100);
  const { data: unread = { count: 0 } } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  // New alerts appear in the open drawer the moment the badge count moves.
  useSyncNotificationsWithCount(unread.count);

  const grouped = useMemo(() => {
    const groups: { label: string; items: AppNotification[] }[] = [];
    const byKey = new Map<string, AppNotification[]>();
    for (const n of notifications) {
      const key = new Date(n.created_at).toDateString();
      byKey.set(key, [...(byKey.get(key) ?? []), n]);
    }
    for (const [key, items] of byKey.entries()) {
      groups.push({ label: groupLabel(items[0].created_at) || key, items });
    }
    return groups;
  }, [notifications]);

  const hasUnread = unread.count > 0;

  const handleOpen = (notification: AppNotification) => {
    if (!notification.is_read) {
      void markRead.mutate(notification.id);
    }
    onClose();
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap={8}>
          <Text fw={700} size="md">
            Notifications
          </Text>
          {unread.count > 0 && (
            <Badge color="brand" variant="light" size="sm">
              {unread.count} new
            </Badge>
          )}
        </Group>
      }
      styles={{ header: { borderBottom: '1px solid var(--app-shell-border-color, #e4e4e7)' } }}
    >
      <Stack gap="md" className="h-full">
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {unread.count > 0
              ? `${unread.count} unread notification${unread.count > 1 ? 's' : ''}`
              : 'You are all caught up'}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<Check size={14} />}
            onClick={() => void markAllRead.mutate()}
            disabled={!hasUnread || markAllRead.isPending}
          >
            Mark all as read
          </Button>
        </Group>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <Text size="sm" c="dimmed" py={40} ta="center">
              Loading notifications…
            </Text>
          ) : grouped.length === 0 ? (
            <Stack align="center" gap={8} py={48} c="dimmed">
              <Sparkle size={28} opacity={0.6} />
              <Text size="sm">No notifications yet</Text>
              <Text size="xs">Stock, order, payment and prediction alerts will show up here.</Text>
            </Stack>
          ) : (
            <Stack gap="xl" pb={16}>
              {grouped.map((group, gi) => (
                <div key={`${group.label}-${gi}`}>
                  <Group gap={8} mb={8} align="center">
                    <Text size="xs" fw={700} c="dimmed" className="uppercase tracking-wide">
                      {group.label}
                    </Text>
                    <Divider className="flex-1" />
                  </Group>
                  <Stack gap={8}>
                    {group.items.map((n) => (
                      <NotificationCard key={n.id} notification={n} onOpen={handleOpen} />
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Drawer>
  );
}