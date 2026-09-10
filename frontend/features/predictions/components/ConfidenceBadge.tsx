'use client';

import { Badge } from '@mantine/core';
import { CheckCircle, Circle, CircleHalf } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const CONFIDENCE_STYLE: Record<
  string,
  { label: string; color: string; icon: ReactNode }
> = {
  high: {
    label: 'High confidence',
    color: 'success',
    icon: <CheckCircle size={14} weight="fill" />,
  },
  medium: {
    label: 'Medium confidence',
    color: 'warning',
    icon: <CircleHalf size={15} weight="fill" />,
  },
  low: {
    label: 'Low confidence',
    color: 'gray',
    icon: <Circle size={14} />,
  },
};

export default function ConfidenceBadge({
  confidence,
}: {
  confidence?: string | null;
}) {
  const style = CONFIDENCE_STYLE[confidence ?? ''] ?? CONFIDENCE_STYLE.low;
  return (
    <Badge
      variant="outline"
      color={style.color}
      radius="sm"
      styles={{ label: { textTransform: 'none' } }}
    >
      <span className="inline-flex items-center gap-1">
        {style.icon}
        {style.label}
      </span>
    </Badge>
  );
}