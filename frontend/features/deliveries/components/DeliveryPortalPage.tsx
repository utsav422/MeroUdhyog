'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Package,
  CheckCircle,
  XCircle,
  NavigationArrow,
  Truck,
  ArrowsClockwise,
  Crosshair,
  WarningCircle,
  CalendarBlank,
} from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { useSession } from '@/lib/providers';
import { PageHeader, StatusBadge, ErrorState, LoadingState } from '@/components/shared';
import { formatDateTime } from '@/lib/format';
import {
  useMyDeliveries,
  useDeliveryAgents,
  deliveriesKeys,
  DELIVERY_STATUSES,
} from '../api';
import type { AgentLive, Delivery } from '../api';
import DeliveryMap from './DeliveryMap';
import useLiveLocation from '../hooks/useLiveLocation';
import { fetchDirections, formatRouteDistance, formatRouteDuration } from '../directions';
import type { RouteResult } from '../directions';

// The statuses a delivery agent can action, mapped to next steps
const NEXT_ACTION: Record<string, { label: string; status: string }> = {
  assigned: { label: 'Mark picked up', status: 'picked_up' },
  picked_up: { label: 'Start transit', status: 'in_transit' },
};

type ViewMode = 'list' | 'map';

type DayFilter = 'today' | 'yesterday' | 'week' | 'all';

const DAY_FILTER_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'all', label: 'All days' },
];

