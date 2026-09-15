'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Checkbox, Group, Text } from '@mantine/core';
import {
  DotsSixVertical,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  ArrowDown,
  ArrowUp,
} from '@phosphor-icons/react';
import type { BillLayout, BillLayoutAlign, BillLayoutBlock } from '../api';

const ALIGN_OPTIONS: { value: BillLayoutAlign; icon: ReactElement }[] = [
  { value: 'left', icon: <TextAlignLeft size={13} /> },
  { value: 'center', icon: <TextAlignCenter size={13} /> },
  { value: 'right', icon: <TextAlignRight size={13} /> },
];

export default function BillLayoutDesigner({
  layout,
  onChange,
}: {
  layout: BillLayout;
  onChange: (layout: BillLayout) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= layout.blocks.length) return;
    const blocks = [...layout.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    onChange({ blocks });
  };

  const toggleDoc = (block: BillLayoutBlock, doc: string) => {
    onChange({
      blocks: layout.blocks.map((b) =>
        b.id === block.id
          ? { ...b, enabled: { ...b.enabled, [doc]: !(b.enabled[doc] ?? true) } }
          : b,
      ),
    });
  };

  const setAlign = (block: BillLayoutBlock, align: BillLayoutAlign) => {
    onChange({
      blocks: layout.blocks.map((b) => (b.id === block.id ? { ...b, align } : b)),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {layout.blocks.map((block, index) => {
        const isDragging = dragIndex === index;
        return (
          <div
            key={block.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              move(dragIndex ?? -1, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
              isDragging
                ? 'border-brand-400 bg-brand-50 shadow-sm'
                : 'border-zinc-100 bg-white hover:border-zinc-200'
            }`}
          >
            <button
              type="button"
              className="cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
              aria-label="Drag to reorder"
              onClick={() => move(index, Math.max(0, index - 1))}
            >
              <DotsSixVertical size={16} weight="bold" />
            </button>

            <div className="min-w-0 flex-1">
              <Text size="sm" fw={500} className="text-zinc-800">
                {block.label}
              </Text>
              <div className="mt-1 flex items-center gap-3">
                {block.applies.map((doc) => (
                  <Checkbox
                    key={doc}
                    size="xs"
                    label={doc === 'invoice' ? 'Invoice' : 'Receipt'}
                    checked={block.enabled[doc] ?? false}
                    onChange={() => toggleDoc(block, doc)}
                  />
                ))}
              </div>
            </div>

            {block.alignable ? (
              <div className="flex items-center rounded-lg border border-zinc-200 p-0.5">
                {ALIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAlign(block, opt.value)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      block.align === opt.value
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-zinc-400 hover:text-zinc-700'
                    }`}
                    aria-label={`Align ${opt.value}`}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
            ) : (
              <Text size="xs" c="dimmed" className="pr-1">
                Full width
              </Text>
            )}

            <Group gap={6} wrap="nowrap">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move up"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === layout.blocks.length - 1}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move down"
              >
                <ArrowDown size={13} />
              </button>
            </Group>
          </div>
        );
      })}
    </div>
  );
}