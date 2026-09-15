'use client';

type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // delivery statuses
  pending_assignment: { label: 'Pending assignment', tone: 'neutral' },
  assigned: { label: 'Assigned', tone: 'brand' },
  picked_up: { label: 'Picked up', tone: 'brand' },
  in_transit: { label: 'In transit', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  // order statuses
  draft: { label: 'Draft', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'brand' },
  ready: { label: 'Ready', tone: 'brand' },
  in_delivery: { label: 'In delivery', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  // payment statuses
  unpaid: { label: 'Unpaid', tone: 'warning' },
  partial: { label: 'Partial', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  voided: { label: 'Voided', tone: 'danger' },
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

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  brand: 'bg-brand-50 text-brand-700',
  neutral: 'bg-black/5 text-[var(--muted)]',
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
  const config = STATUS_MAP[status?.toLowerCase?.() ?? status];
  const tone: Tone = config?.tone ?? 'neutral';
  const text = label ?? config?.label ?? (status ? status.replace(/_/g, ' ') : unknown);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${TONE_CLASSES[tone]}`}
    >
      {text}
    </span>
  );
}