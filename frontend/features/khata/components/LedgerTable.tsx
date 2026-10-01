'use client';

import { useMemo } from 'react';
import { Button, Table, Text } from '@mantine/core';
import { DownloadSimple, FilePdf, Receipt } from '@phosphor-icons/react';
import { EmptyState } from '@/components/shared';
import { downloadCsv } from '@/lib/exportCsv';
import { formatDate, formatMoney } from '@/lib/format';
import type { LedgerEntry } from '../api';

function balanceLabel(balance: string, side: 'dr' | 'cr' | 'zero'): string {
  if (side === 'zero') return '—';
  const formatted = formatMoney(Math.abs(Number(balance)));
  return side === 'cr' ? `${formatted} Cr` : `${formatted} Dr`;
}

function refLabel(entry: LedgerEntry): string {
  if (entry.entry_type === 'invoice') {
    const parts = [entry.invoice_number, entry.order_ref].filter(Boolean);
    return parts.join(' · ') || entry.ref || '—';
  }
  return entry.receipt_number || entry.ref || '—';
}

function particularLabel(entry: LedgerEntry): string {
  return entry.entry_type === 'invoice' ? 'To Sales / Order' : 'By Payment Received';
}

export default function LedgerTable({
  ledger,
  customerName,
  onOpenInvoice,
  onOpenReceipt,
}: {
  ledger: LedgerEntry[];
  customerName: string;
  onOpenInvoice?: (orderId: string) => void;
  onOpenReceipt?: (paymentId: string) => void;
}) {
  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const entry of ledger) {
      if (entry.debit) debit += Number(entry.debit);
      if (entry.credit) credit += Number(entry.credit);
    }
    return { debit, credit };
  }, [ledger]);

  const closing = ledger[ledger.length - 1];

  const exportCsv = () => {
    const rows: Array<Array<string | number | null | undefined>> = ledger.map((entry) => [
      formatDate(entry.date),
      particularLabel(entry),
      refLabel(entry),
      entry.payer_bill_no ?? '',
      entry.debit ?? '',
      entry.credit ?? '',
      entry.balance,
      entry.balance_side === 'zero' ? '' : entry.balance_side.toUpperCase(),
    ]);
    if (totals.debit || totals.credit) {
      rows.push([]);
      rows.push([
        '',
        'TOTAL',
        '',
        '',
        totals.debit.toFixed(2),
        totals.credit.toFixed(2),
        closing?.balance ?? '',
        closing?.balance_side === 'zero' ? '' : closing?.balance_side.toUpperCase(),
      ]);
    }
    downloadCsv(`ledger-${customerName.replace(/[^\w-]+/g, '-')}.csv`, [
      'Date',
      'Particulars',
      'Ref',
      'Money Recipient Bill No.',
      'Debit',
      'Credit',
      'Running Balance',
      'Balance Side',
    ], rows);
  };

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
        <div>
          <Text fw={600} size="md" className="text-zinc-800">
            Ledger
          </Text>
          <Text size="xs" c="dimmed" className="mt-0.5">
            {customerName} · debit / credit with running balance
          </Text>
        </div>
        {ledger.length > 0 && (
          <Button
            variant="default"
            size="xs"
            leftSection={<DownloadSimple size={15} />}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        )}
      </div>

      {ledger.length === 0 ? (
        <EmptyState
          title="No ledger entries"
          description="Billed orders and payments will appear here as a running account."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr className="text-zinc-400">
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Date</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Particulars</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Ref</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider">Money Recipient Bill No.</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Debit</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Credit</Table.Th>
                <Table.Th className="text-xs font-semibold uppercase tracking-wider" ta="right">Balance</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ledger.map((entry, idx) => {
                const isInvoice = entry.entry_type === 'invoice';
                const canOpen =
                  (isInvoice && onOpenInvoice && entry.order_id) ||
                  (!isInvoice && onOpenReceipt && entry.payment_id);
                return (
                  <Table.Tr key={`${entry.entry_type}-${entry.order_id ?? entry.payment_id}-${idx}`}>
                    <Table.Td className="whitespace-nowrap text-zinc-600">
                      {formatDate(entry.date)}
                    </Table.Td>
                    <Table.Td className="whitespace-nowrap text-zinc-700">
                      {particularLabel(entry)}
                    </Table.Td>
                    <Table.Td>
                      {canOpen ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                          onClick={() => {
                            if (isInvoice && entry.order_id) onOpenInvoice?.(entry.order_id);
                            else if (!isInvoice && entry.payment_id) onOpenReceipt?.(entry.payment_id);
                          }}
                        >
                          {isInvoice ? <FilePdf size={14} /> : <Receipt size={14} />}
                          {refLabel(entry)}
                        </button>
                      ) : (
                        <span className="text-zinc-600">{refLabel(entry)}</span>
                      )}
                    </Table.Td>
                    <Table.Td className="text-zinc-600">
                      {entry.payer_bill_no ?? <span className="text-zinc-300">—</span>}
                    </Table.Td>
                    <Table.Td ta="right" className="text-zinc-700">
                      {entry.debit ? formatMoney(entry.debit) : <span className="text-zinc-300">—</span>}
                    </Table.Td>
                    <Table.Td ta="right" className="text-zinc-700">
                      {entry.credit ? formatMoney(entry.credit) : <span className="text-zinc-300">—</span>}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      fw={600}
                      className={
                        entry.balance_side === 'cr' ? 'text-success-700' : 'text-zinc-900'
                      }
                    >
                      {balanceLabel(entry.balance, entry.balance_side)}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
            {(totals.debit !== 0 || totals.credit !== 0) && (
              <Table.Tfoot>
                <Table.Tr className="bg-zinc-50/70">
                  <Table.Td colSpan={4} fw={700} className="text-zinc-800">
                    Total
                  </Table.Td>
                  <Table.Td ta="right" fw={700} className="text-zinc-900">
                    {formatMoney(totals.debit)}
                  </Table.Td>
                  <Table.Td ta="right" fw={700} className="text-zinc-900">
                    {formatMoney(totals.credit)}
                  </Table.Td>
                  <Table.Td
                    ta="right"
                    fw={700}
                    className={
                      closing?.balance_side === 'cr' ? 'text-success-700' : 'text-zinc-900'
                    }
                  >
                    {closing ? balanceLabel(closing.balance, closing.balance_side) : '—'}
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}