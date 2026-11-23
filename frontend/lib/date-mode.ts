import { useSyncExternalStore } from 'react';

export type DateMode = 'AD' | 'BS';

const STORAGE_KEY = 'meroudhyog-date-mode';

let currentMode: DateMode = 'AD';
const listeners = new Set<() => void>();

export function getDateMode(): DateMode {
  return currentMode;
}

export function subscribeDateMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDateMode(next: DateMode): void {
  if (next !== 'AD' && next !== 'BS') return;
  if (next === currentMode) return;
  currentMode = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  listeners.forEach((listener) => listener());
}

export function loadDateMode(): void {
  if (typeof window === 'undefined') return;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'AD' || saved === 'BS') setDateMode(saved);
}

export function useDateMode(): DateMode {
  return useSyncExternalStore(subscribeDateMode, getDateMode, () => 'AD');
}
