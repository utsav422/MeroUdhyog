'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, MultiSelect, SegmentedControl, Select, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  MagnifyingGlass,
  NotePencil,
  Package,
  PencilSimple,
  Receipt,
  Trash,
  User,
  X,
} from '@phosphor-icons/react';
import { useOrders, ORDER_STATUSES, itemCount } from '@/features/orders/api';
import type { Order } from '@/features/orders/api';
import { useReorder, ReorderBadge, canReorder } from './Reorder';
import { useDeliveries } from '@/features/deliveries/api';
import { useRoutes } from '@/features/routes/api';
import { useCustomers } from '@/features/customers/api';
import { StatusBadge } from '@/components/shared';
import { formatMoney, formatNumber, formatDateTime } from '@/lib/format';

type ActivityType = 'order_created' | 'delivery_assigned' | 'order_picked_up' | 'order_delivered';

const ACTIVITY_TYPES: { value: ActivityType; label: string; color: string }[] = [
  { value: 'order_created', label: 'Orders created', color: '#1b4332' },
  { value: 'delivery_assigned', label: 'Deliveries assigned', color: '#2563eb' },
  { value: 'order_picked_up', label: 'Orders picked up', color: '#f59e0b' },
  { value: 'order_delivered', label: 'Orders delivered', color: '#16a34a' },
];

const TYPE_DOT: Record<ActivityType, string> = {
  order_created: '#1b4332',
  delivery_assigned: '#2563eb',
  order_picked_up: '#f59e0b',
  order_delivered: '#16a34a',
};

const NOTE_DOT = '#db2777';

type ActivityEvent = {
  id: string;
  type: ActivityType;
  ts: string;
  title: string;
  description: string;
  orderId: string;
  orderRef: string;
  customerId: string | null;
  amount: string | null;
  order: Order | null;
};

type DayNote = { text: string; updatedAt: string };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NOTES_KEY = 'factorycrm-calendar-day-notes';

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - dow);
  return c;
}

