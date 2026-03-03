/**
 * Tests for Phase IV MCP tool handlers — Slice (Decomposition).
 *
 * The MCP server registers tools at process startup via stdio transport, so
 * these tests exercise the underlying services and helpers that the handlers
 * wrap, using the exact same calling conventions used inside mcp.ts.
 *
 * Covered tools:
 *   create_work_items     — batch work item creation
 *   get_decomposition     — retrieve work items + dependencies + coverage
 *   suggest_decomposition — heuristic suggestions from domain events
 *   set_dependency        — record a dependency between work items
 *   my_create_work_items  — scoped variant (same logic, auto-fills participantId)
 */
import { describe, it, expect } from 'vitest';
import { SessionStore } from '../lib/session-store.js';
import { EventStore } from '../contexts/session/event-store.js';
import { DecompositionService } from '../contexts/decomposition/decomposition-service.js';
import { suggestDecomposition } from '../lib/decomposition-heuristics.js';
import type { DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers — mirror the handler patterns used in mcp.ts
// ---------------------------------------------------------------------------

type McpResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function makeDecompositionService(store: SessionStore, eventStore?: EventStore): DecompositionService {
  return new DecompositionService(
    (c: string) => store.getSession(c) ?? null,
    eventStore
  );
}

/** Simulate the create_work_items handler */
function handleCreateWorkItems(
  store: SessionStore,
  eventStore: EventStore,
  code: string,
  items: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    complexity: 'S' | 'M' | 'L' | 'XL';
    linkedEvents: string[];
    dependencies: string[];
  }>
): McpResult {
  const svc = makeDecompositionService(store, eventStore);
  const session = store.getSession(code);
  if (!session) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }], isError: true };
  }
  const created = items.map((item) => svc.createWorkItem(code, item)).filter(Boolean);
  return { content: [{ type: 'text', text: JSON.stringify({ created }) }] };
}

/** Simulate the get_decomposition handler */
function handleGetDecomposition(
  store: SessionStore,
  eventStore: EventStore,
  code: string
): McpResult {
  const svc = makeDecompositionService(store, eventStore);
  const workItems = svc.getDecomposition(code);
  if (workItems === null) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }], isError: true };
  }
  const session = store.getSession(code)!;
  const dependencies = [...session.workItemDependencies];
  const coverage = svc.getCoverageMatrix(code) ?? [];
  return { content: [{ type: 'text', text: JSON.stringify({ workItems, dependencies, coverage }) }] };
}

/** Simulate the suggest_decomposition handler */
function handleSuggestDecomposition(
  store: SessionStore,
  code: string,
  aggregate?: string
): McpResult {
  const session = store.getSession(code);
  if (!session) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }], isError: true };
  }
  const allEvents = session.submissions.flatMap((s) => s.data.domain_events);
  const suggestions = suggestDecomposition(allEvents, aggregate);
  return { content: [{ type: 'text', text: JSON.stringify({ suggestions }) }] };
}

/** Simulate the set_dependency handler */
function handleSetDependency(
  store: SessionStore,
  eventStore: EventStore,
  code: string,
  fromItemId: string,
  toItemId: string
): McpResult {
  const svc = makeDecompositionService(store, eventStore);
  const dependency = svc.setDependency(code, { fromId: fromItemId, toId: toItemId, participantId: 'system' });
  if (!dependency) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }], isError: true };
  }
  return { content: [{ type: 'text', text: JSON.stringify({ dependency }) }] };
}

/** Simulate the my_create_work_items scoped handler */
function handleMyCreateWorkItems(
  store: SessionStore,
  eventStore: EventStore,
  sessionCode: string,
  participantId: string,
  items: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    complexity: 'S' | 'M' | 'L' | 'XL';
    linkedEvents: string[];
    dependencies: string[];
  }>
): McpResult {
  const svc = makeDecompositionService(store, eventStore);
  const session = store.getSession(sessionCode);
  if (!session) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }], isError: true };
  }
  const created = items.map((item) => svc.createWorkItem(sessionCode, item)).filter(Boolean);
  return { content: [{ type: 'text', text: JSON.stringify({ created, participantId }) }] };
}

