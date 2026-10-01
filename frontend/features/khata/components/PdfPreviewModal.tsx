'use client';

import { Button, Group, Modal, Text } from '@mantine/core';
import { DownloadSimple } from '@phosphor-icons/react';
import { downloadOnClick } from '@/lib/api-client';
import PdfViewer from './PdfViewer';

export default function PdfPreviewModal({
  opened,
  onClose,
  url,
  title,
  subtitle,
  fallbackName,
}: {
  opened: boolean;
  onClose: () => void;
  url: string;
  title: string;
  subtitle?: string;
  fallbackName: string;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div>
          <Text fw={600} size="sm">
            {title}
          </Text>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </div>
      }
      size={1050}
      centered
      closeOnClickOutside={false}
    >
      <Group justify="flex-end" mb="sm">
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<DownloadSimple size={14} />}
          onClick={downloadOnClick(url, fallbackName)}
        >
          Download PDF
        </Button>
      </Group>
      <div className="h-[72vh]">
        <PdfViewer url={url} containerClass="h-full" />
      </div>
    </Modal>
  );
}