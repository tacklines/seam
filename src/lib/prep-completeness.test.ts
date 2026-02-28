import { describe, it, expect } from 'vitest';
import { computePrepStatus, computeSessionStatus } from './prep-completeness.js';
import type { CandidateEventsFile, DomainEvent, BoundaryAssumption, LoadedFile } from '../schema/types.js';

// Helper to build a minimal valid CandidateEventsFile
function makeFile(
  overrides: {
    role?: string;
    scope?: string;
    goal?: string;
    events?: Partial<DomainEvent>[];
    assumptions?: Partial<BoundaryAssumption>[];
  } = {}
): CandidateEventsFile {
  const {
    role = 'test-role',
    scope = 'test scope',
    goal = 'test goal',
    events = [],
    assumptions = [],
  } = overrides;

  return {
    metadata: {
      role,
      scope,
      goal,
      generated_at: '2026-02-28T10:00:00Z',
      event_count: events.length,
      assumption_count: assumptions.length,
    },
    domain_events: events.map((e) => ({
      name: e.name ?? 'DefaultEvent',
      aggregate: e.aggregate ?? 'DefaultAgg',
      trigger: e.trigger ?? 'user action',
      payload: e.payload ?? [],
      integration: e.integration ?? { direction: 'internal' as const },
      confidence: e.confidence ?? ('CONFIRMED' as const),
      ...e,
    })),
    boundary_assumptions: assumptions.map((a) => ({
      id: a.id ?? 'BA-1',
      type: a.type ?? ('contract' as const),
      statement: a.statement ?? 'test assumption',
      affects_events: a.affects_events ?? [],
      confidence: a.confidence ?? ('LIKELY' as const),
      verify_with: a.verify_with ?? 'team',
      ...a,
    })),
  };
}

function makeLoadedFile(
  role: string,
  fileOverrides: Parameters<typeof makeFile>[0] = {}
): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: makeFile({ role, ...fileOverrides }),
  };
}

