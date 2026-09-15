'use client';

import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@mantine/core';
import 'leaflet/dist/leaflet.css';

type LeafletModule = typeof import('leaflet');
type LatLng = { lat: number; lng: number } | null;

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

type Suggestion = { lat: number; lng: number; label: string };

async function searchNominatim(query: string): Promise<Suggestion[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;
  return data
    .filter((d) => d.lat && d.lon && d.display_name)
    .map((d) => ({
      lat: Number(d.lat),
      lng: Number(d.lon),
      label: d.display_name as string,
    }));
}

async function searchPhoton(query: string): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string };
      }>;
    };
    return (data.features ?? [])
      .filter((f) => f.geometry?.coordinates)
      .map((f) => ({
        lat: f.geometry!.coordinates![1],
        lng: f.geometry!.coordinates![0],
        label:
          f.properties?.name && f.geometry
            ? f.properties.name
            : `${f.geometry?.coordinates?.[1]?.toFixed(4)}, ${f.geometry?.coordinates?.[0]?.toFixed(4)}`,
      }));
  } catch {
    return [];
  }
}

async function searchCombined(query: string): Promise<Suggestion[]> {
  let results = await searchNominatim(query);
  if (results.length === 0) {
    results = await searchPhoton(query);
  }
  return results;
}

export default function LocationPicker({
  value,
  onChange,
  label = 'Location',
  placeholder = 'Search address or drop a pin',
}: {
  value: LatLng;
  onChange: (v: LatLng) => void;
  label?: string;
  placeholder?: string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<InstanceType<LeafletModule['Map']> | null>(null);
  const markerInstance = useRef<InstanceType<LeafletModule['Marker']> | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ lat: number; lng: number; label: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  function setPin(lat: number, lng: number) {
    onChangeRef.current({ lat, lng });
  }

  function syncMarker(lat: number, lng: number) {
    if (markerInstance.current) markerInstance.current.setLatLng([lat, lng]);
    if (mapInstance.current) mapInstance.current.panTo([lat, lng]);
  }

  function locateMe() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!mapInstance.current || !markerInstance.current) return;
        setPin(latitude, longitude);
        syncMarker(latitude, longitude);
        mapInstance.current.setView([latitude, longitude], 16);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Click / drag the marker or search instead.'
            : 'Could not get your location. Try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: value ? [value.lat, value.lng] : DEFAULT_CENTER,
        zoom: value ? 14 : 5,
        scrollWheelZoom: false,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f43f5e;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      });

      const marker = L.marker(value ? [value.lat, value.lng] : DEFAULT_CENTER, {
        icon,
        draggable: true,
      }).addTo(map);
      markerInstance.current = marker;

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setPin(pos.lat, pos.lng);
      });

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setPin(lat, lng);
      });

      requestAnimationFrame(() => map.invalidateSize());
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value) syncMarker(value.lat, value.lng);
  }, [value]);

  useEffect(() => {
    if (!mapReady) return;
    if (value) return;
    // auto-zoom to the user's current location on first load (only once)
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        setPin(latitude, longitude);
        syncMarker(latitude, longitude);
        if (mapInstance.current) mapInstance.current.setView([latitude, longitude], 15);
      },
      () => {
        if (!cancelled) setLocateError('Could not fetch your current location; showing a default view.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
    return () => {
      cancelled = true;
    };
  }, [mapReady, value]);

  async function handleSearch(q: string) {
    setQuery(q);
    setSearchError(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchCombined(q);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        if (results.length === 0) {
          setSearchError(
            "Couldn't find that address. Try a nearby landmark, city, or pincode — or just click / drag the marker on the map.",
          );
        }
      } catch {
        setSearchError('Search failed. Try again or click / drag the marker on the map.');
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 350);
  }

  function selectSuggestion(s: { lat: number; lng: number; label: string }) {
    setQuery(s.label);
    setSuggestions([]);
    setShowSuggestions(false);
    if (mapInstance.current && markerInstance.current) {
      mapInstance.current.setView([s.lat, s.lng], 16);
      markerInstance.current.setLatLng([s.lat, s.lng]);
      setPin(s.lat, s.lng);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <TextInput
          label={label}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleSearch(e.currentTarget.value)}
          onFocus={() => {
            if (suggestions.length) setShowSuggestions(true);
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <li key={`${s.lat}-${s.lng}-${i}`}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {searchError && <p className="text-xs text-danger-600">{searchError}</p>}
      <div className="relative">
        <div
          ref={mapRef}
          className="h-64 w-full overflow-hidden rounded-xl border border-zinc-200"
          style={{ zIndex: 1 }}
        />
        {!mapReady && <p className="text-xs text-zinc-400">Loading map…</p>}
        <button
          type="button"
          onClick={locateMe}
          disabled={!mapReady || locating}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
          title="Go to my current location"
        >
          {locating ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          ) : (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: 'radial-gradient(circle, #f43f5e 0%, #f43f5e 35%, transparent 60%)' }}
            />
          )}
          {locating ? 'Locating…' : 'My location'}
        </button>
      </div>
      {locateError && <p className="text-xs text-amber-600">{locateError}</p>}
      {value ? (
        <p className="text-xs text-zinc-500">
          Latitude <span className="font-medium text-zinc-700">{value.lat.toFixed(6)}</span> ·
          Longitude <span className="font-medium text-zinc-700">{value.lng.toFixed(6)}</span>
        </p>
      ) : (
        <p className="text-xs text-zinc-400">
          Search an address or click / drag the marker to capture exact coordinates.
        </p>
      )}
    </div>
  );
}