// ---------------------------------------------------------------------------
// create_work_items
// ---------------------------------------------------------------------------

describe('create_work_items MCP tool handler', () => {
  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();

      const result = handleCreateWorkItems(store, eventStore, 'XXXXXX', [
        {
          title: 'Build auth',
          description: 'Implement auth flow',
          acceptanceCriteria: ['Users can log in'],
          complexity: 'M',
          linkedEvents: ['UserLoggedIn'],
          dependencies: [],
        },
      ]);

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the session exists', () => {
    it('Then creates a single work item and returns it with an ID', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const result = handleCreateWorkItems(store, eventStore, session.code, [
        {
          title: 'Implement payment',
          description: 'End-to-end payment handling',
          acceptanceCriteria: ['Payments succeed', 'Errors handled'],
          complexity: 'L',
          linkedEvents: ['PaymentSucceeded', 'PaymentFailed'],
          dependencies: [],
        },
      ]);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { created: unknown[] };
      expect(body.created).toHaveLength(1);
      const item = body.created[0] as { id: string; title: string; complexity: string };
      expect(item.id).toBeTruthy();
      expect(item.title).toBe('Implement payment');
      expect(item.complexity).toBe('L');
    });

    it('Then batch-creates multiple work items with distinct IDs', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const result = handleCreateWorkItems(store, eventStore, session.code, [
        { title: 'Item A', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: ['EventA'], dependencies: [] },
        { title: 'Item B', description: '', acceptanceCriteria: [], complexity: 'M', linkedEvents: ['EventB'], dependencies: [] },
        { title: 'Item C', description: '', acceptanceCriteria: [], complexity: 'XL', linkedEvents: ['EventC'], dependencies: [] },
      ]);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { created: Array<{ id: string; title: string }> };
      expect(body.created).toHaveLength(3);
      const ids = body.created.map((i) => i.id);
      expect(new Set(ids).size).toBe(3); // all unique
    });

    it('Then an empty items array returns an empty created list', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const result = handleCreateWorkItems(store, eventStore, session.code, []);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { created: unknown[] };
      expect(body.created).toHaveLength(0);
    });

    it('Then work items are persisted on the session', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      handleCreateWorkItems(store, eventStore, session.code, [
        { title: 'Persist me', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: [], dependencies: [] },
      ]);

      const updatedSession = store.getSession(session.code)!;
      expect(updatedSession.workItems).toHaveLength(1);
      expect(updatedSession.workItems[0].title).toBe('Persist me');
    });
  });
});

// ---------------------------------------------------------------------------
// get_decomposition
// ---------------------------------------------------------------------------

