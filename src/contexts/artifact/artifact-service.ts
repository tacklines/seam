import type { CandidateEventsFile } from '../../schema/types.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type { ArtifactSubmitted } from '../session/domain-events.js';
import type { SubmissionProtocol } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// VersionedArtifact — immutable artifact record with version chaining
// ---------------------------------------------------------------------------

export interface VersionedArtifact {
  versionId: string;              // unique ID for this version
  previousVersionId: string | null;  // null for first submission
  participantId: string;
  fileName: string;
  data: CandidateEventsFile;
  submittedAt: string;
  protocol: SubmissionProtocol;
  changeSummary?: string;         // optional description of what changed
  version: number;                // sequential version number (1, 2, 3...)
}

// ---------------------------------------------------------------------------
// ArtifactService — artifact management bounded context
// ---------------------------------------------------------------------------

export class ArtifactService {
  // sessionCode -> flat list of all VersionedArtifacts (all versions, all participants)
  private readonly store = new Map<string, VersionedArtifact[]>();
  private readonly eventStore: EventStore | null;

  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore ?? null;
  }

  /**
   * Submit a new artifact version.
   * If a prior submission exists for the same participant+fileName, chains as a new version.
   * Emits an ArtifactSubmitted domain event if an EventStore is configured.
   */
  submit(
    sessionCode: string,
    participantId: string,
    fileName: string,
    data: CandidateEventsFile,
    protocol: SubmissionProtocol,
    changeSummary?: string
  ): VersionedArtifact {
    const existing = this.getVersionHistory(sessionCode, participantId, fileName);
    const previousVersion = existing.length > 0 ? existing[existing.length - 1] : null;

    const artifact: VersionedArtifact = {
      versionId: generateId(),
      previousVersionId: previousVersion?.versionId ?? null,
      participantId,
      fileName,
      data,
      submittedAt: new Date().toISOString(),
      protocol,
      version: existing.length + 1,
      ...(changeSummary !== undefined ? { changeSummary } : {}),
    };

    if (!this.store.has(sessionCode)) {
      this.store.set(sessionCode, []);
    }
    this.store.get(sessionCode)!.push(artifact);

    if (this.eventStore) {
      this.eventStore.append(sessionCode, {
        type: 'ArtifactSubmitted',
        eventId: generateId(),
        sessionCode,
        timestamp: artifact.submittedAt,
        artifactId: artifact.versionId,
        participantId,
        fileName,
        artifactType: 'candidate-events',
        version: artifact.version,
      } satisfies ArtifactSubmitted);
    }

    return artifact;
  }

  /**
   * Return all versions for a given participant+fileName combination, in submission order.
   */
  getVersionHistory(
    sessionCode: string,
    participantId: string,
    fileName: string
  ): VersionedArtifact[] {
    const all = this.store.get(sessionCode) ?? [];
    return all.filter(
      (a) => a.participantId === participantId && a.fileName === fileName
    );
  }

  /**
   * Return the most recent version for a given participant+fileName, or null if none.
   */
  getLatestVersion(
    sessionCode: string,
    participantId: string,
    fileName: string
  ): VersionedArtifact | null {
    const history = this.getVersionHistory(sessionCode, participantId, fileName);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Return the latest version of each unique participant+fileName pair for a session.
   */
  getArtifactsBySession(sessionCode: string): VersionedArtifact[] {
    const all = this.store.get(sessionCode) ?? [];
    // Build a map keyed by "participantId::fileName" to keep only the latest
    const latestMap = new Map<string, VersionedArtifact>();
    for (const artifact of all) {
      const key = `${artifact.participantId}::${artifact.fileName}`;
      latestMap.set(key, artifact);
    }
    return Array.from(latestMap.values());
  }
}
