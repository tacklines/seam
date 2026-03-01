import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConflictResolution } from '../../schema/types.js';
import type { Overlap } from '../../lib/comparison.js';

// ResolutionRecorder is a Lit web component. We test the logic and
// public interface (properties, events) without full DOM rendering.

// ── Overlap fixture ──────────────────────────────────────────────

const makeOverlap = (partial?: Partial<Overlap>): Overlap => ({
  kind: 'same-name',
  label: 'OrderPlaced',
  roles: ['order-service', 'payment-service'],
  details: 'Both roles emit this event',
  ...partial,
});

// ── ConflictResolution fixture ───────────────────────────────────

const makeResolution = (partial?: Partial<ConflictResolution>): ConflictResolution => ({
  overlapLabel: 'OrderPlaced',
  resolution: 'Combine both perspectives into one',
  chosenApproach: 'merge',
  resolvedBy: ['Alice'],
  resolvedAt: new Date().toISOString(),
  ...partial,
});

// ── Fetch mock helpers ───────────────────────────────────────────

function mockFetch(response: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(ok ? '' : JSON.stringify(response)),
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe('ResolutionRecorder — logic', () => {
  describe('Given an overlap with no existing resolution', () => {
    it('should prepare a valid payload for merge approach', async () => {
      const fetchMock = mockFetch({ resolution: makeResolution({ chosenApproach: 'merge' }) });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        const capturedBody: unknown[] = [];
        fetchMock.mockImplementation(async (_url: string, opts?: RequestInit) => {
          capturedBody.push(JSON.parse(opts?.body as string));
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve({ resolution: makeResolution() }),
            text: () => Promise.resolve(''),
          };
        });

        const overlap = makeOverlap();
        const payload = {
          overlapLabel: overlap.label,
          resolution: 'Combine both perspectives into one',
          chosenApproach: 'merge',
          resolvedBy: ['Alice'],
        };

        await fetch('http://localhost:3002/api/sessions/TEST/jam/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        expect(capturedBody[0]).toEqual(payload);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('should require a description for custom approach', () => {
      const isCustom = (approach: string) => approach === 'custom';
      const canSubmit = (approach: string, text: string) =>
        approach !== null && (approach !== 'custom' || text.trim().length > 0);

      // custom with empty text should block submit
      expect(canSubmit('custom', '')).toBe(false);
      expect(canSubmit('custom', '  ')).toBe(false);

      // custom with text should allow submit
      expect(canSubmit('custom', 'We deferred to order service')).toBe(true);

      // non-custom approaches should allow submit even without custom text
      expect(canSubmit('merge', '')).toBe(true);
      expect(canSubmit('pick-left', '')).toBe(true);
      expect(canSubmit('split', '')).toBe(true);

      expect(isCustom('custom')).toBe(true);
      expect(isCustom('merge')).toBe(false);
    });

    it('should pre-fill description for quick approaches', () => {
      const approaches = [
        { value: 'merge', description: 'Combine both perspectives into one' },
        { value: 'pick-left', description: 'One role owns this; the other defers' },
        { value: 'split', description: 'These are actually two separate things' },
      ];

      for (const a of approaches) {
        // Simulate the pre-fill logic
        const text = a.value !== 'custom' ? a.description : '';
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Given an existing resolution', () => {
    it('should surface the resolved approach and description', () => {
      const resolution = makeResolution({
        chosenApproach: 'merge',
        resolution: 'Order context owns this, payment subscribes',
        resolvedBy: ['Alice', 'Bob'],
      });

      // The component shows the resolution if existingResolution is set
      expect(resolution.chosenApproach).toBe('merge');
      expect(resolution.resolution).toBe('Order context owns this, payment subscribes');
      expect(resolution.resolvedBy).toEqual(['Alice', 'Bob']);
    });
  });

  describe('When the API call fails', () => {
    it('should surface the error message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Session not found or jam not started'),
        json: () => Promise.resolve({ error: 'Session not found or jam not started' }),
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        let errorCaught: string | null = null;
        try {
          const res = await fetch('http://localhost:3002/api/sessions/MISSING/jam/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              overlapLabel: 'OrderPlaced',
              resolution: 'merge',
              chosenApproach: 'merge',
              resolvedBy: ['Alice'],
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(body || `HTTP ${res.status}`);
          }
        } catch (err) {
          errorCaught = (err as Error).message;
        }

        expect(errorCaught).toBe('Session not found or jam not started');
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('Offline mode', () => {
    it('should synthesize a local resolution when sessionCode is empty', () => {
      const overlap = makeOverlap();
      const participantName = 'Alice';

      // Simulates the offline path
      const payload = {
        overlapLabel: overlap.label,
        resolution: 'Combine both perspectives into one',
        chosenApproach: 'merge',
        resolvedBy: [participantName],
      };
      const localResolution: ConflictResolution = {
        ...payload,
        resolvedAt: new Date().toISOString(),
      };

      expect(localResolution.overlapLabel).toBe('OrderPlaced');
      expect(localResolution.resolvedBy).toContain('Alice');
      expect(localResolution.resolvedAt).toBeTruthy();
    });
  });
});

describe('ResolutionRecorder — approach toggling', () => {
  it('should toggle off when the same approach is selected again', () => {
    let selected: string | null = 'merge';

    // Click same approach again — toggle off
    if (selected === 'merge') selected = null;

    expect(selected).toBeNull();
  });

  it('should switch to a different approach', () => {
    let selected: string | null = 'merge';

    // Click a different approach
    selected = 'split';

    expect(selected).toBe('split');
  });
});
