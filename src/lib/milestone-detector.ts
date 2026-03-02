/**
 * Milestone Detector — pure function that compares two session state snapshots
 * and returns which milestones were crossed during that transition.
 *
 * Each milestone fires only when the condition TRANSITIONS from false → true.
 * If the condition was already true in the previous state, it does not re-fire.
 */

export interface MilestoneState {
  /** Number of submitted artifacts in the session */
  artifactCount: number;
  /** Total number of participants in the session */
  participantCount: number;
  /** Number of participants who have submitted an artifact */
  submittedCount: number;
  /** Number of conflicts that are still unresolved */
  unresolvedConflicts: number;
  /** Integration check status, e.g. 'go', 'no-go', 'pending' */
  integrationStatus: string;
}

export type MilestoneKey =
  | 'firstArtifact'
  | 'allSubmitted'
  | 'allResolved'
  | 'integrationGo';

/**
 * Compare two state snapshots and return the list of newly-triggered milestones.
 *
 * Order matters for the caller: milestones are returned in the order they are
 * checked, which is also the order they should be displayed.
 */
export function detectMilestones(
  prev: MilestoneState,
  current: MilestoneState,
): MilestoneKey[] {
  const triggered: MilestoneKey[] = [];

  // First artifact: transitions from 0 artifacts to at least 1
  if (prev.artifactCount === 0 && current.artifactCount >= 1) {
    triggered.push('firstArtifact');
  }

  // All submitted: all participants have submitted (requires at least 1 participant)
  const allSubmittedNow =
    current.participantCount > 0 &&
    current.submittedCount >= current.participantCount;
  const allSubmittedBefore =
    prev.participantCount > 0 &&
    prev.submittedCount >= prev.participantCount;
  if (!allSubmittedBefore && allSubmittedNow) {
    triggered.push('allSubmitted');
  }

  // All conflicts resolved: transitions from >0 unresolved to 0
  // Only fires if there were conflicts to resolve (prev > 0 guards against spurious
  // firing on a fresh session that starts with 0 conflicts).
  if (prev.unresolvedConflicts > 0 && current.unresolvedConflicts === 0) {
    triggered.push('allResolved');
  }

  // Integration go: status transitions to 'go'
  if (prev.integrationStatus !== 'go' && current.integrationStatus === 'go') {
    triggered.push('integrationGo');
  }

  return triggered;
}
