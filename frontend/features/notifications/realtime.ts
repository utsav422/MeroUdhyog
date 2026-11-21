import type { QueryKey } from '@tanstack/react-query';

import type { AppNotification } from './api';
import { notificationsKeys } from './api';
import { deliveriesKeys } from '@/features/deliveries/api';
import { customersKeys } from '@/features/customers/api';
import { khataKeys } from '@/features/khata/api';
import { ordersKeys } from '@/features/orders/api';
import { predictionsKeys } from '@/features/predictions/api';
import { inventoryKeys, productsKeys } from '@/features/products/api';

export const realtimeDomainKeys: QueryKey[] = [
  notificationsKeys.all,
  ordersKeys.all,
  deliveriesKeys.all,
  productsKeys.all,
  inventoryKeys.all,
  khataKeys.all,
  customersKeys.all,
  predictionsKeys.all,
];

const COLORS: Record<string, string> = {
  stock: 'warning',
  order: 'brand',
  delivery: 'accent',
  payment: 'success',
  prediction: 'warning',
  system: 'brand',
};

export function notificationToastColor(category: string): string {
  return COLORS[category] ?? 'brand';
}

function dataDetails(data: Record<string, unknown> | null): string {
  if (!data) return '';
  const parts: string[] = [];
  const orderRef = data.order_ref;
  const status = data.status;
  const product = data.product_name;
  const stock = data.stock;
  const threshold = data.threshold;

  if (typeof orderRef === 'string' && orderRef) parts.push(`Order ${orderRef}`);
  if (typeof product === 'string' && product) parts.push(product);
  if (typeof status === 'string' && status) {
    parts.push(status.replaceAll('_', ' '));
  }
  if (typeof stock === 'number' || typeof stock === 'string') {
    parts.push(`${stock} left`);
  }
  if (typeof threshold === 'number' || typeof threshold === 'string') {
    parts.push(`threshold ${threshold}`);
  }
  return parts.join(' · ');
}

export function notificationToastMessage(notification: AppNotification): string {
  const details = dataDetails(notification.data);
  const message = notification.message ?? 'New notification';
  return details && !message.includes(details) ? `${message} · ${details}` : message;
}

export function notificationQueryKeys(notification: AppNotification): QueryKey[] {
  const data = notification.data ?? {};
  const keys: QueryKey[] = [
    ordersKeys.all,
    deliveriesKeys.all,
    productsKeys.all,
    inventoryKeys.all,
    khataKeys.all,
  ];

  if (notification.category === 'payment' || notification.category === 'system') {
    keys.push(customersKeys.all, khataKeys.all);
  }
  if (notification.category === 'stock' || notification.category === 'prediction') {
    keys.push(inventoryKeys.all, productsKeys.all, predictionsKeys.all);
  }

  const orderId = data.order_id;
  if (typeof orderId === 'string' && orderId) {
    keys.push(ordersKeys.detail(orderId), khataKeys.invoice(orderId));
  }
  const deliveryId = data.delivery_id;
  if (typeof deliveryId === 'string' && deliveryId) {
    keys.push(deliveriesKeys.detail(deliveryId));
  }
  const customerId = data.customer_id;
  if (typeof customerId === 'string' && customerId) {
    keys.push(customersKeys.detail(customerId), khataKeys.customer(customerId));
  }

  return keys.filter(
    (key, index) => keys.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(key)) === index,
  );
}
