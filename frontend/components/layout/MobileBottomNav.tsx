'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House,
  List,
  MapTrifold,
  Package,
  ShoppingBag,
  Users,
} from '@phosphor-icons/react';
import { useSession } from '@/lib/providers';

type NavItem = { href: string; label: string; icon: React.ReactNode };

const MAIN_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: <House size={22} weight="duotone" /> },
  { href: '/products', label: 'Products', icon: <Package size={22} weight="duotone" /> },
  { href: '/orders', label: 'Orders', icon: <ShoppingBag size={22} weight="duotone" /> },
  { href: '/customers', label: 'Customers', icon: <Users size={22} weight="duotone" /> },
];

export default function MobileBottomNav({
  onOpenSidebar,
}: {
  onOpenSidebar: () => void;
}) {
  const pathname = usePathname();
  const session = useSession();
  const isDelivery = session?.role === 'delivery';

  const items: NavItem[] = isDelivery
    ? [
        {
          href: '/deliveries/portal',
          label: 'My Deliveries',
          icon: <MapTrifold size={22} weight="duotone" />,
        },
      ]
    : MAIN_ITEMS;

  const isActive = (href: string) =>
    pathname === href ||
    (href !== '/dashboard' &&
      pathname.startsWith(href) &&
      !(
        href === '/orders' &&
        (pathname.startsWith('/orders/calendar') || pathname.startsWith('/orders/delivered'))
      ) &&
      !(href === '/products' && pathname.startsWith('/products/ledger')) &&
      !(href === '/products/ledger' && pathname.startsWith('/products/ledger/today')));

  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
      active ? 'text-brand-700' : 'text-zinc-500'
    }`;

  const iconClass = (active: boolean) =>
    active ? 'text-brand-600' : 'text-zinc-400';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto mb-3 flex w-[min(92vw,400px)] items-center justify-around gap-1 rounded-[22px] border border-zinc-200/70 bg-white/90 px-2 py-1.5 shadow-[0_-6px_30px_rgba(0,0,0,0.10)] backdrop-blur-xl">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={itemClass(active)}>
              <span className={iconClass(active)}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <button type="button" onClick={onOpenSidebar} className={itemClass(false)}>
          <span className={iconClass(false)}>
            <List size={22} weight="duotone" />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}