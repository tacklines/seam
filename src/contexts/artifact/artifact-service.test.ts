import { describe, it, expect } from 'vitest';
import { ArtifactService } from './artifact-service.js';
import { EventStore } from '../session/event-store.js';
import type { CandidateEventsFile } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeData(role = 'test-role'): CandidateEventsFile {
  return {
    metadata: {
      role,
      scope: 'test',
      goal: 'test goal',
      generated_at: new Date().toISOString(),
      event_count: 1,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'TestEventHappened',
        aggregate: 'TestAggregate',
        trigger: 'test trigger',
        payload: [],
        integration: { direction: 'internal' },
        confidence: 'CONFIRMED',
      },
    ],
    boundary_assumptions: [],
  };
}

const SESSION = 'ABCDEF';
const PARTICIPANT_A = 'participant-a';
const PARTICIPANT_B = 'participant-b';
const FILE_1 = 'events-a.yaml';
const FILE_2 = 'events-b.yaml';

// ---------------------------------------------------------------------------
// submit — first submission
// ---------------------------------------------------------------------------

describe('ArtifactService.submit', () => {
  describe('Given a new session and participant', () => {
    it('When submit is called for the first time, Then version is 1 and previousVersionId is null', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(artifact.version).toBe(1);
      expect(artifact.previousVersionId).toBeNull();
    });

    it('When submit is called for the first time, Then versionId is a non-empty string', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'mcp');
      expect(typeof artifact.versionId).toBe('string');
      expect(artifact.versionId.length).toBeGreaterThan(0);
    });

    it('When submit is called, Then the artifact stores participantId, fileName, and protocol', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'a2a');
      expect(artifact.participantId).toBe(PARTICIPANT_A);
      expect(artifact.fileName).toBe(FILE_1);
      expect(artifact.protocol).toBe('a2a');
    });

    it('When submit is called with changeSummary, Then it is included in the artifact', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web', 'initial upload');
      expect(artifact.changeSummary).toBe('initial upload');
    });

    it('When submit is called without changeSummary, Then changeSummary is undefined', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(artifact.changeSummary).toBeUndefined();
    });
  });

  describe('Given a prior submission exists for same participant+fileName', () => {
    it('When submit is called a second time, Then version is 2', () => {
      const svc = new ArtifactService();
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const v2 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(v2.version).toBe(2);
    });

    it('When submit is called a second time, Then previousVersionId chains to version 1', () => {
      const svc = new ArtifactService();
      const v1 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const v2 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(v2.previousVersionId).toBe(v1.versionId);
    });

    it('When submit is called three times, Then versions are 1, 2, 3 with chained previousVersionIds', () => {
      const svc = new ArtifactService();
      const v1 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const v2 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const v3 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      expect(v2.previousVersionId).toBe(v1.versionId);
      expect(v3.previousVersionId).toBe(v2.versionId);
    });
  });

  describe('Given different files for the same participant', () => {
    it('When each file is submitted, Then version chains are independent', () => {
      const svc = new ArtifactService();
      const f1v1 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const f2v1 = svc.submit(SESSION, PARTICIPANT_A, FILE_2, makeData(), 'web');
      const f1v2 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(f1v1.version).toBe(1);
      expect(f2v1.version).toBe(1);
      expect(f1v2.version).toBe(2);
      expect(f2v1.previousVersionId).toBeNull();
    });
  });

  describe('Given different participants submitting the same fileName', () => {
    it('When each participant submits, Then version chains are independent', () => {
      const svc = new ArtifactService();
      const pAv1 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const pBv1 = svc.submit(SESSION, PARTICIPANT_B, FILE_1, makeData(), 'web');
      const pAv2 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(pAv1.version).toBe(1);
      expect(pBv1.version).toBe(1);
      expect(pAv2.version).toBe(2);
      expect(pBv1.previousVersionId).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getVersionHistory
// ---------------------------------------------------------------------------

describe('ArtifactService.getVersionHistory', () => {
  describe('Given multiple submissions for the same participant+fileName', () => {
    it('When getVersionHistory is called, Then it returns all versions in submission order', () => {
      const svc = new ArtifactService();
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const history = svc.getVersionHistory(SESSION, PARTICIPANT_A, FILE_1);
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });
  });

  describe('Given no submissions', () => {
    it('When getVersionHistory is called, Then it returns an empty array', () => {
      const svc = new ArtifactService();
      const history = svc.getVersionHistory(SESSION, PARTICIPANT_A, FILE_1);
      expect(history).toEqual([]);
    });
  });

  describe('Given submissions for a different participant', () => {
    it('When getVersionHistory is called for participant A, Then it excludes participant B artifacts', () => {
      const svc = new ArtifactService();
      svc.submit(SESSION, PARTICIPANT_B, FILE_1, makeData(), 'web');
      const history = svc.getVersionHistory(SESSION, PARTICIPANT_A, FILE_1);
      expect(history).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// getLatestVersion
// ---------------------------------------------------------------------------

describe('ArtifactService.getLatestVersion', () => {
  describe('Given multiple submissions', () => {
    it('When getLatestVersion is called, Then it returns the highest version', () => {
      const svc = new ArtifactService();
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const v3 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const latest = svc.getLatestVersion(SESSION, PARTICIPANT_A, FILE_1);
      expect(latest).not.toBeNull();
      expect(latest!.versionId).toBe(v3.versionId);
      expect(latest!.version).toBe(3);
    });
  });

  describe('Given no submissions', () => {
    it('When getLatestVersion is called, Then it returns null', () => {
      const svc = new ArtifactService();
      expect(svc.getLatestVersion(SESSION, PARTICIPANT_A, FILE_1)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getArtifactsBySession
// ---------------------------------------------------------------------------

describe('ArtifactService.getArtifactsBySession', () => {
  describe('Given multiple participants each with multiple versions', () => {
    it('When getArtifactsBySession is called, Then it returns only the latest version per participant+fileName', () => {
      const svc = new ArtifactService();
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const aLatest = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const bLatest = svc.submit(SESSION, PARTICIPANT_B, FILE_1, makeData(), 'mcp');
      const results = svc.getArtifactsBySession(SESSION);
      expect(results).toHaveLength(2);
      const versionIds = results.map((r) => r.versionId);
      expect(versionIds).toContain(aLatest.versionId);
      expect(versionIds).toContain(bLatest.versionId);
    });
  });

  describe('Given a participant submitting two different files', () => {
    it('When getArtifactsBySession is called, Then each file appears as a separate entry', () => {
      const svc = new ArtifactService();
      const f1 = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const f2 = svc.submit(SESSION, PARTICIPANT_A, FILE_2, makeData(), 'web');
      const results = svc.getArtifactsBySession(SESSION);
      expect(results).toHaveLength(2);
      const versionIds = results.map((r) => r.versionId);
      expect(versionIds).toContain(f1.versionId);
      expect(versionIds).toContain(f2.versionId);
    });
  });

  describe('Given an empty session', () => {
    it('When getArtifactsBySession is called, Then it returns an empty array', () => {
      const svc = new ArtifactService();
      expect(svc.getArtifactsBySession(SESSION)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Domain events — EventStore integration
// ---------------------------------------------------------------------------

describe('ArtifactService domain events', () => {
  describe('Given an EventStore is provided', () => {
    it('When submit is called, Then an ArtifactSubmitted event is emitted', () => {
      const eventStore = new EventStore();
      const svc = new ArtifactService(eventStore);
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      const events = eventStore.getEvents(SESSION);
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event.type).toBe('ArtifactSubmitted');
      expect((event as { participantId: string }).participantId).toBe(PARTICIPANT_A);
      expect((event as { fileName: string }).fileName).toBe(FILE_1);
      expect((event as { version: number }).version).toBe(1);
      expect((event as { artifactId: string }).artifactId).toBe(artifact.versionId);
    });

    it('When submit is called multiple times, Then each call emits a separate event with correct version', () => {
      const eventStore = new EventStore();
      const svc = new ArtifactService(eventStore);
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'mcp');
      const events = eventStore.getEvents(SESSION);
      expect(events).toHaveLength(2);
      expect((events[0] as { version: number }).version).toBe(1);
      expect((events[1] as { version: number }).version).toBe(2);
    });

    it('When submit is called for different participants, Then separate events are emitted', () => {
      const eventStore = new EventStore();
      const svc = new ArtifactService(eventStore);
      svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      svc.submit(SESSION, PARTICIPANT_B, FILE_1, makeData(), 'web');
      const events = eventStore.getEvents(SESSION);
      expect(events).toHaveLength(2);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When submit is called, Then it succeeds without emitting events', () => {
      const svc = new ArtifactService();
      const artifact = svc.submit(SESSION, PARTICIPANT_A, FILE_1, makeData(), 'web');
      expect(artifact.version).toBe(1);
    });
  });
});
