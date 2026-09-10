'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reportAgentLocation } from '../api';

export type LivePosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  updatedAt: number;
};

const REPORT_INTERVAL_MS = 10_000;
const MIN_MOVE_METERS = 20;

function useLiveLocation() {
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<LivePosition | null>(null);

  const send = useCallback(async (lat: number, lng: number, accuracy: number) => {
    try {
      await reportAgentLocation(lat, lng, accuracy);
      lastSentRef.current = { latitude: lat, longitude: lng, accuracy, updatedAt: Date.now() };
    } catch {
      // Transient network failure — the next report will retry.
    }
  }, []);

  const record = useCallback(
    (lat: number, lng: number, accuracy: number) => {
      const now = Date.now();
      setPosition({ latitude: lat, longitude: lng, accuracy, updatedAt: now });
      setError(null);
      const last = lastSentRef.current;
      const moved =
        !last ||
        Math.hypot(lat - last.latitude, lng - last.longitude) * 111_320 > MIN_MOVE_METERS;
      const due = !last || now - last.updatedAt > REPORT_INTERVAL_MS;
      if (moved || due) void send(lat, lng, accuracy);
    },
    [send],
  );

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => record(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      () => setError('Could not get your location. Check location permissions.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => record(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Allow location access to go live.');
        } else {
          setError('Lost location signal — retrying…');
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
    );
    // Heartbeat so admins always see a fresh position even when stationary.
    intervalRef.current = setInterval(() => {
      setPosition((pos) => {
        if (pos) void send(pos.latitude, pos.longitude, pos.accuracy);
        return pos;
      });
    }, REPORT_INTERVAL_MS);
    setTracking(true);
  }, [record, send]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
    setError(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { tracking, position, error, start, stop };
}

export default useLiveLocation;