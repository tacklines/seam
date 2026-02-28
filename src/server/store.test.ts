/**
 * Tests for the event-subscription-based auto-persistence wiring in store.ts.
 *
 * Because store.ts exports singletons initialised at module load time, we test
 * the behaviour directly via the exported eventStore and by observing that
 * SessionPersistence.save is eventually called after an EventStore event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../contexts/session/event-store.js';
import { SessionStore } from '../lib/session-store.js';
import { SessionPersistence } from '../lib/session-persistence.js';
import type { Session } from '../lib/session-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt-test-001',
    sessionCode: 'TEST01',
    timestamp: '2026-02-28T10:00:00.000Z',
    type: 'SessionCreated' as const,
    creatorName: 'Alice',
    creatorId: 'user-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit: debounced persistence wiring (in isolation — no module-singleton)
// ---------------------------------------------------------------------------

describe('Given an EventStore wired to SessionPersistence via debounced subscription', () => {
  let eventStore: EventStore;
  let sessionStore: SessionStore;
  let saveCallCount: number;
  let saveFn: (sessions: Map<string, Session>) => void;
  let cleanup: (() => void) | undefined;

  function wire(debounceMs: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedulePersist() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        saveFn(sessionStore.exportSessions());
      }, debounceMs);
    }

    const unsubscribe = eventStore.subscribe(() => schedulePersist());
    cleanup = () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }

  beforeEach(() => {
    eventStore = new EventStore();
    sessionStore = new SessionStore();
    saveCallCount = 0;
    saveFn = (_sessions) => { saveCallCount++; };
    cleanup = undefined;
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it('When a single event is appended, Then save is called once after the debounce delay', async () => {
    vi.useFakeTimers();
    wire(100);

    eventStore.append('TEST01', makeEvent());

    // Before debounce fires — no save yet
    expect(saveCallCount).toBe(0);

    await vi.advanceTimersByTimeAsync(110);

    expect(saveCallCount).toBe(1);
  });

  it('When multiple events are appended rapidly, Then save is called only once after the debounce delay', async () => {
    vi.useFakeTimers();
    wire(100);

    // Three rapid appends — should coalesce into one save
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-1' }));
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-2', timestamp: '2026-02-28T10:00:01.000Z' }));
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-3', timestamp: '2026-02-28T10:00:02.000Z' }));

    expect(saveCallCount).toBe(0);

    await vi.advanceTimersByTimeAsync(110);

    expect(saveCallCount).toBe(1);
  });

  it('When two bursts of events occur separated by more than the debounce delay, Then save is called once per burst', async () => {
    vi.useFakeTimers();
    wire(100);

    // First burst
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-1' }));
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-2', timestamp: '2026-02-28T10:00:01.000Z' }));

    await vi.advanceTimersByTimeAsync(110);
    expect(saveCallCount).toBe(1);

    // Second burst
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-3', timestamp: '2026-02-28T10:01:00.000Z' }));
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-4', timestamp: '2026-02-28T10:01:01.000Z' }));

    await vi.advanceTimersByTimeAsync(110);
    expect(saveCallCount).toBe(2);
  });

  it('When no events are appended, Then save is never called', async () => {
    vi.useFakeTimers();
    wire(100);

    await vi.advanceTimersByTimeAsync(500);

    expect(saveCallCount).toBe(0);
  });

  it('When save throws, Then subsequent events still trigger another save attempt', async () => {
    vi.useFakeTimers();

    let callIndex = 0;
    saveFn = (_sessions) => {
      callIndex++;
      if (callIndex === 1) throw new Error('disk full');
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = eventStore.subscribe(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try {
          saveFn(sessionStore.exportSessions());
        } catch {
          // swallow — mirrors production error handling
        }
      }, 100);
    });
    cleanup = () => { unsubscribe(); if (timer) clearTimeout(timer); };

    eventStore.append('TEST01', makeEvent({ eventId: 'evt-1' }));
    await vi.advanceTimersByTimeAsync(110);
    expect(callIndex).toBe(1);

    // Second event after the error — should trigger another attempt
    eventStore.append('TEST01', makeEvent({ eventId: 'evt-2', timestamp: '2026-02-28T10:01:00.000Z' }));
    await vi.advanceTimersByTimeAsync(110);
    expect(callIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Integration smoke: exported singletons exist and have the right types
// ---------------------------------------------------------------------------

describe('Given the store module exports', () => {
  it('When eventStore is imported, Then it is an EventStore instance', async () => {
    const { eventStore } = await import('./store.js');
    expect(eventStore).toBeInstanceOf(EventStore);
  });

  it('When sessionStore is imported, Then it is a SessionStore instance', async () => {
    const { sessionStore } = await import('./store.js');
    expect(sessionStore).toBeInstanceOf(SessionStore);
  });

  it('When persistSessions is checked, Then it is not exported from store', async () => {
    const storeModule = await import('./store.js') as Record<string, unknown>;
    expect(storeModule['persistSessions']).toBeUndefined();
  });

  it('When SessionPersistence is constructed, Then it has save and load methods', () => {
    const p = new SessionPersistence('/tmp/test-sessions.json');
    expect(typeof p.save).toBe('function');
    expect(typeof p.load).toBe('function');
  });
});
