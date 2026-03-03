import { describe, it, expect } from 'vitest';
import { SessionStore } from './session-store.js';
import { EventStore } from '../contexts/session/event-store.js';

describe('SessionStore — Requirements CRUD', () => {
  function createStoreWithSession() {
    const eventStore = new EventStore();
    const store = new SessionStore(eventStore);
    const { session, creatorId } = store.createSession('Alice');
    return { store, eventStore, session, creatorId };
  }

  describe('addRequirement', () => {
    it('creates a requirement with correct defaults', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'Users must be able to log in');

      expect(req).not.toBeNull();
      expect(req!.statement).toBe('Users must be able to log in');
      expect(req!.authorId).toBe(creatorId);
      expect(req!.status).toBe('draft');
      expect(req!.priority).toBe(0);
      expect(req!.tags).toEqual([]);
      expect(req!.derivedEvents).toEqual([]);
      expect(req!.derivedAssumptions).toEqual([]);
      expect(req!.id).toBeTruthy();
      expect(req!.createdAt).toBeTruthy();
      expect(req!.updatedAt).toBe(req!.createdAt);
    });

    it('creates a requirement with tags when provided', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'Need auth', ['security', 'auth']);

      expect(req).not.toBeNull();
      expect(req!.tags).toEqual(['security', 'auth']);
    });

    it('emits RequirementSubmitted domain event', () => {
      const { store, eventStore, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'Users must log in', ['auth']);

      const events = eventStore.getEvents(session.code);
      const reqEvent = events.find(e => e.type === 'RequirementSubmitted');
      expect(reqEvent).toBeDefined();
      expect(reqEvent).toMatchObject({
        type: 'RequirementSubmitted',
        requirementId: req!.id,
        statement: 'Users must log in',
        authorId: creatorId,
        tags: ['auth'],
      });
    });

    it('returns null for a non-existent session', () => {
      const { store } = createStoreWithSession();
      const result = store.addRequirement('ZZZZZZ', 'someId', 'statement');
      expect(result).toBeNull();
    });

    it('returns null for a closed session', () => {
      const { store, session, creatorId } = createStoreWithSession();
      store.closeSession(session.code);
      const result = store.addRequirement(session.code, creatorId, 'statement');
      expect(result).toBeNull();
    });

    it('returns null for an unknown participant', () => {
      const { store, session } = createStoreWithSession();
      const result = store.addRequirement(session.code, 'unknown-id', 'statement');
      expect(result).toBeNull();
    });
  });

  describe('updateRequirement', () => {
    it('changes status', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const updated = store.updateRequirement(session.code, req!.id, { status: 'active' });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('active');
    });

    it('changes priority', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const updated = store.updateRequirement(session.code, req!.id, { priority: 5 });

      expect(updated!.priority).toBe(5);
    });

    it('changes tags', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const updated = store.updateRequirement(session.code, req!.id, { tags: ['important'] });

      expect(updated!.tags).toEqual(['important']);
    });

    it('sets derivedEvents', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const updated = store.updateRequirement(session.code, req!.id, {
        derivedEvents: ['UserLoggedIn', 'SessionCreated'],
      });

      expect(updated!.derivedEvents).toEqual(['UserLoggedIn', 'SessionCreated']);
    });

    it('sets derivedAssumptions', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const updated = store.updateRequirement(session.code, req!.id, {
        derivedAssumptions: ['assumption-1'],
      });

      expect(updated!.derivedAssumptions).toEqual(['assumption-1']);
    });

    it('updates updatedAt timestamp', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      const originalUpdatedAt = req!.updatedAt;

      // Small delay to ensure timestamp differs
      const updated = store.updateRequirement(session.code, req!.id, { status: 'active' });
      expect(updated!.updatedAt).toBeTruthy();
      // updatedAt should be >= original (may be equal if within same ms)
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('returns null for unknown requirement', () => {
      const { store, session } = createStoreWithSession();
      const result = store.updateRequirement(session.code, 'nonexistent', { status: 'active' });
      expect(result).toBeNull();
    });

    it('returns null for non-existent session', () => {
      const { store } = createStoreWithSession();
      const result = store.updateRequirement('ZZZZZZ', 'someId', { status: 'active' });
      expect(result).toBeNull();
    });

    it('returns null for closed session', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req = store.addRequirement(session.code, creatorId, 'A requirement');
      store.closeSession(session.code);
      const result = store.updateRequirement(session.code, req!.id, { status: 'active' });
      expect(result).toBeNull();
    });
  });

  describe('getRequirements', () => {
    it('returns all requirements for a session', () => {
      const { store, session, creatorId } = createStoreWithSession();
      store.addRequirement(session.code, creatorId, 'First requirement');
      store.addRequirement(session.code, creatorId, 'Second requirement');

      const reqs = store.getRequirements(session.code);
      expect(reqs).toHaveLength(2);
      expect(reqs[0].statement).toBe('First requirement');
      expect(reqs[1].statement).toBe('Second requirement');
    });

    it('returns empty array for session with no requirements', () => {
      const { store, session } = createStoreWithSession();
      const reqs = store.getRequirements(session.code);
      expect(reqs).toEqual([]);
    });

    it('returns empty array for non-existent session', () => {
      const { store } = createStoreWithSession();
      const reqs = store.getRequirements('ZZZZZZ');
      expect(reqs).toEqual([]);
    });
  });

  describe('getRequirementCoverage', () => {
    it('returns coverage metrics for all requirements', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req1 = store.addRequirement(session.code, creatorId, 'Req 1');
      const req2 = store.addRequirement(session.code, creatorId, 'Req 2');

      // Add derived events to req1 only
      store.updateRequirement(session.code, req1!.id, {
        derivedEvents: ['UserLoggedIn', 'TokenIssued'],
      });

      const coverage = store.getRequirementCoverage(session.code);
      expect(coverage).toHaveLength(2);

      const cov1 = coverage.find(c => c.reqId === req1!.id)!;
      expect(cov1.eventCount).toBe(2);
      expect(cov1.fulfilled).toBe(true);

      const cov2 = coverage.find(c => c.reqId === req2!.id)!;
      expect(cov2.eventCount).toBe(0);
      expect(cov2.fulfilled).toBe(false);
    });

    it('filters by specific requirementId', () => {
      const { store, session, creatorId } = createStoreWithSession();
      const req1 = store.addRequirement(session.code, creatorId, 'Req 1');
      store.addRequirement(session.code, creatorId, 'Req 2');

      store.updateRequirement(session.code, req1!.id, {
        derivedEvents: ['SomeEvent'],
      });

      const coverage = store.getRequirementCoverage(session.code, req1!.id);
      expect(coverage).toHaveLength(1);
      expect(coverage[0].reqId).toBe(req1!.id);
      expect(coverage[0].eventCount).toBe(1);
      expect(coverage[0].fulfilled).toBe(true);
    });

    it('returns empty array for non-existent session', () => {
      const { store } = createStoreWithSession();
      const coverage = store.getRequirementCoverage('ZZZZZZ');
      expect(coverage).toEqual([]);
    });

    it('returns empty array when no requirements exist', () => {
      const { store, session } = createStoreWithSession();
      const coverage = store.getRequirementCoverage(session.code);
      expect(coverage).toEqual([]);
    });
  });
});