describe('computePrepStatus — happy path (well-formed file)', () => {
  it('should score 80 or higher for a well-formed file', () => {
    const file = makeFile({
      role: 'backend',
      scope: 'order management',
      goal: 'capture all order lifecycle events',
      events: [
        { name: 'OrderPlaced', aggregate: 'Order', integration: { direction: 'inbound' }, confidence: 'CONFIRMED' },
        { name: 'OrderShipped', aggregate: 'Order', integration: { direction: 'outbound' }, confidence: 'CONFIRMED' },
        { name: 'OrderCancelled', aggregate: 'Order', integration: { direction: 'internal' }, confidence: 'LIKELY' },
        { name: 'PaymentReceived', aggregate: 'Payment', integration: { direction: 'inbound' }, confidence: 'CONFIRMED' },
        { name: 'InventoryReserved', aggregate: 'Inventory', integration: { direction: 'internal' }, confidence: 'LIKELY' },
      ],
      assumptions: [
        { id: 'BA-1', type: 'contract', statement: 'Order ID is UUID', affects_events: ['OrderPlaced'], confidence: 'CONFIRMED' },
        { id: 'BA-2', type: 'ownership', statement: 'Payment team owns PaymentReceived', affects_events: ['PaymentReceived'], confidence: 'CONFIRMED' },
        { id: 'BA-3', type: 'ordering', statement: 'PaymentReceived before OrderShipped', affects_events: ['OrderShipped', 'PaymentReceived'], confidence: 'LIKELY' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.completenessScore).toBeGreaterThanOrEqual(80);
    expect(status.eventCount).toBe(5);
    expect(status.assumptionCount).toBe(3);
  });

  it('should return correct confidence breakdown', () => {
    const file = makeFile({
      events: [
        { confidence: 'CONFIRMED' },
        { confidence: 'CONFIRMED' },
        { confidence: 'LIKELY' },
        { confidence: 'POSSIBLE' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.confidenceBreakdown).toEqual({ CONFIRMED: 2, LIKELY: 1, POSSIBLE: 1 });
  });

  it('should return correct direction breakdown', () => {
    const file = makeFile({
      events: [
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'outbound' } },
        { integration: { direction: 'internal' } },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.directionBreakdown).toEqual({ inbound: 2, outbound: 1, internal: 1 });
  });

  it('should collect unique aggregates', () => {
    const file = makeFile({
      events: [
        { aggregate: 'Order' },
        { aggregate: 'Order' },
        { aggregate: 'Payment' },
        { aggregate: 'Inventory' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.aggregateCoverage).toHaveLength(3);
    expect(status.aggregateCoverage).toContain('Order');
    expect(status.aggregateCoverage).toContain('Payment');
    expect(status.aggregateCoverage).toContain('Inventory');
  });

  it('should list unresolved assumptions (non-CONFIRMED)', () => {
    const file = makeFile({
      assumptions: [
        { id: 'BA-1', confidence: 'CONFIRMED' },
        { id: 'BA-2', confidence: 'LIKELY' },
        { id: 'BA-3', confidence: 'POSSIBLE' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.unresolvedAssumptions).toHaveLength(2);
    expect(status.unresolvedAssumptions.map((a) => a.id)).toContain('BA-2');
    expect(status.unresolvedAssumptions.map((a) => a.id)).toContain('BA-3');
  });
});

describe('computePrepStatus — empty file', () => {
  it('should score 10 for a file with no events and no assumptions but valid metadata', () => {
    // Scoring: +0 events, +0 assumptions, +0 directions, +0 aggregates,
    // +0 confidence (no events), +10 metadata
    const file = makeFile({ role: 'frontend', scope: 'checkout', goal: 'define checkout events' });

    const status = computePrepStatus(file);

    expect(status.completenessScore).toBe(10);
    expect(status.eventCount).toBe(0);
    expect(status.assumptionCount).toBe(0);
  });

  it('should detect all gaps for an empty file', () => {
    const file = makeFile();

    const status = computePrepStatus(file);

    expect(status.gaps).toContain('No domain events defined');
    expect(status.gaps).toContain('No boundary assumptions defined');
    expect(status.gaps).toContain('Missing inbound events');
    expect(status.gaps).toContain('Missing outbound events');
    expect(status.gaps).toContain('Missing internal events');
  });
});

describe('computePrepStatus — direction scoring', () => {
  it('should award +20 when all 3 directions are represented', () => {
    // Baseline: 1 event (+15) + metadata (+10) = 25; with all 3 dirs = 25 + 20 = 45
    const file = makeFile({
      events: [
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'outbound' } },
        { integration: { direction: 'internal' } },
      ],
    });

    const status = computePrepStatus(file);

    // All 3 directions present → +20
    expect(status.directionBreakdown.inbound).toBe(1);
    expect(status.directionBreakdown.outbound).toBe(1);
    expect(status.directionBreakdown.internal).toBe(1);
    // Score: +15 (1-4 events) + 20 (all directions) + 10 (metadata) + 10 (>=50% CONFIRMED) = 55
    expect(status.completenessScore).toBe(55);
  });

  it('should not award direction bonus when only 2 directions are present', () => {
    const fileWith2Dirs = makeFile({
      events: [
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'outbound' } },
      ],
    });
    const fileWith3Dirs = makeFile({
      events: [
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'outbound' } },
        { integration: { direction: 'internal' } },
      ],
    });

    const status2 = computePrepStatus(fileWith2Dirs);
    const status3 = computePrepStatus(fileWith3Dirs);

    expect(status3.completenessScore - status2.completenessScore).toBe(20);
  });
});

describe('computePrepStatus — gap detection for missing directions', () => {
  it('should flag missing inbound events', () => {
    const file = makeFile({
      events: [
        { integration: { direction: 'outbound' } },
        { integration: { direction: 'internal' } },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.gaps).toContain('Missing inbound events');
    expect(status.gaps).not.toContain('Missing outbound events');
    expect(status.gaps).not.toContain('Missing internal events');
  });

  it('should flag missing outbound events', () => {
    const file = makeFile({
      events: [
        { integration: { direction: 'inbound' } },
        { integration: { direction: 'internal' } },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.gaps).toContain('Missing outbound events');
    expect(status.gaps).not.toContain('Missing inbound events');
  });

  it('should flag single aggregate coverage', () => {
    const file = makeFile({
      events: [
        { aggregate: 'Order' },
        { aggregate: 'Order' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.gaps).toContain('Only one aggregate referenced — consider broader scope');
  });

  it('should not flag single aggregate when coverage is 0 (no events)', () => {
    const file = makeFile();

    const status = computePrepStatus(file);

    expect(status.gaps).not.toContain('Only one aggregate referenced — consider broader scope');
  });

  it('should flag high POSSIBLE confidence proportion (>50%)', () => {
    const file = makeFile({
      events: [
        { confidence: 'POSSIBLE' },
        { confidence: 'POSSIBLE' },
        { confidence: 'POSSIBLE' },
        { confidence: 'CONFIRMED' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.gaps).toContain('High proportion of POSSIBLE confidence events (>50%)');
  });

  it('should not flag high POSSIBLE confidence when <= 50%', () => {
    const file = makeFile({
      events: [
        { confidence: 'POSSIBLE' },
        { confidence: 'CONFIRMED' },
      ],
    });

    const status = computePrepStatus(file);

    expect(status.gaps).not.toContain('High proportion of POSSIBLE confidence events (>50%)');
  });
});

describe('computeSessionStatus — two files', () => {
  it('should compute correct totals across 2 files', () => {
    const fileA = makeLoadedFile('frontend', {
      events: [
        { name: 'CheckoutStarted', aggregate: 'Checkout', integration: { direction: 'inbound' }, confidence: 'CONFIRMED' },
        { name: 'PaymentInitiated', aggregate: 'Payment', integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      ],
      assumptions: [
        { id: 'BA-1', confidence: 'LIKELY' },
      ],
    });

    const fileB = makeLoadedFile('backend', {
      events: [
        { name: 'OrderCreated', aggregate: 'Order', integration: { direction: 'internal' }, confidence: 'CONFIRMED' },
        { name: 'PaymentProcessed', aggregate: 'Payment', integration: { direction: 'inbound' }, confidence: 'CONFIRMED' },
        { name: 'OrderShipped', aggregate: 'Order', integration: { direction: 'outbound' }, confidence: 'CONFIRMED' },
      ],
      assumptions: [
        { id: 'BA-2', confidence: 'CONFIRMED' },
        { id: 'BA-3', confidence: 'CONFIRMED' },
      ],
    });

    const session = computeSessionStatus([fileA, fileB]);

    expect(session.fileCount).toBe(2);
    expect(session.participantCount).toBe(2);
    expect(session.totalEvents).toBe(5);
    expect(session.totalAssumptions).toBe(3);
    expect(session.perFile).toHaveLength(2);
  });

  it('should compute union of aggregate coverage', () => {
    const fileA = makeLoadedFile('frontend', {
      events: [
        { aggregate: 'Checkout' },
        { aggregate: 'Payment' },
      ],
    });
    const fileB = makeLoadedFile('backend', {
      events: [
        { aggregate: 'Order' },
        { aggregate: 'Payment' },
      ],
    });

    const session = computeSessionStatus([fileA, fileB]);

    expect(session.aggregateCoverage).toHaveLength(3);
    expect(session.aggregateCoverage).toContain('Checkout');
    expect(session.aggregateCoverage).toContain('Payment');
    expect(session.aggregateCoverage).toContain('Order');
  });

  it('should compute overallScore as average of file scores', () => {
    const fileA = makeLoadedFile('frontend', {
      events: [{ integration: { direction: 'inbound' } }],
    });
    const fileB = makeLoadedFile('backend', {
      events: [{ integration: { direction: 'inbound' } }],
    });

    const session = computeSessionStatus([fileA, fileB]);

    const expectedScore = Math.round(
      (session.perFile[0].status.completenessScore + session.perFile[1].status.completenessScore) / 2
    );
    expect(session.overallScore).toBe(expectedScore);
  });

  it('should not flag single participant gap when 2 files present', () => {
    const fileA = makeLoadedFile('frontend');
    const fileB = makeLoadedFile('backend');

    const session = computeSessionStatus([fileA, fileB]);

    expect(session.sessionGaps).not.toContain('Only 1 participant has submitted');
  });
});

describe('computeSessionStatus — single file', () => {
  it('should flag "Only 1 participant has submitted" when fileCount < 2', () => {
    const fileA = makeLoadedFile('frontend', {
      events: [{ name: 'CheckoutStarted' }],
    });

    const session = computeSessionStatus([fileA]);

    expect(session.sessionGaps).toContain('Only 1 participant has submitted');
  });

  it('should return 0 overallScore for empty files list', () => {
    const session = computeSessionStatus([]);

    expect(session.overallScore).toBe(0);
    expect(session.fileCount).toBe(0);
    expect(session.totalEvents).toBe(0);
  });
});
