'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type NotificationUIContextValue = {
  notificationsOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
};

const NotificationUIContext = createContext<NotificationUIContextValue | null>(
  null,
);

export function NotificationUIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const openNotifications = useCallback(() => setNotificationsOpen(true), []);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const value = useMemo(
    () => ({ notificationsOpen, openNotifications, closeNotifications }),
    [notificationsOpen, openNotifications, closeNotifications],
  );

  return (
    <NotificationUIContext.Provider value={value}>
      {children}
    </NotificationUIContext.Provider>
  );
}

export function useNotificationUI() {
  const ctx = useContext(NotificationUIContext);
  if (!ctx) {
    throw new Error('useNotificationUI must be used inside NotificationUIProvider');
  }
  return ctx;
}
