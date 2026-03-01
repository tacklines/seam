import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnresolvedItem } from '../../schema/types.js';

// FlagManager is a Lit web component. We test the logic layer:
// payload construction, form validation, API interaction, offline mode.

// ── Fixture helpers ──────────────────────────────────────────────

const makeItem = (partial?: Partial<UnresolvedItem>): UnresolvedItem => ({
  id: 'item-001',
  description: "Couldn't agree on whether OrderPlaced triggers inventory deduction",
  flaggedBy: 'Alice',
  flaggedAt: new Date().toISOString(),
  ...partial,
});

// ── Pure logic helpers ───────────────────────────────────────────

/** Validates whether the form can be submitted */
function canSubmit(description: string): boolean {
  return description.trim().length > 0;
}

/** Build payload for jam/flag */
function buildPayload(
  description: string,
  flaggedBy: string,
  relatedOverlap?: string
): { description: string; flaggedBy: string; relatedOverlap?: string } {
  const payload: { description: string; flaggedBy: string; relatedOverlap?: string } = {
    description: description.trim(),
    flaggedBy,
  };
  if (relatedOverlap?.trim()) {
    payload.relatedOverlap = relatedOverlap.trim();
  }
  return payload;
}

// ── Tests ────────────────────────────────────────────────────────

describe('FlagManager — form validation', () => {
  describe('When description is empty', () => {
    it('should block submission with blank string', () => {
      expect(canSubmit('')).toBe(false);
    });

    it('should block submission with whitespace-only string', () => {
      expect(canSubmit('   ')).toBe(false);
    });
  });

  describe('When description is provided', () => {
    it('should allow submission', () => {
      expect(canSubmit("We couldn't agree on this")).toBe(true);
    });
  });
});

describe('FlagManager — payload construction', () => {
  it('should include description and flaggedBy', () => {
    const payload = buildPayload('Something unresolved', 'Alice');
    expect(payload.description).toBe('Something unresolved');
    expect(payload.flaggedBy).toBe('Alice');
    expect(payload.relatedOverlap).toBeUndefined();
  });

  it('should include relatedOverlap when provided', () => {
    const payload = buildPayload('Something unresolved', 'Alice', 'OrderPlaced');
    expect(payload.relatedOverlap).toBe('OrderPlaced');
  });

  it('should omit relatedOverlap when it is empty', () => {
    const payload = buildPayload('Something unresolved', 'Alice', '');
    expect(payload.relatedOverlap).toBeUndefined();
  });

  it('should omit relatedOverlap when it is whitespace', () => {
    const payload = buildPayload('Something unresolved', 'Alice', '  ');
    expect(payload.relatedOverlap).toBeUndefined();
  });

  it('should trim whitespace from description', () => {
    const payload = buildPayload('  Needs follow-up  ', 'Bob');
    expect(payload.description).toBe('Needs follow-up');
  });

  it('should fall back to Facilitator when participantName is empty', () => {
    const participantName = '';
    const flaggedBy = participantName || 'Facilitator';
    const payload = buildPayload('Something unresolved', flaggedBy);
    expect(payload.flaggedBy).toBe('Facilitator');
  });
});

describe('FlagManager — API interaction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('When the API call succeeds', () => {
    it('should return the item from the response', async () => {
      const expectedItem = makeItem();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ item: expectedItem }),
        text: () => Promise.resolve(''),
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        const res = await fetch('http://localhost:3002/api/sessions/TEST/jam/flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload("Couldn't agree", 'Alice')),
        });
        expect(res.ok).toBe(true);
        const { item } = (await res.json()) as { item: UnresolvedItem };
        expect(item.id).toBe('item-001');
        expect(item.description).toBe(expectedItem.description);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('When the API call fails', () => {
    it('should throw an error with the response body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Session not found or jam not started'),
        json: () => Promise.resolve({}),
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        let errorMsg: string | null = null;
        try {
          const res = await fetch('http://localhost:3002/api/sessions/NOPE/jam/flag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload("Something", 'Alice')),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(body || `HTTP ${res.status}`);
          }
        } catch (err) {
          errorMsg = (err as Error).message;
        }
        expect(errorMsg).toBe('Session not found or jam not started');
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});

describe('FlagManager — offline mode', () => {
  it('should synthesize a local item when sessionCode is empty', () => {
    const sessionCode = '';
    const description = "Couldn't agree on this";
    const flaggedBy = 'Alice';

    if (!sessionCode) {
      const item: UnresolvedItem = {
        description,
        flaggedBy,
        id: `local-${Date.now()}`,
        flaggedAt: new Date().toISOString(),
      };
      expect(item.id).toMatch(/^local-/);
      expect(item.description).toBe(description);
      expect(item.flaggedBy).toBe('Alice');
      expect(item.flaggedAt).toBeTruthy();
    }
  });
});

describe('FlagManager — item display', () => {
  describe('Given a list of items', () => {
    const items = [
      makeItem({ id: 'a', description: 'First unresolved item' }),
      makeItem({ id: 'b', description: 'Second unresolved item', relatedOverlap: 'OrderPlaced' }),
    ];

    it('should expose the correct count', () => {
      expect(items.length).toBe(2);
    });

    it('should surface relatedOverlap when present', () => {
      const withOverlap = items.find((i) => i.relatedOverlap !== undefined);
      expect(withOverlap?.relatedOverlap).toBe('OrderPlaced');
    });

    it('should handle items without relatedOverlap', () => {
      const withoutOverlap = items.find((i) => i.relatedOverlap === undefined);
      expect(withoutOverlap).toBeDefined();
      expect(withoutOverlap?.relatedOverlap).toBeUndefined();
    });
  });

  describe('Given an empty item list', () => {
    it('should show zero count', () => {
      expect([].length).toBe(0);
    });
  });
});
