'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, TextInput } from '@mantine/core';
import { ArrowLeft, EnvelopeSimple } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/features/auth/api';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const forgot = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
    onSuccess: () => setSent(true),
  });

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
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
      {sent ? (
        <div className="space-y-4">
          <FormAlert variant="success">
            If <span className="font-medium">{email}</span> is registered, a
            password reset link is on its way. Check your inbox and spam folder.
          </FormAlert>
          <p className="text-sm text-[var(--muted)]">
            Didn&apos;t get it? Wait a minute and try again.
          </p>
          <Button
            variant="light"
            color="brand"
            fullWidth
            onClick={() => {
              setSent(false);
              forgot.reset();
            }}
          >
            Send to a different email
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            forgot.mutate();
          }}
          className="space-y-4"
        >
          <TextInput
            label="Email"
            placeholder="you@factory.com"
            type="email"
            required
            autoComplete="email"
            leftSection={<EnvelopeSimple size={18} />}
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />

          {forgot.isError && (
            <FormAlert variant="error">
              Something went wrong. Please try again.
            </FormAlert>
          )}

          <Button
            type="submit"
            fullWidth
            size="md"
            color="brand"
            loading={forgot.isPending}
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
