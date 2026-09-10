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

function SwitchIcon({ state }: { state: SortState | undefined }) {
  if (!state) return <CaretUpDown size={13} className="text-zinc-300" />;
  if (state.direction === 'asc') return <CaretDoubleUp size={13} className="text-brand-600" />;
  return <CaretDoubleDown size={13} className="text-brand-600" />;
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
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <PermissionDeniedState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <ErrorState retry={retry} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <LoadingState />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const selectionEnabled =
    selectable && !!selectedKeys && !!onSelectionChange;
  const pageIds = data.map(getRowId);
  const allPageSelected =
    selectionEnabled &&
    pageIds.length > 0 &&
    pageIds.every((id) => selectedKeys!.includes(id));
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
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <Table
        style={{ minWidth: minWidth }}
        highlightOnHover
        verticalSpacing="sm"
        horizontalSpacing="md"
      >
        <Table.Thead>
          <Table.Tr className="text-zinc-500">
            {selectionEnabled && (
              <Table.Th style={{ width: 40, whiteSpace: 'nowrap' }}>
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
                style={{
                  textAlign: col.align ?? 'left',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
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
                    className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-zinc-800"
                  >
                    {col.header}
                    <SwitchIcon
                      state={
                        sortState?.field === col.key ? sortState : undefined
                      }
                    />
                  </button>
                ) : (
                  col.header
                )}
              </Table.Th>
            ))}
            {rowActions && rowActions.length > 0 && (
              <Table.Th style={{ textAlign: 'right', whiteSpace: 'nowrap' }} />
            )}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((row) => {
            const accent = rowAccent?.(row);
            return (
              <Table.Tr
                key={getRowId(row)}
                className={rowClassName?.(row)}
                style={
                  accent
                    ? { borderLeft: `3px solid ${accent}` }
                    : undefined
                }
              >
              {selectionEnabled && (
                <Table.Td style={{ textAlign: 'left' }}>
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
                <Table.Td
                  key={col.key}
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.render(row)}
                </Table.Td>
              ))}
              {rowActions && rowActions.length > 0 && (
                <Table.Td style={{ textAlign: 'right' }}>
                  <div className="flex justify-end">
                    {(() => {
                      const visible = rowActions.filter((a) => (a.show ? a.show(row) : true));
                      if (visible.length === 0) return null;
                      return (
                        <Menu shadow="md" width={180} position="bottom-end">
                          <Menu.Target>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
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
  );
}