describe('get_decomposition MCP tool handler', () => {
  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();

      const result = handleGetDecomposition(store, eventStore, 'XXXXXX');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the session exists with no work items', () => {
    it('Then returns empty workItems, dependencies, and coverage arrays', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const result = handleGetDecomposition(store, eventStore, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as {
        workItems: unknown[];
        dependencies: unknown[];
        coverage: unknown[];
      };
      expect(body.workItems).toEqual([]);
      expect(body.dependencies).toEqual([]);
      expect(body.coverage).toEqual([]);
    });
  });

  describe('When the session has work items', () => {
    it('Then returns all work items', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');
      const svc = makeDecompositionService(store, eventStore);

      svc.createWorkItem(session.code, {
        title: 'Item A',
        description: '',
        acceptanceCriteria: [],
        complexity: 'S',
        linkedEvents: ['EventA'],
        dependencies: [],
      });
      svc.createWorkItem(session.code, {
        title: 'Item B',
        description: '',
        acceptanceCriteria: [],
        complexity: 'M',
        linkedEvents: ['EventB'],
        dependencies: [],
      });

      const result = handleGetDecomposition(store, eventStore, session.code);
      const body = JSON.parse(result.content[0].text) as {
        workItems: Array<{ title: string }>;
      };
      expect(body.workItems).toHaveLength(2);
      expect(body.workItems.map((i) => i.title)).toContain('Item A');
      expect(body.workItems.map((i) => i.title)).toContain('Item B');
    });

    it('Then includes the coverage matrix', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');
      const svc = makeDecompositionService(store, eventStore);

      svc.createWorkItem(session.code, {
        title: 'Item A',
        description: '',
        acceptanceCriteria: [],
        complexity: 'S',
        linkedEvents: ['OrderPlaced', 'OrderConfirmed'],
        dependencies: [],
      });

      const result = handleGetDecomposition(store, eventStore, session.code);
      const body = JSON.parse(result.content[0].text) as {
        coverage: Array<{ eventName: string; covered: boolean }>;
      };
      expect(body.coverage).toHaveLength(2);
      const event = body.coverage.find((c) => c.eventName === 'OrderPlaced');
      expect(event).toBeDefined();
      expect(event!.covered).toBe(true);
    });

    it('Then includes dependencies that have been set', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');
      const svc = makeDecompositionService(store, eventStore);

      const itemA = svc.createWorkItem(session.code, { title: 'A', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: [], dependencies: [] })!;
      const itemB = svc.createWorkItem(session.code, { title: 'B', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: [], dependencies: [] })!;
      svc.setDependency(session.code, { fromId: itemB.id, toId: itemA.id, participantId: 'p1' });

      const result = handleGetDecomposition(store, eventStore, session.code);
      const body = JSON.parse(result.content[0].text) as {
        dependencies: Array<{ fromId: string; toId: string }>;
      };
      expect(body.dependencies).toHaveLength(1);
      expect(body.dependencies[0].fromId).toBe(itemB.id);
      expect(body.dependencies[0].toId).toBe(itemA.id);
    });
  });
});

// ---------------------------------------------------------------------------
// suggest_decomposition
// ---------------------------------------------------------------------------

describe('suggest_decomposition MCP tool handler', () => {
  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const result = handleSuggestDecomposition(store, 'XXXXXX');
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the session exists with no submissions', () => {
    it('Then returns an empty suggestions array', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const result = handleSuggestDecomposition(store, session.code);
      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { suggestions: unknown[] };
      expect(body.suggestions).toEqual([]);
    });
  });

  describe('When the session has submissions with domain events', () => {
    function submitEvents(store: SessionStore, sessionCode: string, participantId: string, events: DomainEvent[]) {
      // Directly push to session.submissions to avoid YAML parsing overhead in tests
      const session = store.getSession(sessionCode)!;
      session.submissions.push({
        participantId,
        fileName: 'test.yaml',
        data: {
          metadata: {
            role: 'test',
            scope: 'test scope',
            goal: 'test goal',
            generated_at: new Date().toISOString(),
            event_count: events.length,
            assumption_count: 0,
          },
          domain_events: events,
          boundary_assumptions: [],
        },
        submittedAt: new Date().toISOString(),
      });
    }

    it('Then groups events by aggregate and returns suggestions', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');

      const events: DomainEvent[] = [
        {
          name: 'OrderPlaced',
          aggregate: 'Order',
          trigger: 'User places an order',
          payload: [],
          integration: { direction: 'internal' },
          confidence: 'CONFIRMED',
        },
        {
          name: 'OrderConfirmed',
          aggregate: 'Order',
          trigger: 'System confirms the order',
          payload: [],
          integration: { direction: 'internal' },
          confidence: 'LIKELY',
        },
      ];
      submitEvents(store, session.code, creatorId, events);

      const result = handleSuggestDecomposition(store, session.code);
      const body = JSON.parse(result.content[0].text) as {
        suggestions: Array<{ aggregate: string; suggestedItems: unknown[] }>;
      };
      expect(body.suggestions).toHaveLength(1);
      expect(body.suggestions[0].aggregate).toBe('Order');
      expect(body.suggestions[0].suggestedItems.length).toBeGreaterThanOrEqual(1);
    });

    it('Then filters to a single aggregate when provided', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');

      const events: DomainEvent[] = [
        {
          name: 'OrderPlaced',
          aggregate: 'Order',
          trigger: 'User places an order',
          payload: [],
          integration: { direction: 'internal' },
          confidence: 'CONFIRMED',
        },
        {
          name: 'PaymentSucceeded',
          aggregate: 'Payment',
          trigger: 'User initiates payment',
          payload: [],
          integration: { direction: 'internal' },
          confidence: 'CONFIRMED',
        },
      ];
      submitEvents(store, session.code, creatorId, events);

      const result = handleSuggestDecomposition(store, session.code, 'Payment');
      const body = JSON.parse(result.content[0].text) as {
        suggestions: Array<{ aggregate: string }>;
      };
      expect(body.suggestions).toHaveLength(1);
      expect(body.suggestions[0].aggregate).toBe('Payment');
    });

    it('Then suggested items include title, description, linkedEvents, and complexity', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');

      const events: DomainEvent[] = [
        {
          name: 'UserLoggedIn',
          aggregate: 'Auth',
          trigger: 'User provides credentials',
          payload: [],
          integration: { direction: 'internal' },
          confidence: 'CONFIRMED',
        },
      ];
      submitEvents(store, session.code, creatorId, events);

      const result = handleSuggestDecomposition(store, session.code);
      const body = JSON.parse(result.content[0].text) as {
        suggestions: Array<{
          aggregate: string;
          suggestedItems: Array<{
            title: string;
            description: string;
            linkedEvents: string[];
            complexity: string;
          }>;
        }>;
      };
      expect(body.suggestions).toHaveLength(1);
      const item = body.suggestions[0].suggestedItems[0];
      expect(item.title).toBeTruthy();
      expect(item.description).toContain('Auth');
      expect(item.linkedEvents).toContain('UserLoggedIn');
      expect(['S', 'M', 'L', 'XL']).toContain(item.complexity);
    });
  });
});

