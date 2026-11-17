'use client';

import {
  Badge,
  Drawer,
  Group,
  Loader,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useAccounts, useJournalEntry } from '../api';
import { useMoney } from './StatementRows';

export default function JournalEntryDrawer({
  entryId,
  onClose,
}: {
  entryId: string | null;
  onClose: () => void;
}) {
  const query = useJournalEntry(entryId);
  const accountsQuery = useAccounts();
  const money = useMoney('NPR');
  const entry = query.data;

  const accountById = new Map(
    (accountsQuery.data ?? []).map((account) => [
      account.id,
      `${account.code} · ${account.name}`,
    ]),
  );

  const totalDebit = entry?.lines.reduce((sum, line) => sum + Number(line.debit), 0) ?? 0;
  const totalCredit = entry?.lines.reduce((sum, line) => sum + Number(line.credit), 0) ?? 0;

  return (
    <Drawer
      opened={!!entryId}
      onClose={onClose}
      position="right"
      size="lg"
      title={entry ? `${entry.entry_no} · ${entry.voucher_type}` : 'Journal entry'}
    >
      {query.isLoading && (
        <div className="flex justify-center py-10">
          <Loader size="sm" />
        </div>
      )}
      {query.isError && (
        <Text c="red" size="sm">
          Could not load this journal entry.
        </Text>
      )}
      {entry && (
        <Stack>
          <Group gap="xs" wrap="wrap">
            <Badge variant="light" color={entry.status === 'posted' ? 'green' : 'gray'}>
              {entry.status}
            </Badge>
            <Text size="sm" c="dimmed">
              {entry.entry_date}
            </Text>
            {entry.reference && (
              <Text size="sm" c="dimmed">
                Ref: {entry.reference}
              </Text>
            )}
            {entry.source_type && (
              <Badge variant="outline" color="gray">
                {entry.source_type}
              </Badge>
            )}
          </Group>

          {entry.narration && <Text size="sm">{entry.narration}</Text>}

          <Table.ScrollContainer minWidth={520}>
            <Table striped withTableBorder verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Account</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th ta="right">Debit</Table.Th>
                  <Table.Th ta="right">Credit</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {entry.lines.map((line) => (
                  <Table.Tr key={line.id}>
                    <Table.Td>{accountById.get(line.account_id) ?? 'Unknown account'}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {line.description || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" className="tabular-nums">
                      {Number(line.debit) ? money(line.debit) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular-nums">
                      {Number(line.credit) ? money(line.credit) : '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th colSpan={2}>Total</Table.Th>
                  <Table.Th ta="right" className="tabular-nums">
                    {money(totalDebit)}
                  </Table.Th>
                  <Table.Th ta="right" className="tabular-nums">
                    {money(totalCredit)}
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      )}
    </Drawer>
  );
}
