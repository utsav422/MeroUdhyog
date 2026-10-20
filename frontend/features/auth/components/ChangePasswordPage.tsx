'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Paper, PasswordInput, Progress, Title, Text } from '@mantine/core';
import {
  CheckCircle,
  LockSimple,
  SignOut,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/components/fields';
import { evaluatePassword } from '@/features/auth/password';

export default function ChangePasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = evaluatePassword(newPassword);
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const sameAsCurrent =
    currentPassword.length > 0 && currentPassword === newPassword;

  const change = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setDone(true);
      queryClient.clear();
    },
    onError: (err) =>
      setError(
        err instanceof ApiClientError
          ? err.detail
          : 'Could not change your password. Please try again.',
      ),
  });

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    router.push('/login');
    router.refresh();
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Paper radius="lg" withBorder p="xl">
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="text-teal-500">
              <CheckCircle size={56} weight="fill" />
            </span>
            <Title order={2} fw={600}>
              Password changed
            </Title>
            <Text c="dimmed" size="sm">
              For your security, we signed you out of all other sessions. Sign
              in again with your new password.
            </Text>
            <Button
              color="brand"
              size="md"
              leftSection={<SignOut size={18} />}
              onClick={signOut}
            >
              Sign in again
            </Button>
          </div>
        </Paper>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Paper radius="lg" withBorder p="xl">
        <Title order={2} fw={600}>
          Change password
        </Title>
        <Text c="dimmed" size="sm" mt={4}>
          Choose a strong password you don&apos;t use anywhere else.
        </Text>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (newPassword !== confirm) {
              setError('New passwords do not match.');
              return;
            }
            change.mutate();
          }}
          className="mt-6 space-y-4"
        >
          <PasswordInput
            label="Current password"
            placeholder="Your current password"
            required
            autoComplete="current-password"
            leftSection={<LockSimple size={18} />}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.currentTarget.value)}
          />

          <div>
            <PasswordInput
              label="New password"
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
              leftSection={<LockSimple size={18} />}
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
            />
            {newPassword && (
              <div className="mt-2">
                <Progress
                  value={(strength.score / 4) * 100}
                  color={strength.color}
                  size="xs"
                  radius="xl"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Strength:{' '}
                  <span className="font-medium">{strength.label}</span>
                </p>
              </div>
            )}
          </div>

          <PasswordInput
            label="Confirm new password"
            placeholder="Re-enter your new password"
            required
            autoComplete="new-password"
            leftSection={<LockSimple size={18} />}
            error={mismatch ? 'Passwords do not match' : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
          />

          {sameAsCurrent && (
            <FormAlert variant="info">
              Your new password is the same as your current one.
            </FormAlert>
          )}

          {(error || change.isError) && (
            <FormAlert variant="error">{error ?? 'Change failed.'}</FormAlert>
          )}

          <Button
            type="submit"
            color="brand"
            size="md"
            loading={change.isPending}
            disabled={
              currentPassword.length === 0 ||
              newPassword.length < 8 ||
              mismatch ||
              sameAsCurrent
            }
          >
            Update password
          </Button>
        </form>
      </Paper>
    </div>
  );
}
