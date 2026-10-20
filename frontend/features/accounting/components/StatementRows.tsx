'use client';

import type { ReactNode } from 'react';

export function useMoney(currency: string) {
  return (value: string | number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(value));
}

export function AmountRow({
  label,
  amount,
  strong,
  muted,
  indent,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  muted?: boolean;
  indent?: boolean;
}) {
  const negative = Number(amount) < 0;
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2.5 last:border-0 ${
        strong ? 'font-semibold' : ''
      }`}
    >
      <span
        className={`text-sm ${indent ? 'pl-4' : ''} ${
          muted ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'
        }`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums text-sm ${strong ? 'font-semibold' : ''} ${
          negative ? 'text-danger-600' : 'text-[var(--foreground)]'
        }`}
      >
        {amount}
      </span>
    </div>
  );
}

export function StatementSection({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
        {title}
      </h3>
      <div className="rounded-xl border border-[var(--border)] px-4">
        {children}
        {footer}
      </div>
    </div>
  );
}

export function StatementTotal({ label, amount, tone }: { label: string; amount: string; tone?: 'brand' | 'default' }) {
  return (
    <div
      className={`mt-2 flex items-baseline justify-between gap-4 rounded-xl px-4 py-3 ${
        tone === 'brand'
          ? 'bg-brand-50 text-brand-800'
          : 'bg-black/[0.03] text-[var(--foreground)]'
      }`}
    >
      <span className="text-sm font-bold uppercase tracking-wide">{label}</span>
      <span className="tabular-nums text-base font-bold">{amount}</span>
    </div>
  );
}
