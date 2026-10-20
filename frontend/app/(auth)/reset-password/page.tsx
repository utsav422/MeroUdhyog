'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Loader, PasswordInput, Progress } from '@mantine/core';
import { ArrowLeft, LockSimple } from '@phosphor-icons/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';
import { evaluatePassword } from '@/features/auth/password';

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const strength = evaluatePassword(password);

  const validation = useQuery({
    queryKey: ['auth', 'reset-token', token],
    queryFn: () => authApi.validateResetToken(token),
    enabled: token.length > 0,
    retry: false,
  });

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => setDone(true),
    onError: (err) =>
      setError(
        err instanceof ApiClientError
          ? err.detail
          : 'Could not reset your password. Please try again.',
      ),
  });

  useEffect(() => {
    if (done) {
      const id = window.setTimeout(() => router.push('/login'), 2500);
      return () => window.clearTimeout(id);
    }
  }, [done, router]);

  if (!token) {
    return (
      <AuthCard
        title="Invalid reset link"
        footer={
          <Link href="/forgot-password" className="font-medium text-brand-600">
            Request a new link
          </Link>
        }
      >
        <FormAlert variant="error">
          This password reset link is missing its token. Please request a new
          one.
        </FormAlert>
      </AuthCard>
    );
  }

  if (validation.isLoading) {
    return (
      <AuthCard title="Checking your link…">
        <div className="flex justify-center py-6">
          <Loader color="brand" />
        </div>
      </AuthCard>
    );
  }

  if (validation.data && !validation.data.valid) {
    return (
      <AuthCard
        title="This link has expired"
        subtitle="Reset links are valid for a limited time."
        footer={
          <Link href="/forgot-password" className="font-medium text-brand-600">
            Request a new link
          </Link>
        }
      >
        <FormAlert variant="error">
          This password reset link is invalid or has expired.
        </FormAlert>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <FormAlert variant="success">
          Your password has been changed. Redirecting you to sign in…
        </FormAlert>
      </AuthCard>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthCard
      title="Choose a new password"
      subtitle={validation.data?.email ?? undefined}
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) {
            setError('Passwords do not match.');
            return;
          }
          reset.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <PasswordInput
            label="New password"
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
            leftSection={<LockSimple size={18} />}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          {password && (
            <div className="mt-2">
              <Progress
                value={(strength.score / 4) * 100}
                color={strength.color}
                size="xs"
                radius="xl"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Strength: <span className="font-medium">{strength.label}</span>
              </p>
            </div>
          )}
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your new password"
          required
          autoComplete="new-password"
          leftSection={<LockSimple size={18} />}
          error={mismatch ? 'Passwords do not match' : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
        />

        {(error || reset.isError) && (
          <FormAlert variant="error">{error ?? 'Reset failed.'}</FormAlert>
        )}

        <Button
          type="submit"
          fullWidth
          size="md"
          color="brand"
          loading={reset.isPending}
          disabled={password.length < 8 || mismatch}
        >
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Loading…">
          <div className="flex justify-center py-6">
            <Loader color="brand" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
