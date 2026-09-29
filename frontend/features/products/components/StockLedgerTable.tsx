'use client';

import { Fragment, useState } from 'react';
import { Table } from '@mantine/core';
import {
  CaretDoubleDown,
  CaretDoubleUp,
  CaretDown,
  CaretUpDown,
  StackSimple,
} from '@phosphor-icons/react';
import { LoadingState, EmptyState, ErrorState, PermissionDeniedState } from '@/components/shared';
import type { SortState } from '@/components/shared';
import type { StockMovement } from '../api';
import type { VariantDayMetrics } from '../ledgerMetrics';
import { dayLabel, localDayKey } from '../ledgerMetrics';
import MetricCell from './MetricCell';
import { ReasonBadge } from './reasonMeta';

export type LedgerGroup = {
  key: string;
  dayKey: string;
  dayLabel: string;
  productId: string;
  productName: string;
  variantName: string | null;
  metrics: VariantDayMetrics | undefined;
  movements: StockMovement[];
};

export function sortLedgerMovements(
  rows: StockMovement[],
  sort: SortState,
): StockMovement[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const t = (m: StockMovement) => new Date(m.created_at).getTime();
  return [...rows].sort((a, b) => {
    if (sort.field === 'product_name') {
      const p = a.product_name.localeCompare(b.product_name) * dir;
      if (p) return p;
      const v = (a.variant_name ?? '').localeCompare(b.variant_name ?? '');
      if (v) return v;
      const dt = t(a) - t(b);
      if (dt) return dt;
      return a.id.localeCompare(b.id);
    }
    const dt = t(a) - t(b);
    if (dt) return dt * dir;
    const k = a.variant_id.localeCompare(b.variant_id);
    if (k) return k;
    return a.id.localeCompare(b.id);
  });
}

