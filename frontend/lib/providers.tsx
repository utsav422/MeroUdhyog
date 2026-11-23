'use client';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Fragment, createContext, useContext, useEffect, useState } from 'react';
import { loadDateMode, subscribeDateMode } from '@/lib/date-mode';
import { theme } from '@/lib/theme/theme';

function DateModeRefresher({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeDateMode(() => setVersion((value) => value + 1));
    loadDateMode();
    return unsubscribe;
  }, []);

  return <Fragment key={version}>{children}</Fragment>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <Notifications position="top-center" />
        <DateModeRefresher>{children}</DateModeRefresher>
      </MantineProvider>
    </QueryClientProvider>
  );
}

const SessionContext = createContext<{
  user_id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  permissions: string[];
} | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: {
    user_id: string;
    tenant_id: string;
    email: string;
    full_name: string;
    role: string;
    avatar_url: string | null;
    permissions: string[];
  } | null;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  return ctx;
}
