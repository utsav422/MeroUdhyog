'use client';

import { Alert } from '@mantine/core';
import {
  CheckCircle,
  Info,
  WarningCircle,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export { Alert } from '@mantine/core';

export function FormAlert({
  variant,
  children,
}: {
  variant: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const config = {
    error: { color: 'red', Icon: WarningCircle, title: undefined },
    success: { color: 'teal', Icon: CheckCircle, title: undefined },
    info: { color: 'blue', Icon: Info, title: undefined },
  }[variant];

  const Icon = config.Icon;

  return (
    <Alert
      color={config.color}
      variant="light"
      radius="md"
      icon={<Icon size={18} weight="fill" />}
    >
      {children}
    </Alert>
  );
}
