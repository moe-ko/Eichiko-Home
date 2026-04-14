const STORAGE_KEY = 'eichiko-settings';

export interface UserSettings {
  title: string;
  location: string;
  theme: 'dark' | 'light';
}

const DEFAULT_SETTINGS: UserSettings = {
  title: "EICHIKO'S HOME",
  location: 'Greenwich,GB',
  theme: 'dark',
};

function isValidSettings(s: unknown): s is UserSettings {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  const title = o.title as string | undefined;
  const location = o.location as string | undefined;
  const theme = o.theme as string | undefined;
  if (typeof title !== 'string' || typeof location !== 'string') return false;
  if (theme !== 'dark' && theme !== 'light' && theme !== undefined) return false;
  return true;
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
    // Migration: add theme if missing (defaults to 'dark')
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') {
      parsed.theme = 'dark';
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