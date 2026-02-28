import { describe, it, expect } from 'vitest';
import { SessionStore, serializeSession } from './session-store.js';
import { EventStore } from '../contexts/session/event-store.js';
import type { CandidateEventsFile, IntegrationReport } from '../schema/types.js';

const makeFile = (role: string): CandidateEventsFile => ({
  metadata: {
    role,
    scope: 'test scope',
    goal: 'test goal',
    generated_at: '2026-01-01T00:00:00Z',
    event_count: 1,
    assumption_count: 0,
  },
  domain_events: [
    {
      name: 'TestEvent',
      aggregate: 'TestAggregate',
      trigger: 'test trigger',
      payload: [],
      integration: { direction: 'internal' },
      confidence: 'CONFIRMED',
    },
  ],
  boundary_assumptions: [],
});

describe('SessionStore', () => {
  describe('createSession', () => {
    it('creates a session with a 6-char join code', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      expect(session.code).toHaveLength(6);
    });

    it('returns the creator ID', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      expect(creatorId).toBeTruthy();
      expect(session.participants.has(creatorId)).toBe(true);
    });

    it('adds the creator as the first participant', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      expect(session.participants.size).toBe(1);
      const creator = session.participants.get(creatorId)!;
      expect(creator.name).toBe('Alice');
      expect(creator.id).toBe(creatorId);
    });

    it('creates a session with no submissions', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      expect(session.submissions).toHaveLength(0);
    });

    it('sets createdAt to an ISO string', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      expect(typeof session.createdAt).toBe('string');
      expect(() => new Date(session.createdAt)).not.toThrow();
    });

    it('generates unique codes across multiple sessions', () => {
      const store = new SessionStore();
      const codes = new Set(
        Array.from({ length: 50 }, () => store.createSession('user').session.code)
      );
      expect(codes.size).toBe(50);
    });
  });

  describe('joinSession', () => {
    it('returns the session and participant ID when the code is valid', () => {
      const store = new SessionStore();
      const { session: created } = store.createSession('Alice');
      const result = store.joinSession(created.code, 'Bob');
      expect(result).not.toBeNull();
      expect(result!.session.code).toBe(created.code);
      expect(result!.participantId).toBeTruthy();
    });

    it('adds the new participant to the session', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.joinSession(session.code, 'Bob');
      expect(session.participants.size).toBe(2);
      const names = Array.from(session.participants.values()).map((p) => p.name);
      expect(names).toContain('Bob');
    });

    it('returns null for an unknown code', () => {
      const store = new SessionStore();
      const result = store.joinSession('XXXXXX', 'Bob');
      expect(result).toBeNull();
    });

    it('is case-insensitive on join code', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const result = store.joinSession(session.code.toLowerCase(), 'Bob');
      expect(result).not.toBeNull();
    });

    it('assigns a unique id to the new participant', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.joinSession(session.code, 'Bob');
      const ids = Array.from(session.participants.keys());
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('submitYaml', () => {
    it('adds a submission to the session', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const data = makeFile('engineer');

      const submission = store.submitYaml(session.code, creatorId, 'alice.yaml', data);

      expect(submission).not.toBeNull();
      expect(session.submissions).toHaveLength(1);
      expect(session.submissions[0].fileName).toBe('alice.yaml');
    });

    it('returns null for an unknown session code', () => {
      const store = new SessionStore();
      const data = makeFile('engineer');
      const result = store.submitYaml('XXXXXX', 'some-id', 'file.yaml', data);
      expect(result).toBeNull();
    });

    it('returns null for a participant not in the session', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const data = makeFile('engineer');
      const result = store.submitYaml(session.code, 'unknown-participant-id', 'file.yaml', data);
      expect(result).toBeNull();
    });

    it('allows multiple submissions per session', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const joinResult = store.joinSession(session.code, 'Bob')!;

      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer'));
      store.submitYaml(session.code, joinResult.participantId, 'bob.yaml', makeFile('designer'));

      expect(session.submissions).toHaveLength(2);
    });

    it('records submittedAt as an ISO string', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const submission = store.submitYaml(session.code, creatorId, 'file.yaml', makeFile('engineer'));
      expect(typeof submission!.submittedAt).toBe('string');
    });
  });

  describe('getSession', () => {
    it('returns the session for a valid code', () => {
      const store = new SessionStore();
      const { session: created } = store.createSession('Alice');
      const fetched = store.getSession(created.code);
      expect(fetched).not.toBeNull();
      expect(fetched!.code).toBe(created.code);
    });

    it('returns null for an unknown code', () => {
      const store = new SessionStore();
      const result = store.getSession('XXXXXX');
      expect(result).toBeNull();
    });
  });

  describe('getSessionFiles', () => {
    it('returns an empty array when no submissions', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      expect(store.getSessionFiles(session.code)).toEqual([]);
    });

    it('returns an empty array for an unknown code', () => {
      const store = new SessionStore();
      expect(store.getSessionFiles('XXXXXX')).toEqual([]);
    });

    it('returns LoadedFile[] with filename, role, and data', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const data = makeFile('engineer');

      store.submitYaml(session.code, creatorId, 'alice.yaml', data);

      const files = store.getSessionFiles(session.code);
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('alice.yaml');
      expect(files[0].data).toBe(data);
    });

    it('returns one LoadedFile per submission', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const joinResult = store.joinSession(session.code, 'Bob')!;

      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer'));
      store.submitYaml(session.code, joinResult.participantId, 'bob.yaml', makeFile('designer'));

      const files = store.getSessionFiles(session.code);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.filename)).toEqual(['alice.yaml', 'bob.yaml']);
    });
  });

  describe('jam session', () => {
    it('startJam creates jam artifacts on the session', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const jam = store.startJam(session.code);
      expect(jam).not.toBeNull();
      expect(jam!.ownershipMap).toEqual([]);
      expect(jam!.resolutions).toEqual([]);
      expect(jam!.unresolved).toEqual([]);
      expect(typeof jam!.startedAt).toBe('string');
    });

    it('startJam returns existing jam if already started', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const jam1 = store.startJam(session.code);
      const jam2 = store.startJam(session.code);
      expect(jam1).toBe(jam2);
    });

    it('startJam returns null for unknown session', () => {
      const store = new SessionStore();
      expect(store.startJam('XXXXXX')).toBeNull();
    });

    it('resolveConflict adds a resolution', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      const result = store.resolveConflict(session.code, {
        overlapLabel: 'OrderPlaced vs OrderCreated',
        resolution: 'Merged into OrderPlaced',
        chosenApproach: 'merge',
        resolvedBy: ['Alice', 'Bob'],
      });
      expect(result).not.toBeNull();
      expect(result!.overlapLabel).toBe('OrderPlaced vs OrderCreated');
      expect(typeof result!.resolvedAt).toBe('string');
    });

    it('resolveConflict returns null when jam not started', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const result = store.resolveConflict(session.code, {
        overlapLabel: 'test',
        resolution: 'test',
        chosenApproach: 'test',
        resolvedBy: [],
      });
      expect(result).toBeNull();
    });

    it('assignOwnership replaces existing assignment for same aggregate', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Fulfillment', assignedBy: 'Bob' });
      const jam = store.exportJam(session.code)!;
      expect(jam.ownershipMap).toHaveLength(1);
      expect(jam.ownershipMap[0].ownerRole).toBe('Fulfillment');
    });

    it('flagUnresolved adds an item with generated id', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      const item = store.flagUnresolved(session.code, {
        description: 'Need to discuss Payment aggregate ownership',
        flaggedBy: 'Alice',
      });
      expect(item).not.toBeNull();
      expect(item!.id).toBeTruthy();
      expect(item!.description).toBe('Need to discuss Payment aggregate ownership');
    });

    it('exportJam returns all artifacts', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.resolveConflict(session.code, {
        overlapLabel: 'test',
        resolution: 'resolved',
        chosenApproach: 'merge',
        resolvedBy: ['Alice'],
      });
      store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      store.flagUnresolved(session.code, { description: 'TBD', flaggedBy: 'Alice' });

      const jam = store.exportJam(session.code)!;
      expect(jam.resolutions).toHaveLength(1);
      expect(jam.ownershipMap).toHaveLength(1);
      expect(jam.unresolved).toHaveLength(1);
    });
  });

  describe('idempotency', () => {
    describe('joinSession', () => {
      it('returns the same participantId when the same name joins twice', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        const first = store.joinSession(session.code, 'Bob')!;
        const second = store.joinSession(session.code, 'Bob')!;
        expect(second.participantId).toBe(first.participantId);
      });

      it('does not add a duplicate participant entry when the same name joins twice', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.joinSession(session.code, 'Bob');
        store.joinSession(session.code, 'Bob');
        expect(session.participants.size).toBe(2); // Alice + Bob (only once)
      });

      it('does not emit a second ParticipantJoined event on duplicate join', () => {
        const eventStore = new EventStore();
        const store = new SessionStore(eventStore);
        const { session } = store.createSession('Alice');
        store.joinSession(session.code, 'Bob');
        store.joinSession(session.code, 'Bob');
        const joinEvents = eventStore.getEvents(session.code).filter((e) => e.type === 'ParticipantJoined');
        expect(joinEvents).toHaveLength(1);
      });

      it('still allows two different participants with different names', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.joinSession(session.code, 'Bob');
        store.joinSession(session.code, 'Carol');
        expect(session.participants.size).toBe(3);
      });
    });

    describe('submitYaml', () => {
      it('returns the existing submission when content is identical (no duplicate)', () => {
        const store = new SessionStore();
        const { session, creatorId } = store.createSession('Alice');
        const data = makeFile('engineer');
        const first = store.submitYaml(session.code, creatorId, 'alice.yaml', data)!;
        const second = store.submitYaml(session.code, creatorId, 'alice.yaml', data)!;
        expect(second).toBe(first); // same object reference — no mutation
        expect(session.submissions).toHaveLength(1);
      });

      it('does not emit a second ArtifactSubmitted event for identical re-submission', () => {
        const eventStore = new EventStore();
        const store = new SessionStore(eventStore);
        const { session, creatorId } = store.createSession('Alice');
        const data = makeFile('engineer');
        store.submitYaml(session.code, creatorId, 'alice.yaml', data);
        store.submitYaml(session.code, creatorId, 'alice.yaml', data);
        const submitEvents = eventStore.getEvents(session.code).filter((e) => e.type === 'ArtifactSubmitted');
        expect(submitEvents).toHaveLength(1);
      });

      it('updates in-place when content changes for the same participant+fileName', () => {
        const store = new SessionStore();
        const { session, creatorId } = store.createSession('Alice');
        const original = makeFile('engineer');
        const updated = makeFile('engineer-v2');
        store.submitYaml(session.code, creatorId, 'alice.yaml', original);
        const result = store.submitYaml(session.code, creatorId, 'alice.yaml', updated)!;
        expect(session.submissions).toHaveLength(1); // still only one entry
        expect(result.data).toBe(updated);
        expect(session.submissions[0].data).toBe(updated);
      });

      it('emits a second ArtifactSubmitted event when content changes', () => {
        const eventStore = new EventStore();
        const store = new SessionStore(eventStore);
        const { session, creatorId } = store.createSession('Alice');
        store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer'));
        store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer-v2'));
        const submitEvents = eventStore.getEvents(session.code).filter((e) => e.type === 'ArtifactSubmitted');
        expect(submitEvents).toHaveLength(2);
      });

      it('allows different participants to submit files with the same name', () => {
        const store = new SessionStore();
        const { session, creatorId } = store.createSession('Alice');
        const bobResult = store.joinSession(session.code, 'Bob')!;
        store.submitYaml(session.code, creatorId, 'events.yaml', makeFile('engineer'));
        store.submitYaml(session.code, bobResult.participantId, 'events.yaml', makeFile('designer'));
        expect(session.submissions).toHaveLength(2);
      });
    });

    describe('resolveConflict', () => {
      it('returns the existing resolution when the same overlapLabel is resolved twice', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        const first = store.resolveConflict(session.code, {
          overlapLabel: 'OrderPlaced vs OrderCreated',
          resolution: 'Merged into OrderPlaced',
          chosenApproach: 'merge',
          resolvedBy: ['Alice'],
        })!;
        const second = store.resolveConflict(session.code, {
          overlapLabel: 'OrderPlaced vs OrderCreated',
          resolution: 'Different resolution',
          chosenApproach: 'custom',
          resolvedBy: ['Bob'],
        })!;
        expect(second).toBe(first); // same object — first resolution wins
      });

      it('does not create duplicate resolutions for the same overlapLabel', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        store.resolveConflict(session.code, {
          overlapLabel: 'A vs B',
          resolution: 'first',
          chosenApproach: 'merge',
          resolvedBy: ['Alice'],
        });
        store.resolveConflict(session.code, {
          overlapLabel: 'A vs B',
          resolution: 'second',
          chosenApproach: 'custom',
          resolvedBy: ['Bob'],
        });
        const jam = store.exportJam(session.code)!;
        expect(jam.resolutions).toHaveLength(1);
        expect(jam.resolutions[0].resolution).toBe('first');
      });

      it('does not emit a second ResolutionRecorded event on duplicate resolve', () => {
        const eventStore = new EventStore();
        const store = new SessionStore(eventStore);
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        store.resolveConflict(session.code, {
          overlapLabel: 'X vs Y',
          resolution: 'merged',
          chosenApproach: 'merge',
          resolvedBy: ['Alice'],
        });
        store.resolveConflict(session.code, {
          overlapLabel: 'X vs Y',
          resolution: 'other',
          chosenApproach: 'custom',
          resolvedBy: ['Bob'],
        });
        const resEvents = eventStore.getEvents(session.code).filter((e) => e.type === 'ResolutionRecorded');
        expect(resEvents).toHaveLength(1);
      });

      it('allows resolving different overlapLabels independently', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        store.resolveConflict(session.code, { overlapLabel: 'A vs B', resolution: 'r1', chosenApproach: 'merge', resolvedBy: ['Alice'] });
        store.resolveConflict(session.code, { overlapLabel: 'C vs D', resolution: 'r2', chosenApproach: 'custom', resolvedBy: ['Bob'] });
        const jam = store.exportJam(session.code)!;
        expect(jam.resolutions).toHaveLength(2);
      });
    });

    describe('assignOwnership', () => {
      it('replaces the owner when the same aggregate is assigned twice (upsert)', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
        store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Fulfillment', assignedBy: 'Bob' });
        const jam = store.exportJam(session.code)!;
        expect(jam.ownershipMap).toHaveLength(1);
        expect(jam.ownershipMap[0].ownerRole).toBe('Fulfillment');
      });

      it('calling assignOwnership twice with the same value produces one entry', () => {
        const store = new SessionStore();
        const { session } = store.createSession('Alice');
        store.startJam(session.code);
        store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
        store.assignOwnership(session.code, { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
        const jam = store.exportJam(session.code)!;
        expect(jam.ownershipMap).toHaveLength(1);
      });
    });
  });

  describe('serializeSession', () => {
    it('converts participants Map to array', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.joinSession(session.code, 'Bob');

      const serialized = serializeSession(session);
      expect(Array.isArray(serialized.participants)).toBe(true);
      expect(serialized.participants).toHaveLength(2);
      expect(serialized.participants.map((p) => p.name)).toContain('Alice');
      expect(serialized.participants.map((p) => p.name)).toContain('Bob');
    });

    it('preserves code, createdAt, and submissions', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const serialized = serializeSession(session);
      expect(serialized.code).toBe(session.code);
      expect(serialized.createdAt).toBe(session.createdAt);
      expect(serialized.submissions).toEqual(session.submissions);
    });
  });

  describe('event emission', () => {
    const makeIntegrationReport = (status: 'pass' | 'fail' = 'pass'): IntegrationReport => ({
      generatedAt: new Date().toISOString(),
      sourceContracts: [],
      checks: status === 'fail'
        ? [{ name: 'check1', status: 'fail', message: 'something failed' }]
        : [{ name: 'check1', status: 'pass', message: 'ok' }],
      overallStatus: status,
      summary: status === 'pass' ? 'All checks passed' : 'Some checks failed',
    });

    it('emits no events when EventStore is not provided (backward compat)', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.joinSession(session.code, 'Bob');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer'));
      // No assertion needed — if an error were thrown the test would fail.
      // The point is that no EventStore is required.
      expect(session.code).toHaveLength(6);
    });

    it('createSession emits a SessionCreated event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session, creatorId } = store.createSession('Alice');

      const events = eventStore.getEvents(session.code);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SessionCreated');
      expect((events[0] as { creatorName: string }).creatorName).toBe('Alice');
      expect((events[0] as { creatorId: string }).creatorId).toBe(creatorId);
      expect(events[0].sessionCode).toBe(session.code);
    });

    it('joinSession emits a ParticipantJoined event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      const result = store.joinSession(session.code, 'Bob')!;

      const events = eventStore.getEvents(session.code);
      const joinEvent = events.find((e) => e.type === 'ParticipantJoined');
      expect(joinEvent).toBeDefined();
      expect((joinEvent as { participantId: string }).participantId).toBe(result.participantId);
      expect((joinEvent as { participantName: string }).participantName).toBe('Bob');
    });

    it('joinSession emits no event for unknown session code', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      store.joinSession('XXXXXX', 'Bob');
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });

    it('submitYaml emits an ArtifactSubmitted event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile('engineer'));

      const events = eventStore.getEvents(session.code);
      const submitEvent = events.find((e) => e.type === 'ArtifactSubmitted');
      expect(submitEvent).toBeDefined();
      expect((submitEvent as { participantId: string }).participantId).toBe(creatorId);
      expect((submitEvent as { fileName: string }).fileName).toBe('alice.yaml');
      expect((submitEvent as { artifactType: string }).artifactType).toBe('candidate-events');
    });

    it('submitYaml emits no event for unknown session code', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      store.submitYaml('XXXXXX', 'some-id', 'file.yaml', makeFile('engineer'));
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });

    it('resolveConflict emits a ResolutionRecorded event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.resolveConflict(session.code, {
        overlapLabel: 'OrderPlaced vs OrderCreated',
        resolution: 'Merged into OrderPlaced',
        chosenApproach: 'merge',
        resolvedBy: ['Alice', 'Bob'],
      });

      const events = eventStore.getEvents(session.code);
      const resEvent = events.find((e) => e.type === 'ResolutionRecorded');
      expect(resEvent).toBeDefined();
      expect((resEvent as { overlapLabel: string }).overlapLabel).toBe('OrderPlaced vs OrderCreated');
      expect((resEvent as { chosenApproach: string }).chosenApproach).toBe('merge');
      expect((resEvent as { resolvedBy: string[] }).resolvedBy).toEqual(['Alice', 'Bob']);
    });

    it('resolveConflict emits no event when jam not started', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.resolveConflict(session.code, {
        overlapLabel: 'test',
        resolution: 'test',
        chosenApproach: 'merge',
        resolvedBy: [],
      });

      const events = eventStore.getEvents(session.code);
      expect(events.find((e) => e.type === 'ResolutionRecorded')).toBeUndefined();
    });

    it('assignOwnership emits an OwnershipAssigned event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.assignOwnership(session.code, {
        aggregate: 'Order',
        ownerRole: 'Sales',
        assignedBy: 'Alice',
      });

      const events = eventStore.getEvents(session.code);
      const ownEvent = events.find((e) => e.type === 'OwnershipAssigned');
      expect(ownEvent).toBeDefined();
      expect((ownEvent as { aggregate: string }).aggregate).toBe('Order');
      expect((ownEvent as { ownerRole: string }).ownerRole).toBe('Sales');
      expect((ownEvent as { assignedBy: string }).assignedBy).toBe('Alice');
    });

    it('flagUnresolved emits an ItemFlagged event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.flagUnresolved(session.code, {
        description: 'Unclear payment aggregate ownership',
        flaggedBy: 'Alice',
      });

      const events = eventStore.getEvents(session.code);
      const flagEvent = events.find((e) => e.type === 'ItemFlagged');
      expect(flagEvent).toBeDefined();
      expect((flagEvent as { description: string }).description).toBe('Unclear payment aggregate ownership');
      expect((flagEvent as { flaggedBy: string }).flaggedBy).toBe('Alice');
    });

    it('flagUnresolved includes relatedOverlap when provided', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.startJam(session.code);
      store.flagUnresolved(session.code, {
        description: 'TBD',
        flaggedBy: 'Alice',
        relatedOverlap: 'OrderPlaced vs OrderCreated',
      });

      const events = eventStore.getEvents(session.code);
      const flagEvent = events.find((e) => e.type === 'ItemFlagged');
      expect((flagEvent as { relatedOverlap?: string }).relatedOverlap).toBe('OrderPlaced vs OrderCreated');
    });

    it('loadContracts emits a ContractGenerated event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.loadContracts(session.code, {
        generatedAt: new Date().toISOString(),
        eventContracts: [],
        boundaryContracts: [],
      });

      const events = eventStore.getEvents(session.code);
      const contractEvent = events.find((e) => e.type === 'ContractGenerated');
      expect(contractEvent).toBeDefined();
      expect((contractEvent as { version: number }).version).toBe(1);
    });

    it('loadContracts emits no event for unknown session code', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      store.loadContracts('XXXXXX', {
        generatedAt: new Date().toISOString(),
        eventContracts: [],
        boundaryContracts: [],
      });
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });

    it('loadIntegrationReport emits a ComplianceCheckCompleted event with passed=true', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.loadIntegrationReport(session.code, makeIntegrationReport('pass'));

      const events = eventStore.getEvents(session.code);
      const complianceEvent = events.find((e) => e.type === 'ComplianceCheckCompleted');
      expect(complianceEvent).toBeDefined();
      expect((complianceEvent as { passed: boolean }).passed).toBe(true);
      expect((complianceEvent as { failures: string[] }).failures).toHaveLength(0);
    });

    it('loadIntegrationReport emits a ComplianceCheckCompleted event with passed=false on failure', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      store.loadIntegrationReport(session.code, makeIntegrationReport('fail'));

      const events = eventStore.getEvents(session.code);
      const complianceEvent = events.find((e) => e.type === 'ComplianceCheckCompleted');
      expect(complianceEvent).toBeDefined();
      expect((complianceEvent as { passed: boolean }).passed).toBe(false);
      expect((complianceEvent as { failures: string[] }).failures).toContain('something failed');
    });

    it('sendMessage does not emit any domain event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session, creatorId } = store.createSession('Alice');
      const initialCount = eventStore.getEvents(session.code).length;
      store.sendMessage(session.code, creatorId, 'Hello!');
      expect(eventStore.getEvents(session.code).length).toBe(initialCount);
    });

    it('startJam does not emit any domain event', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');
      const initialCount = eventStore.getEvents(session.code).length;
      store.startJam(session.code);
      expect(eventStore.getEvents(session.code).length).toBe(initialCount);
    });

    it('emits events with valid eventId, sessionCode, and timestamp fields', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');

      const events = eventStore.getEvents(session.code);
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event.eventId).toBeTruthy();
      expect(event.sessionCode).toBe(session.code);
      expect(typeof event.timestamp).toBe('string');
      expect(() => new Date(event.timestamp)).not.toThrow();
    });
  });
});
