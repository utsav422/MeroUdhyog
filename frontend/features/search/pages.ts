import type { Icon } from '@phosphor-icons/react';
import {
  Archive,
  BookBookmark,
  CalendarDots,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  Coins,
  CurrencyInr,
  Database,
  FileText,
  Funnel,
  MapTrifold,
  Package,
  Receipt,
  Selection,
  Users,
} from '@phosphor-icons/react';

export interface SearchPage {
  title: string;
  description: string;
  href: string;
  icon: Icon;
  ownerOnly?: boolean;
}

export const SEARCH_PAGES: SearchPage[] = [
  {
    title: 'Dashboard',
    description: 'Overview of today’s factory activity',
    href: '/dashboard',
    icon: ChartLineUp,
  },
  {
    title: 'Products',
    description: 'Manage items, variants, prices and stock',
    href: '/products',
    icon: Package,
  },
  {
    title: 'Stock Ledger',
    description: 'Movement history and running balances',
    href: '/products/ledger',
    icon: Archive,
  },
  {
    title: 'Stock as of Today',
    description: 'Opening, movement and closing stock for every product',
    href: '/products/ledger/today',
    icon: CalendarDots,
  },
  {
    title: 'Orders',
    description: 'Create and track orders that are not delivered yet',
    href: '/orders',
    icon: Receipt,
  },
  {
    title: 'Delivered Orders',
    description: 'Browse completed and delivered orders',
    href: '/orders/delivered',
    icon: CheckCircle,
  },
  {
    title: 'Activity Calendar',
    description: 'Visualize order activity by date',
    href: '/orders/calendar',
    icon: CalendarDots,
  },
  {
    title: 'Deliveries',
    description: 'Assign and track delivery agents',
    href: '/deliveries',
    icon: MapTrifold,
  },
  {
    title: 'Customers',
    description: 'Manage customer records and balances',
    href: '/customers',
    icon: Users,
  },
  {
    title: 'Khata',
    description: 'Customer ledger and running balances',
    href: '/khata',
    icon: BookBookmark,
  },
  {
    title: 'Payments',
    description: 'Record and search customer payments',
    href: '/payments',
    icon: Coins,
  },
  {
    title: 'Staff',
    description: 'Manage team members and accounts',
    href: '/staff',
    icon: Users,
  },
  {
    title: 'Roles',
    description: 'Assign permissions to roles',
    href: '/roles',
    icon: Selection,
  },
  {
    title: 'Categories',
    description: 'Organize products into categories',
    href: '/categories',
    icon: Funnel,
  },
  {
    title: 'Routes',
    description: 'Define delivery routes and cities',
    href: '/routes',
    icon: MapTrifold,
  },
  {
    title: 'Bill Format',
    description: 'Customize the invoice / bill template',
    href: '/settings/bill-format',
    ownerOnly: true,
    icon: FileText,
  },
  {
    title: 'Finance',
    description: 'Income and expense transactions',
    href: '/finance',
    icon: CurrencyInr,
  },
  {
    title: 'Imports',
    description: 'Import customers or products from CSV',
    href: '/imports',
    icon: Database,
  },
  {
    title: 'Predictions',
    description: 'Smart forecasts for customers and products',
    href: '/predictions',
    icon: ChartLineUp,
  },
  {
    title: 'Audits',
    description: 'Review the audit trail',
    href: '/audits',
    icon: ClipboardText,
  },
];