const DAY_FILTER_LABEL: Record<DayFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  all: 'All days',
};

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DeliveryPortalPage() {
  const qc = useQueryClient();
  const session = useSession();
  const isAgent = session?.role === 'delivery';
  const myQuery = useMyDeliveries();
  const agentsQuery = useDeliveryAgents();
  const { tracking, position, error: locationError, start, stop } = useLiveLocation();

  const [view, setView] = useState<ViewMode>(isAgent ? 'list' : 'map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<Delivery | null>(null);
  const [failedTarget, setFailedTarget] = useState<Delivery | null>(null);
  const [proofNotes, setProofNotes] = useState('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  const deliveries = useMemo(() => myQuery.data ?? [], [myQuery.data]);

  const filteredDeliveries = useMemo<Delivery[]>(() => {
    if (dayFilter === 'all') return deliveries;
    const now = new Date();
    return deliveries.filter((d) => {
      if (!d.created_at) return false;
      const created = new Date(d.created_at);
      if (dayFilter === 'today') return sameLocalDay(created, now);
      if (dayFilter === 'yesterday') {
        return sameLocalDay(created, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      }
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return created >= start && created <= now;
    });
  }, [deliveries, dayFilter]);

  const stats = useMemo(() => {
    const inTransit = filteredDeliveries.filter((d) => ['picked_up', 'in_transit'].includes(d.status)).length;
    const delivered = filteredDeliveries.filter((d) => d.status === 'delivered').length;
    const pending = filteredDeliveries.filter((d) => ['pending_assignment', 'assigned'].includes(d.status)).length;
    const total = filteredDeliveries.length;
    return { total, pending, inTransit, delivered };
  }, [filteredDeliveries]);

  const selected = selectedId ? filteredDeliveries.find((d) => d.id === selectedId) ?? null : null;

  // Catalog managers watch every live agent; an agent sees their own live dot.
  const liveAgents = useMemo<AgentLive[]>(() => {
    if (isAgent) {
      if (tracking && position) {
        return [
          {
            id: session?.user_id ?? 'self',
            full_name: 'You',
            email: session?.email ?? '',
            agent_lat: String(position.latitude.toFixed(6)),
            agent_lng: String(position.longitude.toFixed(6)),
            agent_location_updated_at: new Date(position.updatedAt).toISOString(),
            active_deliveries: stats.total,
          },
        ];
      }
      return [];
    }
    return (agentsQuery.data ?? []).filter(
      (a) => a.agent_lat && a.agent_lng,
    );
  }, [isAgent, tracking, position, session, stats.total, agentsQuery.data]);

  const liveCount = useMemo(
    () =>
      liveAgents.filter((a) => {
        if (!a.agent_location_updated_at) return false;
        const age = (agentsQuery.dataUpdatedAt - new Date(a.agent_location_updated_at).getTime()) / 1000;
        return age < 180;
      }).length,
    [liveAgents, agentsQuery.dataUpdatedAt],
  );

  const syncQuery = () => qc.invalidateQueries({ queryKey: deliveriesKeys.mine() });

  const [route, setRoute] = useState<RouteResult>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const routeTarget = useMemo(() => {
    const dest = selectedId ? filteredDeliveries.find((d) => d.id === selectedId) : null;
    if (!dest || !dest.delivery_lat || !dest.delivery_lng || !position) return null;
    return {
      to: { lat: Number(dest.delivery_lat), lng: Number(dest.delivery_lng) },
      from: { lat: position.latitude, lng: position.longitude },
    };
  }, [selectedId, position, filteredDeliveries]);

  const activeRoute = useMemo(() => (routeTarget ? route : null), [routeTarget, route]);

  useEffect(() => {
    if (!routeTarget) return;
    let cancelled = false;
    fetchDirections(routeTarget.from, routeTarget.to).then((r) => {
      if (cancelled) return;
      setRoute(r);
      setRouteError(r ? null : 'Directions are unavailable for this route right now.');
    });
    return () => {
      cancelled = true;
    };
  }, [routeTarget]);

  const statusMutation = useMutation({
    mutationFn: async ({ delivery, status }: { delivery: Delivery; status: string }) => {
      await apiClient.patch(`/deliveries/${delivery.id}`, { status });
    },
    onSuccess: (_data, vars) => {
      notifications.show({
        color: 'success',
        title: `Marked ${vars.status.replace(/_/g, ' ')}`,
        message: 'Status updated — the map marker has been updated.',
      });
      syncQuery();
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  const completeMutation = useMutation({
    mutationFn: async ({
      delivery,
      status,
      notes,
    }: {
      delivery: Delivery;
      status: 'delivered' | 'failed';
      notes?: string;
    }) => {
      await apiClient.patch(`/deliveries/${delivery.id}`, {
        status,
        ...(notes ? { proof_notes: notes } : {}),
      });
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: 'Delivery completed',
        message: 'Status updated — the map marker has been updated.',
      });
      syncQuery();
      setDeliverTarget(null);
      setFailedTarget(null);
      setProofNotes('');
    },
    onError: (error) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      }),
  });

  if (myQuery.isLoading) return <LoadingState />;
  if (myQuery.isError) return <ErrorState retry={() => myQuery.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isAgent ? 'My Deliveries' : 'Deliveries'}
        subtitle={
          isAgent
            ? `Hi ${session?.full_name ?? 'there'} — go live with GPS so your manager can follow you, then update statuses as you deliver.`
            : 'Track every delivery and your live agents on the map, or review the full list.'
        }
        actions={
          <Group gap="sm">
            <Select
              value={dayFilter}
              onChange={(value) => {
                setDayFilter((value as DayFilter) ?? 'all');
                setSelectedId(null);
              }}
              data={DAY_FILTER_OPTIONS}
              leftSection={<CalendarBlank size={15} />}
              w={150}
              aria-label="Filter by day"
            />
            {isAgent &&
              (tracking ? (
                <Button
                  color="green"
                  leftSection={
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                    </span>
                  }
                  onClick={stop}
                >
                  {position ? `Live · ±${Math.round(position.accuracy)}m` : 'Live…'}
                </Button>
              ) : (
                <Button
                  color="brand"
                  leftSection={<Crosshair size={16} />}
                  onClick={start}
                >
                  Go live
                </Button>
              ))}
            <SegmentedControl
              value={view}
              onChange={(value) => setView(value as ViewMode)}
              data={[
                { label: 'List', value: 'list' },
                { label: 'Map', value: 'map' },
              ]}
            />
            <Button
              variant="default"
              leftSection={<ArrowsClockwise size={16} />}
              onClick={() => {
                myQuery.refetch();
                agentsQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </Group>
        }
      />

      {locationError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WarningCircle size={18} weight="fill" className="text-amber-500" />
          {locationError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Truck size={20} weight="bold" />}
          label={isAgent ? 'Assigned to you' : 'Total deliveries'}
          value={stats.total}
          color="bg-brand-50 text-brand-600"
        />
        <StatCard
          icon={<Package size={20} weight="bold" />}
          label="To collect / pending"
          value={stats.pending}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={<NavigationArrow size={20} weight="bold" />}
          label="In transit"
          value={stats.inTransit}
          color="bg-violet-50 text-violet-600"
        />
        <StatCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Delivered"
          value={stats.delivered}
          color="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <CalendarBlank size={13} />
        Showing <span className="font-semibold text-zinc-600">{DAY_FILTER_LABEL[dayFilter].toLowerCase()}</span>{' '}
        deliveries ({stats.total})
      </div>

      {view === 'map' ? (
        <div>
          <div className="relative">
            <DeliveryMap
              deliveries={filteredDeliveries}
              agents={liveAgents}
              selectedId={selectedId}
              route={activeRoute}
              onSelect={setSelectedId}
            />
            {liveCount > 0 && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-blue-600 shadow-sm">
                {liveCount} agent{liveCount === 1 ? '' : 's'} live now
              </div>
            )}
            {activeRoute && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm">
                <Truck size={13} weight="bold" />
                {formatRouteDistance(activeRoute.distanceM)} from you · ≈{formatRouteDuration(activeRoute.durationS)}
              </div>
            )}
            {routeError && position && selectedId && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm">
                {routeError}
              </div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-sm">
              {DELIVERY_STATUSES.map((s) => (
                <span
                  key={s}
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_STATUS_COLOR(s) }} />
                  {s.replace(/_/g, ' ')}
                </span>
              ))}
              <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} />
                agent
              </span>
            </div>
          </div>

          {selected && (
            <div className="mt-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <Group justify="space-between" align="start">
                <div>
                  <Text fw={700} size="lg">{selected.order_ref ?? 'Delivery'}</Text>
                  <Text size="sm" c="dimmed">{selected.customer_name}</Text>
                </div>
                <StatusBadge status={selected.status} />
              </Group>
              {selected.delivery_address && (
                <div className="mt-3 flex items-start gap-1.5 text-sm text-zinc-600">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <span>{selected.delivery_address}</span>
                </div>
              )}
              {selected.delivery_lat && selected.delivery_lng && activeRoute ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                  <Truck size={13} weight="bold" />
                  {formatRouteDistance(activeRoute.distanceM)} from you · ≈{formatRouteDuration(activeRoute.durationS)}
                </div>
              ) : selected.delivery_lat && selected.delivery_lng && isAgent && !tracking ? (
                <div className="mt-2 text-xs text-zinc-400">
                  Go live with GPS to see driving directions to this delivery.
                </div>
              ) : null}
              {selected.proof_notes && (
                <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  <span className="font-semibold">Proof: </span>
                  {selected.proof_notes}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          {filteredDeliveries.length === 0 ? (
            <div className="flex h-[420px] flex-col items-center justify-center rounded-2xl border border-zinc-100 bg-white p-8 text-center shadow-sm">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
                <MapPin size={22} weight="duotone" />
              </div>
              {dayFilter === 'all' ? (
                <>
                  <Text fw={600} className="text-zinc-800">No deliveries yet</Text>
                  <Text size="sm" c="dimmed" className="mt-1 max-w-xs">
                    {isAgent
                      ? 'When a manager assigns a delivery to you, it will show up here.'
                      : 'Once orders are placed, their deliveries will show up here.'}
                  </Text>
                </>
              ) : (
                <>
                  <Text fw={600} className="text-zinc-800">
                    No {DAY_FILTER_LABEL[dayFilter].toLowerCase()} deliveries
                  </Text>
                  <Text size="sm" c="dimmed" className="mt-1 max-w-xs">
                    Pick a different day to see more deliveries on the map.
                  </Text>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredDeliveries.map((d) => {
                const next = NEXT_ACTION[d.status];
                const isSelected = d.id === selectedId;
                return (
                  <div
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(d.id);
                      }
                    }}
                    className={`cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                      isSelected ? 'border-brand-400 ring-2 ring-brand-100' : 'border-zinc-100 hover:border-zinc-200'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-800">{d.order_ref ?? '—'}</span>
                        <StatusBadge status={d.status} />
                      </div>
                      <span className="text-[11px] text-zinc-400">{formatDateTime(d.assigned_at)}</span>
                    </div>
                    <div className="mb-1 text-sm font-semibold text-zinc-700">
                      {d.customer_name ?? 'Walk-in'}
                    </div>
                    {d.delivery_address ? (
                      <div className="mb-2 flex items-start gap-1.5 text-xs text-zinc-500">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{d.delivery_address}</span>
                      </div>
                    ) : d.delivery_lat && d.delivery_lng ? (
                      <div className="mb-2 text-[11px] text-zinc-400">
                        {Number(d.delivery_lat).toFixed(5)}, {Number(d.delivery_lng).toFixed(5)}
                      </div>
                    ) : null}
                    {!d.delivery_lat || !d.delivery_lng ? (
                      <div className="mb-3 text-[11px] text-amber-600">No map coordinates for this delivery</div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {next && (
                        <Button
                          size="xs"
                          leftSection={<Package size={13} />}
                          loading={statusMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            statusMutation.mutate({ delivery: d, status: next.status });
                          }}
                        >
                          {next.label}
                        </Button>
                      )}
                      {d.status === 'in_transit' && (
                        <>
                          <Button
                            size="xs"
                            color="green"
                            leftSection={<CheckCircle size={13} />}
                            loading={completeMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeliverTarget(d);
                            }}
                          >
                            Mark delivered
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            leftSection={<XCircle size={13} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFailedTarget(d);
                            }}
                          >
                            Mark failed
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        opened={!!deliverTarget}
        onClose={() => {
          setDeliverTarget(null);
          setProofNotes('');
        }}
        title={`Mark ${deliverTarget?.order_ref ?? ''} delivered`}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Confirm the drop-off is complete. You can add proof notes below.
          </Text>
          <Textarea
            label="Proof notes"
            placeholder="Optional — signature, photo reference, notes…"
            value={proofNotes}
            onChange={(e) => setProofNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Button
            color="green"
            loading={completeMutation.isPending}
            onClick={() =>
              deliverTarget &&
              completeMutation.mutate({ delivery: deliverTarget, status: 'delivered', notes: proofNotes })
            }
          >
            Confirm delivered
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={!!failedTarget}
        onClose={() => {
          setFailedTarget(null);
          setProofNotes('');
        }}
        title={`Mark ${failedTarget?.order_ref ?? ''} failed`}
      >
        <Stack gap="md">
          <Textarea
            label="Reason"
            placeholder="Reason for failed delivery"
            value={proofNotes}
            onChange={(e) => setProofNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Button
            color="red"
            loading={completeMutation.isPending}
            onClick={() =>
              failedTarget && completeMutation.mutate({ delivery: failedTarget, status: 'failed', notes: proofNotes })
            }
          >
            Mark failed
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}

function MAP_STATUS_COLOR(status: string): string {
  const colors: Record<string, string> = {
    pending_assignment: '#71717a',
    assigned: '#3b82f6',
    picked_up: '#f59e0b',
    in_transit: '#8b5cf6',
    delivered: '#22c55e',
    failed: '#ef4444',
  };
  return colors[status] ?? '#71717a';
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <Text size="xs" c="dimmed" fw={500}>{label}</Text>
        <Text fw={700} size="xl" className="leading-tight">{value}</Text>
      </div>
    </div>
  );
}