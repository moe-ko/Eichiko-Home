import type { TransportPanel } from '$lib/types/transport';

const STORAGE_KEY = 'eichiko-transport-config';

const DEFAULT_PANELS: TransportPanel[] = [
  { id: '1', type: 'bus', label: 'Bexley Road / Glenesk Road (Stop AF)', stopId: '490007227W' },
  { id: '2', type: 'bus', label: 'Southend Crescent / Wythens Walk (Stop B)', stopId: '490012279S1' },
  { id: '3', type: 'train', label: 'New Eltham Station', crs: 'NEH', platform: '1' },
  { id: '4', type: 'train', label: 'Eltham Station', crs: 'ELW', platform: '1' },
];

// Structural type guard, validate untrusted localStorage input before use.
// Anything that doesn't match the expected shape is discarded so a corrupted
// or tampered-with storage entry can't crash the app or be used as an
// injection vector into fetch URLs.
function isValidPanel(p: unknown): p is TransportPanel {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== 'string') return false;
  if (o.type !== 'bus' && o.type !== 'train') return false;
  if (typeof o.label !== 'string') return false;
  if (o.type === 'bus') {
    if (typeof o.stopId !== 'string') return false;
  } else {
    if (typeof o.crs !== 'string') return false;
    if (o.platform !== null && typeof o.platform !== 'string') return false;
  }
  return true;
}

export function loadPanels(): TransportPanel[] {
  if (typeof window === 'undefined') return DEFAULT_PANELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANELS;
    const parsed = JSON.parse(raw);
    if (
      parsed.version === 1 &&
      Array.isArray(parsed.panels) &&
      parsed.panels.length > 0 &&
      parsed.panels.every(isValidPanel)
    ) {
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
