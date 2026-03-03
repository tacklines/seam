import { describe, it, expect, beforeEach } from 'vitest';
import type { ActiveSession, AppStateEvent } from './app-state.js';
import type { Requirement } from '../schema/types.js';

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
  requirements: [],
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

const makeRequirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  id: 'req-1',
  statement: 'Users can register',
  authorId: 'local',
  status: 'draft',
  priority: 0,
  tags: [],
  derivedEvents: [],
  derivedAssumptions: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Store — requirements (local-first)', () => {
  beforeEach(() => {
    store.clearSession();
    // Clear all requirements
    for (const r of store.get().requirements) {
      store.removeRequirement(r.id);
    }
  });

  describe('addRequirement', () => {
    it('works without a session', () => {
      expect(store.get().sessionState).toBeNull();
      store.addRequirement(makeRequirement());
      expect(store.get().requirements).toHaveLength(1);
      expect(store.get().requirements[0].statement).toBe('Users can register');
    });

    it('emits requirements-changed event', () => {
      const events: AppStateEvent[] = [];
      const unsub = store.subscribe(e => events.push(e));
      store.addRequirement(makeRequirement());
      unsub();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('requirements-changed');
    });
  });

  describe('removeRequirement', () => {
    it('works without a session', () => {
      store.addRequirement(makeRequirement({ id: 'r1' }));
      store.removeRequirement('r1');
      expect(store.get().requirements).toHaveLength(0);
    });

    it('is a no-op for unknown IDs', () => {
      store.addRequirement(makeRequirement({ id: 'keep' }));
      store.removeRequirement('unknown');
      expect(store.get().requirements).toHaveLength(1);
    });
  });

  describe('updateRequirementId', () => {
    it('swaps the ID while preserving other fields', () => {
      store.addRequirement(makeRequirement({ id: 'local-uuid', statement: 'Keep this' }));
      store.updateRequirementId('local-uuid', 'server-id');
      expect(store.get().requirements).toHaveLength(1);
      expect(store.get().requirements[0].id).toBe('server-id');
      expect(store.get().requirements[0].statement).toBe('Keep this');
    });

    it('emits requirements-changed event', () => {
      store.addRequirement(makeRequirement({ id: 'old' }));
      const events: AppStateEvent[] = [];
      const unsub = store.subscribe(e => events.push(e));
      store.updateRequirementId('old', 'new');
      unsub();
      expect(events[0].type).toBe('requirements-changed');
    });
  });

  describe('setSession — requirement merge', () => {
    it('merges server requirements that are not already local', () => {
      store.addRequirement(makeRequirement({ id: 'local-1', statement: 'Local req' }));

      const serverReq = makeRequirement({ id: 'server-1', statement: 'Server req' });
      store.setSession('CODE', 'p1', makeSession('CODE'));
      // Now update with a session that has requirements
      store.updateSession({ ...makeSession('CODE'), requirements: [serverReq] });

      const ids = store.get().requirements.map(r => r.id);
      expect(ids).toContain('local-1');
      expect(ids).toContain('server-1');
    });

    it('deduplicates by statement text', () => {
      store.addRequirement(makeRequirement({ id: 'local-1', statement: 'Same statement' }));

      const serverReq = makeRequirement({ id: 'server-1', statement: 'Same statement' });
      store.setSession('CODE', 'p1', { ...makeSession('CODE'), requirements: [serverReq] });

      expect(store.get().requirements).toHaveLength(1);
      expect(store.get().requirements[0].id).toBe('local-1');
    });

    it('deduplicates by id', () => {
      store.addRequirement(makeRequirement({ id: 'same-id', statement: 'Local text' }));

      const serverReq = makeRequirement({ id: 'same-id', statement: 'Server text' });
      store.setSession('CODE', 'p1', { ...makeSession('CODE'), requirements: [serverReq] });

      expect(store.get().requirements).toHaveLength(1);
    });
  });

  describe('clearSession — requirement persistence', () => {
    it('preserves local requirements when session is cleared', () => {
      store.addRequirement(makeRequirement({ id: 'r1' }));
      store.addRequirement(makeRequirement({ id: 'r2', statement: 'Second' }));

      store.setSession('CODE', 'p1', makeSession('CODE'));
      store.clearSession();

      expect(store.get().sessionState).toBeNull();
      expect(store.get().requirements).toHaveLength(2);
    });
  });
});
