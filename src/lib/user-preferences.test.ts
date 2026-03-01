import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserPreference, setUserPreference } from './user-preferences.js';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

let localStorageMock = makeLocalStorageMock();

beforeEach(() => {
  localStorageMock = makeLocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getUserPreference', () => {
  it('returns the default theme when nothing is stored', () => {
    expect(getUserPreference('theme')).toBe('system');
  });

  it('returns the default reducedMotion when nothing is stored', () => {
    expect(getUserPreference('reducedMotion')).toBe(false);
  });

  it('returns the default compactMode when nothing is stored', () => {
    expect(getUserPreference('compactMode')).toBe(false);
  });

  it('returns a stored value that differs from the default', () => {
    localStorageMock.getItem.mockImplementationOnce(() =>
      JSON.stringify({ theme: 'dark', reducedMotion: false, compactMode: false })
    );
    expect(getUserPreference('theme')).toBe('dark');
  });

  it('falls back to the default when localStorage contains malformed JSON', () => {
    localStorageMock.getItem.mockImplementationOnce(() => 'not-valid-json');
    expect(getUserPreference('theme')).toBe('system');
  });

  it('falls back to defaults when localStorage throws on getItem', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage error');
    });
    expect(getUserPreference('theme')).toBe('system');
  });
});

describe('setUserPreference', () => {
  it('persists a theme preference to localStorage', () => {
    setUserPreference('theme', 'dark');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'mhw-preferences',
      expect.stringContaining('"theme":"dark"')
    );
  });

  it('persists a boolean preference to localStorage', () => {
    setUserPreference('reducedMotion', true);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string);
    expect(stored.reducedMotion).toBe(true);
  });

  it('reading back a set value returns the updated preference', () => {
    setUserPreference('compactMode', true);
    // Capture what was written and feed it to getItem on the next read
    const written = localStorageMock.setItem.mock.calls[0][1] as string;
    localStorageMock.getItem.mockReturnValueOnce(written);
    expect(getUserPreference('compactMode')).toBe(true);
  });

  it('does not overwrite other keys when setting one preference', () => {
    // Pre-populate storage with all three preferences
    const initial = JSON.stringify({ theme: 'light', reducedMotion: true, compactMode: false });
    localStorageMock.getItem.mockReturnValueOnce(initial);

    setUserPreference('compactMode', true);

    const written = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string);
    expect(written.theme).toBe('light');
    expect(written.reducedMotion).toBe(true);
    expect(written.compactMode).toBe(true);
  });

  it('does not throw when localStorage.setItem throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    expect(() => setUserPreference('theme', 'dark')).not.toThrow();
  });
});
