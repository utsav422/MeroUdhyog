'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { SessionProvider } from '@/lib/providers';
import { useMe, useTenant } from '@/features/auth/hooks';
import { PushNotificationsProvider } from '@/features/notifications/components/PushNotificationsProvider';
import { LoadingState } from '@/components/shared';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const tenant = useTenant(!!me.data);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (me.isError) {
      const status = (me.error as { status?: number } | undefined)?.status;
      if (status === 401) {
        router.replace('/login');
      }
    }
  }, [me.isError, me.error, router]);

  useEffect(() => {
    const id = window.setTimeout(() => setSidebarOpen(false), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Redirecting to login…" />
      </div>
    );
  }

  const session = me.data
    ? {
        user_id: me.data.user_id,
        tenant_id: me.data.tenant_id,
        email: me.data.email,
        full_name: me.data.full_name,
        role: me.data.role,
      }
    : null;

  return (
    <SessionProvider value={session}>
      <div className="flex min-h-screen bg-[var(--background)]">
        <Sidebar
          tenantName={tenant.data?.name ?? 'Workspace'}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            fullName={session?.full_name ?? ''}
            email={session?.email ?? ''}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
          <main className="flex-1 px-6 pb-28 pt-6 lg:px-8 lg:pb-6">{children}</main>
        </div>
      </div>
      <MobileBottomNav onOpenSidebar={() => setSidebarOpen(true)} />
      <PushNotificationsProvider enabled={!!session} />
    </SessionProvider>
  );
}