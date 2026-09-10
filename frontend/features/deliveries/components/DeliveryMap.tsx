'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { AgentLive, Delivery } from '../api';
import type { RouteResult } from '../directions';

type LeafletModule = typeof import('leaflet');
type MarkerType = InstanceType<LeafletModule['Marker']>;

const STATUS_COLORS: Record<string, string> = {
  pending_assignment: '#71717a',
  assigned: '#3b82f6',
  picked_up: '#f59e0b',
  in_transit: '#8b5cf6',
  delivered: '#22c55e',
  failed: '#ef4444',
};

const AGENT_COLOR = '#2563eb';

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#71717a';
}

function agentIconHtml(L: LeafletModule): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:38px;height:38px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,.35);animation:portalPulse 1.8s ease-out infinite"></div>
        <div style="position:absolute;top:3px;left:3px;width:32px;height:32px;border-radius:9px;background:${AGENT_COLOR};box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9.2" y="4.5" width="12" height="8.5" rx="1.2" fill="#fff"/>
            <rect x="2.2" y="5.6" width="6.2" height="7.4" rx="1.1" fill="#fff"/>
            <rect x="3.6" y="6.8" width="3.6" height="2.6" rx="0.8" fill="#93b4f8"/>
            <circle cx="6.6" cy="15.5" r="2.3" fill="#fff"/>
            <circle cx="16.6" cy="15.5" r="2.3" fill="#fff"/>
            <circle cx="6.6" cy="15.5" r="1" fill="${AGENT_COLOR}"/>
            <circle cx="16.6" cy="15.5" r="1" fill="${AGENT_COLOR}"/>
            <path d="M9.2 7.9h1.7" stroke="#93b4f8" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
        </div>
      </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 30],
  });
}

function deliveryMarkerHtml(color: string, badge: number | null): string {
  return `<div style="position:relative;width:24px;height:24px">
      <div style="width:24px;height:24px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>
      ${
        badge
          ? `<span style="position:absolute;bottom:-3px;right:-3px;min-width:15px;height:15px;line-height:15px;padding:0 4px;border-radius:8px;background:#18181b;color:#fff;font-size:9px;font-weight:700;text-align:center;border:1.5px solid #fff">${badge}</span>`
          : ''
      }
    </div>`;
}

function customerKey(d: Delivery): string {
  const name = (d.customer_name ?? '').trim().toLowerCase();
  const addr = (d.delivery_address ?? '').trim().toLowerCase();
  if (!name && !addr) return `__id:${d.id}`;
  return `${name}::${addr}`;
}

