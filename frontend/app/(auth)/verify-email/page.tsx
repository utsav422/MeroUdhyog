'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Loader, TextInput } from '@mantine/core';
import { CheckCircle, EnvelopeSimple } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';

function VerifyInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const started = useRef(false);

  const [email, setEmail] = useState('');

  const verify = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
  });

  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(email),
  });

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  if (!token) {
    return (
      <AuthCard
        title="Verify your email"
        subtitle="Enter your email address and we'll send a fresh verification link."
        footer={
          <Link href="/login" className="font-medium text-brand-600">
            Back to sign in
          </Link>
        }
      >
        {resend.isSuccess ? (
          <FormAlert variant="success">
            If that email needs verification, a new link has been sent.
          </FormAlert>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resend.mutate();
            }}
            className="space-y-4"
          >
            <TextInput
              label="Email"
              placeholder="you@factory.com"
              type="email"
              required
              leftSection={<EnvelopeSimple size={18} />}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Button
              type="submit"
              fullWidth
              size="md"
              color="brand"
              loading={resend.isPending}
            >
              Resend verification link
            </Button>
          </form>
        )}
      </AuthCard>
    );
  }

  if (verify.isPending || verify.isIdle) {
    return (
      <AuthCard title="Verifying your email…">
        <div className="flex justify-center py-6">
          <Loader color="brand" />
        </div>
      </AuthCard>
    );
  }

  if (verify.isError) {
    return (
      <AuthCard
        title="Verification failed"
        footer={
          <Link href="/login" className="font-medium text-brand-600">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <FormAlert variant="error">
            {verify.error instanceof ApiClientError
              ? verify.error.detail
              : 'This verification link is invalid or has expired.'}
          </FormAlert>
          {resend.isSuccess ? (
            <FormAlert variant="success">
              If that email needs verification, a new link has been sent.
            </FormAlert>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resend.mutate();
              }}
              className="space-y-4"
            >
              <TextInput
                label="Email"
                placeholder="you@factory.com"
                type="email"
                required
                leftSection={<EnvelopeSimple size={18} />}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <Button
                type="submit"
                variant="light"
                color="brand"
                fullWidth
                loading={resend.isPending}
              >
                Resend verification link
              </Button>
            </form>
          )}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Email verified"
      footer={
        <Link href="/login" className="font-medium text-brand-600">
          Continue to sign in
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center py-2 text-teal-500">
          <CheckCircle size={56} weight="fill" />
        </div>
        <FormAlert variant="success">
          Your email address has been verified. You&apos;re all set.
        </FormAlert>
        <Button component={Link} href="/login" fullWidth size="md" color="brand">
          Go to sign in
        </Button>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
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
      <VerifyInner />
    </Suspense>
  );
}
