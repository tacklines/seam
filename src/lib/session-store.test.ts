import { describe, it, expect } from 'vitest';
import { generateJoinCode, SessionStore } from './session-store.js';
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

describe('generateJoinCode', () => {
  it('returns a 6-character string', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(6);
  });

  it('contains only uppercase alphanumeric characters from the allowed alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('never contains confusing characters: 0, O, 1, I, L', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('generates different codes on repeated calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, generateJoinCode));
    // With 32^6 ~= 1 billion possibilities, 20 calls should give 20 unique codes
    expect(codes.size).toBe(20);
  });
});

describe('SessionStore', () => {
  describe('createSession', () => {
    it('creates a session with a 6-char join code', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      expect(session.code).toHaveLength(6);
      expect(session.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    });

    it('adds the creator as the first participant', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      expect(session.participants.size).toBe(1);
      const [participant] = session.participants.values();
      expect(participant.name).toBe('Alice');
      expect(participant.id).toBeTruthy();
      expect(participant.joinedAt).toBeInstanceOf(Date);
    });

    it('creates a session with no submissions', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      expect(session.submissions).toHaveLength(0);
    });

    it('sets createdAt to a Date', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('generates unique codes across multiple sessions', () => {
      const store = new SessionStore();
      const codes = new Set(
        Array.from({ length: 50 }, () => store.createSession('user').code)
      );
      expect(codes.size).toBe(50);
    });
  });

  describe('joinSession', () => {
    it('returns the session when the code is valid', () => {
      const store = new SessionStore();
      const created = store.createSession('Alice');
      const joined = store.joinSession(created.code, 'Bob');
      expect(joined).not.toBeNull();
      expect(joined!.code).toBe(created.code);
    });

    it('adds the new participant to the session', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
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

    it('assigns a unique id to the new participant', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      store.joinSession(session.code, 'Bob');
      const ids = Array.from(session.participants.keys());
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('submitYaml', () => {
    it('adds a submission to the session', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      const [participantId] = session.participants.keys();
      const data = makeFile('engineer');

      const submission = store.submitYaml(session.code, participantId, 'alice.yaml', data);

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
      const session = store.createSession('Alice');
      const data = makeFile('engineer');
      const result = store.submitYaml(session.code, 'unknown-participant-id', 'file.yaml', data);
      expect(result).toBeNull();
    });

    it('allows multiple submissions per session', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      const [aliceId] = session.participants.keys();
      store.joinSession(session.code, 'Bob');
      const bobId = Array.from(session.participants.keys())[1];

      store.submitYaml(session.code, aliceId, 'alice.yaml', makeFile('engineer'));
      store.submitYaml(session.code, bobId, 'bob.yaml', makeFile('designer'));

      expect(session.submissions).toHaveLength(2);
    });

    it('records submittedAt as a Date', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      const [participantId] = session.participants.keys();
      const submission = store.submitYaml(session.code, participantId, 'file.yaml', makeFile('engineer'));
      expect(submission!.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe('getSession', () => {
    it('returns the session for a valid code', () => {
      const store = new SessionStore();
      const created = store.createSession('Alice');
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
      const session = store.createSession('Alice');
      expect(store.getSessionFiles(session.code)).toEqual([]);
    });

    it('returns an empty array for an unknown code', () => {
      const store = new SessionStore();
      expect(store.getSessionFiles('XXXXXX')).toEqual([]);
    });

    it('returns LoadedFile[] with filename, role, and data', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      const [participantId] = session.participants.keys();
      const data = makeFile('engineer');

      store.submitYaml(session.code, participantId, 'alice.yaml', data);

      const files = store.getSessionFiles(session.code);
      expect(files).toHaveLength(1);
      expect(files[0]).toEqual({
        filename: 'alice.yaml',
        role: 'engineer',
        data,
      });
    });

    it('returns one LoadedFile per submission', () => {
      const store = new SessionStore();
      const session = store.createSession('Alice');
      const [aliceId] = session.participants.keys();
      store.joinSession(session.code, 'Bob');
      const bobId = Array.from(session.participants.keys())[1];

      store.submitYaml(session.code, aliceId, 'alice.yaml', makeFile('engineer'));
      store.submitYaml(session.code, bobId, 'bob.yaml', makeFile('designer'));

      const files = store.getSessionFiles(session.code);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.filename)).toEqual(['alice.yaml', 'bob.yaml']);
      expect(files.map((f) => f.role)).toEqual(['engineer', 'designer']);
    });
  });
});
