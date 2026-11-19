'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Camera,
  FloppyDisk,
  LockKey,
  MapPin,
  Trash,
} from '@phosphor-icons/react';
import { apiAssetUrl } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorState, LoadingState, LocationPicker, PageHeader } from '@/components/shared';
import { useProfile, useRemoveAvatar, useUpdateProfile, useUploadAvatar } from '../api';
import type { UserProfile } from '../api';

type LatLng = { lat: number; lng: number } | null;

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function locationFromProfile(profile: UserProfile): LatLng {
  const lat = toNumber(profile.latitude);
  const lng = toNumber(profile.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function sameLocation(a: LatLng, b: LatLng): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function ProfileContent({ profile }: { profile: UserProfile }) {
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const [fullName, setFullName] = useState(profile.full_name);
  const [location, setLocation] = useState<LatLng>(locationFromProfile(profile));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const savedLocation = locationFromProfile(profile);
  const nameChanged = fullName.trim() !== profile.full_name;
  const locationChanged = !sameLocation(location, savedLocation);
  const canSave =
    fullName.trim().length > 0 && (nameChanged || locationChanged) && !update.isPending;

  const handleSave = () => {
    if (!canSave) return;
    update.mutate(
      {
        full_name: fullName.trim(),
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
      },
      {
        onSuccess: () => {
          setFullName((name) => name.trim());
          notifications.show({
            color: 'success',
            title: 'Profile updated',
            message: 'Your details and saved location were updated.',
          });
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'Could not save profile',
            message: errorMessage(error),
          }),
      },
    );
  };

  const handleAvatarUpload = () => {
    if (!avatarFile) return;
    uploadAvatar.mutate(avatarFile, {
      onSuccess: () => {
        setAvatarFile(null);
        notifications.show({
          color: 'success',
          title: 'Photo updated',
          message: 'Your profile photo is now visible in the app.',
        });
      },
      onError: (error) =>
        notifications.show({
          color: 'red',
          title: 'Upload failed',
          message: errorMessage(error),
        }),
    });
  };

  const handleAvatarRemove = () => {
    removeAvatar.mutate(undefined, {
      onSuccess: () =>
        notifications.show({
          color: 'success',
          title: 'Photo removed',
          message: 'Your initials will be shown instead.',
        }),
      onError: (error) =>
        notifications.show({
          color: 'red',
          title: 'Could not remove photo',
          message: errorMessage(error),
        }),
    });
  };

  return (
    <div>
      <PageHeader
        title="My profile"
        subtitle="Manage your personal details, profile photo, and saved location."
        actions={
          <Button
            leftSection={<FloppyDisk size={16} />}
            onClick={handleSave}
            loading={update.isPending}
            disabled={!canSave}
          >
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Paper radius="lg" withBorder p="xl">
          <div className="flex flex-col items-center text-center">
            <Avatar
              color="brand"
              radius={999}
              size={104}
              src={apiAssetUrl(profile.avatar_url)}
            >
              {initials(profile.full_name) || 'U'}
            </Avatar>
            <Title order={2} size="h4" mt="md">
              {profile.full_name}
            </Title>
            <Text size="sm" c="dimmed">
              {profile.email}
            </Text>
            <Group justify="center" gap="xs" mt="sm">
              <Badge color="brand" variant="light">
                {titleCase(profile.role)}
              </Badge>
              <Badge
                color={profile.is_email_verified ? 'success' : 'warning'}
                variant="light"
              >
                {profile.is_email_verified ? 'Email verified' : 'Email unverified'}
              </Badge>
            </Group>
          </div>

          <Divider my="lg" />

          <Stack gap="sm">
            <FileInput
              label="Profile photo"
              placeholder="PNG, JPG, WebP or GIF up to 2MB"
              accept="image/png,image/jpeg,image/webp,image/gif"
              leftSection={<Camera size={16} />}
              value={avatarFile}
              onChange={setAvatarFile}
              clearable
            />
            <Group grow>
              <Button
                variant="light"
                onClick={handleAvatarUpload}
                loading={uploadAvatar.isPending}
                disabled={!avatarFile}
              >
                Upload photo
              </Button>
              {profile.avatar_url && (
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<Trash size={16} />}
                  onClick={handleAvatarRemove}
                  loading={removeAvatar.isPending}
                >
                  Remove
                </Button>
              )}
            </Group>
          </Stack>

          <Divider my="lg" />

          <Stack gap="xs">
            <Group justify="space-between" gap="md">
              <Text size="sm" c="dimmed">
                Member since
              </Text>
              <Text size="sm" fw={500}>
                {formatDate(profile.created_at)}
              </Text>
            </Group>
            <Group justify="space-between" gap="md">
              <Text size="sm" c="dimmed">
                Account status
              </Text>
              <Text size="sm" fw={500}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </Text>
            </Group>
            {profile.is_superadmin && (
              <Group justify="space-between" gap="md">
                <Text size="sm" c="dimmed">
                  Access
                </Text>
                <Text size="sm" fw={500}>
                  Platform admin
                </Text>
              </Group>
            )}
          </Stack>
        </Paper>

        <div className="flex flex-col gap-6">
          <Paper radius="lg" withBorder p="xl">
            <Title order={2} size="h4">
              Personal details
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              Your name is shown to teammates across the workspace.
            </Text>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleSave();
              }}
            >
              <TextInput
                label="Full name"
                placeholder="Your full name"
                value={fullName}
                maxLength={200}
                required
                onChange={(event) => setFullName(event.currentTarget.value)}
              />
              <TextInput
                label="Email address"
                value={profile.email}
                disabled
                description="Contact an administrator to change your sign-in email."
              />
              <TextInput
                label="Role"
                value={titleCase(profile.role)}
                disabled
                description="Roles are managed by an administrator."
              />
            </form>
          </Paper>

          <Paper radius="lg" withBorder p="xl">
            <Group gap="sm" align="center">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <MapPin size={18} weight="duotone" />
              </span>
              <div>
                <Title order={2} size="h4">
                  Saved location
                </Title>
                <Text size="sm" c="dimmed">
                  Used to centre maps and prefill your location.
                </Text>
              </div>
            </Group>

            <div className="mt-5">
              <LocationPicker
                value={location}
                onChange={setLocation}
                label="Your location"
                placeholder="Search your address or drop a pin"
                autoLocate={false}
              />
            </div>

            <Group justify="space-between" mt="sm">
              <Text size="xs" c="dimmed">
                Use the top-right Save changes button to store this location.
              </Text>
              {location && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => setLocation(null)}
                >
                  Clear
                </Button>
              )}
            </Group>
          </Paper>

          <Paper radius="lg" withBorder p="xl">
            <Group justify="space-between" align="center" gap="md" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <LockKey size={18} className="text-zinc-500" />
                  <Title order={2} size="h4">
                    Password
                  </Title>
                </Group>
                <Text size="sm" c="dimmed" mt={4}>
                  Choose a strong password you don&apos;t use anywhere else.
                </Text>
              </div>
              <Button component={Link} href="/settings/change-password" variant="light">
                Change
              </Button>
            </Group>
          </Paper>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const profile = useProfile();

  if (profile.isLoading) {
    return (
      <div>
        <PageHeader
          title="My profile"
          subtitle="Manage your personal details, profile photo, and saved location."
        />
        <LoadingState label="Loading profile…" />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div>
        <PageHeader
          title="My profile"
          subtitle="Manage your personal details, profile photo, and saved location."
        />
        <ErrorState
          message={errorMessage(profile.error)}
          retry={() => void profile.refetch()}
        />
      </div>
    );
  }

  if (!profile.data) return null;

  return <ProfileContent profile={profile.data} />;
}