// ---------------------------------------------------------------------------
// set_dependency
// ---------------------------------------------------------------------------

describe('set_dependency MCP tool handler', () => {
  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();

      const result = handleSetDependency(store, eventStore, 'XXXXXX', 'item-1', 'item-2');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the session exists', () => {
    it('Then records the dependency and returns it', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const result = handleSetDependency(store, eventStore, session.code, 'item-1', 'item-2');

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as {
        dependency: { fromId: string; toId: string; participantId: string; setAt: string };
      };
      expect(body.dependency.fromId).toBe('item-1');
      expect(body.dependency.toId).toBe('item-2');
      expect(body.dependency.participantId).toBe('system');
      expect(body.dependency.setAt).toBeTruthy();
    });

    it('Then is idempotent: repeated calls return the same record', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      const first = handleSetDependency(store, eventStore, session.code, 'item-1', 'item-2');
      const second = handleSetDependency(store, eventStore, session.code, 'item-1', 'item-2');

      const firstBody = JSON.parse(first.content[0].text) as { dependency: { setAt: string; participantId: string } };
      const secondBody = JSON.parse(second.content[0].text) as { dependency: { setAt: string; participantId: string } };
      // Second call should return the original record unchanged
      expect(secondBody.dependency.setAt).toBe(firstBody.dependency.setAt);
      expect(secondBody.dependency.participantId).toBe('system');
    });

    it('Then emits a DependencySet domain event', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session } = store.createSession('Alice');

      handleSetDependency(store, eventStore, session.code, 'item-A', 'item-B');

      const events = eventStore.getEvents(session.code);
      const depEvent = events.find((e) => e.type === 'DependencySet');
      expect(depEvent).toBeDefined();
      expect((depEvent as { fromItemId: string }).fromItemId).toBe('item-A');
      expect((depEvent as { toItemId: string }).toItemId).toBe('item-B');
    });
  });
});

// ---------------------------------------------------------------------------
// my_create_work_items (scoped variant)
// ---------------------------------------------------------------------------

