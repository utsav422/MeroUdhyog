'use client';

import { useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/providers';
import { playNotificationSound, primeNotificationSound } from '@/lib/notification-sound';
import {
  notificationsKeys,
  type AppNotification,
} from '@/features/notifications/api';
import { useNotificationUI } from './NotificationUIProvider';
import {
  notificationQueryKeys,
  notificationToastColor,
  notificationToastMessage,
  realtimeDomainKeys,
} from '../realtime';

export function RealtimeNotificationsProvider() {
  const session = useSession();
  const queryClient = useQueryClient();
  const { openNotifications } = useNotificationUI();
  const seen = useRef(new Set<string>());
  const userId = session?.user_id;
  const tenantId = session?.tenant_id;

  useEffect(() => {
    window.addEventListener('pointerdown', primeNotificationSound, { once: true });
    return () => window.removeEventListener('pointerdown', primeNotificationSound);
  }, []);

  useEffect(() => {
    if (!userId || !tenantId) return undefined;

    const source = new EventSource('/api/v1/notifications/stream');

    source.onopen = () => {
      queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
      for (const key of realtimeDomainKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const handleNotification = (event: Event) => {
      let notification: AppNotification;
      try {
        notification = JSON.parse((event as MessageEvent<string>).data) as AppNotification;
      } catch {
        return;
      }
      if (!notification?.id || seen.current.has(notification.id)) return;
      seen.current.add(notification.id);

      queryClient.invalidateQueries({ queryKey: notificationsKeys.count() });
      queryClient.invalidateQueries({ queryKey: notificationsKeys.list() });
      for (const key of notificationQueryKeys(notification)) {
        queryClient.invalidateQueries({ queryKey: key });
      }

      playNotificationSound();
      notifications.show({
        id: `realtime-${notification.id}`,
        title: notification.title,
        message: notificationToastMessage(notification),
        color: notificationToastColor(notification.category),
        autoClose: 8_000,
        withBorder: true,
        onClick: () => openNotifications(),
      });
    };

    source.addEventListener('notification', handleNotification);
    return () => {
      source.removeEventListener('notification', handleNotification);
      source.close();
    };
  }, [userId, tenantId, queryClient, openNotifications]);

  return null;
}
