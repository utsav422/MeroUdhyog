'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, PasswordInput, TextInput } from '@mantine/core';
import { EnvelopeSimple, LockSimple, ArrowUpRight } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { sessionKeys } from '@/features/auth/hooks';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => authApi.login({ email, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      const me = await queryClient.fetchQuery({
        queryKey: sessionKeys.me(),
        queryFn: () => apiClient.get<{ role: string }>('/auth/me'),
      });
      router.push(me.role === 'delivery' ? '/deliveries/portal' : '/dashboard');
      router.refresh();
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.detail
          : 'Something went wrong. Please try again.',
      );
    },
  });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    login.mutate();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Mero Udhyog workspace."
      footer={
        <>
          New to Mero Udhyog?{' '}
          <Link
            href="/register"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Create a workspace
          </Link>
          <div className="mt-3">
            <a
              href="https://mero-udhyog-6jp1.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700"
            >
              Visit our website
              <ArrowUpRight size={14} weight="bold" />
            </a>
          </div>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
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

        <PasswordInput
          label="Password"
          placeholder="Your password"
          required
          autoComplete="current-password"
          leftSection={<LockSimple size={18} />}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />

        <div className="flex items-center justify-between">
          <Checkbox
            label="Keep me signed in"
            checked={remember}
            onChange={(e) => setRemember(e.currentTarget.checked)}
          />
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Forgot password?
          </Link>
        </div>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <Button
          type="submit"
          fullWidth
          size="md"
          loading={login.isPending}
          color="brand"
        >
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