export function buildLedgerGroups(
  movements: StockMovement[],
  metricsByVariantDay: Map<string, VariantDayMetrics>,
): LedgerGroup[] {
  const map = new Map<string, LedgerGroup>();
  const order: string[] = [];
  for (const m of movements) {
    const dayKey = localDayKey(m.created_at);
    const key = `${m.variant_id}::${dayKey}`;
    let group = map.get(key);
    if (!group) {
      const metrics = metricsByVariantDay.get(key);
      group = {
        key,
        dayKey,
        dayLabel: metrics?.label ?? dayLabel(dayKey),
        productId: m.product_id,
        productName: m.product_name,
        variantName: m.variant_name,
        metrics,
        movements: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.movements.push(m);
  }
  return order.map((k) => map.get(k)!);
}

function SortIcon({ state }: { state: SortState | undefined }) {
  if (!state) return <CaretUpDown size={13} className="text-[var(--muted)]/50" />;
  if (state.direction === 'asc') return <CaretDoubleUp size={13} className="text-brand-600" />;
  return <CaretDoubleDown size={13} className="text-brand-600" />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {children}
    </div>
  );
}

export default function StockLedgerTable({
  groups,
  loading,
  error,
  retry,
  isPermissionDenied,
  sortState,
  onSortChange,
  minWidth = 820,
  emptyTitle,
  emptyDescription,
  onViewProduct,
}: {
  groups: LedgerGroup[];
  loading?: boolean;
  error?: boolean;
  retry?: () => void;
  isPermissionDenied?: boolean;
  sortState?: SortState;
  onSortChange?: (sort: SortState) => void;
  minWidth?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  onViewProduct?: (productId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isPermissionDenied) {
    return (
      <Frame>
        <PermissionDeniedState />
      </Frame>
    );
  }
  if (error) {
    return (
      <Frame>
        <ErrorState retry={retry} />
      </Frame>
    );
  }
  if (loading) {
    return (
      <Frame>
        <LoadingState />
      </Frame>
    );
  }
  if (groups.length === 0) {
    return (
      <Frame>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Frame>
    );
  }

  const handleSort = (field: string) => {
    if (!onSortChange) return;
    onSortChange({
      field,
      direction:
        sortState?.field === field && sortState.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const cols = 8;

  return (
    <Frame>
      <div className="overflow-x-auto">
        <Table style={{ minWidth }} verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="border-b border-[var(--border)]">
              <Table.Th style={{ width: 44, padding: 0 }} className="!bg-transparent !py-3" />
              <Table.Th
                style={{ textAlign: 'left', whiteSpace: 'nowrap' }}
                className="!bg-transparent !py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
              >
                <button
                  type="button"
                  onClick={() => handleSort('product_name')}
                  className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-[var(--foreground)]"
                >
                  Product
                  <SortIcon
                    state={
                      sortState?.field === 'product_name' ? sortState : undefined
                    }
                  />
                </button>
              </Table.Th>
              {['Opening', 'Added', 'Sold', 'Production / Damaged', 'Closing'].map((h) => (
                <Table.Th
                  key={h}
                  style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                  className="!bg-transparent !py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                >
                  {h}
                </Table.Th>
              ))}
              <Table.Th
                style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                className="!bg-transparent !py-3"
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((g, index) => {
              const isOpen = !!expanded[g.key];
              const dm = g.metrics;
              const frameIds = new Set(g.movements.map((m) => m.id));
              const frames = (dm?.frames ?? []).filter((f) => frameIds.has(f.id));
              return (
                <Fragment key={g.key}>
                  {index === 0 || g.dayLabel !== groups[index - 1]?.dayLabel ? (
                    <Table.Tr className="border-b border-[var(--border)]">
                      <Table.Td colSpan={cols} className="!bg-black/[0.02] !px-4 !py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                            {g.dayLabel}
                          </span>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ) : null}
                  <Table.Tr
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-black/[0.02]"
                    data-row-id={g.key}
                  >
                    <Table.Td style={{ textAlign: 'left' }} className="!py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))
                        }
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.productName} ${g.variantName ?? ''} movements`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition-all hover:bg-black/5 hover:text-[var(--foreground)]"
                      >
                        <span
                          className={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
                        >
                          <CaretDown size={15} weight="bold" />
                        </span>
                      </button>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'left' }} className="!py-3">
                      <button
                        type="button"
                        onClick={() => onViewProduct?.(g.productId)}
                        className="block truncate text-sm font-semibold text-[var(--foreground)] hover:text-brand-700"
                      >
                        {g.productName}
                      </button>
                      {g.variantName && (
                        <div className="truncate text-xs text-[var(--muted)]">{g.variantName}</div>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <MetricCell value={dm?.opening ?? 0} />
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <MetricCell value={dm?.added ?? 0} tone="success" />
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <MetricCell value={dm?.sold ?? 0} tone="warning" />
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <MetricCell
                        value={(dm?.produced ?? 0) + (dm?.damaged ?? 0)}
                        tone="brand"
                      />
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <MetricCell value={dm?.closing ?? 0} tone="strong" />
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => onViewProduct?.(g.productId)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
                          aria-label="View product"
                        >
                          <StackSimple size={18} weight="bold" />
                        </button>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                  {isOpen &&
                    frames.map((f) => (
                      <Table.Tr
                        key={f.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <Table.Td
                          style={{ textAlign: 'left' }}
                          className="!bg-black/[0.015] !py-3"
                        >
                          <div className="ml-3 h-5 w-px bg-[var(--border)]" aria-hidden />
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'left' }} className="!bg-black/[0.015] !py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--foreground)]">
                              {new Date(f.created_at).toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <ReasonBadge reason={f.reason} />
                          </div>
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3">
                          <MetricCell value={f.opening} tone="muted" />
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3">
                          {f.added ? <MetricCell value={f.added} tone="success" /> : null}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3">
                          {f.sold ? <MetricCell value={f.sold} tone="warning" /> : null}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3">
                          {f.used ? <MetricCell value={f.used} tone="brand" /> : null}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3">
                          <MetricCell value={f.closing} tone="strong" />
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }} className="!bg-black/[0.015] !py-3" />
                      </Table.Tr>
                    ))}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Frame>
  );
}