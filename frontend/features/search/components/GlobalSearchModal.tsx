'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { Icon } from '@phosphor-icons/react';
import {
  ArrowRight,
  Coins,
  FileText,
  House,
  MagnifyingGlass,
  MapTrifold,
  Package,
  Receipt,
  SpinnerGap,
  Tag,
  Truck,
  User,
  Users,
  Warning,
} from '@phosphor-icons/react';
import { useSession } from '@/lib/providers';
import { useGlobalSearch, type SearchHit } from '@/features/search/api';
import { SEARCH_PAGES, type SearchPage } from '@/features/search/pages';

const TYPE_LABEL: Record<string, string> = {
  product: 'Product',
  category: 'Category',
  customer: 'Customer',
  order: 'Order',
  delivery: 'Delivery',
  staff: 'Staff',
  route: 'Route',
  payment: 'Payment',
  transaction: 'Finance',
};

const TYPE_ICON: Record<string, Icon> = {
  product: Package,
  category: Tag,
  customer: Users,
  order: Receipt,
  delivery: Truck,
  staff: User,
  route: MapTrifold,
  payment: Coins,
  transaction: FileText,
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-brand-100 px-0.5 text-brand-800">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface FlatItem {
  key: string;
  title: string;
  subtitle?: string | null;
  badge: string;
  href: string;
  icon: Icon;
}

interface SearchGroup {
  label: string;
  icon: Icon;
  items: FlatItem[];
}

function typeBadge(type: string): string {
  return TYPE_LABEL[type] ?? 'Result';
}

function typeIcon(type: string): Icon {
  return TYPE_ICON[type] ?? FileText;
}

function hitToItem(hit: SearchHit): FlatItem {
  return {
    key: hit.id,
    title: hit.title,
    subtitle: hit.subtitle,
    badge: hit.meta ?? typeBadge(hit.type),
    href: hit.href,
    icon: typeIcon(hit.type),
  };
}

function pageToItem(page: SearchPage): FlatItem {
  return {
    key: `page:${page.href}`,
    title: page.title,
    subtitle: page.description,
    badge: 'Page',
    href: page.href,
    icon: page.icon,
  };
}

export default function GlobalSearchModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const session = useSession();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [debounced] = useDebouncedValue(query, 180);
  const q = debounced.trim();
  const { data, isFetching } = useGlobalSearch(q);

  const visiblePages = useMemo(() => {
    const isOwner = session?.role === 'owner';
    const all = isOwner ? SEARCH_PAGES : SEARCH_PAGES.filter((p) => !p.ownerOnly);
    if (!q) return all;
    const needle = q.toLowerCase();
    return all.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle),
    );
  }, [q, session]);

  const groups = useMemo<SearchGroup[]>(() => {
    const hitGroups: SearchGroup[] = (data ?? []).map<SearchGroup>((g) => ({
      label: g.label,
      icon: TYPE_ICON[g.key] ?? FileText,
      items: g.items.map(hitToItem),
    }));
    const pageGroup: SearchGroup = {
      label: 'Pages',
      icon: House,
      items: visiblePages.map(pageToItem),
    };
    if (q) {
      return [...hitGroups, pageGroup].filter((g) => g.items.length > 0);
    }
    return [pageGroup];
  }, [data, q, visiblePages]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    if (!opened || flat.length === 0) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((a) => Math.min(a + 1, flat.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        router.push(flat[activeIndex].href);
        onClose();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [opened, flat, activeIndex, router, onClose]);

  const noResults = q.length > 0 && !isFetching && groups.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      size={680}
      radius="lg"
      padding={0}
      centered
      transitionProps={{ duration: 150, transition: 'pop' }}
      overlayProps={{ backgroundOpacity: 0.55 }}
    >
      <div className="flex h-[min(620px,85dvh)] flex-col overflow-hidden rounded-lg shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-3.5">
          <MagnifyingGlass size={20} className="shrink-0 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search products, orders, customers, pages…"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400"
          />
          {isFetching && (
            <SpinnerGap size={16} className="shrink-0 animate-spin text-zinc-400" />
          )}
          {query.length > 0 && (
            <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
              esc
            </kbd>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {noResults ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Warning size={28} className="text-zinc-300" />
              <p className="text-sm text-zinc-400">
                No results for “{query.trim()}”.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-1.5 px-4 pb-1 pt-3">
                  <group.icon size={13} className="text-zinc-400" weight="bold" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    {group.label}
                  </span>
                </div>
                {group.items.map((item) => {
                  const isActive = flat.indexOf(item) === activeIndex;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                      onMouseMove={() => setActive(flat.indexOf(item))}
                      className={`group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isActive ? 'bg-brand-50' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                          isActive
                            ? 'border-brand-200 bg-white text-brand-600'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-400'
                        }`}
                      >
                        <item.icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-800">
                          <HighlightText text={item.title} query={q} />
                        </span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-zinc-400">
                            <HighlightText text={item.subtitle} query={q} />
                          </span>
                        )}
                      </span>
                      <span
                        className={`hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:block ${
                          isActive
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-zinc-100 text-zinc-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[11px] text-zinc-400">
          <span>
            <Kbd>↑↓</Kbd> navigate <Kbd>↵</Kbd> open <Kbd>esc</Kbd> close
          </span>
          <span>
            <Kbd>⌘K</Kbd> toggle search
          </span>
        </div>
      </div>
    </Modal>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-sans text-[10px] font-medium">
      {children}
    </kbd>
  );
}