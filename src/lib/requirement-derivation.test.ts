import { describe, it, expect } from 'vitest';
import {
  deriveFromRequirement,
  deriveFromRequirements,
} from './requirement-derivation.js';
import type { Requirement, DomainEvent } from '../schema/types.js';

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    text: 'Users should be able to create orders',
    participantId: 'p1',
    status: 'draft',
    derivedEvents: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const existingEvent: DomainEvent = {
  name: 'OrderCreated',
  aggregate: 'Order',
  trigger: 'Customer places order',
  payload: [{ field: 'orderId', type: 'string' }],
  integration: { direction: 'internal' },
  confidence: 'LIKELY',
};

describe('deriveFromRequirement', () => {
  it('derives events from requirement text with create keyword', () => {
    const req = makeRequirement({ text: 'Users should be able to create orders' });
    const results = deriveFromRequirement(req, []);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Created');
    expect(results[0].confidence).toBeDefined();
    expect(results[0].trigger).toBeDefined();
    expect(results[0].stateChange).toBeDefined();
  });

  it('filters out events that already exist in the session', () => {
    const req = makeRequirement({ text: 'Users should be able to create orders' });
    const results = deriveFromRequirement(req, [existingEvent]);

    const names = results.map((r) => r.name.toLowerCase());
    expect(names).not.toContain('ordercreated');
  });

  it('returns empty array when no keywords match', () => {
    const req = makeRequirement({ text: 'The system shall be performant' });
    const results = deriveFromRequirement(req, []);

    expect(results).toEqual([]);
  });

  it('derives approval-related events', () => {
    const req = makeRequirement({ text: 'Manager must approve expense reports' });
    const results = deriveFromRequirement(req, []);

    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('Approved'))).toBe(true);
  });

  it('derives payment-related events', () => {
    const req = makeRequirement({ text: 'Customer should pay for the subscription' });
    const results = deriveFromRequirement(req, []);

    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('Payment'))).toBe(true);
  });

  it('contextualizes event names from requirement text', () => {
    const req = makeRequirement({ text: 'Admin can delete accounts' });
    const results = deriveFromRequirement(req, []);

    expect(results.length).toBeGreaterThan(0);
    // Should use "Accounts" or "Account" context rather than generic "Entity"
    const hasContextualName = results.some(
      (r) => !r.name.includes('Entity')
    );
    expect(hasContextualName).toBe(true);
  });
});

describe('deriveFromRequirements', () => {
  it('returns suggestions grouped by requirement ID', () => {
    const reqs = [
      makeRequirement({ id: 'req-1', text: 'Users create orders' }),
      makeRequirement({ id: 'req-2', text: 'Admin can approve requests' }),
    ];
    const results = deriveFromRequirements(reqs, []);

    expect(results).toHaveLength(2);
    expect(results[0].requirementId).toBe('req-1');
    expect(results[1].requirementId).toBe('req-2');
    expect(results[0].events.length).toBeGreaterThan(0);
    expect(results[1].events.length).toBeGreaterThan(0);
  });

  it('handles empty requirements array', () => {
    const results = deriveFromRequirements([], []);
    expect(results).toEqual([]);
  });
});
