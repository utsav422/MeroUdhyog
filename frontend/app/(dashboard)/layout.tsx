'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import { SessionProvider } from '@/lib/providers';
import { useMe, useTenant } from '@/features/auth/hooks';
import { LoadingState } from '@/components/shared';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const me = useMe();
  const tenant = useTenant(!!me.data);

  useEffect(() => {
    if (me.isError) {
      const status = (me.error as { status?: number } | undefined)?.status;
      if (status === 401) {
        router.replace('/login');
      }
    }
  }, [me.isError, me.error, router]);

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
      <div className="flex min-h-screen bg-[#f6f7fb]">
        <Sidebar tenantName={tenant.data?.name ?? 'Workspace'} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar fullName={session?.full_name ?? ''} email={session?.email ?? ''} />
          <main className="flex-1 px-6 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
