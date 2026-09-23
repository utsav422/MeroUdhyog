'use client';

import { useEffect, useRef } from 'react';
import { setupPushNotifications } from '@/features/notifications/push';

/**
 * Mount once inside the dashboard layout to register the service worker and
 * subscribe this browser to Web Push (for lock-screen notifications). No-ops
 * silently when push is unsupported/unconfigured/permission denied.
 */
export function PushNotificationsProvider({ enabled = true }: { enabled?: boolean }) {
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void setupPushNotifications();
  }, [enabled]);

  return null;
}