function timeStr(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fullDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function OrdersCalendar() {
  const ordersQuery = useOrders();
  const deliveriesQuery = useDeliveries();
  const routesQuery = useRoutes();
  const customersQuery = useCustomers();
  const reorder = useReorder();

  const [view, setView] = useState<'month' | 'week'>('month');
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [tab, setTab] = useState<string>('activity');

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [notes, setNotes] = useState<Record<string, DayNote>>({});
  const [draft, setDraft] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [expandedByDay, setExpandedByDay] = useState<Record<string, string[]>>({});
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const [calendarHeight, setCalendarHeight] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(NOTES_KEY);
        setNotes(raw ? (JSON.parse(raw) as Record<string, DayNote>) : {});
      } catch {
        setNotes({});
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCalendarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectDay = (date: Date) => {
    setSelectedDay(date);
    setDraft(notes[toKey(date)]?.text ?? '');
    setNoteEditing(false);
  };

  const updateNotes = (updater: (prev: Record<string, DayNote>) => Record<string, DayNote>) => {
    setNotes((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode, quota) — keep in-memory only
      }
      return next;
    });
  };

  const saveNote = () => {
    const text = draft.trim();
    if (!text) return;
    updateNotes((prev) => ({ ...prev, [toKey(selectedDay)]: { text, updatedAt: new Date().toISOString() } }));
    setNoteEditing(false);
  };

  const cancelEdit = () => {
    setNoteEditing(false);
    setDraft(notes[toKey(selectedDay)]?.text ?? '');
  };

  const startEdit = () => setNoteEditing(true);

  const startAdd = () => {
    setDraft('');
    setNoteEditing(true);
  };

  const deleteNote = (key: string) => {
    updateNotes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === toKey(selectedDay)) {
      setDraft('');
      setNoteEditing(false);
    }
  };

  const orders = ordersQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const routes = routesQuery.data ?? [];
  const customers = customersQuery.data ?? [];

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const filteredEvents = useMemo<ActivityEvent[]>(() => {
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const events: ActivityEvent[] = [];

    for (const o of orders) {
      if (statusFilter && o.status !== statusFilter) continue;
      if (routeFilter && o.route_id !== routeFilter) continue;
      const custName = customerMap.get(o.customer_id ?? '') ?? 'Customer';
      if (search && !`${o.order_ref} ${custName}`.toLowerCase().includes(search.toLowerCase())) continue;
      events.push({
        id: `order-created-${o.id}`,
        type: 'order_created',
        ts: o.created_at,
        title: `Order ${o.order_ref} created`,
        description: custName,
        orderId: o.id,
        orderRef: o.order_ref,
        customerId: o.customer_id ?? null,
        amount: ['failed', 'cancelled'].includes(o.status) ? null : o.total_amount,
        order: o,
      });
    }

    for (const d of deliveries) {
      if (routeFilter && d.route_id !== routeFilter) continue;
      const linkedOrder = orderById.get(d.order_id);
      if (statusFilter && linkedOrder && linkedOrder.status !== statusFilter) continue;
      if (statusFilter && !linkedOrder) continue;
      const ref = d.order_ref ?? 'Order';
      const who = d.customer_name ?? 'customer';
      if (search && !`${ref} ${who}`.toLowerCase().includes(search.toLowerCase())) continue;

      if (d.assigned_at) {
        events.push({
          id: `assigned-${d.id}`,
          type: 'delivery_assigned',
          ts: d.assigned_at,
          title: `Delivery assigned for ${ref}`,
          description: who,
          orderId: d.order_id,
          orderRef: ref,
          customerId: linkedOrder?.customer_id ?? null,
          amount: linkedOrder ? linkedOrder.total_amount : null,
          order: linkedOrder ?? null,
        });
      }
      if (d.picked_up_at) {
        events.push({
          id: `picked-${d.id}`,
          type: 'order_picked_up',
          ts: d.picked_up_at,
          title: `${ref} picked up`,
          description: who,
          orderId: d.order_id,
          orderRef: ref,
          customerId: linkedOrder?.customer_id ?? null,
          amount: linkedOrder ? linkedOrder.total_amount : null,
          order: linkedOrder ?? null,
        });
      }
      if (d.delivered_at) {
        events.push({
          id: `delivered-${d.id}`,
          type: 'order_delivered',
          ts: d.delivered_at,
          title: `${ref} delivered`,
          description: who,
          orderId: d.order_id,
          orderRef: ref,
          customerId: linkedOrder?.customer_id ?? null,
          amount: linkedOrder ? linkedOrder.total_amount : null,
          order: linkedOrder ?? null,
        });
      }
    }

    return events
      .filter((e) => (typeFilter.length === 0 ? true : typeFilter.includes(e.type)))
      .filter((e) => (customerFilter ? e.customerId === customerFilter : true))
      .filter((e) => {
        if (!statusFilter) return true;
        const linkedOrder = orderById.get(e.orderId);
        if (!linkedOrder) return true;
        return linkedOrder.status === statusFilter;
      })
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }, [orders, deliveries, customerMap, typeFilter, statusFilter, routeFilter, customerFilter, search]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of filteredEvents) {
      const d = new Date(e.ts);
      if (Number.isNaN(d.getTime())) continue;
      const key = toKey(d);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [filteredEvents]);

  const selectedDayKey = toKey(selectedDay);
  const selectedEvents = (eventsByDay.get(selectedDayKey) ?? []).sort((a, b) => a.ts.localeCompare(b.ts));
  const dayNote = notes[selectedDayKey];

  const orderGroups = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of selectedEvents) {
      const list = map.get(e.orderId) ?? [];
      list.push(e);
      map.set(e.orderId, list);
    }
    return [...map.values()].sort((a, b) => a[0].ts.localeCompare(b[0].ts));
  }, [selectedEvents]);

  const flowRows = useMemo(() => {
    const rows: (
      | { kind: 'header'; group: ActivityEvent[] }
      | { kind: 'event'; e: ActivityEvent }
    )[] = [];
    for (const group of orderGroups) {
      rows.push({ kind: 'header', group });
      for (const e of group) rows.push({ kind: 'event', e });
    }
    return rows;
  }, [orderGroups]);

  const defaultExpandedIds = useMemo(
    () => (orderGroups[0] ? [orderGroups[0][0].orderId] : []),
    [orderGroups],
  );
  const expandedForDay = expandedByDay[selectedDayKey];
  const expandedSet = useMemo(() => new Set(expandedForDay ?? []), [expandedForDay]);
  const isOrderExpanded = (orderId: string) =>
    expandedForDay === undefined ? defaultExpandedIds.includes(orderId) : expandedSet.has(orderId);
  const toggleOrder = (orderId: string) => {
    const base = new Set(expandedForDay === undefined ? defaultExpandedIds : expandedForDay);
    if (base.has(orderId)) base.delete(orderId);
    else base.add(orderId);
    setExpandedByDay((prev) => ({ ...prev, [selectedDayKey]: [...base] }));
  };

  const weekStart = useMemo(() => startOfWeek(viewDate), [viewDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart],
  );

  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const leading = (startOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - leading + 1;
    cells.push(day >= 1 && day <= daysInMonth ? new Date(viewDate.getFullYear(), viewDate.getMonth(), day) : null);
  }

  const monthEvents = filteredEvents.filter((e) => {
    const d = new Date(e.ts);
    return d.getFullYear() === viewDate.getFullYear() && d.getMonth() === viewDate.getMonth();
  });
  const monthSummary = {
    total: monthEvents.length,
    delivered: monthEvents.filter((e) => e.type === 'order_delivered').length,
    created: monthEvents.filter((e) => e.type === 'order_created').length,
  };
  const monthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const monthNotes = Object.keys(notes).filter((k) => k.startsWith(monthPrefix)).length;

  const allNotes = useMemo(
    () =>
      Object.entries(notes)
        .map(([key, n]) => ({ key, ...n }))
        .sort((a, b) => b.key.localeCompare(a.key)),
    [notes],
  );

  const today = new Date();
  const typeOptions = ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }));
  const statusOptions = [...ORDER_STATUSES].map((s) => ({ value: s, label: s.replace(/_/g, ' ') }));
  const routeOptions = routes.map((r) => ({ value: r.id, label: r.name }));
  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
  const hasActiveFilters = typeFilter.length > 0 || !!statusFilter || !!routeFilter || !!customerFilter || !!search;

  const calendarLabel =
    view === 'month'
      ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
      : `${MONTHS[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} – ${
          MONTHS[weekDays[6].getMonth()].slice(0, 3)
        } ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`;

  const navigate = (dir: -1 | 1) => {
    if (view === 'month') {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1));
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7 * dir);
      setViewDate(d);
    }
  };

  const goToday = () => {
    const now = new Date();
    setViewDate(view === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : startOfWeek(now));
    selectDay(now);
  };

  function clearFilters() {
    setTypeFilter([]);
    setStatusFilter(null);
    setRouteFilter(null);
    setCustomerFilter(null);
    setSearch('');
  }

  const editNoteFromList = (key: string) => {
    const d = parseKey(key);
    selectDay(d);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    setNoteEditing(true);
  };

  const renderGrid = (dates: (Date | null)[]) => (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {WEEKDAYS.map((w) => (
        <div
          key={w}
          className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] sm:pb-2 sm:text-[11px]"
        >
          {w}
        </div>
      ))}
      {dates.map((date, i) => {
        if (!date) {
          return <div key={`blank-${i}`} className="min-h-[52px] rounded-xl sm:min-h-[104px]" />;
        }
        const key = toKey(date);
        const dayEvents = eventsByDay.get(key) ?? [];
        const hasNote = !!notes[key]?.text;
        const typesPresent = [...new Set(dayEvents.map((e) => e.type))];
        const isToday = isSameDay(date, today);
        const isSelected = isSameDay(date, selectedDay);
        return (
          <button
            key={key}
            type="button"
            onClick={() => selectDay(date)}
            className={`flex min-h-[52px] flex-col items-stretch gap-1 rounded-xl border p-1 text-left transition-all sm:min-h-[104px] sm:p-2 ${
              isSelected
                ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
                : isToday
                  ? 'border-brand-300 bg-white hover:border-brand-400'
                  : 'border-[var(--border)] bg-white hover:border-[var(--border)] hover:bg-black/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isToday ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'
                }`}
              >
                {date.getDate()}
              </span>
              {dayEvents.length > 0 && (
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                  {dayEvents.length}
                </span>
              )}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-1">
              {typesPresent.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: TYPE_DOT[t] }}
                />
              ))}
              {typesPresent.length > 3 && (
                <span className="text-[9px] font-bold leading-none text-[var(--muted)]">
                  +{typesPresent.length - 3}
                </span>
              )}
              {hasNote && (
                <span
                  title="Has a note"
                  className="ml-auto h-1.5 w-1.5 rounded-sm"
                  style={{ backgroundColor: NOTE_DOT }}
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const statCard = (icon: React.ReactNode, label: string, value: number, iconClass: string) => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}>{icon}</div>
      <Text size="xs" c="dimmed" fw={500}>{label}</Text>
      <Text fw={700} size="xl" className="mt-0.5">{formatNumber(value)}</Text>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text fw={700} size="xl" className="leading-tight">
            Activity calendar
          </Text>
          <Text size="sm" c="dimmed" className="mt-1">
            Every order and delivery event, plus your own day notes — on one timeline.
          </Text>
        </div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 hover:shadow-md"
        >
          <Receipt size={16} weight="bold" />
          View orders
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCard(
          <CalendarBlank size={22} weight="bold" />,
          'Events this month',
          monthSummary.total,
          'bg-brand-50 text-brand-600',
        )}
        {statCard(<CheckCircle size={22} weight="bold" />, 'Delivered', monthSummary.delivered, 'bg-success-50 text-success-700')}
        {statCard(<Package size={22} weight="bold" />, 'Orders created', monthSummary.created, 'bg-accent-50 text-accent-600')}
        {statCard(<NotePencil size={22} weight="bold" />, 'Notes this month', monthNotes, 'bg-pink-50 text-pink-600')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          placeholder="Search order or customer…"
          defaultValue={search}
          leftSection={<MagnifyingGlass size={16} className="text-[var(--muted)]" />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          className="w-full sm:w-56"
          size="sm"
        />
        <MultiSelect
          size="sm"
          placeholder="Activity type"
          data={typeOptions}
          value={typeFilter}
          onChange={(value) => setTypeFilter(value.length ? value : [])}
          className="w-full sm:w-56"
          clearable
        />
        <Select
          size="sm"
          placeholder="Order status"
          clearable
          data={statusOptions}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value ?? null)}
          className="w-full sm:w-44"
        />
        <Select
          size="sm"
          placeholder="Route"
          clearable
          data={routeOptions}
          value={routeFilter}
          onChange={(value) => setRouteFilter(value ?? null)}
          className="w-full sm:w-44"
        />
        <Select
          size="sm"
          placeholder="Customer"
          clearable
          searchable
          data={customerOptions}
          value={customerFilter}
          onChange={(value) => setCustomerFilter(value ?? null)}
          className="w-full sm:w-56"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            <X size={14} />
            Clear filters
          </button>
        )}
      </div>

      <Tabs value={tab} onChange={(value) => value && setTab(value)}>
        <Tabs.List mb="md">
          <Tabs.Tab value="activity" leftSection={<CalendarBlank size={15} />}>Activity</Tabs.Tab>
          <Tabs.Tab value="notes" leftSection={<NotePencil size={15} />}>Notes</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="activity">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div ref={calendarRef} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    size="xs"
                    value={view}
                    onChange={(v) => setView(v as 'month' | 'week')}
                    data={[
                      { value: 'month', label: 'Month' },
                      { value: 'week', label: 'Week' },
                    ]}
                  />
                  <span className="ml-1 text-sm font-bold text-[var(--foreground)]">{calendarLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
                    aria-label="Previous"
                  >
                    <CaretLeft size={16} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)]"
                    aria-label="Next"
                  >
                    <CaretRight size={16} weight="bold" />
                  </button>
                </div>
              </div>

              {view === 'month' ? renderGrid(cells) : renderGrid(weekDays)}

              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-4">
                {ACTIVITY_TYPES.map((t) => (
                  <span key={t.value} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: NOTE_DOT }} />
                  Day notes
                </span>
              </div>
            </div>

            <div
              className="flex min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              style={{ maxHeight: calendarHeight || undefined }}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Text fw={700} size="md">{fullDateLabel(selectedDay)}</Text>
                  <Text size="sm" c="dimmed">
                    {formatNumber(selectedEvents.length)} activit{selectedEvents.length === 1 ? 'y' : 'ies'}
                    {dayNote ? ' · has a note' : ''}
                  </Text>
                </div>
                {customerFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    {customerMap.get(customerFilter) ?? 'Customer'}
                    <X size={12} weight="bold" />
                  </button>
                )}
              </div>

              {dayNote && (
                <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-pink-100 bg-pink-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">Note</p>
                    <p className="mt-0.5 text-xs text-pink-800">{dayNote.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('notes')}
                    className="shrink-0 text-xs font-semibold text-pink-700 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}

              {selectedEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <CalendarBlank size={20} className="mx-auto text-[var(--muted)]/50" />
                  <Text size="sm" c="dimmed" className="mt-2">
                    No activities on this day
                  </Text>
                  <Button size="xs" variant="subtle" mt="sm" leftSection={<NotePencil size={13} />} onClick={() => setTab('notes')}>
                    Add a note for this day
                  </Button>
                </div>
              ) : (
                <div className="relative mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pb-1 pr-1">
                  <div className="absolute bottom-0 left-[11px] top-0 w-[2px] rounded-full bg-[var(--border)]" />
                  <div className="space-y-0">
                    {flowRows.map((row) => {
                      if (row.kind === 'header') {
                        const group = row.group;
                        const order = group[0].order;
                        const first = group[0];
                        const last = group[group.length - 1];
                        const headerRef = order?.order_ref ?? first.orderRef;
                        const custName = customerMap.get(order?.customer_id ?? '') ?? first.description;
                        const totalAmount = group.find((e) => e.amount != null)?.amount ?? null;
                        return (
                          <div key={`h-${group[0].orderId}`} className="relative pl-8 mb-4">
                            <span className="absolute left-[6px] top-3 h-3 w-3 rounded-[3px] bg-brand-600 ring-2 ring-white" />
                            <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleOrder(group[0].orderId)}
                                  aria-expanded={isOrderExpanded(group[0].orderId)}
                                  aria-label={isOrderExpanded(group[0].orderId) ? 'Collapse order' : 'Expand order'}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand-200 bg-white text-brand-700 transition-colors hover:bg-brand-100"
                                >
                                  {isOrderExpanded(group[0].orderId) ? (
                                    <CaretDown size={12} weight="bold" />
                                  ) : (
                                    <CaretRight size={12} weight="bold" className="ml-px" />
                                  )}
                                </button>
                                <span className="font-mono text-sm font-bold text-[var(--foreground)]">{headerRef}</span>
                                {order && <StatusBadge status={order.status} />}
                                {order && <ReorderBadge order={order} />}
                                <span className="ml-auto flex items-center gap-2">
                                  {!isOrderExpanded(group[0].orderId) && (
                                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 ring-1 ring-brand-200">
                                      {group.length} {group.length === 1 ? 'event' : 'events'}
                                    </span>
                                  )}
                                  <span className="text-[11px] font-medium text-[var(--muted)]">
                                    {timeStr(first.ts)} – {timeStr(last.ts)}
                                  </span>
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span
                                  className={`inline-flex items-center gap-1 font-semibold ${
                                    customerFilter === order?.customer_id ? 'text-brand-700' : 'text-[var(--foreground)]'
                                  }`}
                                >
                                  <User size={13} weight="bold" />
                                  {custName}
                                </span>
                                {order && <span className="text-[var(--muted)]">{itemCount(order)} units</span>}
                                {totalAmount != null && (
                                  <span className="font-medium text-[var(--muted)]">{formatMoney(totalAmount)}</span>
                                )}
                                {order && canReorder(order) && (
                                  <button
                                    type="button"
                                    onClick={() => reorder.reorderOrder(order)}
                                    disabled={reorder.isPending}
                                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                                  >
                                    <ArrowsClockwise size={12} weight="bold" />
                                    Re-order
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      const { e } = row;
                      if (!isOrderExpanded(e.orderId)) return null;
                      return (
                        <div key={e.id} className="relative pl-8 pb-5">
                          <span
                            className="absolute left-[7px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface)]"
                            style={{ backgroundColor: TYPE_DOT[e.type] }}
                          />
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="text-xs font-semibold text-[var(--foreground)]">{e.title}</span>
                              <span className="text-[10px] font-medium text-[var(--muted)]">{timeStr(e.ts)}</span>
                            </div>
                            {e.description && (
                              <div className="mt-0.5 text-[11px] text-[var(--muted)]">{e.description}</div>
                            )}
                            {e.amount != null && (
                              <div className="text-[11px] font-medium text-[var(--muted)]">{formatMoney(e.amount)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="notes">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm shadow-black/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <CalendarBlank size={18} weight="bold" />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Note for a day</p>
                    <p className="text-base font-bold leading-tight text-[var(--foreground)]">{fullDateLabel(selectedDay)}</p>
                  </div>
                </div>
                <DatePickerInput
                  size="xs"
                  value={toKey(selectedDay)}
                  onChange={(value) => {
                    if (value) selectDay(parseKey(value));
                  }}
                  clearable={false}
                  className="w-40"
                />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Everything you write is saved instantly and tied to exactly this date.
              </p>

              <div className="mt-4">

              {noteEditing ? (
                <div className="rounded-2xl border border-pink-200 bg-pink-50/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <PencilSimple size={12} weight="bold" className="text-pink-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">
                      {dayNote ? 'Editing existing note' : 'Writing a new note'}
                    </span>
                  </div>
                  <Textarea
                    autosize
                    minRows={4}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    placeholder="e.g. Client promised to pay today — follow up on order #ORD-… "
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="xs"
                      color="pink"
                      leftSection={<Check size={14} weight="bold" />}
                      onClick={saveNote}
                      disabled={!draft.trim()}
                    >
                      {dayNote ? 'Update note' : 'Save note'}
                    </Button>
                    <Button size="xs" variant="default" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : dayNote ? (
                <div className="relative overflow-hidden rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50/70 to-white p-4">
                  <span className="absolute inset-y-0 left-0 w-1 bg-pink-500" />
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-pink-700">
                      <NotePencil size={16} weight="bold" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">Note</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-700 ring-1 ring-pink-100">
                          <Check size={10} weight="bold" />
                          Saved {formatDateTime(dayNote.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{dayNote.text}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="xs"
                          color="pink"
                          leftSection={<PencilSimple size={13} />}
                          onClick={startEdit}
                        >
                          Edit note
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<Trash size={13} />}
                          onClick={() => deleteNote(selectedDayKey)}
                        >
                          Delete note
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startAdd}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/30 px-4 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                    <NotePencil size={18} weight="bold" />
                  </span>
                  <span className="text-sm font-semibold text-brand-700">Add a note for this day</span>
                  <span className="text-xs text-[var(--muted)]">Jot down follow-ups, client promises or reminders</span>
                </button>
              )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm shadow-black/[0.02]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <NotePencil size={16} weight="bold" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-tight text-[var(--foreground)]">All notes</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {formatNumber(allNotes.length)} on record{' '}
                      {customerFilter ? '· filtered to one customer view' : ''}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                  {formatNumber(allNotes.length)}
                </span>
              </div>

              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {allNotes.map((n) => {
                  const active = n.key === selectedDayKey;
                  return (
                    <div
                      key={n.key}
                      className={`group flex items-start gap-3 rounded-xl border p-3 transition-all ${
                        active
                          ? 'border-brand-300 bg-brand-50/40 ring-1 ring-brand-100'
                          : 'border-[var(--border)] bg-white hover:border-brand-200 hover:shadow-sm'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          active ? 'bg-brand-100 text-brand-700' : 'bg-pink-50 text-pink-600'
                        }`}
                      >
                        <NotePencil size={15} weight="bold" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                            {fullDateLabel(parseKey(n.key))}
                          </p>
                          {active && (
                            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{n.text}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]/70">Saved {formatDateTime(n.updatedAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <ActionIcon
                          size="md"
                          variant="subtle"
                          color="gray"
                          onClick={() => editNoteFromList(n.key)}
                          aria-label={`Edit note for ${n.key}`}
                        >
                          <PencilSimple size={15} />
                        </ActionIcon>
                        <ActionIcon
                          size="md"
                          variant="subtle"
                          color="red"
                          onClick={() => deleteNote(n.key)}
                          aria-label={`Delete note for ${n.key}`}
                        >
                          <Trash size={15} />
                        </ActionIcon>
                      </div>
                    </div>
                  );
                })}
                {allNotes.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-12 text-center">
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <NotePencil size={18} weight="bold" />
                    </span>
                    <Text size="sm" fw={500} c="dimmed" className="mt-3">
                      No notes yet
                    </Text>
                    <Text size="xs" c="dimmed" className="mt-0.5">
                      Write your first note for {fullDateLabel(selectedDay)} and it will appear here.
                    </Text>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}