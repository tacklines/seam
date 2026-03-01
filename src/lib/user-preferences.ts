/**
 * Typed localStorage wrapper for per-user UI preferences.
 *
 * Unlike session config (which is server-side and shared across all participants),
 * user preferences are client-local and scoped to the individual browser.
 *
 * Storage key: `mhw-preferences`
 */

export interface UserPreferences {
  /** Color scheme preference. `'system'` follows OS setting. Default: `'system'` */
  theme: 'light' | 'dark' | 'system';
  /** When true, animations and transitions are minimised. Default: `false` */
  reducedMotion: boolean;
  /** When true, the UI uses a denser layout with smaller spacing. Default: `false` */
  compactMode: boolean;
}

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  reducedMotion: false,
  compactMode: false,
};

const STORAGE_KEY = 'mhw-preferences';

function readPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...DEFAULT_USER_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

function writePreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable (e.g. in private browsing with storage blocked).
    // Silently swallow — callers should not need to handle this.
  }
}

/**
 * Returns the current value of a single user preference key.
 *
 * Falls back to the default value when localStorage is unavailable or the key
 * has not been set yet.
 */
export function getUserPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
  return readPreferences()[key];
}

/**
 * Persists a single user preference to localStorage.
 *
 * The change is applied immediately — no "Save" step required.
 */
export function setUserPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): void {
  const current = readPreferences();
  current[key] = value;
  writePreferences(current);
}
