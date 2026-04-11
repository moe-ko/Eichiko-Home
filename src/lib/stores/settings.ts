const STORAGE_KEY = 'eichiko-settings';

export interface UserSettings {
  title: string;
  location: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  title: "EICHIKO'S HOME",
  location: 'Greenwich,GB',
};

function isValidSettings(s: unknown): s is UserSettings {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.location === 'string';
}

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Migration: merge old weatherLocation into location (unified settings)
    if (parsed.weatherLocation && !parsed.location) {
      parsed.location = parsed.weatherLocation;
    }
    if (isValidSettings(parsed)) {
      return parsed;
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}