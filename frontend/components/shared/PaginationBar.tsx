'use client';

import { Group, Pagination, Select, Text } from '@mantine/core';

const PAGE_SIZES = ['10', '25', '50'];

export default function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <Group justify="space-between" align="center" wrap="wrap" mt="md">
      <Text size="sm" c="dimmed">
        Showing {start}–{end} of {total}
      </Text>
      <Group gap="sm" align="center">
        <Group gap="xs" align="center">
          <Text size="sm" c="dimmed">
            Rows per page
          </Text>
          <Select
            size="xs"
            w={80}
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            data={PAGE_SIZES}
            allowDeselect={false}
          />
        </Group>
        <Pagination
          value={page}
          onChange={onPageChange}
          total={totalPages}
          siblings={1}
          withEdges
          size="sm"
        />
      </Group>
    </Group>
  );
}
