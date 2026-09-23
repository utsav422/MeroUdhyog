'use client';

import { apiClient } from '@/lib/api-client';

function toBase64Url(data: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes: Uint8Array<ArrayBuffer> =
    data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Register the service worker and subscribe this browser to Web Push, then
 * persist the subscription on the backend so future notifications reach the
 * device lock screen. Safe to call from anywhere: no-ops when unsupported,
 * keys are unconfigured, or the user declined permission.
 */
export async function setupPushNotifications(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const { enabled, public_key } = await apiClient.get<{
      enabled: boolean;
      public_key: string | null;
    }>('/notifications/push/public-key');

    if (!enabled || !public_key) return;

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }

    const p256dh = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!p256dh || !auth) return;

    await apiClient.post('/notifications/push/subscribe', {
      endpoint: subscription.endpoint,
      p256dh: toBase64Url(p256dh),
      auth: toBase64Url(auth),
    });
  } catch {
    // Push is best-effort; never surface errors for an optional feature.
  }
}