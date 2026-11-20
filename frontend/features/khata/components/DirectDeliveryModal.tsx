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
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Plus, Trash } from '@phosphor-icons/react';
import { formatMoney } from '@/lib/format';
import { PAYMENT_METHODS } from '../constants';
import { useCreateDirectDelivery } from '../api';
import { defaultVariantPrice, useProducts } from '../../products/api';
import type { Variant } from '../../products/api';

type Line = {
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: string;
};

function localDateTimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateValue(date = new Date()) {
  return localDateTimeValue(date).slice(0, 10);
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function dateToIso(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

export default function DirectDeliveryModal({
  opened,
  onClose,
  customerId,
  customerName,
  creditLimit,
  creditAvailable,
  onRecorded,
}: {
  opened: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  creditLimit: string | null;
  creditAvailable: string | null;
  onRecorded?: () => void;
}) {
  const productsQuery = useProducts(opened);
  const createDelivery = useCreateDirectDelivery();

  const [lines, setLines] = useState<Line[]>([{ product_id: '', variant_id: '', quantity: 1, unit_price: '0' }]);
  const [enteredAt, setEnteredAt] = useState(localDateTimeValue());
  const [deliveredDate, setDeliveredDate] = useState(localDateValue());
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const [includePayment, setIncludePayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(localDateValue());
  const [payerBillNo, setPayerBillNo] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [generateReceipt, setGenerateReceipt] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const variantOptions = useMemo(() => {
    const options: { value: string; label: string; data: Variant; product_id: string }[] = [];
    for (const product of productsQuery.data ?? []) {
      for (const variant of product.variants) {
        options.push({
          value: variant.id,
          label: `${product.name} — ${variant.name}`,
          data: variant,
          product_id: product.id,
        });
      }
    }
    return options;
  }, [productsQuery.data]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0),
    [lines],
  );

  const reset = () => {
    setLines([{ product_id: '', variant_id: '', quantity: 1, unit_price: '0' }]);
    setEnteredAt(localDateTimeValue());
    setDeliveredDate(localDateValue());
    setAddress('');
    setNotes('');
    setOverrideCreditLimit(false);
    setIncludePayment(false);
    setPaymentAmount('0');
    setPaymentMethod('cash');
    setPaymentDate(localDateValue());
    setPayerBillNo('');
    setPaymentNote('');
    setGenerateReceipt(true);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const selectVariant = (index: number, variantId: string) => {
    const option = variantOptions.find((o) => o.value === variantId);
    if (!option) return;
    updateLine(index, {
      variant_id: variantId,
      product_id: option.product_id,
      unit_price: defaultVariantPrice(option.data),
    });
  };

  const submit = () => {
    const validLines = lines.filter((line) => line.variant_id && Number(line.quantity) > 0);
    if (validLines.length === 0) {
      setError('Add at least one product with a quantity.');
      return;
    }
    if (!deliveredDate) {
      setError('Choose the date the goods were delivered.');
      return;
    }
    if (includePayment && Number(paymentAmount) <= 0) {
      setError('Enter a payment amount greater than zero, or turn off the payment section.');
      return;
    }

    createDelivery.mutate(
      {
        customerId,
        input: {
          items: validLines.map((line) => ({
            product_id: line.product_id,
            variant_id: line.variant_id,
            quantity: Number(line.quantity),
            unit_price: line.unit_price,
          })),
          delivery_address: address.trim() || null,
          notes: notes.trim() || null,
          entered_at: enteredAt ? toIso(enteredAt) : null,
          delivered_at: dateToIso(deliveredDate),
          override_credit_limit: overrideCreditLimit,
          payment: includePayment
            ? {
                amount: paymentAmount,
                method: paymentMethod,
                collected_at: paymentDate ? dateToIso(paymentDate) : null,
                note: paymentNote.trim() || null,
                payer_bill_no: payerBillNo.trim() || null,
                generate_receipt: generateReceipt,
              }
            : null,
        },
      },
      {
        onSuccess: (result) => {
          notifications.show({
            color: 'success',
            title: 'Delivery recorded',
            message: `${result.order_ref} is in orders, deliveries, stock and ${customerName}'s khata.`,
          });
          onRecorded?.();
          close();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not record the delivery.'),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={close} title={`Add past delivery · ${customerName}`} size="xl" centered>
      <Stack gap="md">
        {error && (
          <div className="rounded-xl bg-danger-50 px-4 py-2.5 text-sm font-medium text-danger-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextInput
            label="Recorded / entered at"
            type="datetime-local"
            value={enteredAt}
            onChange={(e) => setEnteredAt(e.currentTarget.value)}
          />
          <TextInput
            label="Delivered on"
            type="date"
            required
            value={deliveredDate}
            onChange={(e) => setDeliveredDate(e.currentTarget.value)}
          />
          <TextInput
            label="Delivery address"
            placeholder="Defaults to customer address"
            value={address}
            onChange={(e) => setAddress(e.currentTarget.value)}
          />
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Text size="sm" fw={600} className="text-zinc-700">Delivered items</Text>
              <Text size="xs" c="dimmed">
                Enter the price charged at the time. Current stock is not capped — this is a past delivery.
              </Text>
            </div>
            <Button
              variant="light"
              size="xs"
              leftSection={<Plus size={14} />}
              onClick={() =>
                setLines((prev) => [...prev, { product_id: '', variant_id: '', quantity: 1, unit_price: '0' }])
              }
            >
              Add item
            </Button>
          </div>
          <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-xl border border-zinc-200 bg-white">
            <Table verticalSpacing="sm" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr className="text-zinc-400">
                  <Table.Th className="text-xs font-semibold uppercase tracking-wider">Product</Table.Th>
                  <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={80}>Qty</Table.Th>
                  <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={110} ta="right">Price</Table.Th>
                  <Table.Th className="text-xs font-semibold uppercase tracking-wider" w={110} ta="right">Amount</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((line, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>
                      <Select
                        size="xs"
                        searchable
                        placeholder="Select product…"
                        data={variantOptions.map((o) => ({ value: o.value, label: o.label }))}
                        value={line.variant_id || null}
                        onChange={(v) => v && selectVariant(index, v)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        size="xs"
                        w={80}
                        min={0}
                        allowDecimal={false}
                        value={line.quantity}
                        onChange={(v) => updateLine(index, { quantity: Number(v) || 0 })}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <input
                        type="number"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => updateLine(index, { unit_price: e.currentTarget.value })}
                        className="h-8 w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-right text-sm outline-none focus:border-brand-400 focus:bg-white"
                      />
                    </Table.Td>
                    <Table.Td ta="right" fw={600} className="text-zinc-800">
                      {formatMoney(((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)).toString())}
                    </Table.Td>
                    <Table.Td>
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-lg p-1 text-zinc-300 transition-colors hover:bg-danger-50 hover:text-danger-500"
                      >
                        <Trash size={14} />
                      </button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
          <div className="mt-3 flex justify-end text-lg font-bold tabular-nums text-zinc-900">
            Total: {formatMoney(total.toString())}
          </div>
        </div>

        <Textarea
          label="Note"
          placeholder="Optional context for this past delivery"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          maxLength={500}
          autosize
          minRows={2}
          maxRows={4}
        />

        <div className="rounded-xl border border-zinc-200 p-4">
          <Checkbox
            label="A payment was received for this delivery"
            checked={includePayment}
            onChange={(e) => setIncludePayment(e.currentTarget.checked)}
          />
          {includePayment && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberInput
                label="Amount received"
                min={0}
                decimalScale={2}
                prefix="₹ "
                value={paymentAmount}
                onChange={(v) => setPaymentAmount(String(v ?? 0))}
              />
              <Select
                label="Payment method"
                data={PAYMENT_METHODS}
                value={paymentMethod}
                onChange={(v) => setPaymentMethod(v ?? 'cash')}
              />
              <TextInput
                label="Payment date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.currentTarget.value)}
              />
              <TextInput
                label="Money recipient bill no."
                placeholder="Optional voucher number"
                value={payerBillNo}
                onChange={(e) => setPayerBillNo(e.currentTarget.value)}
                maxLength={40}
              />
              <TextInput
                label="Payment note"
                placeholder="Optional"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.currentTarget.value)}
                maxLength={500}
              />
              <div className="flex items-end">
                <Checkbox
                  label="Generate a printable receipt"
                  checked={generateReceipt}
                  onChange={(e) => setGenerateReceipt(e.currentTarget.checked)}
                  mb={8}
                />
              </div>
            </div>
          )}
        </div>

        {creditLimit && (
          <Checkbox
            label={`Override credit limit (${formatMoney(creditLimit)} limit, ${formatMoney(creditAvailable ?? '0')} available)`}
            checked={overrideCreditLimit}
            onChange={(e) => setOverrideCreditLimit(e.currentTarget.checked)}
          />
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={close}>Cancel</Button>
          <Button loading={createDelivery.isPending} onClick={submit}>Record delivery</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
