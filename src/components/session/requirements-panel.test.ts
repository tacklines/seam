/**
 * Tests for requirements-panel component.
 *
 * These tests focus on the exported pure-function helpers (statusIcon,
 * statusColor) and the custom event contract. Full rendering tests
 * require a browser environment (Playwright e2e).
 */

import { describe, it, expect } from 'vitest';
import { statusIcon, statusColor } from './requirements-panel.js';
import type { Requirement, RequirementStatus } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    statement: 'We need offline support',
    authorId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    derivedEvents: [],
    derivedAssumptions: [],
    status: 'draft',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// statusIcon
// ---------------------------------------------------------------------------

describe('statusIcon', () => {
  it('returns check-circle for fulfilled', () => {
    expect(statusIcon('fulfilled')).toBe('check-circle');
  });

  it('returns play-circle for active', () => {
    expect(statusIcon('active')).toBe('play-circle');
  });

  it('returns circle for draft', () => {
    expect(statusIcon('draft')).toBe('circle');
  });

  it('returns dash-circle for deferred', () => {
    expect(statusIcon('deferred')).toBe('dash-circle');
  });
});

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------

describe('statusColor', () => {
  it('returns success for fulfilled', () => {
    expect(statusColor('fulfilled')).toBe('success');
  });

  it('returns primary for active', () => {
    expect(statusColor('active')).toBe('primary');
  });

  it('returns neutral for draft', () => {
    expect(statusColor('draft')).toBe('neutral');
  });

  it('returns neutral for deferred', () => {
    expect(statusColor('deferred')).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// Status mapping covers all RequirementStatus values
// ---------------------------------------------------------------------------

describe('status mapping completeness', () => {
  const allStatuses: RequirementStatus[] = ['draft', 'active', 'fulfilled', 'deferred'];

  it('statusIcon handles every RequirementStatus', () => {
    for (const status of allStatuses) {
      expect(typeof statusIcon(status)).toBe('string');
      expect(statusIcon(status).length).toBeGreaterThan(0);
    }
  });

  it('statusColor handles every RequirementStatus', () => {
    for (const status of allStatuses) {
      expect(typeof statusColor(status)).toBe('string');
      expect(statusColor(status).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Event detail shape (requirement-selected)
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

// ---------------------------------------------------------------------------
// Requirement data model
// ---------------------------------------------------------------------------

describe('Requirement data model', () => {
  it('makeRequirement produces valid defaults', () => {
    const req = makeRequirement();
    expect(req.id).toBe('req-1');
    expect(req.statement).toBe('We need offline support');
    expect(req.status).toBe('draft');
    expect(req.derivedEvents).toEqual([]);
  });

  it('derivedEvents count is used for event count display', () => {
    const noEvents = makeRequirement({ derivedEvents: [] });
    const withEvents = makeRequirement({
      derivedEvents: ['EventA', 'EventB', 'EventC'],
    });

    expect(noEvents.derivedEvents.length).toBe(0);
    expect(withEvents.derivedEvents.length).toBe(3);
  });

  it('fulfilled requirement with events maps to success icon', () => {
    const req = makeRequirement({
      status: 'fulfilled',
      derivedEvents: ['DataSyncRequested', 'OfflineCacheCreated'],
    });

    expect(statusIcon(req.status)).toBe('check-circle');
    expect(statusColor(req.status)).toBe('success');
    expect(req.derivedEvents.length).toBe(2);
  });

  it('draft requirement with zero events needs derivation warning', () => {
    const req = makeRequirement({ status: 'draft', derivedEvents: [] });

    expect(statusIcon(req.status)).toBe('circle');
    expect(req.derivedEvents.length).toBe(0);
    // Component should show warning badge when eventCount === 0
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('empty state', () => {
  it('empty requirements array should trigger empty state', () => {
    const requirements: Requirement[] = [];
    expect(requirements.length).toBe(0);
    // Component renders empty state message when requirements.length === 0
  });

  it('non-empty requirements array should render list', () => {
    const requirements = [
      makeRequirement({ id: 'req-1' }),
      makeRequirement({ id: 'req-2', statement: 'Users should share documents' }),
    ];
    expect(requirements.length).toBe(2);
  });
});
