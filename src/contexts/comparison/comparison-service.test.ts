import { describe, it, expect } from 'vitest';
import { ComparisonService } from './comparison-service.js';
import { EventStore } from '../session/event-store.js';
import type { Session, Submission } from '../../lib/session-store.js';
import type { CandidateEventsFile, DomainEvent as DomainEventSchema, BoundaryAssumption } from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(name: string, aggregate: string): DomainEventSchema {
  return {
    name,
    aggregate,
    trigger: 'user action',
    payload: [],
    integration: { direction: 'internal' as const },
    confidence: 'CONFIRMED' as const,
  };
}

function makeAssumption(id: string, affectsEvents: string[]): BoundaryAssumption {
  return {
    id,
    type: 'contract' as const,
    statement: `Assumption ${id}`,
    affects_events: affectsEvents,
    confidence: 'LIKELY' as const,
    verify_with: 'team',
  };
}

function makeCandidateFile(
  role: string,
  events: DomainEventSchema[] = [],
  assumptions: BoundaryAssumption[] = []
): CandidateEventsFile {
  return {
    metadata: {
      role,
      scope: 'test',
      goal: 'testing',
      generated_at: '2026-01-01T00:00:00Z',
      event_count: events.length,
      assumption_count: assumptions.length,
    },
    domain_events: events,
    boundary_assumptions: assumptions,
  };
}

function makeSubmission(
  participantId: string,
  fileName: string,
  data: CandidateEventsFile
): Submission {
  return {
    participantId,
    fileName,
    data,
    submittedAt: new Date().toISOString(),
  };
}

function makeSession(
  code = 'ABCDEF',
  submissions: Submission[] = [],
  participants: Map<string, { id: string; name: string; joinedAt: string }> = new Map()
): Session {
  return {
    code,
    createdAt: new Date().toISOString(),
    status: 'active',
    participants,
    submissions,
    messages: [],
    jam: null,
    contracts: null,
    integrationReport: null,
    config: DEFAULT_SESSION_CONFIG,
    priorities: [],
    votes: [],
    workItems: [],
    workItemDependencies: [],
    drafts: [],
    requirements: [],
  };
}

function makeGetSession(session: Session | null) {
  return (_code: string) => session;
}

// ---------------------------------------------------------------------------
// runComparison — happy path
// ---------------------------------------------------------------------------

