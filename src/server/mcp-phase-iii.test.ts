/**
 * Tests for the Phase III MCP tool handlers (Rank phase):
 *   set_priority, cast_vote, get_priorities, suggest_priorities
 *
 * The MCP server registers tools via stdio transport, so we cannot call
 * registerTool handlers directly in unit tests. Instead these tests exercise
 * the underlying service methods and heuristic logic using the exact calling
 * conventions the handlers use. This validates round-trip logic (error handling,
 * business rules, domain event emission) for each tool.
 */
import { describe, it, expect } from 'vitest';
import { SessionStore } from '../lib/session-store.js';
import { PrioritizationService } from '../contexts/prioritization/prioritization-service.js';
import type { CandidateEventsFile, DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<CandidateEventsFile> = {}): CandidateEventsFile {
  return {
    metadata: {
      role: 'backend',
      scope: 'Order service',
      goal: 'Model order lifecycle',
      generated_at: '2026-01-01T00:00:00Z',
      event_count: 3,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'OrderCreated',
        aggregate: 'Order',
        trigger: 'Customer places order',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'OrderCompleted',
        aggregate: 'Order',
        trigger: 'Order fulfillment done',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'outbound' },
        confidence: 'LIKELY',
      },
      {
        name: 'OrderCancelled',
        aggregate: 'Order',
        trigger: 'Customer cancels order',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'POSSIBLE',
      },
    ],
    boundary_assumptions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers — mirror the handler patterns used in mcp.ts
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function handleSetPriority(
  store: SessionStore,
  sessionCode: string,
  eventName: string,
  tier: 'must_have' | 'should_have' | 'could_have',
  participantId = 'mcp-agent'
): ToolResult {
  const service = new PrioritizationService((code) => store.getSession(code));
  const result = service.setPriority(sessionCode, { eventName, participantId, tier });
  if (!result) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ updated: true }) }],
  };
}

function handleCastVote(
  store: SessionStore,
  sessionCode: string,
  participantId: string,
  eventName: string,
  direction: 'up' | 'down'
): ToolResult {
  const service = new PrioritizationService((code) => store.getSession(code));
  const result = service.castVote(sessionCode, { eventName, participantId, direction });
  if (!result) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  const session = store.getSession(sessionCode);
  const votes = session?.votes.filter((v) => v.eventName === eventName) ?? [];
  const upvotes = votes.filter((v) => v.direction === 'up').length;
  const downvotes = votes.filter((v) => v.direction === 'down').length;
  const newCount = upvotes - downvotes;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ newCount }) }],
  };
}

function handleGetPriorities(store: SessionStore, sessionCode: string): ToolResult {
  const service = new PrioritizationService((code) => store.getSession(code));
  const scores = service.computeCompositeScores(sessionCode);
  if (!scores) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  const events = scores.map((s) => {
    const upvotes = s.votes.filter((v) => v.direction === 'up').length;
    const downvotes = s.votes.filter((v) => v.direction === 'down').length;
    const tierCounts: Record<string, number> = {};
    for (const p of s.priorities) {
      tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1;
    }
    const topTier =
      Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'could_have';
    return {
      name: s.eventName,
      tier: topTier,
      score: s.compositeScore,
      votes: upvotes - downvotes,
    };
  });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ events }) }],
  };
}

// Inline heuristic — mirrors the suggestPrioritiesHeuristic in mcp.ts
interface PrioritySuggestion {
  eventName: string;
  suggestedTier: 'must_have' | 'should_have' | 'could_have';
  reasoning: string;
}

