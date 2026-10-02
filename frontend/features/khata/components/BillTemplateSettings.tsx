'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  FileInput,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ImageSquare, Receipt, FileText, SlidersHorizontal } from '@phosphor-icons/react';
import {
  useBillLayouts,
  useBillTemplate,
  useUpdateBillLayout,
  useUpdateBillTemplate,
  useUploadTemplateImage,
} from '../api';
import type { BillDocType, BillLayout, BillLayoutPreset, BillTemplate } from '../api';
import BillLayoutDesigner from './BillLayoutDesigner';
import BillLayoutLibrary from './BillLayoutLibrary';
import BillPreview from './BillPreview';

function cloneLayout(layout: BillLayout): BillLayout {
  return { blocks: layout.blocks.map((b) => ({ ...b, enabled: { ...b.enabled } })) };
}

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

function LoadingLayout() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton height={280} radius="lg" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Skeleton height={200} radius="lg" />
        <Skeleton height={200} radius="lg" />
      </div>
      <Skeleton height={220} radius="lg" />
    </div>
  );
}

function BillFormatEditor({
  template,
  presets,
  layoutsLoading,
}: {
  template: BillTemplate;
  presets: BillLayoutPreset[];
  layoutsLoading: boolean;
}) {
  const updateTemplate = useUpdateBillTemplate();
  const updateLayout = useUpdateBillLayout();

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
  const [docType, setDocType] = useState<BillDocType>('invoice');
  const [selectedId, setSelectedId] = useState<string | null>(
    () => presets.find((p) => p.is_default_invoice)?.id ?? presets[0]?.id ?? null,
  );
  // Once the user picks a preset from the library we stop auto-following the
  // previewed document type, so toggling Invoice/Receipt never yanks their
  // selection (or unsaved edits) away.
  const [followsPreview, setFollowsPreview] = useState(true);
  // The layout being edited. `draft.id` tracks which preset the working copy
  // belongs to, so switching presets falls back to the saved copy while
  // background refetches never clobber in-progress edits.
  const [draft, setDraft] = useState<{ id: string | null; layout: BillLayout }>(() => ({
    id: presets.find((p) => p.is_default_invoice)?.id ?? presets[0]?.id ?? null,
    layout: cloneLayout(
      presets.find((p) => p.is_default_invoice)?.layout ?? presets[0]?.layout ?? { blocks: [] },
    ),
  }));

  const selected = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? presets[0] ?? null,
    [presets, selectedId],
  );

  const layout =
    selected && draft.id === selected.id
      ? draft.layout
      : cloneLayout(selected?.layout ?? { blocks: [] });

  const setLayout = (next: BillLayout) =>
    setDraft({ id: selected?.id ?? null, layout: next });

  const changeDocType = (next: BillDocType) => {
    setDocType(next);
    if (!followsPreview) return;
    const target = presets.find((p) =>
      next === 'invoice' ? p.is_default_invoice : p.is_default_receipt,
    );
    if (target) setSelectedId(target.id);
  };

  const selectPreset = (id: string) => {
    setFollowsPreview(false);
    setSelectedId(id);
  };

  const set = (field: keyof typeof text) => (value: string) =>
    setText((f) => ({ ...f, [field]: value }));

  const saveDetails = () => {
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
      },
      {
        onSuccess: () =>
          notifications.show({
            color: 'success',
            title: 'Bill format saved',
            message: 'New receipts and invoices will use this branding.',
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

  const saveLayout = () => {
    if (!selected) return;
    updateLayout.mutate(
      { id: selected.id, layout },
      {
        onSuccess: (preset) => {
          const inUse =
            preset.is_default_invoice || preset.is_default_receipt
              ? `It is used for all ${preset.is_default_invoice ? 'invoices' : 'receipts'}.`
              : 'It is saved but not used for any document type yet.';
          notifications.show({
            color: 'success',
            title: 'Layout saved',
            message: `“${preset.name}” updated. ${inUse}`,
          });
        },
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Could not save layout',
            message: err instanceof Error ? err.message : 'Something went wrong',
          }),
      },
    );
  };

  const branding = {
    business_name: text.business_name,
    tax_id: text.tax_id || null,
    address: text.address || null,
    phone: text.phone || null,
    email: text.email || null,
    footer_note: text.footer_note || null,
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
                Pick a saved layout, then drag blocks to reorder, toggle them per document, and align.
                Changes preview live.
              </Text>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <BillLayoutLibrary
              presets={presets}
              isLoading={layoutsLoading}
              selectedId={selected?.id ?? null}
              currentLayout={layout}
              onSelect={selectPreset}
              onCreated={(preset) => selectPreset(preset.id)}
            />
            <div className="min-w-0">
              {selected && layout.blocks.length > 0 ? (
                <>
                  <Text size="xs" c="dimmed" mb={8}>
                    Editing “{selected.name}”
                  </Text>
                  <BillLayoutDesigner layout={layout} onChange={setLayout} />
                  <Button
                    size="sm"
                    mt="md"
                    onClick={saveLayout}
                    loading={updateLayout.isPending}
                  >
                    Save layout
                  </Button>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  {layoutsLoading ? 'Loading layouts…' : 'Select a layout to start editing.'}
                </Text>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky top-6 flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Text fw={600} size="sm" className="text-zinc-800">Live preview</Text>
              <Text size="xs" c="dimmed">Matches the printed PDF.</Text>
            </div>
            <SegmentedControl
              size="xs"
              value={docType}
              onChange={(v) => changeDocType(v as BillDocType)}
              data={[
                { value: 'invoice', label: 'Invoice' },
                { value: 'receipt', label: 'Receipt' },
              ]}
            />
          </div>
          <div className="flex justify-center">
            <BillPreview
              docType={docType}
              branding={branding}
              logo={template.logo?.data_url ?? null}
              signature={template.signature?.data_url ?? null}
              layout={layout}
            />
          </div>
        </div>

        <Button size="md" onClick={saveDetails} loading={updateTemplate.isPending} className="self-end">
          Save bill format
        </Button>
      </div>
    </div>
  );
}

export default function BillTemplateSettings() {
  const templateQuery = useBillTemplate();
  const layoutsQuery = useBillLayouts();

  const presets = layoutsQuery.data ?? [];
  const templateReady = !templateQuery.isLoading && !!templateQuery.data;
  const presetsReady = !layoutsQuery.isLoading;

  if (!templateReady && !templateQuery.isError) return <LoadingLayout />;
  if (templateQuery.isError || !templateQuery.data) {
    return <Text c="dimmed" size="sm">Could not load the bill format template.</Text>;
  }

  if (!presetsReady) {
    return (
      <div className="flex flex-col gap-6">
        <LoadingLayout />
        <Text size="sm" c="dimmed">Loading saved bill layouts…</Text>
      </div>
    );
  }

  return (
    <BillFormatEditor
      template={templateQuery.data}
      presets={presets}
      layoutsLoading={layoutsQuery.isLoading}
    />
  );
}
