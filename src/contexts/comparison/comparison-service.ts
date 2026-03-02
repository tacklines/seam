import type { LoadedFile } from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import { compareFiles } from '../../lib/comparison.js';
import type { Overlap } from '../../lib/comparison.js';
import type {
  ComparisonCompleted,
  ConflictsDetected,
  GapsIdentified,
} from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// ComparisonResult — the result stored on the session after a comparison run
// ---------------------------------------------------------------------------

export interface ComparisonResult {
  comparisonId: string;
  ranAt: string;
  artifactIds: string[];
  overlaps: Overlap[];
  gapDescriptions: string[];
}

// ---------------------------------------------------------------------------
// Gap detection — events that appear in only one role are potential gaps
// ---------------------------------------------------------------------------

function detectGaps(files: LoadedFile[]): string[] {
  if (files.length < 2) return [];

  // Collect each event name grouped by the roles that mention it
  const eventRoles = new Map<string, Set<string>>();
  for (const file of files) {
    for (const event of file.data.domain_events) {
      const set = eventRoles.get(event.name) ?? new Set<string>();
      set.add(file.role);
      eventRoles.set(event.name, set);
    }
  }

  // An event is a gap if it appears in exactly one role
  const gaps: string[] = [];
  for (const [name, roles] of eventRoles) {
    if (roles.size === 1) {
      const [role] = [...roles];
      gaps.push(`Event "${name}" is only mentioned by role "${role}" — potential coverage gap`);
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// ComparisonService — event-sourced wrapper around comparison pure functions
// ---------------------------------------------------------------------------

export class ComparisonService {
  private readonly getSession: (code: string) => Session | null;
  private readonly eventStore: EventStore | null;

  // In-memory store of comparison history per session code
  private readonly history = new Map<string, ComparisonResult[]>();

  constructor(
    getSession: (code: string) => Session | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  /**
   * Run a comparison across all submitted artifacts in the session.
   * Emits ComparisonCompleted, ConflictsDetected (if conflicts found),
   * and GapsIdentified (if gaps found).
   * Returns the comparison result, or null if the session is not found.
   */
  runComparison(code: string): ComparisonResult | null {
    const session = this.getSession(code);
    if (!session) return null;

    const files: LoadedFile[] = session.submissions.map((sub) => ({
      filename: sub.fileName,
      role: session.participants.get(sub.participantId)?.name ?? 'unknown',
      data: sub.data,
    }));

    const overlaps = compareFiles(files);
    const gapDescriptions = detectGaps(files);

    const comparisonId = generateId();
    const timestamp = new Date().toISOString();
    const artifactIds = session.submissions.map((sub) => sub.participantId);

    const result: ComparisonResult = {
      comparisonId,
      ranAt: timestamp,
      artifactIds,
      overlaps,
      gapDescriptions,
    };

    // Persist to history
    if (!this.history.has(code)) {
      this.history.set(code, []);
    }
    this.history.get(code)!.push(result);

    // Emit domain events
    if (this.eventStore) {
      this.eventStore.append(code, {
        type: 'ComparisonCompleted',
        eventId: generateId(),
        sessionCode: code,
        timestamp,
        comparisonId,
        artifactIds,
        overlapCount: overlaps.length,
        gapCount: gapDescriptions.length,
      } satisfies ComparisonCompleted);

      if (overlaps.length > 0) {
        this.eventStore.append(code, {
          type: 'ConflictsDetected',
          eventId: generateId(),
          sessionCode: code,
          timestamp,
          comparisonId,
          conflicts: overlaps.map((o) => ({
            label: o.label,
            description: o.details,
          })),
        } satisfies ConflictsDetected);
      }

      if (gapDescriptions.length > 0) {
        this.eventStore.append(code, {
          type: 'GapsIdentified',
          eventId: generateId(),
          sessionCode: code,
          timestamp,
          comparisonId,
          gaps: gapDescriptions.map((description) => ({ description })),
        } satisfies GapsIdentified);
      }
    }

    return result;
  }

  /**
   * Return the latest comparison result for the session, or null if none has been run.
   */
  queryComparison(code: string): ComparisonResult | null {
    const history = this.history.get(code);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Return all past comparison results for the session in chronological order.
   * Returns an empty array if no comparisons have been run.
   */
  getComparisonHistory(code: string): ComparisonResult[] {
    return [...(this.history.get(code) ?? [])];
  }
}
