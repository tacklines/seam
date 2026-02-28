import { describe, it, expect } from 'vitest';
import { compareFiles, compareArtifacts } from './comparison.js';
import type { LoadedFile, DomainEvent, BoundaryAssumption } from '../schema/types.js';
import type { Overlap } from './comparison.js';
import type { ComparableArtifact } from '../contexts/comparison/types.js';

// Helper to build a minimal valid LoadedFile
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
        generated_at: '2026-02-27T10:00:00Z',
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

describe('Given fewer than 2 files', () => {
  it('when no files, returns empty overlap list', () => {
    // Per comparison.ts:99 — early return for < 2 files
    expect(compareFiles([])).toEqual([]);
  });

  it('when one file, returns empty overlap list', () => {
    // Per comparison.ts:99 — early return for < 2 files
    const file = makeFile('role-a', [{ name: 'EventA' }]);
    expect(compareFiles([file])).toEqual([]);
  });
});

describe('Given two files with same event name in different roles', () => {
  it('when event name appears in both roles, returns same-name overlap', () => {
    // Per comparison.ts:13-37 — findNameOverlaps detects shared event names
    const fileA = makeFile('frontend', [{ name: 'PaymentSucceeded' }]);
    const fileB = makeFile('backend', [{ name: 'PaymentSucceeded' }]);
    const overlaps = compareFiles([fileA, fileB]);
    const nameOverlaps = overlaps.filter((o) => o.kind === 'same-name');
    expect(nameOverlaps).toHaveLength(1);
    expect(nameOverlaps[0].label).toBe('PaymentSucceeded');
    expect(nameOverlaps[0].roles).toContain('frontend');
    expect(nameOverlaps[0].roles).toContain('backend');
  });
});

describe('Given two files with same event name in the same role', () => {
  it('when duplicate event name is within one role only, returns no same-name overlap', () => {
    // Per comparison.ts:25 — only flags when roles.length > 1
    const fileA = makeFile('backend', [
      { name: 'PaymentSucceeded', aggregate: 'Payment' },
      { name: 'PaymentSucceeded', aggregate: 'Order' },
    ]);
    const fileB = makeFile('frontend', [{ name: 'CheckoutStarted' }]);
    const overlaps = compareFiles([fileA, fileB]);
    const nameOverlaps = overlaps.filter((o) => o.kind === 'same-name');
    expect(nameOverlaps).toHaveLength(0);
  });
});

describe('Given two files with same aggregate in different roles', () => {
  it('when aggregate is claimed by multiple roles, returns same-aggregate overlap', () => {
    // Per comparison.ts:40-62 — findAggregateOverlaps detects shared aggregates
    const fileA = makeFile('frontend', [{ name: 'EventA', aggregate: 'Checkout' }]);
    const fileB = makeFile('backend', [{ name: 'EventB', aggregate: 'Checkout' }]);
    const overlaps = compareFiles([fileA, fileB]);
    const aggOverlaps = overlaps.filter((o) => o.kind === 'same-aggregate');
    expect(aggOverlaps).toHaveLength(1);
    expect(aggOverlaps[0].label).toBe('Checkout');
    expect(aggOverlaps[0].roles).toContain('frontend');
    expect(aggOverlaps[0].roles).toContain('backend');
  });
});

