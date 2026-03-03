import { describe, it, expect } from 'vitest';
import { PrioritizationService } from './prioritization-service.js';
import type { Session } from '../../lib/session-store.js';
import type { EventPriority } from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(code: string = 'TEST01'): Session {
  return {
    code,
    createdAt: new Date().toISOString(),
    status: 'active',
    participants: new Map(),
    submissions: [],
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

function makeService(session: Session | null): PrioritizationService {
  const getSession = (code: string) =>
    session && session.code === code ? session : null;
  return new PrioritizationService(getSession);
}

// ---------------------------------------------------------------------------
// setPriority
// ---------------------------------------------------------------------------

describe('PrioritizationService.setPriority', () => {
  it('adds a new priority record for a participant+event', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'must_have',
    });

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe('OrderPlaced');
    expect(result!.participantId).toBe('p1');
    expect(result!.tier).toBe('must_have');
    expect(result!.setAt).toBeTruthy();
    expect(session.priorities).toHaveLength(1);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    const result = svc.setPriority('NOCODE', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'must_have',
    });
    expect(result).toBeNull();
  });

  it('is idempotent: replaces existing priority for same participant+event', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'must_have',
    });

    const result = svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'could_have',
    });

    expect(result!.tier).toBe('could_have');
    // Only one record should exist, not two
    expect(session.priorities).toHaveLength(1);
    expect(session.priorities[0].tier).toBe('could_have');
  });

  it('stores separate records for different participants on the same event', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'must_have',
    });
    svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p2',
      tier: 'should_have',
    });

    expect(session.priorities).toHaveLength(2);
  });

  it('emits PrioritySet domain event when eventStore is provided', () => {
    const session = makeSession();
    const emitted: unknown[] = [];
    const eventStore = {
      append: (_code: string, event: unknown) => emitted.push(event),
      getEvents: () => [],
    } as any;

    const svc = new PrioritizationService(
      (code) => (code === 'TEST01' ? session : null),
      eventStore
    );

    svc.setPriority('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      tier: 'must_have',
    });

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as any).type).toBe('PrioritySet');
    expect((emitted[0] as any).eventName).toBe('OrderPlaced');
    expect((emitted[0] as any).tier).toBe('must_have');
  });
});

// ---------------------------------------------------------------------------
// castVote
// ---------------------------------------------------------------------------

describe('PrioritizationService.castVote', () => {
  it('records an upvote for a participant+event', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.castVote('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      direction: 'up',
    });

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe('OrderPlaced');
    expect(result!.participantId).toBe('p1');
    expect(result!.direction).toBe('up');
    expect(result!.castAt).toBeTruthy();
    expect(session.votes).toHaveLength(1);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    const result = svc.castVote('NOCODE', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      direction: 'up',
    });
    expect(result).toBeNull();
  });

  it('is idempotent: replaces existing vote for same participant+event', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.castVote('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      direction: 'up',
    });

    const result = svc.castVote('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      direction: 'down',
    });

    expect(result!.direction).toBe('down');
    expect(session.votes).toHaveLength(1);
    expect(session.votes[0].direction).toBe('down');
  });

  it('stores separate votes for different participants on the same event', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', direction: 'up' });
    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p2', direction: 'down' });

    expect(session.votes).toHaveLength(2);
  });

  it('emits VoteCast domain event when eventStore is provided', () => {
    const session = makeSession();
    const emitted: unknown[] = [];
    const eventStore = {
      append: (_code: string, event: unknown) => emitted.push(event),
      getEvents: () => [],
    } as any;

    const svc = new PrioritizationService(
      (code) => (code === 'TEST01' ? session : null),
      eventStore
    );

    svc.castVote('TEST01', {
      eventName: 'OrderPlaced',
      participantId: 'p1',
      direction: 'up',
    });

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as any).type).toBe('VoteCast');
    expect((emitted[0] as any).direction).toBe('up');
  });
});

