'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Checkbox,
  PasswordInput,
  Progress,
  TextInput,
} from '@mantine/core';
import {
  Buildings,
  EnvelopeSimple,
  LockSimple,
  User,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthCard } from '@/features/auth/components/AuthShell';
import { FormAlert } from '@/features/auth/components/fields';
import { evaluatePassword } from '@/features/auth/password';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => evaluatePassword(password), [password]);

  const register = useMutation({
    mutationFn: () =>
      authApi.register({
        tenant_name: tenantName,
        tenant_slug: tenantSlug || slugify(tenantName),
        email,
        full_name: fullName,
        password,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.push('/dashboard');
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
    register.mutate();
  }

  const canSubmit =
    tenantName &&
    fullName &&
    email &&
    password.length >= 8 &&
    accepted &&
    !register.isPending;

  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Set up your factory on Mero Udhyog in under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <TextInput
          label="Organisation name"
          placeholder="Himalayan Steel Works"
          required
          leftSection={<Buildings size={18} />}
          value={tenantName}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTenantName(value);
            if (!slugEdited) setTenantSlug(slugify(value));
          }}
        />

        <TextInput
          label="Workspace slug"
          description="Used in your workspace URL. Lowercase letters, numbers and dashes."
          placeholder="himalayan-steel"
          required
          value={tenantSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setTenantSlug(slugify(e.currentTarget.value));
          }}
        />

        <TextInput
          label="Your name"
          placeholder="Sita Sharma"
          required
          leftSection={<User size={18} />}
          value={fullName}
          onChange={(e) => setFullName(e.currentTarget.value)}
        />

        <TextInput
          label="Work email"
          placeholder="you@factory.com"
          type="email"
          required
          autoComplete="email"
          leftSection={<EnvelopeSimple size={18} />}
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />

        <div>
          <PasswordInput
            label="Password"
            placeholder="Create a strong password"
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

        <Checkbox
          label="I agree to the Terms of Service and Privacy Policy"
          checked={accepted}
          onChange={(e) => setAccepted(e.currentTarget.checked)}
        />

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <Button
          type="submit"
          fullWidth
          size="md"
          color="brand"
          loading={register.isPending}
          disabled={!canSubmit}
        >
          Create workspace
        </Button>
      </form>
    </AuthCard>
  );
}
