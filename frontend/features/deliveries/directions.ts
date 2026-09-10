'use client';

export type RouteResult = {
  points: [number, number][];
  distanceM: number;
  durationS: number;
} | null;

export async function fetchDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) return null;
    const points = (route.geometry?.coordinates ?? []).map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );
    return {
      points,
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatRouteDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}