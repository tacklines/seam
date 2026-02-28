import type {
  JamArtifacts,
  ConflictResolution,
  OwnershipAssignment,
  UnresolvedItem,
} from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type {
  ResolutionRecorded,
  OwnershipAssigned,
  ItemFlagged,
} from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// AgreementService — jam/agreement operations for the Agreement bounded context
// ---------------------------------------------------------------------------

export class AgreementService {
  private readonly getSession: (code: string) => Session | null;
  private readonly eventStore: EventStore | null;

  constructor(
    getSession: (code: string) => Session | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  startJam(code: string): JamArtifacts | null {
    const session = this.getSession(code);
    if (!session) return null;
    if (session.jam) return session.jam;
    session.jam = {
      startedAt: new Date().toISOString(),
      ownershipMap: [],
      resolutions: [],
      unresolved: [],
    };
    return session.jam;
  }

  resolveConflict(
    code: string,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): ConflictResolution | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;

    // Idempotency: if this overlapLabel has already been resolved, return the existing resolution
    const existing = session.jam.resolutions.find(
      (r) => r.overlapLabel === resolution.overlapLabel
    );
    if (existing) return existing;

    const full: ConflictResolution = {
      ...resolution,
      resolvedAt: new Date().toISOString(),
    };
    session.jam.resolutions.push(full);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ResolutionRecorded',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: full.resolvedAt,
        overlapLabel: full.overlapLabel,
        resolution: full.resolution,
        chosenApproach: full.chosenApproach,
        resolvedBy: full.resolvedBy,
      } satisfies ResolutionRecorded);
    }

    return full;
  }

  assignOwnership(
    code: string,
    assignment: Omit<OwnershipAssignment, 'assignedAt'>
  ): OwnershipAssignment | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    const full: OwnershipAssignment = {
      ...assignment,
      assignedAt: new Date().toISOString(),
    };
    // Replace existing assignment for the same aggregate
    session.jam.ownershipMap = session.jam.ownershipMap.filter(
      (o) => o.aggregate !== full.aggregate
    );
    session.jam.ownershipMap.push(full);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'OwnershipAssigned',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: full.assignedAt,
        aggregate: full.aggregate,
        ownerRole: full.ownerRole,
        assignedBy: full.assignedBy,
      } satisfies OwnershipAssigned);
    }

    return full;
  }

  flagUnresolved(
    code: string,
    item: Omit<UnresolvedItem, 'id' | 'flaggedAt'>
  ): UnresolvedItem | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    const full: UnresolvedItem = {
      ...item,
      id: generateId(),
      flaggedAt: new Date().toISOString(),
    };
    session.jam.unresolved.push(full);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ItemFlagged',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: full.flaggedAt,
        description: full.description,
        flaggedBy: full.flaggedBy,
        ...(full.relatedOverlap !== undefined ? { relatedOverlap: full.relatedOverlap } : {}),
      } satisfies ItemFlagged);
    }

    return full;
  }

  exportJam(code: string): JamArtifacts | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    return session.jam;
  }
}
