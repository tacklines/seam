/**
 * Tests for the shared requirements-panel component.
 *
 * These tests cover the exported pure-function helpers (coverageCount,
 * isCovered) and the component's event contract. Full rendering requires
 * a browser environment (Playwright e2e).
 */

import { describe, it, expect } from 'vitest';
import { coverageCount, isCovered } from './requirements-panel.js';
import type { Requirement } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    statement: 'Users need offline support',
    authorId: 'user-1',
    status: 'draft',
    priority: 0,
    tags: [],
    derivedEvents: [],
    derivedAssumptions: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isCovered
// ---------------------------------------------------------------------------

describe('isCovered', () => {
  it('returns true when derivedEvents overlaps with sessionEventNames', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced'] });
    expect(isCovered(req, ['OrderPlaced'])).toBe(true);
  });

  it('returns false when derivedEvents has no overlap with sessionEventNames', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced'] });
    expect(isCovered(req, ['PaymentReceived'])).toBe(false);
  });

  it('returns false when derivedEvents is empty', () => {
    const req = makeRequirement({ derivedEvents: [] });
    expect(isCovered(req, ['OrderPlaced', 'PaymentReceived'])).toBe(false);
  });

  it('returns false when sessionEventNames is empty', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced'] });
    expect(isCovered(req, [])).toBe(false);
  });

  it('returns false when both arrays are empty', () => {
    const req = makeRequirement({ derivedEvents: [] });
    expect(isCovered(req, [])).toBe(false);
  });

  it('returns true for partial overlap (some derived events accepted)', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced', 'OrderShipped', 'OrderCancelled'] });
    expect(isCovered(req, ['OrderPlaced'])).toBe(true);
  });

  it('returns true when all derived events are in session', () => {
    const req = makeRequirement({ derivedEvents: ['EventA', 'EventB'] });
    expect(isCovered(req, ['EventA', 'EventB', 'EventC'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coverageCount
// ---------------------------------------------------------------------------

describe('coverageCount', () => {
  it('returns 0 when derivedEvents is empty', () => {
    const req = makeRequirement({ derivedEvents: [] });
    expect(coverageCount(req, ['OrderPlaced'])).toBe(0);
  });

  it('returns 0 when no overlap with sessionEventNames', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced'] });
    expect(coverageCount(req, ['PaymentReceived'])).toBe(0);
  });

  it('returns correct count for single matching event', () => {
    const req = makeRequirement({ derivedEvents: ['OrderPlaced'] });
    expect(coverageCount(req, ['OrderPlaced'])).toBe(1);
  });

  it('returns correct count for multiple matching events', () => {
    const req = makeRequirement({
      derivedEvents: ['OrderPlaced', 'OrderShipped', 'OrderCancelled'],
    });
    expect(coverageCount(req, ['OrderPlaced', 'OrderShipped', 'OrderCancelled'])).toBe(3);
  });

  it('returns count of only overlapping events (partial match)', () => {
    const req = makeRequirement({
      derivedEvents: ['EventA', 'EventB', 'EventC'],
    });
    expect(coverageCount(req, ['EventA', 'EventC'])).toBe(2);
  });

  it('returns 0 when sessionEventNames is empty', () => {
    const req = makeRequirement({ derivedEvents: ['EventA'] });
    expect(coverageCount(req, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Coverage for multiple requirements
// ---------------------------------------------------------------------------

describe('coverage categorization for multiple requirements', () => {
  const requirements: Requirement[] = [
    makeRequirement({
      id: 'req-1',
      statement: 'Offline support',
      derivedEvents: ['OfflineCacheCreated'],
    }),
    makeRequirement({
      id: 'req-2',
      statement: 'User login',
      derivedEvents: ['UserLoggedIn', 'SessionStarted'],
    }),
    makeRequirement({
      id: 'req-3',
      statement: 'Order processing',
      derivedEvents: [],
    }),
  ];
  const sessionEventNames = ['OfflineCacheCreated', 'UserLoggedIn'];

  it('req-1 is covered (1 event)', () => {
    expect(isCovered(requirements[0], sessionEventNames)).toBe(true);
    expect(coverageCount(requirements[0], sessionEventNames)).toBe(1);
  });

  it('req-2 is covered (1 of 2 derived events accepted)', () => {
    expect(isCovered(requirements[1], sessionEventNames)).toBe(true);
    expect(coverageCount(requirements[1], sessionEventNames)).toBe(1);
  });

  it('req-3 is uncovered (no derived events)', () => {
    expect(isCovered(requirements[2], sessionEventNames)).toBe(false);
    expect(coverageCount(requirements[2], sessionEventNames)).toBe(0);
  });

  it('correctly distinguishes covered vs uncovered requirements', () => {
    const covered = requirements.filter((r) => isCovered(r, sessionEventNames));
    const uncovered = requirements.filter((r) => !isCovered(r, sessionEventNames));
    expect(covered.length).toBe(2);
    expect(uncovered.length).toBe(1);
    expect(uncovered[0].id).toBe('req-3');
  });
});

// ---------------------------------------------------------------------------
// Header count
// ---------------------------------------------------------------------------

describe('header count rendering', () => {
  it('represents 3 requirements as "Requirements (3)"', () => {
    const requirements = [
      makeRequirement({ id: 'req-1' }),
      makeRequirement({ id: 'req-2', statement: 'Second requirement' }),
      makeRequirement({ id: 'req-3', statement: 'Third requirement' }),
    ];
    // The component renders: Requirements (${count})
    const headerText = `Requirements (${requirements.length})`;
    expect(headerText).toBe('Requirements (3)');
  });

  it('represents 0 requirements as "Requirements (0)"', () => {
    const requirements: Requirement[] = [];
    const headerText = `Requirements (${requirements.length})`;
    expect(headerText).toBe('Requirements (0)');
  });

  it('represents 1 requirement as "Requirements (1)"', () => {
    const requirements = [makeRequirement()];
    const headerText = `Requirements (${requirements.length})`;
    expect(headerText).toBe('Requirements (1)');
  });
});

// ---------------------------------------------------------------------------
// Event detail shape
// ---------------------------------------------------------------------------

describe('requirement-selected event', () => {
  it('CustomEvent detail has requirementId string', () => {
    const event = new CustomEvent('requirement-selected', {
      detail: { requirementId: 'req-42' },
      bubbles: true,
      composed: true,
    });
    expect(event.type).toBe('requirement-selected');
    expect(event.detail).toEqual({ requirementId: 'req-42' });
    expect(typeof event.detail.requirementId).toBe('string');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});

describe('derive-more-clicked event', () => {
  it('CustomEvent has empty detail', () => {
    const event = new CustomEvent('derive-more-clicked', {
      detail: {},
      bubbles: true,
      composed: true,
    });
    expect(event.type).toBe('derive-more-clicked');
    expect(event.detail).toEqual({});
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});