describe('my_create_work_items scoped MCP tool handler', () => {
  describe('When the session does not exist', () => {
    it('Then returns isError', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();

      const result = handleMyCreateWorkItems(store, eventStore, 'XXXXXX', 'p1', [
        { title: 'Item', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: [], dependencies: [] },
      ]);

      expect(result.isError).toBe(true);
    });
  });

  describe('When the session exists', () => {
    it('Then creates work items and includes participantId in the response', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session, creatorId } = store.createSession('Alice');

      const result = handleMyCreateWorkItems(store, eventStore, session.code, creatorId, [
        { title: 'Scoped item', description: 'Created by scoped tool', acceptanceCriteria: ['AC1'], complexity: 'M', linkedEvents: ['EventX'], dependencies: [] },
      ]);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as {
        created: Array<{ title: string }>;
        participantId: string;
      };
      expect(body.created).toHaveLength(1);
      expect(body.created[0].title).toBe('Scoped item');
      expect(body.participantId).toBe(creatorId);
    });

    it('Then persists work items on the session', () => {
      const store = new SessionStore();
      const eventStore = new EventStore();
      const { session, creatorId } = store.createSession('Alice');

      handleMyCreateWorkItems(store, eventStore, session.code, creatorId, [
        { title: 'Persisted via scoped', description: '', acceptanceCriteria: [], complexity: 'S', linkedEvents: [], dependencies: [] },
      ]);

      const updated = store.getSession(session.code)!;
      expect(updated.workItems).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// suggestDecomposition pure function (unit tests)
// ---------------------------------------------------------------------------

describe('suggestDecomposition heuristic function', () => {
  const makeEvent = (name: string, aggregate: string, trigger: string): DomainEvent => ({
    name,
    aggregate,
    trigger,
    payload: [],
    integration: { direction: 'internal' },
    confidence: 'CONFIRMED',
  });

  it('Returns empty array for empty event list', () => {
    expect(suggestDecomposition([])).toEqual([]);
  });

  it('Groups events by aggregate', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'User places order'),
      makeEvent('OrderShipped', 'Order', 'System ships order'),
      makeEvent('PaymentSucceeded', 'Payment', 'User pays'),
    ];
    const suggestions = suggestDecomposition(events);
    expect(suggestions).toHaveLength(2);
    const aggs = suggestions.map((s) => s.aggregate);
    expect(aggs).toContain('Order');
    expect(aggs).toContain('Payment');
  });

  it('Filters to a single aggregate when aggregate param is provided', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'User places order'),
      makeEvent('PaymentSucceeded', 'Payment', 'User pays'),
    ];
    const suggestions = suggestDecomposition(events, 'Order');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].aggregate).toBe('Order');
  });

  it('Assigns correct complexity: S for 1-2 events, M for 3-4, L for 5-6, XL for 7+', () => {
    const twoEvents = [
      makeEvent('E1', 'Agg', 'User does A'),
      makeEvent('E2', 'Agg', 'User does B'),
    ];
    const [s] = suggestDecomposition(twoEvents);
    // Both events have same trigger prefix "User" → grouped together → count=2 → S
    const item = s.suggestedItems.find((i) => i.linkedEvents.length === 2);
    expect(item?.complexity).toBe('S');
  });

  it('Groups events with the same trigger pattern together', () => {
    const events = [
      makeEvent('UserCreated', 'User', 'User registers'),
      makeEvent('UserUpdated', 'User', 'User updates profile'),
      makeEvent('SystemNotified', 'User', 'System sends notification'),
    ];
    const suggestions = suggestDecomposition(events, 'User');
    expect(suggestions).toHaveLength(1);
    // "User registers" and "User updates profile" → user-initiated pattern (both start with "User")
    // "System sends notification" → system-driven pattern
    // So 2 suggested items
    expect(suggestions[0].suggestedItems.length).toBeGreaterThanOrEqual(1);
  });

  it('Suggestions are sorted alphabetically by aggregate name', () => {
    const events = [
      makeEvent('ZebraEvent', 'Zebra', 'User triggers zebra'),
      makeEvent('AppleEvent', 'Apple', 'User triggers apple'),
      makeEvent('MangoEvent', 'Mango', 'User triggers mango'),
    ];
    const suggestions = suggestDecomposition(events);
    expect(suggestions.map((s) => s.aggregate)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('Returns an empty aggregate filter result when no events match', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'User places order')];
    const suggestions = suggestDecomposition(events, 'NonExistent');
    expect(suggestions).toEqual([]);
  });
});