describe('ComparisonService.runComparison', () => {
  describe('Given a session with multiple files that have overlapping events', () => {
    it('When runComparison is called, Then it returns a ComparisonResult with overlaps', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'payments-team', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'fulfillment-team', joinedAt: '' }],
      ]);
      const file1 = makeCandidateFile('payments-team', [
        makeEvent('OrderPlaced', 'Order'),
        makeEvent('PaymentReceived', 'Payment'),
      ]);
      const file2 = makeCandidateFile('fulfillment-team', [
        makeEvent('OrderPlaced', 'Order'),
        makeEvent('OrderShipped', 'Shipment'),
      ]);
      const submissions = [
        makeSubmission('p1', 'payments.yaml', file1),
        makeSubmission('p2', 'fulfillment.yaml', file2),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result).not.toBeNull();
      expect(result!.comparisonId).toBeTruthy();
      expect(typeof result!.ranAt).toBe('string');
      expect(result!.overlaps.length).toBeGreaterThan(0);
      // OrderPlaced appears in both roles — should be a same-name overlap
      const nameOverlap = result!.overlaps.find(
        (o) => o.kind === 'same-name' && o.label === 'OrderPlaced'
      );
      expect(nameOverlap).toBeDefined();
    });

    it('When runComparison is called, Then artifactIds contains all participant IDs', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('E1', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('E1', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result!.artifactIds).toContain('p1');
      expect(result!.artifactIds).toContain('p2');
    });
  });

  describe('Given a session with no submissions', () => {
    it('When runComparison is called, Then it returns a result with no overlaps', () => {
      const session = makeSession('ABCDEF', []);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result).not.toBeNull();
      expect(result!.overlaps).toEqual([]);
      expect(result!.gapDescriptions).toEqual([]);
    });
  });

  describe('Given a session with only one file submitted', () => {
    it('When runComparison is called, Then it returns a result with no overlaps', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'solo-role', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'solo.yaml', makeCandidateFile('solo-role', [
          makeEvent('OrderPlaced', 'Order'),
        ])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result).not.toBeNull();
      expect(result!.overlaps).toEqual([]);
      expect(result!.gapDescriptions).toEqual([]);
    });
  });

  describe('Given an unknown session code', () => {
    it('When runComparison is called, Then it returns null', () => {
      const svc = new ComparisonService(makeGetSession(null));
      const result = svc.runComparison('XXXXXX');
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// runComparison — gap detection
// ---------------------------------------------------------------------------

describe('ComparisonService.runComparison gap detection', () => {
  describe('Given two files where one event is unique to a role', () => {
    it('When runComparison is called, Then gapDescriptions includes the unique event', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [
          makeEvent('SharedEvent', 'Agg'),
          makeEvent('UniqueToRoleA', 'AggA'),
        ])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [
          makeEvent('SharedEvent', 'Agg'),
          makeEvent('UniqueToRoleB', 'AggB'),
        ])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result!.gapDescriptions.length).toBeGreaterThan(0);
      const gapA = result!.gapDescriptions.find((g) => g.includes('UniqueToRoleA'));
      const gapB = result!.gapDescriptions.find((g) => g.includes('UniqueToRoleB'));
      expect(gapA).toBeDefined();
      expect(gapB).toBeDefined();
    });
  });

  describe('Given two files where all events are shared', () => {
    it('When runComparison is called, Then gapDescriptions is empty', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('SharedEvent', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('SharedEvent', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result!.gapDescriptions).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// runComparison — domain event emission
// ---------------------------------------------------------------------------

describe('ComparisonService.runComparison domain events', () => {
  describe('Given an EventStore and files with overlapping events', () => {
    it('When runComparison is called, Then a ComparisonCompleted event is emitted', () => {
      const eventStore = new EventStore();
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('SameEvent', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('SameEvent', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session), eventStore);

      svc.runComparison('ABCDEF');

      const events = eventStore.getEvents('ABCDEF');
      const completedEvent = events.find((e) => e.type === 'ComparisonCompleted');
      expect(completedEvent).toBeDefined();
      expect((completedEvent as { overlapCount: number }).overlapCount).toBeGreaterThan(0);
    });

    it('When runComparison finds overlaps, Then a ConflictsDetected event is emitted', () => {
      const eventStore = new EventStore();
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('SameEvent', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('SameEvent', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session), eventStore);

      svc.runComparison('ABCDEF');

      const events = eventStore.getEvents('ABCDEF');
      const conflictsEvent = events.find((e) => e.type === 'ConflictsDetected');
      expect(conflictsEvent).toBeDefined();
      const conflicts = (conflictsEvent as { conflicts: { label: string; description: string }[] }).conflicts;
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].label).toBeTruthy();
      expect(conflicts[0].description).toBeTruthy();
    });

    it('When runComparison finds gaps, Then a GapsIdentified event is emitted', () => {
      const eventStore = new EventStore();
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('OnlyInA', 'AggA')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('OnlyInB', 'AggB')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session), eventStore);

      svc.runComparison('ABCDEF');

      const events = eventStore.getEvents('ABCDEF');
      const gapsEvent = events.find((e) => e.type === 'GapsIdentified');
      expect(gapsEvent).toBeDefined();
      const gaps = (gapsEvent as { gaps: { description: string }[] }).gaps;
      expect(gaps.length).toBeGreaterThan(0);
    });
  });

  describe('Given an EventStore and files with no overlaps', () => {
    it('When runComparison is called, Then ConflictsDetected is NOT emitted', () => {
      const eventStore = new EventStore();
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('UniqueA', 'AggA')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('UniqueB', 'AggB')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session), eventStore);

      svc.runComparison('ABCDEF');

      const events = eventStore.getEvents('ABCDEF');
      const conflictsEvent = events.find((e) => e.type === 'ConflictsDetected');
      expect(conflictsEvent).toBeUndefined();
    });

    it('When runComparison is called with no submissions, Then no GapsIdentified is emitted', () => {
      const eventStore = new EventStore();
      const session = makeSession('ABCDEF', []);
      const svc = new ComparisonService(makeGetSession(session), eventStore);

      svc.runComparison('ABCDEF');

      const events = eventStore.getEvents('ABCDEF');
      const gapsEvent = events.find((e) => e.type === 'GapsIdentified');
      expect(gapsEvent).toBeUndefined();
    });
  });

  describe('Given no EventStore is configured', () => {
    it('When runComparison is called, Then it works without emitting events (backward compat)', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('SameEvent', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('SameEvent', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      expect(result).not.toBeNull();
      expect(result!.overlaps.length).toBeGreaterThan(0);
    });
  });

  describe('Given an EventStore and a null session', () => {
    it('When runComparison is called, Then no events are emitted', () => {
      const eventStore = new EventStore();
      const svc = new ComparisonService(makeGetSession(null), eventStore);

      svc.runComparison('XXXXXX');

      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// queryComparison
// ---------------------------------------------------------------------------

describe('ComparisonService.queryComparison', () => {
  describe('Given no comparison has been run', () => {
    it('When queryComparison is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new ComparisonService(makeGetSession(session));

      expect(svc.queryComparison('ABCDEF')).toBeNull();
    });
  });

  describe('Given a comparison has been run', () => {
    it('When queryComparison is called, Then it returns the most recent result', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('E1', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('E1', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const runResult = svc.runComparison('ABCDEF');
      const queryResult = svc.queryComparison('ABCDEF');

      expect(queryResult).not.toBeNull();
      expect(queryResult!.comparisonId).toBe(runResult!.comparisonId);
    });

    it('When queryComparison is called after two runs, Then it returns the latest result', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('E1', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('E1', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      svc.runComparison('ABCDEF');
      const secondResult = svc.runComparison('ABCDEF');

      expect(svc.queryComparison('ABCDEF')!.comparisonId).toBe(secondResult!.comparisonId);
    });
  });
});

// ---------------------------------------------------------------------------
// getComparisonHistory
// ---------------------------------------------------------------------------

describe('ComparisonService.getComparisonHistory', () => {
  describe('Given no comparisons have been run', () => {
    it('When getComparisonHistory is called, Then it returns an empty array', () => {
      const session = makeSession();
      const svc = new ComparisonService(makeGetSession(session));

      expect(svc.getComparisonHistory('ABCDEF')).toEqual([]);
    });
  });

  describe('Given multiple comparisons have been run', () => {
    it('When getComparisonHistory is called, Then it returns all results in order', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('E1', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('E1', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const first = svc.runComparison('ABCDEF');
      const second = svc.runComparison('ABCDEF');
      const history = svc.getComparisonHistory('ABCDEF');

      expect(history).toHaveLength(2);
      expect(history[0].comparisonId).toBe(first!.comparisonId);
      expect(history[1].comparisonId).toBe(second!.comparisonId);
    });

    it('When getComparisonHistory is called, Then modifying the returned array does not affect internal state', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile('role-a', [makeEvent('E1', 'Agg')])),
        makeSubmission('p2', 'b.yaml', makeCandidateFile('role-b', [makeEvent('E1', 'Agg')])),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      svc.runComparison('ABCDEF');
      const history = svc.getComparisonHistory('ABCDEF');
      history.pop();

      expect(svc.getComparisonHistory('ABCDEF')).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Assumption-conflict detection
// ---------------------------------------------------------------------------

describe('ComparisonService assumption conflict detection', () => {
  describe('Given two files with conflicting assumptions', () => {
    it('When runComparison is called, Then overlaps include assumption-conflict kind', () => {
      const participants = new Map([
        ['p1', { id: 'p1', name: 'role-a', joinedAt: '' }],
        ['p2', { id: 'p2', name: 'role-b', joinedAt: '' }],
      ]);
      const submissions = [
        makeSubmission('p1', 'a.yaml', makeCandidateFile(
          'role-a',
          [makeEvent('OrderPlaced', 'Order')],
          [makeAssumption('BA-1', ['OrderPlaced'])]
        )),
        makeSubmission('p2', 'b.yaml', makeCandidateFile(
          'role-b',
          [makeEvent('OrderPlaced', 'Order')],
          [makeAssumption('BA-2', ['OrderPlaced'])]
        )),
      ];
      const session = makeSession('ABCDEF', submissions, participants);
      const svc = new ComparisonService(makeGetSession(session));

      const result = svc.runComparison('ABCDEF');

      const assumptionConflict = result!.overlaps.find((o) => o.kind === 'assumption-conflict');
      expect(assumptionConflict).toBeDefined();
    });
  });
});
