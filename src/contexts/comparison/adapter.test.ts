import { describe, it, expect } from 'vitest';
import { toComparableArtifact } from './adapter.js';
import type { LoadedFile, DomainEvent, BoundaryAssumption } from '../../schema/types.js';

function makeFile(
  role: string,
  events: Partial<DomainEvent>[] = [],
  assumptions: Partial<BoundaryAssumption>[] = []
): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: {
      metadata: {
        role,
        scope: 'test',
        goal: 'test',
        generated_at: '2026-02-28T00:00:00Z',
        event_count: events.length,
        assumption_count: assumptions.length,
      },
      domain_events: events.map((e) => ({
        name: e.name ?? 'DefaultEvent',
        aggregate: e.aggregate ?? 'DefaultAgg',
        trigger: e.trigger ?? 'trigger',
        payload: e.payload ?? [],
        integration: e.integration ?? { direction: 'internal' as const },
        confidence: e.confidence ?? 'CONFIRMED' as const,
        ...e,
      })),
      boundary_assumptions: assumptions.map((a) => ({
        id: a.id ?? 'BA-1',
        type: a.type ?? 'contract' as const,
        statement: a.statement ?? 'test assumption',
        affects_events: a.affects_events ?? [],
        confidence: a.confidence ?? 'LIKELY' as const,
        verify_with: a.verify_with ?? 'someone',
        ...a,
      })),
    },
  };
}

describe('toComparableArtifact', () => {
  it('maps role from LoadedFile', () => {
    const file = makeFile('payments-team');
    const artifact = toComparableArtifact(file);
    expect(artifact.role).toBe('payments-team');
  });

  it('maps domain_events to events with name and aggregate', () => {
    const file = makeFile('backend', [
      { name: 'PaymentSucceeded', aggregate: 'Payment' },
      { name: 'OrderPlaced', aggregate: 'Order' },
    ]);
    const artifact = toComparableArtifact(file);
    expect(artifact.events).toHaveLength(2);
    expect(artifact.events[0]).toEqual({ name: 'PaymentSucceeded', aggregate: 'Payment' });
    expect(artifact.events[1]).toEqual({ name: 'OrderPlaced', aggregate: 'Order' });
  });

  it('maps boundary_assumptions to assumptions with camelCase affectsEvents', () => {
    const file = makeFile(
      'frontend',
      [],
      [{
        id: 'BA-42',
        type: 'contract' as const,
        statement: 'PaymentSucceeded carries total in cents',
        affects_events: ['PaymentSucceeded', 'RefundIssued'],
        confidence: 'CONFIRMED' as const,
        verify_with: 'backend team',
      }]
    );
    const artifact = toComparableArtifact(file);
    expect(artifact.assumptions).toHaveLength(1);
    expect(artifact.assumptions[0]).toEqual({
      id: 'BA-42',
      type: 'contract',
      statement: 'PaymentSucceeded carries total in cents',
      affectsEvents: ['PaymentSucceeded', 'RefundIssued'],
    });
  });

  it('produces empty events and assumptions arrays for a file with none', () => {
    const file = makeFile('observer');
    const artifact = toComparableArtifact(file);
    expect(artifact.events).toEqual([]);
    expect(artifact.assumptions).toEqual([]);
  });

  it('does not carry over extra LoadedFile fields (filename, metadata)', () => {
    const file = makeFile('ops');
    const artifact = toComparableArtifact(file);
    expect(Object.keys(artifact)).toEqual(['role', 'events', 'assumptions']);
  });
});
