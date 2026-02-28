import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionPersistence } from './session-persistence.js';
import type { Session, Participant, Submission } from './session-store.js';
import type { CandidateEventsFile, JamArtifacts, ContractBundle, IntegrationReport } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-persistence-test-'));
}

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p-1',
    name: 'Alice',
    joinedAt: '2026-02-28T08:00:00Z',
    ...overrides,
  };
}

function makeMinimalData(): CandidateEventsFile {
  return {
    metadata: {
      role: 'frontend',
      scope: 'payments',
      goal: 'identify payment events',
      generated_at: '2026-02-28T08:00:00Z',
      event_count: 1,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'PaymentSucceeded',
        aggregate: 'Payment',
        trigger: 'SubmitPayment',
        payload: [{ field: 'amount_cents', type: 'integer' }],
        integration: { direction: 'internal' },
        confidence: 'CONFIRMED',
      },
    ],
    boundary_assumptions: [],
  };
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    participantId: 'p-1',
    fileName: 'frontend.yaml',
    data: makeMinimalData(),
    submittedAt: '2026-02-28T08:05:00Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Omit<Session, 'participants'>> & { participants?: Map<string, Participant> } = {}): Session {
  const participants = overrides.participants ?? new Map([
    ['p-1', makeParticipant({ id: 'p-1' })],
  ]);
  return {
    code: 'ABC123',
    createdAt: '2026-02-28T08:00:00Z',
    participants,
    submissions: [],
    messages: [],
    jam: null,
    contracts: null,
    integrationReport: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Given SessionPersistence with a temp directory', () => {
  let tmpDir: string;
  let filePath: string;
  let persistence: SessionPersistence;

  beforeEach(() => {
    tmpDir = makeTempDir();
    filePath = path.join(tmpDir, 'sessions.json');
    persistence = new SessionPersistence(filePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('When loading from a non-existent file', () => {
    it('returns an empty map', () => {
      const result = persistence.load();
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('When saving and loading a single session', () => {
    it('round-trips the session with correct code and dates', () => {
      const session = makeSession();
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      expect(loaded.size).toBe(1);
      const loadedSession = loaded.get('ABC123');
      expect(loadedSession).toBeDefined();
      expect(loadedSession!.code).toBe('ABC123');
      expect(loadedSession!.createdAt).toBe('2026-02-28T08:00:00Z');
    });
  });

  describe('When saving and loading sessions with participants', () => {
    it('round-trips Map<string, Participant> correctly', () => {
      const participants = new Map([
        ['p-1', makeParticipant({ id: 'p-1', name: 'Alice' })],
        ['p-2', makeParticipant({ id: 'p-2', name: 'Bob', joinedAt: '2026-02-28T08:01:00Z' })],
      ]);
      const session = makeSession({ participants });
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      const s = loaded.get('ABC123')!;
      expect(s.participants).toBeInstanceOf(Map);
      expect(s.participants.size).toBe(2);
      expect(s.participants.get('p-1')!.name).toBe('Alice');
      expect(s.participants.get('p-2')!.name).toBe('Bob');
    });
  });

  describe('When saving and loading sessions with submissions', () => {
    it('round-trips submissions with CandidateEventsFile data', () => {
      const session = makeSession({
        submissions: [
          makeSubmission({ participantId: 'p-1', fileName: 'frontend.yaml' }),
        ],
      });
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      const s = loaded.get('ABC123')!;
      expect(s.submissions).toHaveLength(1);
      expect(s.submissions[0].fileName).toBe('frontend.yaml');
      expect(s.submissions[0].data.domain_events[0].name).toBe('PaymentSucceeded');
      expect(s.submissions[0].data.metadata.role).toBe('frontend');
    });
  });

  describe('When saving and loading sessions with jam artifacts', () => {
    it('round-trips JamArtifacts correctly', () => {
      const jam: JamArtifacts = {
        startedAt: '2026-02-28T09:00:00Z',
        ownershipMap: [
          { aggregate: 'Payment', ownerRole: 'backend', assignedBy: 'Alice', assignedAt: '2026-02-28T09:05:00Z' },
        ],
        resolutions: [
          {
            overlapLabel: 'PaymentSucceeded',
            resolution: 'Merge into single event',
            chosenApproach: 'merge',
            resolvedBy: ['Alice', 'Bob'],
            resolvedAt: '2026-02-28T09:10:00Z',
          },
        ],
        unresolved: [],
      };
      const session = makeSession({ jam });
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      const s = loaded.get('ABC123')!;
      expect(s.jam).not.toBeNull();
      expect(s.jam!.ownershipMap).toHaveLength(1);
      expect(s.jam!.ownershipMap[0].aggregate).toBe('Payment');
      expect(s.jam!.resolutions).toHaveLength(1);
      expect(s.jam!.resolutions[0].chosenApproach).toBe('merge');
    });
  });

  describe('When saving and loading sessions with contracts', () => {
    it('round-trips ContractBundle correctly', () => {
      const contracts: ContractBundle = {
        generatedAt: '2026-02-28T10:00:00Z',
        eventContracts: [
          {
            eventName: 'PaymentSucceeded',
            aggregate: 'Payment',
            version: '1.0.0',
            schema: { type: 'object', properties: {} },
            owner: 'backend',
            consumers: ['frontend'],
            producedBy: 'SubmitPayment',
          },
        ],
        boundaryContracts: [],
      };
      const session = makeSession({ contracts });
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      const s = loaded.get('ABC123')!;
      expect(s.contracts).not.toBeNull();
      expect(s.contracts!.eventContracts).toHaveLength(1);
      expect(s.contracts!.eventContracts[0].eventName).toBe('PaymentSucceeded');
    });
  });

  describe('When saving and loading sessions with integration reports', () => {
    it('round-trips IntegrationReport correctly', () => {
      const integrationReport: IntegrationReport = {
        generatedAt: '2026-02-28T11:00:00Z',
        sourceContracts: ['PaymentSucceeded'],
        overallStatus: 'pass',
        summary: 'All checks pass',
        checks: [
          { name: 'schema-compat', status: 'pass', message: 'All schemas compatible' },
        ],
      };
      const session = makeSession({ integrationReport });
      const sessions = new Map([['ABC123', session]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      const s = loaded.get('ABC123')!;
      expect(s.integrationReport).not.toBeNull();
      expect(s.integrationReport!.overallStatus).toBe('pass');
      expect(s.integrationReport!.checks).toHaveLength(1);
    });
  });

  describe('When saving and loading multiple sessions', () => {
    it('preserves all sessions with their individual data', () => {
      const s1 = makeSession({ code: 'AAA111' });
      const s2 = makeSession({
        code: 'BBB222',
        participants: new Map([['p-2', makeParticipant({ id: 'p-2', name: 'Bob' })]]),
      });
      const sessions = new Map([['AAA111', s1], ['BBB222', s2]]);

      persistence.save(sessions);
      const loaded = persistence.load();

      expect(loaded.size).toBe(2);
      expect(loaded.get('AAA111')!.code).toBe('AAA111');
      expect(loaded.get('BBB222')!.participants.get('p-2')!.name).toBe('Bob');
    });
  });

  describe('When saving creates nested directories', () => {
    it('creates missing parent directories automatically', () => {
      const nestedPath = path.join(tmpDir, 'nested', 'deep', 'sessions.json');
      const nestedPersistence = new SessionPersistence(nestedPath);
      const sessions = new Map([['ABC123', makeSession()]]);

      expect(() => nestedPersistence.save(sessions)).not.toThrow();
      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('When saving an empty map', () => {
    it('writes a file that loads back as empty map', () => {
      const sessions = new Map<string, Session>();

      persistence.save(sessions);
      const loaded = persistence.load();

      expect(loaded.size).toBe(0);
    });
  });
});
