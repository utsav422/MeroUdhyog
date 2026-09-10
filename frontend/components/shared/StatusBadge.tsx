'use client';

import { Badge } from '@mantine/core';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // delivery statuses
  pending_assignment: { label: 'Pending assignment', tone: 'neutral' },
  assigned: { label: 'Assigned', tone: 'info' },
  picked_up: { label: 'Picked up', tone: 'info' },
  in_transit: { label: 'In transit', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  // order statuses
  draft: { label: 'Draft', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  ready: { label: 'Ready', tone: 'info' },
  in_delivery: { label: 'In delivery', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  // payment statuses
  unpaid: { label: 'Unpaid', tone: 'warning' },
  partial: { label: 'Partial', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  // generic
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  enabled: { label: 'Enabled', tone: 'success' },
  disabled: { label: 'Disabled', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  new: { label: 'New', tone: 'success' },
  low_stock: { label: 'Low stock', tone: 'danger' },
  // prediction stock statuses
  on_track: { label: 'On track', tone: 'success' },
  due_soon: { label: 'Due soon', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  insufficient_data: { label: 'Needs data', tone: 'neutral' },
};

const TONE_COLOR: Record<Tone, string> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'brand',
  neutral: 'gray',
};

export default function StatusBadge({
  status,
  label,
  unknown = 'Unknown',
}: {
  status: string;
  label?: string;
  unknown?: string;
}) {
  const config = STATUS_MAP[status.toLowerCase?.() ?? status];
  const tone: Tone = config?.tone ?? 'neutral';
  const text = label ?? config?.label ?? (status ? status.replace(/_/g, ' ') : unknown);

  return (
    <Badge
      variant="light"
      color={TONE_COLOR[tone]}
      radius="sm"
      styles={{ label: { textTransform: 'none', fontWeight: 600 } }}
    >
      {text}
    </Badge>
  );
}