describe('Given two files with conflicting boundary assumptions', () => {
  it('when assumptions of same type affect same events in different roles, returns assumption-conflict', () => {
    // Per comparison.ts:65-96 — findAssumptionConflicts checks shared events + same type
    const fileA = makeFile(
      'frontend',
      [{ name: 'PaymentSucceeded' }],
      [{
        id: 'BA-1',
        type: 'contract' as const,
        statement: 'PaymentSucceeded carries total as decimal dollars',
        affects_events: ['PaymentSucceeded'],
      }]
    );
    const fileB = makeFile(
      'backend',
      [{ name: 'PaymentSucceeded' }],
      [{
        id: 'BA-1',
        type: 'contract' as const,
        statement: 'PaymentSucceeded carries amount_cents as integer',
        affects_events: ['PaymentSucceeded'],
      }]
    );
    const overlaps = compareFiles([fileA, fileB]);
    const conflicts = overlaps.filter((o) => o.kind === 'assumption-conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].roles).toContain('frontend');
    expect(conflicts[0].roles).toContain('backend');
    expect(conflicts[0].details).toContain('PaymentSucceeded');
  });
});

describe('Given two files with assumptions of different types on same events', () => {
  it('when assumption types differ, returns no conflict', () => {
    // Per comparison.ts:85 — only conflicts when a.assumption.type === b.assumption.type
    const fileA = makeFile(
      'frontend',
      [],
      [{
        id: 'BA-1',
        type: 'contract' as const,
        statement: 'Contract assumption',
        affects_events: ['PaymentSucceeded'],
      }]
    );
    const fileB = makeFile(
      'backend',
      [],
      [{
        id: 'BA-2',
        type: 'ordering' as const,
        statement: 'Ordering assumption',
        affects_events: ['PaymentSucceeded'],
      }]
    );
    const overlaps = compareFiles([fileA, fileB]);
    const conflicts = overlaps.filter((o) => o.kind === 'assumption-conflict');
    expect(conflicts).toHaveLength(0);
  });
});

// Helper to build a minimal ComparableArtifact
function makeArtifact(
  role: string,
  events: { name: string; aggregate: string }[] = [],
  assumptions: { id: string; type: string; statement: string; affectsEvents: string[] }[] = []
): ComparableArtifact {
  return { role, events, assumptions };
}

describe('compareArtifacts — Given fewer than 2 artifacts', () => {
  it('when no artifacts, returns empty overlap list', () => {
    expect(compareArtifacts([])).toEqual([]);
  });

  it('when one artifact, returns empty overlap list', () => {
    const a = makeArtifact('role-a', [{ name: 'EventA', aggregate: 'AggA' }]);
    expect(compareArtifacts([a])).toEqual([]);
  });
});

describe('compareArtifacts — Given two artifacts with same event name in different roles', () => {
  it('when event name appears in both roles, returns same-name overlap', () => {
    const artA = makeArtifact('frontend', [{ name: 'PaymentSucceeded', aggregate: 'Payment' }]);
    const artB = makeArtifact('backend', [{ name: 'PaymentSucceeded', aggregate: 'Order' }]);
    const overlaps = compareArtifacts([artA, artB]);
    const nameOverlaps = overlaps.filter((o) => o.kind === 'same-name');
    expect(nameOverlaps).toHaveLength(1);
    expect(nameOverlaps[0].label).toBe('PaymentSucceeded');
    expect(nameOverlaps[0].roles).toContain('frontend');
    expect(nameOverlaps[0].roles).toContain('backend');
  });
});

describe('compareArtifacts — Given two artifacts with same aggregate in different roles', () => {
  it('when aggregate is claimed by multiple roles, returns same-aggregate overlap', () => {
    const artA = makeArtifact('frontend', [{ name: 'EventA', aggregate: 'Checkout' }]);
    const artB = makeArtifact('backend', [{ name: 'EventB', aggregate: 'Checkout' }]);
    const overlaps = compareArtifacts([artA, artB]);
    const aggOverlaps = overlaps.filter((o) => o.kind === 'same-aggregate');
    expect(aggOverlaps).toHaveLength(1);
    expect(aggOverlaps[0].label).toBe('Checkout');
    expect(aggOverlaps[0].roles).toContain('frontend');
    expect(aggOverlaps[0].roles).toContain('backend');
  });
});

describe('compareArtifacts — Given two artifacts with conflicting assumptions', () => {
  it('when assumptions of same type affect same events in different roles, returns assumption-conflict', () => {
    const artA = makeArtifact(
      'frontend',
      [{ name: 'PaymentSucceeded', aggregate: 'Payment' }],
      [{
        id: 'BA-1',
        type: 'contract',
        statement: 'PaymentSucceeded carries total as decimal dollars',
        affectsEvents: ['PaymentSucceeded'],
      }]
    );
    const artB = makeArtifact(
      'backend',
      [{ name: 'PaymentSucceeded', aggregate: 'Payment' }],
      [{
        id: 'BA-2',
        type: 'contract',
        statement: 'PaymentSucceeded carries amount_cents as integer',
        affectsEvents: ['PaymentSucceeded'],
      }]
    );
    const overlaps = compareArtifacts([artA, artB]);
    const conflicts = overlaps.filter((o) => o.kind === 'assumption-conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].roles).toContain('frontend');
    expect(conflicts[0].roles).toContain('backend');
    expect(conflicts[0].details).toContain('PaymentSucceeded');
  });

  it('when assumption types differ, returns no conflict', () => {
    const artA = makeArtifact(
      'frontend',
      [],
      [{ id: 'BA-1', type: 'contract', statement: 'A contract', affectsEvents: ['OrderPlaced'] }]
    );
    const artB = makeArtifact(
      'backend',
      [],
      [{ id: 'BA-2', type: 'ordering', statement: 'An ordering rule', affectsEvents: ['OrderPlaced'] }]
    );
    const overlaps = compareArtifacts([artA, artB]);
    const conflicts = overlaps.filter((o) => o.kind === 'assumption-conflict');
    expect(conflicts).toHaveLength(0);
  });
});
