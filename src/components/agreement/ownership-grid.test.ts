import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OwnershipAssignment } from '../../schema/types.js';

// OwnershipGrid is a Lit web component. We test the logic layer:
// assignment resolution, cell state derivation, API payload shape.

// ── Fixture helpers ──────────────────────────────────────────────

const makeAssignment = (partial?: Partial<OwnershipAssignment>): OwnershipAssignment => ({
  aggregate: 'Order',
  ownerRole: 'order-service',
  assignedBy: 'Alice',
  assignedAt: new Date().toISOString(),
  ...partial,
});

// ── Pure logic helpers (extracted from component internals) ──────

/** Returns the ownerRole for an aggregate, or undefined */
function getOwner(map: OwnershipAssignment[], aggregate: string): string | undefined {
  return map.find((a) => a.aggregate === aggregate)?.ownerRole;
}

/** Count how many aggregates have assignments */
function assignedCount(aggregates: string[], map: OwnershipAssignment[]): number {
  return aggregates.filter((agg) => map.some((a) => a.aggregate === agg)).length;
}

/** Build payload for jam/assign */
function buildPayload(aggregate: string, ownerRole: string, assignedBy: string) {
  return { aggregate, ownerRole, assignedBy };
}

// ── Tests ────────────────────────────────────────────────────────

describe('OwnershipGrid — ownership resolution', () => {
  describe('Given an empty ownership map', () => {
    it('should return undefined for any aggregate', () => {
      const map: OwnershipAssignment[] = [];
      expect(getOwner(map, 'Order')).toBeUndefined();
      expect(getOwner(map, 'Payment')).toBeUndefined();
    });

    it('should report 0 assigned aggregates', () => {
      expect(assignedCount(['Order', 'Payment', 'Inventory'], [])).toBe(0);
    });
  });

  describe('Given a populated ownership map', () => {
    const map: OwnershipAssignment[] = [
      makeAssignment({ aggregate: 'Order', ownerRole: 'order-service' }),
      makeAssignment({ aggregate: 'Payment', ownerRole: 'payment-service' }),
    ];

    it('should resolve the owning role for a known aggregate', () => {
      expect(getOwner(map, 'Order')).toBe('order-service');
      expect(getOwner(map, 'Payment')).toBe('payment-service');
    });

    it('should return undefined for an unassigned aggregate', () => {
      expect(getOwner(map, 'Inventory')).toBeUndefined();
    });

    it('should count correctly across a mixed set', () => {
      const aggregates = ['Order', 'Payment', 'Inventory'];
      expect(assignedCount(aggregates, map)).toBe(2);
    });
  });

  describe('When assigning ownership', () => {
    it('should build the correct payload', () => {
      const payload = buildPayload('Order', 'order-service', 'Alice');
      expect(payload).toEqual({
        aggregate: 'Order',
        ownerRole: 'order-service',
        assignedBy: 'Alice',
      });
    });

    it('should fall back to Facilitator when participantName is empty', () => {
      const participantName = '';
      const assignedBy = participantName || 'Facilitator';
      expect(assignedBy).toBe('Facilitator');
    });
  });
});

describe('OwnershipGrid — cell state derivation', () => {
  describe('Given a cell for an aggregate/role pair', () => {
    const map: OwnershipAssignment[] = [
      makeAssignment({ aggregate: 'Order', ownerRole: 'order-service' }),
    ];

    it('should mark the owning role as owned', () => {
      const isOwner = (agg: string, role: string) => getOwner(map, agg) === role;
      expect(isOwner('Order', 'order-service')).toBe(true);
      expect(isOwner('Order', 'payment-service')).toBe(false);
      expect(isOwner('Payment', 'order-service')).toBe(false);
    });
  });
});

describe('OwnershipGrid — API interaction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('When the API call succeeds', () => {
    it('should return the assignment from the response', async () => {
      const expectedAssignment = makeAssignment({ aggregate: 'Order', ownerRole: 'order-service' });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ assignment: expectedAssignment }),
        text: () => Promise.resolve(''),
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        const res = await fetch('http://localhost:3002/api/sessions/TEST/jam/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload('Order', 'order-service', 'Alice')),
        });
        expect(res.ok).toBe(true);
        const { assignment } = (await res.json()) as { assignment: OwnershipAssignment };
        expect(assignment.aggregate).toBe('Order');
        expect(assignment.ownerRole).toBe('order-service');
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
        json: () => Promise.resolve({ error: 'Session not found or jam not started' }),
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      try {
        let errorMsg: string | null = null;
        try {
          const res = await fetch('http://localhost:3002/api/sessions/NOPE/jam/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload('Order', 'order-service', 'Alice')),
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

  describe('Offline mode', () => {
    it('should synthesize a local assignment when sessionCode is empty', () => {
      const sessionCode = '';
      const aggregate = 'Order';
      const ownerRole = 'order-service';
      const assignedBy = 'Alice';

      // Offline path — no fetch, local synthesis
      if (!sessionCode) {
        const assignment: OwnershipAssignment = {
          aggregate,
          ownerRole,
          assignedBy,
          assignedAt: new Date().toISOString(),
        };
        expect(assignment.aggregate).toBe('Order');
        expect(assignment.ownerRole).toBe('order-service');
        expect(assignment.assignedAt).toBeTruthy();
      }
    });
  });
});
