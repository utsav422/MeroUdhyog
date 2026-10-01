'use client';

import { useState } from 'react';
import { ActionIcon, Badge, Button, Menu, Modal, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  CheckCircle,
  Copy,
  DotsThreeVertical,
  FileText,
  NotePencil,
  Plus,
  Receipt,
  TrashSimple,
} from '@phosphor-icons/react';
import {
  useCreateBillLayout,
  useDeleteBillLayout,
  useSetDefaultBillLayout,
  useUpdateBillLayout,
} from '../api';
import type { BillDocType, BillLayout, BillLayoutPreset } from '../api';

const DOC_LABEL: Record<BillDocType, string> = {
  invoice: 'invoices',
  receipt: 'receipts',
};

function uniqueName(presets: BillLayoutPreset[], base: string): string {
  const taken = new Set(presets.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

export default function BillLayoutLibrary({
  presets,
  isLoading,
  selectedId,
  currentLayout,
  onSelect,
  onCreated,
}: {
  presets: BillLayoutPreset[];
  isLoading: boolean;
  selectedId: string | null;
  /** The designer's current on-screen layout, used to seed new/duplicated presets. */
  currentLayout: BillLayout;
  onSelect: (id: string) => void;
  onCreated: (preset: BillLayoutPreset) => void;
}) {
  const createLayout = useCreateBillLayout();
  const updateLayout = useUpdateBillLayout();
  const deleteLayout = useDeleteBillLayout();
  const setDefault = useSetDefaultBillLayout();

  const [renameTarget, setRenameTarget] = useState<BillLayoutPreset | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BillLayoutPreset | null>(null);

  const notifyError = (title: string, err: unknown) =>
    notifications.show({
      color: 'red',
      title,
      message: err instanceof Error ? err.message : 'Something went wrong',
    });

  const handleCreate = (name: string, layout: BillLayout, title: string) => {
    createLayout.mutate(
      { name, layout },
      {
        onSuccess: (preset) => {
          onCreated(preset);
          notifications.show({
            color: 'success',
            title: `${title} created`,
            message:
              preset.is_default_invoice || preset.is_default_receipt
                ? `“${preset.name}” is already used for ${DOC_LABEL[
                    preset.is_default_invoice ? 'invoice' : 'receipt'
                  ]}.`
                : `“${preset.name}” is saved but not in use yet.`,
          });
        },
        onError: (err) => notifyError('Could not create layout', err),
      },
    );
  };

  const handleSetDefault = (preset: BillLayoutPreset, docType: BillDocType) => {
    setDefault.mutate(
      { id: preset.id, docType },
      {
        onSuccess: () =>
          notifications.show({
            color: 'success',
            title: `Default layout updated`,
            message: `“${preset.name}” now applies to every ${DOC_LABEL[docType]} in the app.`,
          }),
        onError: (err) => notifyError('Could not update the default layout', err),
      },
    );
  };

  const submitRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    updateLayout.mutate(
      { id: renameTarget.id, name },
      {
        onSuccess: (preset) => {
          setRenameTarget(null);
          notifications.show({
            color: 'success',
            title: 'Layout renamed',
            message: `This layout is now called “${preset.name}”.`,
          });
        },
        onError: (err) => notifyError('Could not rename layout', err),
      },
    );
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    deleteLayout.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        notifications.show({
          color: 'success',
          title: 'Layout deleted',
          message: `“${deleteTarget.name}” is no longer saved.`,
        });
      },
      onError: (err) => notifyError('Could not delete layout', err),
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm"
          >
            <Skeleton height={12} width="45%" radius="sm" mb={10} />
            <Skeleton height={10} width="70%" radius="sm" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="light"
        size="sm"
        leftSection={<Plus size={16} />}
        loading={createLayout.isPending}
        onClick={() =>
          handleCreate(uniqueName(presets, 'New layout'), currentLayout, 'Layout')
        }
      >
        New layout
      </Button>

      <Stack gap="sm">
        {presets.map((preset) => {
          const isDefaultInvoice = preset.is_default_invoice;
          const isDefaultReceipt = preset.is_default_receipt;
          const isLast = presets.length === 1;
          const deleteDisabled = isDefaultInvoice || isDefaultReceipt || isLast;
          const deleteLabel = isLast
            ? 'Cannot delete last layout'
            : isDefaultInvoice || isDefaultReceipt
              ? 'Cannot delete default layout'
              : 'Delete';

          return (
            <div
              key={preset.id}
              onClick={() => onSelect(preset.id)}
              className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                preset.id === selectedId
                  ? 'border-brand-400 ring-1 ring-brand-200'
                  : 'border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Text fw={600} size="sm" className="truncate text-zinc-800">
                    {preset.name}
                  </Text>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isDefaultInvoice && (
                      <Badge
                        size="xs"
                        variant="light"
                        color="brand"
                        leftSection={<FileText size={10} />}
                      >
                        Default for all invoices
                      </Badge>
                    )}
                    {isDefaultReceipt && (
                      <Badge
                        size="xs"
                        variant="light"
                        color="success"
                        leftSection={<Receipt size={10} />}
                      >
                        Default for all receipts
                      </Badge>
                    )}
                    {!isDefaultInvoice && !isDefaultReceipt && (
                      <Text size="xs" c="dimmed">
                        Not in use
                      </Text>
                    )}
                  </div>
                </div>

                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Actions for ${preset.name}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DotsThreeVertical size={18} weight="bold" />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item
                      leftSection={
                        isDefaultInvoice ? <CheckCircle size={16} /> : <FileText size={16} />
                      }
                      disabled={isDefaultInvoice}
                      onClick={() => handleSetDefault(preset, 'invoice')}
                    >
                      {isDefaultInvoice ? 'Default for all invoices' : 'Use for all invoices'}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={
                        isDefaultReceipt ? <CheckCircle size={16} /> : <Receipt size={16} />
                      }
                      disabled={isDefaultReceipt}
                      onClick={() => handleSetDefault(preset, 'receipt')}
                    >
                      {isDefaultReceipt ? 'Default for all receipts' : 'Use for all receipts'}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<NotePencil size={16} />}
                      onClick={() => {
                        setRenameTarget(preset);
                        setRenameValue(preset.name);
                      }}
                    >
                      Rename
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Copy size={16} />}
                      onClick={() =>
                        handleCreate(
                          uniqueName(presets, `${preset.name} copy`),
                          preset.layout,
                          'Layout',
                        )
                      }
                    >
                      Duplicate
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      disabled={deleteDisabled}
                      leftSection={<TrashSimple size={16} />}
                      onClick={() => setDeleteTarget(preset)}
                    >
                      {deleteLabel}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>
          );
        })}
      </Stack>

      <Modal
        opened={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="Rename layout"
        size="sm"
      >
        <TextInput
          label="Layout name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.currentTarget.value)}
          data-autofocus
          maxLength={60}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="default" onClick={() => setRenameTarget(null)}>
            Cancel
          </Button>
          <Button onClick={submitRename} loading={updateLayout.isPending}>
            Save name
          </Button>
        </div>
      </Modal>

      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete layout"
        size="sm"
      >
        <Text size="sm" className="text-zinc-600">
          Delete “{deleteTarget?.name}”? This cannot be undone.
        </Text>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={submitDelete} loading={deleteLayout.isPending}>
            Delete layout
          </Button>
        </div>
      </Modal>
    </div>
  );
}
