import Link from 'next/link';
import type { ReactNode } from 'react';

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/#ai-predictions', label: 'AI predictions' },
  { href: '/#how-it-works', label: 'How it works' },
];

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
              MU
            </span>
            <span className="text-base font-semibold tracking-tight text-[var(--foreground)]">
              Mero Udhyog
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[var(--muted)] sm:flex">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-[var(--foreground)]">
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-[var(--border)] bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 text-sm text-[var(--muted)] sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-600 text-[10px] font-bold text-white">
              MU
            </span>
            <span className="font-medium text-[var(--foreground)]">Mero Udhyog</span>
          </div>
          <p>© {new Date().getFullYear()} Mero Udhyog. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}