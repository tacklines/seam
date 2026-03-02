import { describe, it, expect } from 'vitest';
import { detectMilestones } from './milestone-detector.js';
import type { MilestoneState } from './milestone-detector.js';

/** Baseline state: empty session, nothing happened */
const emptyState: MilestoneState = {
  artifactCount: 0,
  participantCount: 2,
  submittedCount: 0,
  unresolvedConflicts: 0,
  integrationStatus: 'pending',
};

describe('detectMilestones', () => {
  // ─── firstArtifact ─────────────────────────────────────────────────────────

  describe('firstArtifact', () => {
    it('fires when artifactCount goes from 0 to 1', () => {
      const prev = { ...emptyState, artifactCount: 0 };
      const curr = { ...emptyState, artifactCount: 1 };
      expect(detectMilestones(prev, curr)).toContain('firstArtifact');
    });

    it('fires when artifactCount goes from 0 to more than 1', () => {
      const prev = { ...emptyState, artifactCount: 0 };
      const curr = { ...emptyState, artifactCount: 3 };
      expect(detectMilestones(prev, curr)).toContain('firstArtifact');
    });

    it('does not fire when already had artifacts', () => {
      const prev = { ...emptyState, artifactCount: 1 };
      const curr = { ...emptyState, artifactCount: 2 };
      expect(detectMilestones(prev, curr)).not.toContain('firstArtifact');
    });

    it('does not fire when count stays at 0', () => {
      const prev = { ...emptyState, artifactCount: 0 };
      const curr = { ...emptyState, artifactCount: 0 };
      expect(detectMilestones(prev, curr)).not.toContain('firstArtifact');
    });
  });

  // ─── allSubmitted ──────────────────────────────────────────────────────────

  describe('allSubmitted', () => {
    it('fires when submitted count reaches participantCount', () => {
      const prev = { ...emptyState, participantCount: 3, submittedCount: 2 };
      const curr = { ...emptyState, participantCount: 3, submittedCount: 3 };
      expect(detectMilestones(prev, curr)).toContain('allSubmitted');
    });

    it('fires when both counts are equal and previously were not', () => {
      const prev = { ...emptyState, participantCount: 2, submittedCount: 0 };
      const curr = { ...emptyState, participantCount: 2, submittedCount: 2 };
      expect(detectMilestones(prev, curr)).toContain('allSubmitted');
    });

    it('does not fire when already fully submitted', () => {
      const prev = { ...emptyState, participantCount: 2, submittedCount: 2 };
      const curr = { ...emptyState, participantCount: 2, submittedCount: 2 };
      expect(detectMilestones(prev, curr)).not.toContain('allSubmitted');
    });

    it('does not fire when there are no participants', () => {
      const prev = { ...emptyState, participantCount: 0, submittedCount: 0 };
      const curr = { ...emptyState, participantCount: 0, submittedCount: 0 };
      expect(detectMilestones(prev, curr)).not.toContain('allSubmitted');
    });

    it('does not fire when partial submission only', () => {
      const prev = { ...emptyState, participantCount: 3, submittedCount: 1 };
      const curr = { ...emptyState, participantCount: 3, submittedCount: 2 };
      expect(detectMilestones(prev, curr)).not.toContain('allSubmitted');
    });
  });

  // ─── allResolved ───────────────────────────────────────────────────────────

  describe('allResolved', () => {
    it('fires when unresolvedConflicts drops from >0 to 0', () => {
      const prev = { ...emptyState, unresolvedConflicts: 3 };
      const curr = { ...emptyState, unresolvedConflicts: 0 };
      expect(detectMilestones(prev, curr)).toContain('allResolved');
    });

    it('fires when last conflict is resolved (1 → 0)', () => {
      const prev = { ...emptyState, unresolvedConflicts: 1 };
      const curr = { ...emptyState, unresolvedConflicts: 0 };
      expect(detectMilestones(prev, curr)).toContain('allResolved');
    });

    it('does not fire when starting at 0 (fresh session)', () => {
      const prev = { ...emptyState, unresolvedConflicts: 0 };
      const curr = { ...emptyState, unresolvedConflicts: 0 };
      expect(detectMilestones(prev, curr)).not.toContain('allResolved');
    });

    it('does not fire when conflicts only decrease but not to 0', () => {
      const prev = { ...emptyState, unresolvedConflicts: 5 };
      const curr = { ...emptyState, unresolvedConflicts: 2 };
      expect(detectMilestones(prev, curr)).not.toContain('allResolved');
    });

    it('does not fire when conflicts increase', () => {
      const prev = { ...emptyState, unresolvedConflicts: 0 };
      const curr = { ...emptyState, unresolvedConflicts: 2 };
      expect(detectMilestones(prev, curr)).not.toContain('allResolved');
    });
  });

  // ─── integrationGo ─────────────────────────────────────────────────────────

  describe('integrationGo', () => {
    it('fires when status transitions to "go"', () => {
      const prev = { ...emptyState, integrationStatus: 'pending' };
      const curr = { ...emptyState, integrationStatus: 'go' };
      expect(detectMilestones(prev, curr)).toContain('integrationGo');
    });

    it('fires when status transitions from "no-go" to "go"', () => {
      const prev = { ...emptyState, integrationStatus: 'no-go' };
      const curr = { ...emptyState, integrationStatus: 'go' };
      expect(detectMilestones(prev, curr)).toContain('integrationGo');
    });

    it('does not fire when already "go"', () => {
      const prev = { ...emptyState, integrationStatus: 'go' };
      const curr = { ...emptyState, integrationStatus: 'go' };
      expect(detectMilestones(prev, curr)).not.toContain('integrationGo');
    });

    it('does not fire when status stays non-go', () => {
      const prev = { ...emptyState, integrationStatus: 'pending' };
      const curr = { ...emptyState, integrationStatus: 'no-go' };
      expect(detectMilestones(prev, curr)).not.toContain('integrationGo');
    });
  });

  // ─── multiple milestones at once ───────────────────────────────────────────

  describe('multiple milestones', () => {
    it('returns multiple milestones when several conditions are crossed at once', () => {
      const prev: MilestoneState = {
        artifactCount: 0,
        participantCount: 2,
        submittedCount: 0,
        unresolvedConflicts: 0,
        integrationStatus: 'pending',
      };
      const curr: MilestoneState = {
        artifactCount: 2,
        participantCount: 2,
        submittedCount: 2,
        unresolvedConflicts: 0,
        integrationStatus: 'go',
      };
      const result = detectMilestones(prev, curr);
      expect(result).toContain('firstArtifact');
      expect(result).toContain('allSubmitted');
      expect(result).toContain('integrationGo');
      // allResolved does NOT fire because prev.unresolvedConflicts === 0
      expect(result).not.toContain('allResolved');
    });

    it('does not fire any milestone when nothing changes', () => {
      const state: MilestoneState = {
        artifactCount: 2,
        participantCount: 3,
        submittedCount: 1,
        unresolvedConflicts: 2,
        integrationStatus: 'pending',
      };
      expect(detectMilestones(state, { ...state })).toHaveLength(0);
    });
  });
});
