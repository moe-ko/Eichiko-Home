import type { TransportPanel } from '$lib/types/transport';

const STORAGE_KEY = 'eichiko-transport-config';

const DEFAULT_PANELS: TransportPanel[] = [
  { id: '1', type: 'bus', label: 'Bexley Road / Glenesk Road (Stop AF)', stopId: '490007227W' },
  { id: '2', type: 'bus', label: 'Southend Crescent / Wythens Walk (Stop B)', stopId: '490012279S1' },
  { id: '3', type: 'train', label: 'New Eltham Station', crs: 'NEH', platform: '1' },
  { id: '4', type: 'train', label: 'Eltham Station', crs: 'ELW', platform: '1' },
];

export function loadPanels(): TransportPanel[] {
  if (typeof window === 'undefined') return DEFAULT_PANELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANELS;
    const parsed = JSON.parse(raw);
    if (parsed.version === 1 && Array.isArray(parsed.panels) && parsed.panels.length > 0) {
      return parsed.panels;
    }
    return DEFAULT_PANELS;
  } catch {
    return DEFAULT_PANELS;
  }
}

export function savePanels(panels: TransportPanel[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, panels }));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}
