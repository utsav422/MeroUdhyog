'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Group, Indicator, Menu, Text } from '@mantine/core';
import { Bell, MagnifyingGlass, SignOut, UserCircle } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useUnreadCount } from '@/features/notifications/api';
import { NotificationsDrawer } from '@/features/notifications/components/NotificationsDrawer';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/orders/calendar': 'Activity Calendar',
  '/orders': 'Orders',
  '/deliveries': 'Deliveries',
  '/customers': 'Customers',
  '/staff': 'Staff',
};

export default function Topbar({
  fullName = '',
  email = '',
}: {
  fullName?: string;
  email?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const unreadCount = unread?.count ?? 0;

  let title = 'Dashboard';
  for (const [prefix, label] of Object.entries(TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      title = label;
      break;
    }
  }

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await apiClient.post('/auth/logout');
    } catch {
      // ignore errors on logout; still redirect
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  const initials = fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-zinc-200/70 bg-[var(--background)]/90 px-6 py-3.5 backdrop-blur">
      <div>
        <Text fw={700} size="lg" className="leading-tight">
          {title}
        </Text>
        <Text size="xs" c="dimmed" className="hidden sm:block">
          Manage your factory operations
        </Text>
      </div>

      <Group justify="flex-end" align="center" gap="md">
        <div
          className={`hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 transition-all md:flex ${
            searchOpen ? 'w-72 border-brand-300 ring-4 ring-brand-50' : 'w-56'
          }`}
        >
          <MagnifyingGlass size={16} className="text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            placeholder="Search…"
            className="w-full bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
            ⌘K
          </kbd>
        </div>

        <Indicator
          inline
          label={unreadCount > 99 ? '99+' : unreadCount}
          size={18}
          color="danger"
          offset={4}
          disabled={unreadCount === 0}
          styles={{
            indicator: {
              fontSize: 10,
              fontWeight: 700,
              paddingInline: 4,
              border: '2px solid var(--background)',
            },
          }}
        >
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setNotificationsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-zinc-800"
          >
            <Bell size={18} />
          </button>
        </Indicator>

        <NotificationsDrawer
          opened={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
        />

        <Menu shadow="md" width={220} position="bottom-end">
          <Menu.Target>
            <button type="button" className="flex items-center gap-2">
              <Avatar color="brand" radius="xl" size={36}>
                {initials || 'U'}
              </Avatar>
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <div className="px-3 py-2">
              <Text size="sm" fw={600} className="truncate">
                {fullName || 'User'}
              </Text>
              <Text size="xs" c="dimmed" className="truncate">
                {email}
              </Text>
            </div>
            <Menu.Divider />
            <Menu.Item leftSection={<UserCircle size={16} />}>Profile</Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<SignOut size={16} />}
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </header>
  );
}