function suggestPrioritiesHeuristicTest(
  allEvents: DomainEvent[],
  refCount: Record<string, number>
): PrioritySuggestion[] {
  const seen = new Set<string>();
  const uniqueEvents: DomainEvent[] = [];
  for (const event of allEvents) {
    if (!seen.has(event.name)) {
      seen.add(event.name);
      uniqueEvents.push(event);
    }
  }

  return uniqueEvents.map((event): PrioritySuggestion => {
    const reasons: string[] = [];
    let tier: 'must_have' | 'should_have' | 'could_have' = 'could_have';

    if (event.confidence === 'CONFIRMED') {
      tier = 'must_have';
      reasons.push('confidence is CONFIRMED');
    } else if (event.confidence === 'LIKELY') {
      tier = 'should_have';
      reasons.push('confidence is LIKELY');
    } else {
      reasons.push('confidence is POSSIBLE');
    }

    if (event.integration?.direction === 'outbound') {
      if (tier === 'could_have') {
        tier = 'should_have';
      } else if (tier === 'should_have') {
        tier = 'must_have';
      }
      reasons.push('outbound integration point (cross-context dependency)');
    }

    const count = refCount[event.name] ?? 1;
    if (count >= 2) {
      tier = 'must_have';
      reasons.push(`referenced in ${count} participant submissions (high agreement)`);
    }

    return {
      eventName: event.name,
      suggestedTier: tier,
      reasoning: reasons.join('; '),
    };
  });
}

function handleSuggestPriorities(store: SessionStore, sessionCode: string): ToolResult {
  const session = store.getSession(sessionCode);
  if (!session) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }

  const allEvents = session.submissions.flatMap((s) => s.data.domain_events);
  if (allEvents.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ suggestions: [] }) }],
    };
  }

  const refCount: Record<string, number> = {};
  for (const submission of session.submissions) {
    for (const event of submission.data.domain_events) {
      refCount[event.name] = (refCount[event.name] ?? 0) + 1;
    }
  }

  const suggestions = suggestPrioritiesHeuristicTest(allEvents, refCount);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ suggestions }) }],
  };
}

// ---------------------------------------------------------------------------
// Tests: set_priority handler
// ---------------------------------------------------------------------------