// ---------------------------------------------------------------------------
// getPriorities
// ---------------------------------------------------------------------------

describe('PrioritizationService.getPriorities', () => {
  it('returns all priorities for the session', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'A', participantId: 'p1', tier: 'must_have' });
    svc.setPriority('TEST01', { eventName: 'B', participantId: 'p1', tier: 'should_have' });

    const priorities = svc.getPriorities('TEST01');
    expect(priorities).not.toBeNull();
    expect(priorities!).toHaveLength(2);
  });

  it('returns empty array when no priorities have been set', () => {
    const session = makeSession();
    const svc = makeService(session);

    const priorities = svc.getPriorities('TEST01');
    expect(priorities).toEqual([]);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    expect(svc.getPriorities('NOCODE')).toBeNull();
  });

  it('returns a copy — mutations do not affect session state', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'A', participantId: 'p1', tier: 'must_have' });
    const priorities = svc.getPriorities('TEST01')!;
    priorities.push({} as EventPriority);

    expect(session.priorities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// computeCompositeScores
// ---------------------------------------------------------------------------

describe('PrioritizationService.computeCompositeScores', () => {
  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    expect(svc.computeCompositeScores('NOCODE')).toBeNull();
  });

  it('returns empty array when no priorities have been set', () => {
    const session = makeSession();
    const svc = makeService(session);
    expect(svc.computeCompositeScores('TEST01')).toEqual([]);
  });

  it('computes score from a single must_have priority with no votes', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', tier: 'must_have' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores).toHaveLength(1);
    // must_have weight = 3, net votes = 0, score = 3
    expect(scores[0].compositeScore).toBe(3);
    expect(scores[0].eventName).toBe('OrderPlaced');
  });

  it('averages tier weights across multiple participants', () => {
    const session = makeSession();
    const svc = makeService(session);

    // p1: must_have (3), p2: could_have (1) → avg = 2
    svc.setPriority('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', tier: 'must_have' });
    svc.setPriority('TEST01', { eventName: 'OrderPlaced', participantId: 'p2', tier: 'could_have' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores[0].compositeScore).toBe(2); // (3 + 1) / 2 + 0 votes
  });

  it('adjusts score by net vote balance', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', tier: 'should_have' });
    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', direction: 'up' });
    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p2', direction: 'up' });
    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p3', direction: 'down' });

    const scores = svc.computeCompositeScores('TEST01')!;
    // should_have = 2, net votes = 2 up - 1 down = 1, score = 3
    expect(scores[0].compositeScore).toBe(3);
  });

  it('sorts results highest score first', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'LowPriority', participantId: 'p1', tier: 'could_have' });
    svc.setPriority('TEST01', { eventName: 'HighPriority', participantId: 'p1', tier: 'must_have' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores[0].eventName).toBe('HighPriority');
    expect(scores[1].eventName).toBe('LowPriority');
  });

  it('uses event name as alphabetical tiebreaker for equal scores', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'Zebra', participantId: 'p1', tier: 'must_have' });
    svc.setPriority('TEST01', { eventName: 'Apple', participantId: 'p1', tier: 'must_have' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores[0].eventName).toBe('Apple');
    expect(scores[1].eventName).toBe('Zebra');
  });

  it('includes all priorities and votes in the CompositeScore record', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setPriority('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', tier: 'must_have' });
    svc.castVote('TEST01', { eventName: 'OrderPlaced', participantId: 'p1', direction: 'up' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores[0].priorities).toHaveLength(1);
    expect(scores[0].votes).toHaveLength(1);
  });

  it('events with votes but no priorities are excluded from composite scores', () => {
    const session = makeSession();
    const svc = makeService(session);

    // Vote on an event that has no priority set
    svc.castVote('TEST01', { eventName: 'Orphan', participantId: 'p1', direction: 'up' });

    const scores = svc.computeCompositeScores('TEST01')!;
    expect(scores).toHaveLength(0);
  });
});
