import { describe, it, expect } from 'vitest';
import { SessionStore, serializeSession } from './session-store.js';
import type { CandidateEventsFile } from '../schema/types.js';

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
});
