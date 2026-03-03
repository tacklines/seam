import { describe, it, expect, beforeEach } from 'vitest';
import type { ActiveSession, AppStateEvent } from './app-state.js';

// We import Store via the module but re-instantiate for test isolation.
// The store singleton is exported, but we test the Store class behaviour
// by importing the module fresh each time via a factory approach.
// Since the Store class is not exported, we test via the exported singleton
// after resetting — but the singleton is shared. We test in isolation by
// calling clearSession() / removeFile() etc. between tests.
//
// For session-specific tests we import the actual store singleton but
// reset session state before each test.
import { store } from './app-state.js';

const makeSession = (code = 'ABC123'): ActiveSession => ({
  code,
  createdAt: '2026-01-01T00:00:00Z',
  participants: [{ id: 'p1', name: 'Alice', joinedAt: '2026-01-01T00:00:00Z' }],
  submissions: [],
  priorities: [],
  votes: [],
  workItems: [],
  workItemDependencies: [],
  ownershipMap: [],
  resolutions: [],
});

describe('Store — session state', () => {
  beforeEach(() => {
    // Reset session state before each test
    store.clearSession();
  });

  describe('setSession', () => {
    it('stores session state with code and participantId', () => {
      const session = makeSession();
      store.setSession('ABC123', 'p1', session);

      const state = store.get();
      expect(state.sessionState).not.toBeNull();
      expect(state.sessionState!.code).toBe('ABC123');
      expect(state.sessionState!.participantId).toBe('p1');
      expect(state.sessionState!.session).toEqual(session);
    });

    it('emits session-connected event with code and participantId', () => {
      const events: AppStateEvent[] = [];
      const unsub = store.subscribe((e) => events.push(e));

      store.setSession('XYZ789', 'p2', makeSession('XYZ789'));
      unsub();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'session-connected', code: 'XYZ789', participantId: 'p2' });
    });

    it('replaces existing session state when called again', () => {
      store.setSession('FIRST1', 'p1', makeSession('FIRST1'));
      store.setSession('SECOND', 'p2', makeSession('SECOND'));

      const state = store.get();
      expect(state.sessionState!.code).toBe('SECOND');
      expect(state.sessionState!.participantId).toBe('p2');
    });
  });

  describe('updateSession', () => {
    it('updates the session snapshot while preserving code and participantId', () => {
      store.setSession('ABC123', 'p1', makeSession());

      const updated = makeSession();
      updated.participants = [
        { id: 'p1', name: 'Alice', joinedAt: '2026-01-01T00:00:00Z' },
        { id: 'p2', name: 'Bob', joinedAt: '2026-01-01T00:01:00Z' },
      ];
      store.updateSession(updated);

      const state = store.get();
      expect(state.sessionState!.code).toBe('ABC123');
      expect(state.sessionState!.participantId).toBe('p1');
      expect(state.sessionState!.session.participants).toHaveLength(2);
    });

    it('emits session-updated event', () => {
      store.setSession('ABC123', 'p1', makeSession());

      const events: AppStateEvent[] = [];
      const unsub = store.subscribe((e) => events.push(e));
      store.updateSession(makeSession());
      unsub();

      expect(events[0]).toEqual({ type: 'session-updated' });
    });

    it('is a no-op when no session is active', () => {
      const events: AppStateEvent[] = [];
      const unsub = store.subscribe((e) => events.push(e));
      store.updateSession(makeSession());
      unsub();

      expect(events).toHaveLength(0);
      expect(store.get().sessionState).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('removes session state from the store', () => {
      store.setSession('ABC123', 'p1', makeSession());
      store.clearSession();

      expect(store.get().sessionState).toBeNull();
    });

    it('emits session-disconnected event', () => {
      store.setSession('ABC123', 'p1', makeSession());

      const events: AppStateEvent[] = [];
      const unsub = store.subscribe((e) => events.push(e));
      store.clearSession();
      unsub();

      expect(events[0]).toEqual({ type: 'session-disconnected' });
    });

    it('is safe to call when no session is active', () => {
      expect(() => store.clearSession()).not.toThrow();
      expect(store.get().sessionState).toBeNull();
    });
  });
});