export default function DeliveryMap({
  deliveries,
  agents = [],
  selectedId,
  route = null,
  onSelect,
}: {
  deliveries: Delivery[];
  agents?: AgentLive[];
  selectedId: string | null;
  route?: RouteResult;
  onSelect: (id: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapInstance = useRef<InstanceType<LeafletModule['Map']> | null>(null);
  const layerGroupRef = useRef<InstanceType<LeafletModule['LayerGroup']> | null>(null);
  const agentLayerRef = useRef<InstanceType<LeafletModule['LayerGroup']> | null>(null);
  const routeLayerRef = useRef<InstanceType<LeafletModule['Polyline']> | null>(null);
  const markersRef = useRef<Map<string, { marker: MarkerType; lat: number; lng: number }>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Inject the pulse animation once (used by live agent markers).
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('portal-pulse')) {
      const style = document.createElement('style');
      style.id = 'portal-pulse';
      style.textContent =
        '@keyframes portalPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(2.4);opacity:0}}';
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapRef.current, {
        center: [24.8607, 67.0011],
        zoom: 12,
        scrollWheelZoom: false,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      agentLayerRef.current = L.layerGroup().addTo(map);

      requestAnimationFrame(() => map.invalidateSize());
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstance.current || !layerGroupRef.current) return;
    const L = leafletRef.current;
    if (!L) return;
    const layerGroup = layerGroupRef.current;

    layerGroup.clearLayers();
    markersRef.current.clear();

    const points: { d: Delivery; lat: number; lng: number }[] = [];
    for (const d of deliveries) {
      if (d.status === 'failed') continue;
      const lat = Number(d.delivery_lat);
      const lng = Number(d.delivery_lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      points.push({ d, lat, lng });
    }

    // Oldest first so newer markers end up above older ones (Leaflet stacks in
    // append order), then group same-customer deliveries so their pins fan out
    // with the newest one sitting squarely on top.
    points.sort(
      (a, b) => new Date(a.d.created_at).getTime() - new Date(b.d.created_at).getTime(),
    );

    const groups = new Map<string, typeof points>();
    for (const p of points) {
      const key = customerKey(p.d);
      const items = groups.get(key);
      if (items) items.push(p);
      else groups.set(key, [p]);
    }

    const latlngs: [number, number][] = [];
    for (const [, items] of groups) {
      const n = items.length;
      items.forEach((p, i) => {
        const isNewest = i === n - 1;
        let lat = p.lat;
        let lng = p.lng;
        if (!isNewest) {
          const behind = n - 1;
          const angle = behind === 1 ? -Math.PI / 2 : (i / behind) * 2 * Math.PI - Math.PI / 2;
          const r = 0.0006;
          const cosLng = Math.max(0.1, Math.cos((p.lat * Math.PI) / 180));
          lat = p.lat + r * Math.sin(angle);
          lng = p.lng + (r / cosLng) * Math.cos(angle);
        }
        const color = statusColor(p.d.status);
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: deliveryMarkerHtml(color, isNewest && n > 1 ? n : null),
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          zIndexOffset: isNewest ? n : 0,
        }).addTo(layerGroup);
        marker.bindPopup(
          `<div style="min-width:160px">
            <div style="font-weight:700;font-size:13px;margin-bottom:2px">${p.d.order_ref ?? 'Order'}</div>
            <div style="font-size:12px;color:#52525b">${p.d.customer_name ?? ''}</div>
            ${p.d.delivery_address ? `<div style="font-size:12px;color:#52525b;margin-top:2px">${p.d.delivery_address}</div>` : ''}
            ${
              n > 1
                ? `<div style="font-size:12px;color:#a1a1aa;margin-top:2px">${n} delivery${n === 1 ? '' : 'ies'} to this customer · newest on top</div>`
                : ''
            }
            <div style="font-size:12px;color:#52525b;margin-top:4px"><span style="font-weight:600;color:${color}">${(
              p.d.status ?? ''
            ).replace(/_/g, ' ')}</span></div>
          </div>`,
        );
        marker.on('click', () => onSelectRef.current(p.d.id));
        markersRef.current.set(p.d.id, { marker, lat, lng });
        latlngs.push([lat, lng]);
      });
    }

    if (latlngs.length === 0) {
      mapInstance.current.setView([24.8607, 67.0011], 5);
      return;
    }
    mapInstance.current.fitBounds(L.latLngBounds(latlngs).pad(0.2), { maxZoom: 15 });
  }, [deliveries, mapReady]);

  // Live agent markers
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !agentLayerRef.current) return;
    const L = leafletRef.current;
    if (!L) return;
    const agentLayer = agentLayerRef.current;

    agentLayer.clearLayers();

    const livePoints: [number, number][] = [];
    for (const a of agents) {
      const lat = Number(a.agent_lat);
      const lng = Number(a.agent_lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      livePoints.push([lat, lng]);
      const marker = L.marker([lat, lng], { icon: agentIconHtml(L) }).addTo(agentLayer);
      const age = a.agent_location_updated_at
        ? Math.max(0, Math.round((Date.now() - new Date(a.agent_location_updated_at).getTime()) / 1000))
        : null;
      marker.bindPopup(
        `<div style="min-width:170px">
          <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;margin-bottom:2px">
            <span style="width:8px;height:8px;border-radius:50%;background:${AGENT_COLOR}"></span>
            ${a.full_name}
          </div>
          <div style="font-size:12px;color:#2563eb;font-weight:600">Live</div>
          <div style="font-size:12px;color:#52525b;margin-top:4px">${a.active_deliveries} active delivery${
            a.active_deliveries === 1 ? '' : 'ies'
          }</div>
          <div style="font-size:11px;color:#a1a1aa;margin-top:2px">${
            age === null ? 'no position yet' : `last update ${age}s ago`
          }</div>
        </div>`,
      );
    }

    if (livePoints.length > 0) {
      mapInstance.current.fitBounds(L.latLngBounds(livePoints).pad(0.3), { maxZoom: 15 });
    }
  }, [agents, mapReady]);

  // Directions polyline from the agent's live position to the selected delivery
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const L = leafletRef.current;
    if (!L) return;
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    if (!route || route.points.length < 2) return;
    routeLayerRef.current = L.polyline(route.points, {
      color: '#6366f1',
      weight: 4,
      opacity: 0.9,
    }).addTo(mapInstance.current);
  }, [route, mapReady]);

  useEffect(() => {
    if (!mapReady || !selectedId) return;
    const entry = markersRef.current.get(selectedId);
    if (entry) {
      mapInstance.current?.setView([entry.lat, entry.lng], 15);
      entry.marker.openPopup();
    }
  }, [selectedId, mapReady]);

  return (
    <div
      ref={mapRef}
      className="h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-200"
      style={{ zIndex: 1 }}
    />
  );
}