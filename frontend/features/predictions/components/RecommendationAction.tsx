'use client';

import { Badge, Button, Tooltip } from '@mantine/core';
import { EnvelopeSimple, Phone } from '@phosphor-icons/react';

export default function RecommendationAction({
  rec,
  phone,
  email,
  productName,
}: {
  rec: string;
  phone?: string | null;
  email?: string | null;
  productName?: string | null;
}) {
  if (rec === 'call') {
    if (phone) {
      return (
        <Button
          component="a"
          href={`tel:${phone}`}
          size="xs"
          variant="light"
          color="danger"
          leftSection={<Phone size={13} weight="bold" />}
          styles={{ label: { textTransform: 'none' } }}
        >
          Call
        </Button>
      );
    }
    return (
      <Tooltip label="No phone number on file">
        <span>
          <Badge variant="light" color="gray" radius="sm">
            Call
          </Badge>
        </span>
      </Tooltip>
    );
  }

  if (rec === 'message') {
    if (email) {
      const subject = productName
        ? `Following up on your ${productName} order`
        : 'Following up on your order';
      return (
        <Button
          component="a"
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
          size="xs"
          variant="light"
          color="brand"
          leftSection={<EnvelopeSimple size={13} weight="bold" />}
          styles={{ label: { textTransform: 'none' } }}
        >
          Message
        </Button>
      );
    }
    return (
      <Tooltip label="No email on file">
        <span>
          <Badge variant="light" color="gray" radius="sm">
            Message
          </Badge>
        </span>
      </Tooltip>
    );
  }

  return (
    <Badge variant="light" color="gray" radius="sm">
      Wait
    </Badge>
  );
}