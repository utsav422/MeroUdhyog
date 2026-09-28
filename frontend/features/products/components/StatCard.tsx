'use client';

import { Text } from '@mantine/core';

export default function StatCard({
  icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <Text size="xs" c="var(--muted)" fw={500}>{label}</Text>
      <Text fw={700} size="lg" className="mt-0.5">{value}</Text>
      {hint && (
        <Text size="xs" c="var(--muted)" className="mt-0.5">{hint}</Text>
      )}
    </div>
  );
}