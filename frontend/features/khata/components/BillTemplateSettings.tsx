'use client';

import { useState } from 'react';
import {
  Button,
  FileInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ImageSquare, Receipt, FileText, SlidersHorizontal } from '@phosphor-icons/react';
import { useBillTemplate, useUpdateBillTemplate, useUploadTemplateImage } from '../api';
import type { BillLayout, BillTemplate } from '../api';
import BillLayoutDesigner from './BillLayoutDesigner';
import BillPreview from './BillPreview';

function ImagePicker({
  kind,
  label,
  hint,
  dataUrl,
}: {
  kind: 'logo' | 'signature';
  label: string;
  hint: string;
  dataUrl: string | null;
}) {
  const upload = useUploadTemplateImage();

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ImageSquare size={16} weight="duotone" />
        </span>
        <div>
          <Text fw={600} size="sm" className="text-zinc-800">{label}</Text>
          <Text size="xs" c="dimmed">{hint}</Text>
        </div>
      </div>

      {dataUrl ? (
        <div className="mb-3 flex h-28 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={kind}
            className="max-h-full max-w-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="mb-3 flex h-20 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-400">
          No {kind} set
        </div>
      )}

      <FileInput
        placeholder="Choose image"
        accept="image/*"
        size="sm"
        disabled={upload.isPending}
        onChange={(file) => {
          if (!file) return;
          upload.mutate(
            { kind, file },
            {
              onSuccess: () =>
                notifications.show({
                  color: 'success',
                  title: `${label} updated`,
                  message: 'Applied to new receipts and invoices.',
                }),
              onError: (err) =>
                notifications.show({
                  color: 'red',
                  title: 'Upload failed',
                  message: err instanceof Error ? err.message : 'Something went wrong',
                }),
            },
          );
        }}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function BillFormatEditor({ template }: { template: BillTemplate }) {
  const updateTemplate = useUpdateBillTemplate();

  const [text, setText] = useState(() => ({
    business_name: template.business_name,
    tax_id: template.tax_id ?? '',
    address: template.address ?? '',
    phone: template.phone ?? '',
    email: template.email ?? '',
    footer_note: template.footer_note ?? '',
    invoice_number_prefix: template.invoice_number_prefix,
    receipt_number_prefix: template.receipt_number_prefix,
  }));
  const [layout, setLayout] = useState<BillLayout>(template.layout ?? { blocks: [] });
  const [docType, setDocType] = useState<'invoice' | 'receipt'>('invoice');

  const set = (field: keyof typeof text) => (value: string) =>
    setText((f) => ({ ...f, [field]: value }));

  const save = () => {
    updateTemplate.mutate(
      {
        business_name: text.business_name || null,
        tax_id: text.tax_id || null,
        address: text.address || null,
        phone: text.phone || null,
        email: text.email || null,
        footer_note: text.footer_note || null,
        invoice_number_prefix: text.invoice_number_prefix || null,
        receipt_number_prefix: text.receipt_number_prefix || null,
        layout,
      },
      {
        onSuccess: () =>
          notifications.show({
            color: 'success',
            title: 'Bill format saved',
            message: 'New receipts and invoices will use this branding and layout.',
          }),
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Save failed',
            message: err instanceof Error ? err.message : 'Something went wrong',
          }),
      },
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <FileText size={18} weight="duotone" />
            </span>
            <div>
              <Text fw={600} size="md" className="text-zinc-800">Business details</Text>
              <Text size="xs" c="dimmed">Printed on every receipt and invoice.</Text>
            </div>
          </div>
          <Stack gap="md">
            <TextField label="Business name" value={text.business_name} onChange={set('business_name')} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="PAN / VAT number" value={text.tax_id} onChange={set('tax_id')} />
              <TextField label="Phone" value={text.phone} onChange={set('phone')} />
            </div>
            <TextField label="Email" value={text.email} onChange={set('email')} />
            <TextField label="Address" value={text.address} onChange={set('address')} />
            <TextField
              label="Footer note"
              placeholder="e.g. THANK YOU FOR YOUR BUSINESS"
              value={text.footer_note}
              onChange={set('footer_note')}
            />
          </Stack>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ImagePicker
            kind="logo"
            label="Logo"
            hint="Shown top-left (best: square, ≤3MB)"
            dataUrl={template.logo?.data_url ?? null}
          />
          <ImagePicker
            kind="signature"
            label="Authorized signature"
            hint="Shown on invoices"
            dataUrl={template.signature?.data_url ?? null}
          />
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
              <Receipt size={18} weight="duotone" />
            </span>
            <div>
              <Text fw={600} size="md" className="text-zinc-800">Numbering</Text>
              <Text size="xs" c="dimmed">Prefixes for the auto-incrementing counters.</Text>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Invoice prefix" value={text.invoice_number_prefix} onChange={set('invoice_number_prefix')} />
            <TextField label="Receipt prefix" value={text.receipt_number_prefix} onChange={set('receipt_number_prefix')} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 px-4 py-3">
              <Text size="xs" c="dimmed" fw={600}>Next invoice number</Text>
              <Text size="sm" fw={600} className="text-zinc-800">
                {text.invoice_number_prefix || 'INV-'}
                {template.next_invoice_number}
              </Text>
            </div>
            <div className="rounded-xl bg-zinc-50 px-4 py-3">
              <Text size="xs" c="dimmed" fw={600}>Next receipt number</Text>
              <Text size="sm" fw={600} className="text-zinc-800">
                {text.receipt_number_prefix || 'RCT-'}
                {template.next_receipt_number}
              </Text>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
              <SlidersHorizontal size={18} weight="duotone" />
            </span>
            <div>
              <Text fw={600} size="md" className="text-zinc-800">Layout</Text>
              <Text size="xs" c="dimmed">
                Drag blocks to reorder, toggle them per document, and align. Changes preview live.
              </Text>
            </div>
          </div>
          <BillLayoutDesigner layout={layout} onChange={setLayout} />
        </div>
      </div>

      <div className="sticky top-6 flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <Text fw={600} size="sm" className="text-zinc-800">Live preview</Text>
              <Text size="xs" c="dimmed">Matches the printed PDF.</Text>
            </div>
            <SegmentedControl
              size="xs"
              value={docType}
              onChange={(v) => setDocType(v as 'invoice' | 'receipt')}
              data={[
                { value: 'invoice', label: 'Invoice' },
                { value: 'receipt', label: 'Receipt' },
              ]}
            />
          </div>
          <div className="flex justify-center">
            <BillPreview
              docType={docType}
              draft={{
                ...text,
                next_invoice_number: template.next_invoice_number,
                next_receipt_number: template.next_receipt_number,
              }}
              logo={template.logo?.data_url ?? null}
              signature={template.signature?.data_url ?? null}
              layout={layout}
            />
          </div>
        </div>

        <Button size="md" onClick={save} loading={updateTemplate.isPending} className="self-end">
          Save bill format
        </Button>
      </div>
    </div>
  );
}

export default function BillTemplateSettings() {
  const templateQuery = useBillTemplate();

  if (templateQuery.isLoading) return null;
  if (templateQuery.isError || !templateQuery.data) {
    return <Text c="dimmed" size="sm">Could not load the bill format template.</Text>;
  }

  return <BillFormatEditor template={templateQuery.data} />;
}