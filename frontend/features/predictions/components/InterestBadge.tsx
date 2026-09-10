'use client';

import { Badge } from '@mantine/core';

export default function InterestBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'success' : score >= 40 ? 'warning' : 'gray';
  return (
    <Badge variant="light" color={color} radius="sm">
      {score}
    </Badge>
  );
}