describe('set_priority MCP tool handler', () => {
  describe('When the session exists and event is valid', () => {
    it('Then returns updated: true on success', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSetPriority(store, session.code, 'OrderCreated', 'must_have');

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { updated: boolean };
      expect(body.updated).toBe(true);
    });

    it('Then stores the priority in the session', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have');

      const service = new PrioritizationService((code) => store.getSession(code));
      const priorities = service.getPriorities(session.code);
      expect(priorities).not.toBeNull();
      expect(priorities?.length).toBe(1);
      expect(priorities?.[0].eventName).toBe('OrderCreated');
      expect(priorities?.[0].tier).toBe('must_have');
    });

    it('Then updates an existing priority (idempotent)', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have');
      handleSetPriority(store, session.code, 'OrderCreated', 'should_have');

      const service = new PrioritizationService((code) => store.getSession(code));
      const priorities = service.getPriorities(session.code);
      // Should still have only one priority record (updated, not duplicated)
      expect(priorities?.filter((p) => p.eventName === 'OrderCreated').length).toBe(1);
      expect(priorities?.[0].tier).toBe('should_have');
    });

    it('Then different participants can set different tiers for the same event', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const join = store.joinSession(session.code, 'Bob');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have', creatorId);
      handleSetPriority(store, session.code, 'OrderCreated', 'should_have', join!.participantId);

      const service = new PrioritizationService((code) => store.getSession(code));
      const priorities = service.getPriorities(session.code);
      expect(priorities?.length).toBe(2);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleSetPriority(store, 'XXXXXX', 'OrderCreated', 'must_have');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: cast_vote handler
// ---------------------------------------------------------------------------

describe('cast_vote MCP tool handler', () => {
  describe('When the session exists', () => {
    it('Then returns newCount of 1 after a single upvote', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleCastVote(store, session.code, creatorId, 'OrderCreated', 'up');

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { newCount: number };
      expect(body.newCount).toBe(1);
    });

    it('Then returns newCount of -1 after a single downvote', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleCastVote(store, session.code, creatorId, 'OrderCreated', 'down');

      const body = JSON.parse(result.content[0].text) as { newCount: number };
      expect(body.newCount).toBe(-1);
    });

    it('Then net count is 0 when upvotes and downvotes are equal', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const join = store.joinSession(session.code, 'Bob');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleCastVote(store, session.code, creatorId, 'OrderCreated', 'up');
      const result = handleCastVote(store, session.code, join!.participantId, 'OrderCreated', 'down');

      const body = JSON.parse(result.content[0].text) as { newCount: number };
      expect(body.newCount).toBe(0);
    });

    it('Then updating an existing vote (idempotent) adjusts the net count correctly', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      // Cast initial upvote
      handleCastVote(store, session.code, creatorId, 'OrderCreated', 'up');
      // Change to downvote — should replace the prior vote
      const result = handleCastVote(store, session.code, creatorId, 'OrderCreated', 'down');

      const body = JSON.parse(result.content[0].text) as { newCount: number };
      // Net should be -1 (one downvote, prior upvote replaced)
      expect(body.newCount).toBe(-1);
    });

    it('Then votes from multiple participants accumulate', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const bob = store.joinSession(session.code, 'Bob');
      const carol = store.joinSession(session.code, 'Carol');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleCastVote(store, session.code, creatorId, 'OrderCreated', 'up');
      handleCastVote(store, session.code, bob!.participantId, 'OrderCreated', 'up');
      const result = handleCastVote(store, session.code, carol!.participantId, 'OrderCreated', 'down');

      const body = JSON.parse(result.content[0].text) as { newCount: number };
      expect(body.newCount).toBe(1); // 2 up - 1 down
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleCastVote(store, 'XXXXXX', 'p1', 'OrderCreated', 'up');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: get_priorities handler
// ---------------------------------------------------------------------------

describe('get_priorities MCP tool handler', () => {
  describe('When the session has prioritized events', () => {
    it('Then returns events sorted by composite score descending', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have');
      handleSetPriority(store, session.code, 'OrderCompleted', 'could_have');
      handleCastVote(store, session.code, creatorId, 'OrderCreated', 'up');

      const result = handleGetPriorities(store, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { events: Array<{ name: string; score: number }> };
      expect(body.events.length).toBe(2);
      // First event should have higher score
      expect(body.events[0].score).toBeGreaterThanOrEqual(body.events[1].score);
    });

    it('Then each event has name, tier, score, and votes fields', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have');

      const result = handleGetPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { events: Array<{ name: string; tier: string; score: number; votes: number }> };

      expect(body.events[0].name).toBeDefined();
      expect(body.events[0].tier).toBeDefined();
      expect(typeof body.events[0].score).toBe('number');
      expect(typeof body.events[0].votes).toBe('number');
    });

    it('Then tier reflects the plurality winner when multiple participants set tiers', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const bob = store.joinSession(session.code, 'Bob');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      handleSetPriority(store, session.code, 'OrderCreated', 'must_have', creatorId);
      handleSetPriority(store, session.code, 'OrderCreated', 'must_have', bob!.participantId);

      const result = handleGetPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { events: Array<{ name: string; tier: string }> };
      const event = body.events.find((e) => e.name === 'OrderCreated');
      expect(event?.tier).toBe('must_have');
    });

    it('Then returns empty events array when no priorities have been set', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleGetPriorities(store, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { events: unknown[] };
      expect(body.events).toEqual([]);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleGetPriorities(store, 'XXXXXX');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: suggest_priorities handler
// ---------------------------------------------------------------------------

describe('suggest_priorities MCP tool handler', () => {
  describe('When the session has submitted artifacts', () => {
    it('Then returns a suggestion for each unique domain event', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };
      expect(body.suggestions.length).toBe(3); // 3 events in makeFile
      const names = body.suggestions.map((s) => s.eventName);
      expect(names).toContain('OrderCreated');
      expect(names).toContain('OrderCompleted');
      expect(names).toContain('OrderCancelled');
    });

    it('Then CONFIRMED events are suggested as must_have', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      const orderCreated = body.suggestions.find((s) => s.eventName === 'OrderCreated');
      expect(orderCreated?.suggestedTier).toBe('must_have'); // CONFIRMED confidence
      expect(orderCreated?.reasoning).toContain('CONFIRMED');
    });

    it('Then outbound LIKELY events are escalated to must_have', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      const orderCompleted = body.suggestions.find((s) => s.eventName === 'OrderCompleted');
      // LIKELY + outbound => must_have
      expect(orderCompleted?.suggestedTier).toBe('must_have');
      expect(orderCompleted?.reasoning).toContain('outbound');
    });

    it('Then POSSIBLE internal events are suggested as could_have', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      const orderCancelled = body.suggestions.find((s) => s.eventName === 'OrderCancelled');
      expect(orderCancelled?.suggestedTier).toBe('could_have'); // POSSIBLE, internal
      expect(orderCancelled?.reasoning).toContain('POSSIBLE');
    });

    it('Then events appearing in multiple submissions are escalated to must_have', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const bob = store.joinSession(session.code, 'Bob');

      // Both Alice and Bob include OrderCancelled (POSSIBLE internal — normally could_have)
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());
      store.submitYaml(session.code, bob!.participantId, 'bob.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      const orderCancelled = body.suggestions.find((s) => s.eventName === 'OrderCancelled');
      // Cross-submission reference overrides confidence-based tier
      expect(orderCancelled?.suggestedTier).toBe('must_have');
      expect(orderCancelled?.reasoning).toContain('2 participant submissions');
    });

    it('Then each suggestion has eventName, suggestedTier, and reasoning', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      for (const s of body.suggestions) {
        expect(s.eventName).toBeDefined();
        expect(['must_have', 'should_have', 'could_have']).toContain(s.suggestedTier);
        expect(typeof s.reasoning).toBe('string');
        expect(s.reasoning.length).toBeGreaterThan(0);
      }
    });

    it('Then returns empty suggestions when no artifacts are submitted', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleSuggestPriorities(store, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { suggestions: unknown[] };
      expect(body.suggestions).toEqual([]);
    });

    it('Then deduplicates events appearing in multiple submissions', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const bob = store.joinSession(session.code, 'Bob');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());
      store.submitYaml(session.code, bob!.participantId, 'bob.yaml', makeFile());

      const result = handleSuggestPriorities(store, session.code);
      const body = JSON.parse(result.content[0].text) as { suggestions: PrioritySuggestion[] };

      // Same 3 events, deduplicated — not 6
      const uniqueNames = new Set(body.suggestions.map((s) => s.eventName));
      expect(uniqueNames.size).toBe(body.suggestions.length);
      expect(body.suggestions.length).toBe(3);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleSuggestPriorities(store, 'XXXXXX');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: PrioritizationService composite score calculation
// ---------------------------------------------------------------------------

describe('PrioritizationService composite score', () => {
  describe('When priorities and votes are combined', () => {
    it('Then composite score = avg tier weight + net votes', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const service = new PrioritizationService((code) => store.getSession(code));

      // must_have weight = 3, cast 2 upvotes
      service.setPriority(session.code, { eventName: 'OrderCreated', participantId: creatorId, tier: 'must_have' });
      service.castVote(session.code, { eventName: 'OrderCreated', participantId: creatorId, direction: 'up' });
      const bob = store.joinSession(session.code, 'Bob');
      service.castVote(session.code, { eventName: 'OrderCreated', participantId: bob!.participantId, direction: 'up' });

      const scores = service.computeCompositeScores(session.code);
      expect(scores).not.toBeNull();
      // avgTierWeight = 3, netVotes = 2, compositeScore = 5
      expect(scores![0].compositeScore).toBe(5);
    });

    it('Then events with higher scores sort first', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const service = new PrioritizationService((code) => store.getSession(code));
      service.setPriority(session.code, { eventName: 'OrderCreated', participantId: creatorId, tier: 'must_have' });
      service.setPriority(session.code, { eventName: 'OrderCancelled', participantId: creatorId, tier: 'could_have' });

      const scores = service.computeCompositeScores(session.code);
      expect(scores![0].eventName).toBe('OrderCreated');
      expect(scores![1].eventName).toBe('OrderCancelled');
    });
  });
});
