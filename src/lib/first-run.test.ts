import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hasSeenTip,
  markTipSeen,
  resetAllTips,
  getUnseenTips,
} from './first-run.js';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
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
// hasSeenTip
// ---------------------------------------------------------------------------

describe('hasSeenTip', () => {
  it('returns false when nothing has been stored', () => {
    expect(hasSeenTip('comparison-view')).toBe(false);
  });

  it('returns false for an unseen tip when other tips have been seen', () => {
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify(['conflict-resolve'])
    );
    expect(hasSeenTip('comparison-view')).toBe(false);
  });

  it('returns true after a tip has been marked seen', () => {
    // Simulate stored value already containing the tip
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify(['comparison-view'])
    );
    expect(hasSeenTip('comparison-view')).toBe(true);
  });

  it('returns false when localStorage contains malformed JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-valid-json');
    expect(hasSeenTip('comparison-view')).toBe(false);
  });

  it('returns false when localStorage contains a non-array value', () => {
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ key: 'val' }));
    expect(hasSeenTip('comparison-view')).toBe(false);
  });

  it('returns false when localStorage.getItem throws', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage error');
    });
    expect(hasSeenTip('comparison-view')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markTipSeen
// ---------------------------------------------------------------------------

describe('markTipSeen', () => {
  it('persists a tip key to localStorage', () => {
    markTipSeen('comparison-view');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'seam-help-tips-seen',
      expect.stringContaining('comparison-view')
    );
  });

  it('does not duplicate a key when marked seen twice', () => {
    const stored = JSON.stringify(['comparison-view']);
    localStorageMock.getItem.mockReturnValueOnce(stored);

    markTipSeen('comparison-view');

    // setItem should not have been called because the tip was already present
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('appends to existing seen tips without replacing them', () => {
    const stored = JSON.stringify(['conflict-resolve']);
    localStorageMock.getItem.mockReturnValueOnce(stored);

    markTipSeen('comparison-view');

    const written = JSON.parse(
      localStorageMock.setItem.mock.calls[0][1] as string
    ) as string[];
    expect(written).toContain('conflict-resolve');
    expect(written).toContain('comparison-view');
  });

  it('does not throw when localStorage.setItem throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    expect(() => markTipSeen('priority-view')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resetAllTips
// ---------------------------------------------------------------------------

describe('resetAllTips', () => {
  it('calls localStorage.removeItem with the storage key', () => {
    resetAllTips();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      'seam-help-tips-seen'
    );
  });

  it('after reset, hasSeenTip returns false for all tips', () => {
    // Simulate removal — getItem returns null after removeItem
    localStorageMock.removeItem.mockImplementationOnce(() => {
      // The mock store is already empty by default in each test
    });
    resetAllTips();
    expect(hasSeenTip('comparison-view')).toBe(false);
    expect(hasSeenTip('priority-view')).toBe(false);
  });

  it('does not throw when localStorage.removeItem throws', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('storage error');
    });
    expect(() => resetAllTips()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getUnseenTips
// ---------------------------------------------------------------------------

describe('getUnseenTips', () => {
  it('returns all tip keys when nothing has been seen', () => {
    const unseen = getUnseenTips();
    expect(unseen).toContain('comparison-view');
    expect(unseen).toContain('conflict-resolve');
    expect(unseen).toContain('priority-view');
    expect(unseen).toContain('breakdown-editor');
    expect(unseen).toContain('integration-dashboard');
    expect(unseen).toContain('file-drop');
    expect(unseen).toContain('spark-canvas');
    expect(unseen).toContain('agreements-tab');
    expect(unseen).toContain('contracts-tab');
    expect(unseen).toHaveLength(9);
  });

  it('excludes tips that have already been seen', () => {
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify(['comparison-view', 'priority-view'])
    );
    const unseen = getUnseenTips();
    expect(unseen).not.toContain('comparison-view');
    expect(unseen).not.toContain('priority-view');
    expect(unseen).toContain('conflict-resolve');
  });

  it('returns an empty array when all tips have been seen', () => {
    const allKeys = [
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
    localStorageMock.getItem.mockReturnValue(JSON.stringify(allKeys));
    expect(getUnseenTips()).toHaveLength(0);
  });

  it('returns all tips when localStorage contains malformed JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('corrupt');
    expect(getUnseenTips()).toHaveLength(9);
  });
});
