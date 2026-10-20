'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80';

const HIGHLIGHTS = [
  {
    title: 'One workspace for your factory',
    body: 'Orders, delivery, khatha and payments — all in a single, tidy view.',
  },
  {
    title: 'Numbers you can trust',
    body: 'Live stock, dues and profit without endless spreadsheets.',
  },
  {
    title: 'Built for Nepali udhyog',
    body: 'Fast, offline-friendly and designed around how you actually work.',
  },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-brand-700 text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between">
        <Image
          src={PANEL_IMAGE}
          alt="Factory floor"
          fill
          priority
          sizes="46vw"
          className="object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-800/90 via-brand-700/85 to-brand-900/95" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/login" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500 text-sm font-bold text-brand-900">
              MU
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Mero Udhyog
            </span>
          </Link>

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              Run your factory with clarity, not cluttered books.
            </h2>
            <ul className="mt-8 space-y-5">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-3.5">
                  <span className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-500/20 text-accent-300">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-sm text-white/70">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Mero Udhyog. All rights reserved.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-[var(--background)] px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-7 shadow-sm sm:p-9">
      <Link
        href="/login"
        className="mb-6 inline-flex items-center gap-2 lg:hidden"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
          MU
        </span>
        <span className="text-base font-semibold tracking-tight">
          Mero Udhyog
        </span>
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1.5 text-sm text-[var(--muted)]">{subtitle}</p>
      )}

      <div className="mt-6">{children}</div>

      {footer && (
        <div className="mt-6 border-t border-[var(--border)] pt-5 text-center text-sm text-[var(--muted)]">
          {footer}
        </div>
      )}
    </div>
  );
}
