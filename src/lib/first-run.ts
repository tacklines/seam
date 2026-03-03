/**
 * First-run state manager for contextual help tips.
 *
 * Tracks which help tips have been shown to this user via localStorage.
 * Each tip is shown once per browser (not once per session).
 *
 * Storage key: `seam-help-tips-seen` — JSON array of HelpTipKey strings.
 */

export type HelpTipKey =
  | 'comparison-view'
  | 'conflict-resolve'
  | 'priority-view'
  | 'breakdown-editor'
  | 'integration-dashboard'
  | 'file-drop'
  | 'spark-canvas'
  | 'agreements-tab'
  | 'contracts-tab';

const ALL_TIP_KEYS: HelpTipKey[] = [
  'comparison-view',
  'conflict-resolve',
  'priority-view',
  'breakdown-editor',
  'integration-dashboard',
  'file-drop',
  'spark-canvas',
  'agreements-tab',
  'contracts-tab',
];

const STORAGE_KEY = 'seam-help-tips-seen';

function readSeenTips(): HelpTipKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is HelpTipKey => typeof v === 'string');
  } catch {
    return [];
  }
}

function writeSeenTips(keys: HelpTipKey[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // localStorage may be unavailable (e.g. in private browsing with storage blocked).
    // Silently swallow — callers should not need to handle this.
  }
}

/**
 * Returns true if this user has already seen the given help tip.
 */
export function hasSeenTip(key: HelpTipKey): boolean {
  return readSeenTips().includes(key);
}

/**
 * Records the given help tip as seen in localStorage.
 * Subsequent calls to hasSeenTip(key) will return true.
 */
export function markTipSeen(key: HelpTipKey): void {
  const seen = readSeenTips();
  if (!seen.includes(key)) {
    writeSeenTips([...seen, key]);
  }
}

/**
 * Clears all seen-tip records from localStorage.
 * Intended for testing and settings reset flows.
 */
export function resetAllTips(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently swallow storage errors.
  }
}

/**
 * Returns all HelpTipKeys that this user has not yet seen.
 */
export function getUnseenTips(): HelpTipKey[] {
  const seen = readSeenTips();
  return ALL_TIP_KEYS.filter((k) => !seen.includes(k));
}
