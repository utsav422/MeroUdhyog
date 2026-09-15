'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TrashSimple } from '@phosphor-icons/react';
import { formatMoney } from '@/lib/format';
import { PAYMENT_METHODS } from '../constants';
import { useRecordPayment } from '../api';
import type { KhataOrder } from '../api';

type AllocationRow = { order_id: string; amount: string };

export default function RecordPaymentModal({
  opened,
  onClose,
  customerId,
  orders,
  onRecorded,
}: {
  opened: boolean;
  onClose: () => void;
  customerId: string;
  orders: KhataOrder[];
  onRecorded?: () => void;
}) {
  const recordPayment = useRecordPayment();

  const [amount, setAmount] = useState<string>('0');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [collectedDate, setCollectedDate] = useState('');
  const [generateReceipt, setGenerateReceipt] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const orderBalance = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      map[o.order_id] = Math.max(0, Number(o.total_amount) - Number(o.amount_paid));
    }
    return map;
  }, [orders]);

  const billableOrders = useMemo(
    () => orders.filter((o) => (orderBalance[o.order_id] ?? 0) > 0),
    [orders, orderBalance],
  );

  const reset = () => {
    setAmount('0');
    setMethod('cash');
    setNote('');
    setCollectedDate('');
    setGenerateReceipt(true);
    setManualMode(false);
    setAllocations([]);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addAllocation = () => {
    setAllocations((rows) => [...rows, { order_id: '', amount: '' }]);
  };

  const updateAllocation = (index: number, patch: Partial<AllocationRow>) => {
    setAllocations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeAllocation = (index: number) => {
    setAllocations((rows) => rows.filter((_, i) => i !== index));
  };

  const submit = () => {
    const value = Number(amount || 0);
    if (!value || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    let finalAllocations: { order_id: string; amount: string }[] | null = null;
    if (manualMode) {
      if (allocations.length === 0) {
        setError('Choose at least one order to settle.');
        return;
      }
      let allocated = 0;
      const rows: { order_id: string; amount: string }[] = [];
      for (const row of allocations) {
        if (!row.order_id) {
          setError('Every allocation needs an order.');
          return;
        }
        const rowAmount = Number(row.amount || 0);
        if (!rowAmount || rowAmount <= 0) {
          setError('Every allocation needs an amount greater than zero.');
          return;
        }
        const balance = orderBalance[row.order_id] ?? 0;
        if (rowAmount > balance) {
          setError(`The allocated amount for that order exceeds its outstanding of ${formatMoney(balance)}.`);
          return;
        }
        allocated += rowAmount;
        rows.push({ order_id: row.order_id, amount: row.amount });
      }
      if (allocated > value) {
        setError('Allocations cannot exceed the payment amount.');
        return;
      }
      finalAllocations = rows;
    }

    recordPayment.mutate(
      {
        customer_id: customerId,
        amount: amount,
        method,
        note: note || null,
        collected_at: collectedDate
          ? new Date(`${collectedDate}T12:00:00`).toISOString()
          : null,
        allocations: finalAllocations,
        generate_receipt: generateReceipt,
      },
      {
        onSuccess: (payment) => {
          notifications.show({
            color: 'success',
            title: 'Payment recorded',
            message: payment.receipt_number
              ? `Receipt ${payment.receipt_number} generated.`
              : 'Ledger updated.',
          });
          onRecorded?.();
          close();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Recording failed. Try again.');
        },
      },
    );
  };

  return (
    <Modal opened={opened} onClose={close} title="Record payment" size="lg" centered>
      <Stack gap="md">
        {error && (
          <div className="rounded-xl bg-danger-50 px-4 py-2.5 text-sm font-medium text-danger-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput
            label="Amount"
            required
            min={0}
            value={amount}
            onChange={(v) => setAmount(String(v ?? 0))}
            thousandSeparator=","
            decimalScale={2}
            prefix="₹ "
          />
          <Select
            label="Payment method"
            data={PAYMENT_METHODS}
            value={method}
            onChange={(v) => setMethod(v ?? 'cash')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="Collection date"
            type="date"
            value={collectedDate}
            onChange={(e) => setCollectedDate(e.currentTarget.value)}
          />
          <div className="flex items-end">
            <Checkbox
              label="Generate a printable receipt"
              checked={generateReceipt}
              onChange={(e) => setGenerateReceipt(e.currentTarget.checked)}
              mb={4}
            />
          </div>
        </div>

        <Textarea
          label="Note"
          placeholder="Optional note (e.g. partial advance, balance against shop account)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          maxLength={500}
          autosize
          minRows={2}
          maxRows={4}
        />

        {billableOrders.length > 0 && (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <Text size="sm" fw={600} className="text-zinc-700">
                Allocation
              </Text>
              <Checkbox
                label="Choose orders manually"
                checked={manualMode}
                onChange={(e) => setManualMode(e.currentTarget.checked)}
                size="xs"
              />
            </div>
            <Text size="xs" c="dimmed">
              {manualMode
                ? 'Pick which orders this payment settles. The rest is applied as credit.'
                : 'Auto-applied to the oldest outstanding orders first (FIFO).'}
            </Text>

            {!manualMode && (
              <Stack gap={6} mt="sm">
                {billableOrders.slice(0, 5).map((o) => (
                  <div
                    key={o.order_id}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium text-zinc-700">{o.order_ref}</span>
                    <span className="text-zinc-500">{formatMoney(orderBalance[o.order_id])}</span>
                  </div>
                ))}
                {billableOrders.length > 5 && (
                  <Text size="xs" c="dimmed">
                    +{billableOrders.length - 5} more outstanding orders
                  </Text>
                )}
              </Stack>
            )}

            {manualMode && (
              <Stack gap="xs" mt="sm">
                {allocations.map((row, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Select
                      className="flex-1"
                      placeholder="Choose order"
                      size="xs"
                      data={billableOrders.map((o) => ({
                        value: o.order_id,
                        label: `${o.order_ref} — balance ${formatMoney(orderBalance[o.order_id])}`,
                      }))}
                      value={row.order_id || null}
                      onChange={(v) => updateAllocation(index, { order_id: v ?? '' })}
                    />
                    <NumberInput
                      className="w-40"
                      size="xs"
                      placeholder="Amount"
                      min={0}
                      value={row.amount}
                      onChange={(v) => updateAllocation(index, { amount: String(v ?? 0) })}
                    />
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-xs"
                      onClick={() => removeAllocation(index)}
                    >
                      <TrashSimple size={14} />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button variant="light" size="xs" onClick={addAllocation} disabled={billableOrders.length === 0}>
                    + Add order
                  </Button>
                </div>
              </Stack>
            )}
          </div>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button loading={recordPayment.isPending} onClick={submit}>
            Record payment
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}