'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardPage from '@/features/dashboard/components/DashboardPage';
import { useSession } from '@/lib/providers';
import { LoadingState } from '@/components/shared';

export default function Page() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session?.role === 'delivery') {
      router.replace('/deliveries/portal');
    }
  }, [session?.role, router]);

  if (session?.role === 'delivery') {
    return <LoadingState label="Opening your delivery portal…" />;
  }

  return <DashboardPage />;
}