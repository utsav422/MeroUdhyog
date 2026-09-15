'use client';

import { Checkbox, Menu, Table } from '@mantine/core';
import { CaretDoubleDown, CaretDoubleUp, DotsThree, CaretUpDown } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from './States';

export type SortState = { field: string; direction: 'asc' | 'desc' };

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
};

export type RowAction<T> = {
  label: string | ((row: T) => string);
  icon?: ReactNode | ((row: T) => ReactNode);
  color?: string;
  onClick: (row: T) => void;
  show?: (row: T) => boolean;
};

function SortIcon({ state }: { state: SortState | undefined }) {
  if (!state) return <CaretUpDown size={13} className="text-[var(--muted)]/50" />;
  if (state.direction === 'asc') return <CaretDoubleUp size={13} className="text-brand-600" />;
  return <CaretDoubleDown size={13} className="text-brand-600" />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {children}
    </div>
  );
}

export default function DataTable<T>({
  columns,
  data,
  loading,
  error,
  retry,
  isPermissionDenied,
  emptyTitle,
  emptyDescription,
  sortState,
  onSortChange,
  rowActions,
  getRowId,
  minWidth,
  rowClassName,
  rowAccent,
  selectable,
  selectedKeys,
  onSelectionChange,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: boolean;
  retry?: () => void;
  isPermissionDenied?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  sortState?: SortState;
  onSortChange?: (sort: SortState) => void;
  rowActions?: RowAction<T>[];
  getRowId: (row: T) => string;
  minWidth?: number;
  /* Optional per-row class names, e.g. to dim out locked rows. */
  rowClassName?: (row: T) => string | undefined;
  /* Optional per-row hex color used as a 3px left border accent. */
  rowAccent?: (row: T) => string | undefined;
  /* Enables per-row checkboxes for bulk actions on the current page. */
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
}) {
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

  if (data.length === 0) {
    return (
      <Frame>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Frame>
    );
  }

  const selectionEnabled = selectable && !!selectedKeys && !!onSelectionChange;
  const pageIds = data.map(getRowId);
  const allPageSelected =
    selectionEnabled && pageIds.length > 0 && pageIds.every((id) => selectedKeys!.includes(id));
  const somePageSelected =
    selectionEnabled && pageIds.some((id) => selectedKeys!.includes(id));

  const togglePage = () => {
    if (!onSelectionChange) return;
    if (allPageSelected) {
      onSelectionChange(selectedKeys!.filter((k) => !pageIds.includes(k)));
    } else {
      onSelectionChange([...new Set([...selectedKeys!, ...pageIds])]);
    }
  };

  return (
    <Frame>
      <div className="overflow-x-auto">
        <Table style={{ minWidth }} verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr className="border-b border-[var(--border)]">
              {selectionEnabled && (
                <Table.Th
                  style={{ width: 40, whiteSpace: 'nowrap' }}
                  className="!bg-transparent !py-3"
                >
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={!allPageSelected && somePageSelected}
                    onChange={togglePage}
                    aria-label="Select all on page"
                  />
                </Table.Th>
              )}
              {columns.map((col) => (
                <Table.Th
                  key={col.key}
                  style={{ textAlign: col.align ?? 'left', width: col.width, whiteSpace: 'nowrap' }}
                  className="!bg-transparent !py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange({
                          field: col.key,
                          direction:
                            sortState?.field === col.key && sortState.direction === 'asc'
                              ? 'desc'
                              : 'asc',
                        })
                      }
                      className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-[var(--foreground)]"
                    >
                      {col.header}
                      <SortIcon state={sortState?.field === col.key ? sortState : undefined} />
                    </button>
                  ) : (
                    col.header
                  )}
                </Table.Th>
              ))}
              {rowActions && rowActions.length > 0 && (
                <Table.Th
                  style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                  className="!bg-transparent !py-3"
                />
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((row) => {
              const accent = rowAccent?.(row);
              return (
                <Table.Tr
                  key={getRowId(row)}
                  data-row-id={getRowId(row)}
                  className={`border-b border-[var(--border)] transition-colors last:border-0 hover:bg-black/[0.02] ${
                    rowClassName?.(row) ?? ''
                  }`}
                  style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
                >
                  {selectionEnabled && (
                    <Table.Td style={{ textAlign: 'left' }} className="!py-3">
                      <Checkbox
                        aria-label="Select row"
                        checked={selectedKeys!.includes(getRowId(row))}
                        onChange={() => {
                          const id = getRowId(row);
                          if (selectedKeys!.includes(id)) {
                            onSelectionChange!(selectedKeys!.filter((k) => k !== id));
                          } else {
                            onSelectionChange!([...selectedKeys!, id]);
                          }
                        }}
                      />
                    </Table.Td>
                  )}
                  {columns.map((col) => (
                    <Table.Td key={col.key} style={{ textAlign: col.align ?? 'left' }} className="!py-3">
                      {col.render(row)}
                    </Table.Td>
                  ))}
                  {rowActions && rowActions.length > 0 && (
                    <Table.Td style={{ textAlign: 'right' }} className="!py-3">
                      <div className="flex justify-end">
                        {(() => {
                          const visible = rowActions.filter((a) => (a.show ? a.show(row) : true));
                          if (visible.length === 0) return null;
                          return (
                            <Menu shadow="md" width={180} position="bottom-end">
                              <Menu.Target>
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
                                  aria-label="Row actions"
                                >
                                  <DotsThree size={18} weight="bold" />
                                </button>
                              </Menu.Target>
                              <Menu.Dropdown>
                                {visible.map((action, i) => (
                                  <Menu.Item
                                    key={i}
                                    leftSection={
                                      typeof action.icon === 'function'
                                        ? action.icon(row)
                                        : action.icon
                                    }
                                    color={action.color}
                                    onClick={() => action.onClick(row)}
                                  >
                                    {typeof action.label === 'function'
                                      ? action.label(row)
                                      : action.label}
                                  </Menu.Item>
                                ))}
                              </Menu.Dropdown>
                            </Menu>
                          );
                        })()}
                      </div>
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Frame>
  );
}