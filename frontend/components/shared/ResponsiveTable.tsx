'use client';

import { Table } from '@mantine/core';
import type { ReactNode } from 'react';

/** A table that stays inside its card on narrow screens.
 *
 *  Mantine renders `Table` with `width: 100%; table-layout: auto`, so a table
 *  can never compress below the min-content width of its own cells. Dropped
 *  into a card without a scroll container, a 6-7 column table therefore pushes
 *  straight through the card border and drags a page-level scrollbar along
 *  behind it. Wrapping in `overflow-x-auto` is the fix; doing it by hand is
 *  easy to forget, so this component makes it the default.
 *
 *  Usage:
 *    <ResponsiveTable minWidth={560}>
 *      <Table.Thead>…</Table.Thead>
 *      <Table.Tbody>…</Table.Tbody>
 *    </ResponsiveTable>
 *
 *  `minWidth` should approximate the table's min-content width. It is only a
 *  floor: the table still grows to fill wider cards.
 */
export default function ResponsiveTable({
  children,
  minWidth,
  verticalSpacing = 'sm',
  horizontalSpacing = 'md',
  className = '',
}: {
  /** Table head / body / foot elements. */
  children: ReactNode;
  /** Approximate min-content width in px, so columns don't crush on desktop. */
  minWidth?: number;
  verticalSpacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  horizontalSpacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <Table
        style={{ minWidth }}
        verticalSpacing={verticalSpacing}
        horizontalSpacing={horizontalSpacing}
      >
        {children}
      </Table>
    </div>
  );
}