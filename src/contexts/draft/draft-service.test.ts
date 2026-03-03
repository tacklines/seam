import { describe, it, expect } from 'vitest';
import { DraftService } from './draft-service.js';
import { EventStore } from '../session/event-store.js';
import type { Session } from '../../lib/session-store.js';
import type { CandidateEventsFile } from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandidateEventsFile(): CandidateEventsFile {
  return {
    metadata: {
      role: 'Order Management',
      scope: 'checkout',
      goal: 'Handle customer orders',
      generated_at: '2026-01-01T00:00:00Z',
      event_count: 1,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'OrderPlaced',
        aggregate: 'Order',
        trigger: 'Customer submits checkout',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'outbound' },
        confidence: 'CONFIRMED',
      },
    ],
    boundary_assumptions: [],
  };
}

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

function makeGetSession(session: Session | null) {
  return (code: string) =>
    session && session.code === code ? session : null;
}

// ---------------------------------------------------------------------------
// createDraft
// ---------------------------------------------------------------------------

describe('DraftService.createDraft', () => {
  describe('Given a valid session', () => {
    it('When createDraft is called, Then it returns a Draft with generated id, createdAt, updatedAt, and null publishedAt', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));

      const result = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBeTruthy();
      expect(result!.participantId).toBe('p1');
      expect(typeof result!.createdAt).toBe('string');
      expect(typeof result!.updatedAt).toBe('string');
      expect(result!.publishedAt).toBeNull();
    });

    it('When createDraft is called, Then the draft is added to session.drafts', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));

      svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      expect(session.drafts).toHaveLength(1);
    });

    it('When createDraft is called twice, Then two drafts exist with different ids', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));

      const a = svc.createDraft('TEST01', { participantId: 'p1', content: makeCandidateEventsFile() });
      const b = svc.createDraft('TEST01', { participantId: 'p2', content: makeCandidateEventsFile() });

      expect(a!.id).not.toBe(b!.id);
      expect(session.drafts).toHaveLength(2);
    });
  });

  describe('Given an unknown session', () => {
    it('When createDraft is called, Then it returns null', () => {
      const svc = new DraftService(makeGetSession(null));
      const result = svc.createDraft('XXXXXX', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });
      expect(result).toBeNull();
    });
  });

  describe('Given an EventStore is provided', () => {
    it('When createDraft succeeds, Then a DraftCreated event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new DraftService(makeGetSession(session), eventStore);

      const result = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const events = eventStore.getEvents('TEST01');
      const draftEvent = events.find((e) => e.type === 'DraftCreated');
      expect(draftEvent).toBeDefined();
      expect((draftEvent as { draftId: string }).draftId).toBe(result!.id);
      expect((draftEvent as { participantId: string }).participantId).toBe('p1');
    });

    it('When createDraft returns null (unknown session), Then no event is emitted', () => {
      const eventStore = new EventStore();
      const svc = new DraftService(makeGetSession(null), eventStore);
      svc.createDraft('XXXXXX', { participantId: 'p1', content: makeCandidateEventsFile() });
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When createDraft is called, Then it works without emitting events', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const result = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });
      expect(result).not.toBeNull();
      expect(session.drafts).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// getDraft
// ---------------------------------------------------------------------------

describe('DraftService.getDraft', () => {
  describe('Given a draft that exists in the session', () => {
    it('When getDraft is called with the draft id, Then it returns the draft', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const found = svc.getDraft('TEST01', created!.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created!.id);
    });
  });

  describe('Given a draft id that does not exist', () => {
    it('When getDraft is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const result = svc.getDraft('TEST01', 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('Given an unknown session', () => {
    it('When getDraft is called, Then it returns null', () => {
      const svc = new DraftService(makeGetSession(null));
      expect(svc.getDraft('XXXXXX', 'any-id')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getDrafts
// ---------------------------------------------------------------------------

describe('DraftService.getDrafts', () => {
  describe('Given a session with multiple drafts', () => {
    it('When getDrafts is called, Then it returns all drafts', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      svc.createDraft('TEST01', { participantId: 'p1', content: makeCandidateEventsFile() });
      svc.createDraft('TEST01', { participantId: 'p2', content: makeCandidateEventsFile() });

      const drafts = svc.getDrafts('TEST01');
      expect(drafts).not.toBeNull();
      expect(drafts!).toHaveLength(2);
    });
  });

  describe('Given a session with no drafts', () => {
    it('When getDrafts is called, Then it returns an empty array', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const drafts = svc.getDrafts('TEST01');
      expect(drafts).toEqual([]);
    });
  });

  describe('Given an unknown session', () => {
    it('When getDrafts is called, Then it returns null', () => {
      const svc = new DraftService(makeGetSession(null));
      expect(svc.getDrafts('XXXXXX')).toBeNull();
    });
  });

  describe('Given the returned array is mutated', () => {
    it('When the returned array is modified, Then session.drafts is not affected', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      svc.createDraft('TEST01', { participantId: 'p1', content: makeCandidateEventsFile() });

      const drafts = svc.getDrafts('TEST01')!;
      drafts.splice(0, 1); // mutate the returned array
      expect(session.drafts).toHaveLength(1); // session is unchanged
    });
  });
});

// ---------------------------------------------------------------------------
// updateDraft
// ---------------------------------------------------------------------------

describe('DraftService.updateDraft', () => {
  describe('Given a draft that exists', () => {
    it('When updateDraft is called with new content, Then it returns the updated draft with new updatedAt', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });
      const originalUpdatedAt = created!.updatedAt;

      // Small delay to ensure timestamp difference
      const newContent: CandidateEventsFile = {
        ...makeCandidateEventsFile(),
        metadata: { ...makeCandidateEventsFile().metadata, role: 'Updated Role' },
      };

      const updated = svc.updateDraft('TEST01', created!.id, { content: newContent });
      expect(updated).not.toBeNull();
      expect(updated!.content.metadata.role).toBe('Updated Role');
      expect(updated!.updatedAt >= originalUpdatedAt).toBe(true);
    });

    it('When updateDraft is called, Then the draft in session is replaced', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const newContent: CandidateEventsFile = {
        ...makeCandidateEventsFile(),
        metadata: { ...makeCandidateEventsFile().metadata, role: 'New Role' },
      };
      svc.updateDraft('TEST01', created!.id, { content: newContent });

      expect(session.drafts[0].content.metadata.role).toBe('New Role');
    });
  });

  describe('Given a draft id that does not exist', () => {
    it('When updateDraft is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const result = svc.updateDraft('TEST01', 'bad-id', {
        content: makeCandidateEventsFile(),
      });
      expect(result).toBeNull();
    });
  });

  describe('Given an unknown session', () => {
    it('When updateDraft is called, Then it returns null', () => {
      const svc = new DraftService(makeGetSession(null));
      expect(svc.updateDraft('XXXXXX', 'any-id', { content: makeCandidateEventsFile() })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// publishDraft
// ---------------------------------------------------------------------------

describe('DraftService.publishDraft', () => {
  describe('Given an unpublished draft', () => {
    it('When publishDraft is called, Then it returns the draft with publishedAt set', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const published = svc.publishDraft('TEST01', created!.id);
      expect(published).not.toBeNull();
      expect(typeof published!.publishedAt).toBe('string');
      expect(published!.publishedAt).not.toBeNull();
    });

    it('When publishDraft is called, Then the session draft is updated', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      svc.publishDraft('TEST01', created!.id);
      expect(session.drafts[0].publishedAt).not.toBeNull();
    });
  });

  describe('Given an already-published draft', () => {
    it('When publishDraft is called again, Then it returns the existing draft without changing publishedAt', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const first = svc.publishDraft('TEST01', created!.id);
      const second = svc.publishDraft('TEST01', created!.id);

      expect(second!.publishedAt).toBe(first!.publishedAt);
    });
  });

  describe('Given a draft id that does not exist', () => {
    it('When publishDraft is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      expect(svc.publishDraft('TEST01', 'bad-id')).toBeNull();
    });
  });

  describe('Given an unknown session', () => {
    it('When publishDraft is called, Then it returns null', () => {
      const svc = new DraftService(makeGetSession(null));
      expect(svc.publishDraft('XXXXXX', 'any-id')).toBeNull();
    });
  });

  describe('Given an EventStore is provided', () => {
    it('When publishDraft succeeds, Then a DraftPublished event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new DraftService(makeGetSession(session), eventStore);
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      svc.publishDraft('TEST01', created!.id);

      const events = eventStore.getEvents('TEST01');
      const publishEvent = events.find((e) => e.type === 'DraftPublished');
      expect(publishEvent).toBeDefined();
      expect((publishEvent as { draftId: string }).draftId).toBe(created!.id);
    });

    it('When publishDraft is called on an already-published draft, Then no additional event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new DraftService(makeGetSession(session), eventStore);
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      svc.publishDraft('TEST01', created!.id);
      svc.publishDraft('TEST01', created!.id); // second call — idempotent

      const events = eventStore.getEvents('TEST01');
      const publishEvents = events.filter((e) => e.type === 'DraftPublished');
      expect(publishEvents).toHaveLength(1); // only one event
    });

    it('When publishDraft returns null (bad id), Then no event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new DraftService(makeGetSession(session), eventStore);

      svc.publishDraft('TEST01', 'bad-id');

      const events = eventStore.getEvents('TEST01');
      expect(events).toHaveLength(0);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When publishDraft is called, Then it works without emitting events', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const published = svc.publishDraft('TEST01', created!.id);
      expect(published).not.toBeNull();
      expect(published!.publishedAt).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// deleteDraft
// ---------------------------------------------------------------------------

describe('DraftService.deleteDraft', () => {
  describe('Given a draft that exists', () => {
    it('When deleteDraft is called, Then it returns true and the draft is removed', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const created = svc.createDraft('TEST01', {
        participantId: 'p1',
        content: makeCandidateEventsFile(),
      });

      const result = svc.deleteDraft('TEST01', created!.id);
      expect(result).toBe(true);
      expect(session.drafts).toHaveLength(0);
    });

    it('When deleteDraft removes one of two drafts, Then the other draft remains', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const a = svc.createDraft('TEST01', { participantId: 'p1', content: makeCandidateEventsFile() });
      const b = svc.createDraft('TEST01', { participantId: 'p2', content: makeCandidateEventsFile() });

      svc.deleteDraft('TEST01', a!.id);

      expect(session.drafts).toHaveLength(1);
      expect(session.drafts[0].id).toBe(b!.id);
    });
  });

  describe('Given a draft id that does not exist', () => {
    it('When deleteDraft is called, Then it returns false', () => {
      const session = makeSession();
      const svc = new DraftService(makeGetSession(session));
      const result = svc.deleteDraft('TEST01', 'nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('Given an unknown session', () => {
    it('When deleteDraft is called, Then it returns false', () => {
      const svc = new DraftService(makeGetSession(null));
      expect(svc.deleteDraft('XXXXXX', 'any-id')).toBe(false);
    });
  });
});
