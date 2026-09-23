'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Users,
  Package,
  Truck,
  SquareHalf,
  ChartPieSlice,
  Sparkle,
  Factory,
  Tag,
  MapTrifold,
  Wallet,
  FileArrowUp,
  ShieldCheck,
  UserGear,
  CalendarBlank,
  Notebook,
  HandCoins,
  Stamp,
} from '@phosphor-icons/react';
import { useSession } from '@/lib/providers';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  ownerOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: <ChartPieSlice size={18} weight="duotone" />,
      },
      {
        href: '/products',
        label: 'Products',
        icon: <Package size={18} weight="duotone" />,
      },
      {
        href: '/orders',
        label: 'Orders',
        icon: <ShoppingBag size={18} weight="duotone" />,
      },
      {
        href: '/orders/calendar',
        label: 'Activity Calendar',
        icon: <CalendarBlank size={18} weight="duotone" />,
      },
      {
        href: '/deliveries',
        label: 'Deliveries',
        icon: <Truck size={18} weight="duotone" />,
      },
      {
        href: '/customers',
        label: 'Customers',
        icon: <Users size={18} weight="duotone" />,
      },
      {
        href: '/khata',
        label: 'Khata',
        icon: <Notebook size={18} weight="duotone" />,
      },
      {
        href: '/payments',
        label: 'Payments',
        icon: <HandCoins size={18} weight="duotone" />,
      },
    ],
  },
  {
    label: 'Analytics',
    items: [
      {
        href: '/predictions',
        label: 'Predictions',
        icon: <Sparkle size={18} weight="duotone" />,
      },
    ],
  },
  {
    label: 'Management',
    items: [
      {
        href: '/staff',
        label: 'Staff',
        icon: <UserGear size={18} weight="duotone" />,
      },
      {
        href: '/roles',
        label: 'Roles',
        icon: <Users size={18} weight="duotone" />,
      },
      {
        href: '/categories',
        label: 'Categories',
        icon: <Tag size={18} weight="duotone" />,
      },
      {
        href: '/routes',
        label: 'Routes',
        icon: <MapTrifold size={18} weight="duotone" />,
      },
      {
        href: '/settings/bill-format',
        label: 'Bill Format',
        icon: <Stamp size={18} weight="duotone" />,
        ownerOnly: true,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/finance',
        label: 'Finance',
        icon: <Wallet size={18} weight="duotone" />,
      },
      {
        href: '/imports',
        label: 'Imports',
        icon: <FileArrowUp size={18} weight="duotone" />,
      },
      {
        href: '/audits',
        label: 'Audits',
        icon: <ShieldCheck size={18} weight="duotone" />,
      },
    ],
  },
];

export default function Sidebar({
  tenantName = 'Workspace',
}: {
  tenantName?: string;
}) {
  const pathname = usePathname();
  const session = useSession();
  const isDeliveryAgent = session?.role === 'delivery';
  const isOwner = session?.role === 'owner';

  const navGroups: NavGroup[] = isDeliveryAgent
    ? [
        {
          label: 'My work',
          items: [
            {
              href: '/deliveries/portal',
              label: 'My Deliveries',
              icon: <MapTrifold size={18} weight="duotone" />,
            },
          ],
        },
      ]
    : NAV_GROUPS.map((group) => {
        const deliveryMapItem: NavItem = {
          href: '/deliveries/portal',
          label: 'Delivery Map',
          icon: <MapTrifold size={18} weight="duotone" />,
        };
        const items: NavItem[] =
          group.label === 'Main' ? [...group.items, deliveryMapItem] : group.items;
        return {
          ...group,
          items: items.filter((item) => !item.ownerOnly || isOwner),
        };
      });

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200/70 bg-white px-4 py-5 lg:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Factory size={20} weight="duotone" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-zinc-900">Mero Udhyog</div>
          <div className="text-xs text-zinc-400">Tenant dashboard</div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
          <SquareHalf size={16} weight="fill" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-zinc-800">
            {tenantName}
          </div>
          <div className="text-[11px] text-zinc-400">Current workspace</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {group.label}
            </div>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href) && !(item.href === '/orders' && pathname.startsWith('/orders/calendar')));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-brand-600' : 'text-zinc-400'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <Sparkle size={13} weight="fill" className="text-brand-200" />
          Pro plan
        </div>
        <p className="mb-3 text-xs leading-relaxed text-brand-100">
          Unlock analytics, exports and priority support.
        </p>
        <button
          type="button"
          className="w-full rounded-lg bg-white/95 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-white"
        >
          Upgrade
        </button>
      </div>
    </aside>
  );
}
