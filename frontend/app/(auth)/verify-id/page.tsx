'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Loader } from '@mantine/core';
import { CheckCircle } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';

function VerifyIdInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: () => authApi.verifyId(token),
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
        title="ID verification link needed"
        subtitle="Open the verification link sent to your staff email."
        footer={
          <Link href="/login" className="font-medium text-brand-600">
            Back to sign in
          </Link>
        }
      >
        <FormAlert variant="error">
          This link is incomplete. Use the full link from your verification email.
        </FormAlert>
      </AuthCard>
    );
  }

  if (verify.isPending || verify.isIdle) {
    return (
      <AuthCard title="Verifying your ID…">
        <div className="flex justify-center py-6">
          <Loader color="brand" />
        </div>
      </AuthCard>
    );
  }

  if (verify.isError) {
    return (
      <AuthCard
        title="ID verification failed"
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
          <Button component={Link} href="/login" fullWidth size="md" color="brand">
            Go to sign in
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="ID verified"
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
          Your ID has been verified. Your staff account is ready to use.
        </FormAlert>
        <Button component={Link} href="/login" fullWidth size="md" color="brand">
          Go to sign in
        </Button>
      </div>
    </AuthCard>
  );
}

export default function VerifyIdPage() {
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
      <VerifyIdInner />
    </Suspense>
  );
}
