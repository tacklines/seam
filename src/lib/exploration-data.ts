import type { AppState } from '../state/app-state.js';
import { computeSessionStatus } from './prep-completeness.js';
import type { ExplorationGap, ExplorationPrompt, ExplorationPattern } from '../components/artifact/exploration-guide.js';

export type { ExplorationGap, ExplorationPrompt, ExplorationPattern };

/**
 * Derive exploration data (completeness, gaps, prompts, patterns) from the
 * loaded files for the exploration-guide sidebar component.
 * Pure derivation — no side effects.
 */
export function deriveExplorationData(files: AppState['files']): {
  score: number;
  gaps: ExplorationGap[];
  prompts: ExplorationPrompt[];
  patterns: ExplorationPattern[];
} {
  if (files.length === 0) {
    return { score: 0, gaps: [], prompts: [], patterns: [] };
  }

  const sessionStatus = computeSessionStatus(files);
  const { overallScore, sessionGaps, aggregateCoverage } = sessionStatus;

  // Map gap strings to ExplorationGap objects with action hints
  const gaps: ExplorationGap[] = sessionGaps.map((msg): ExplorationGap => {
    let action = 'Review';
    if (msg.includes('No domain events')) {
      action = 'Add events';
    } else if (msg.includes('No boundary assumptions')) {
      action = 'Add assumptions';
    } else if (msg.includes('inbound') || msg.includes('outbound') || msg.includes('internal')) {
      action = 'Add event';
    } else if (msg.includes('Only one aggregate')) {
      action = 'Broaden scope';
    } else if (msg.includes('POSSIBLE')) {
      action = 'Review confidence';
    } else if (msg.includes('1 participant') || msg.includes('Only 1')) {
      action = 'Invite participant';
    }
    return { message: msg, action };
  });

  // Also include per-file gaps, deduplicating across files
  const perFileGapMessages = new Set<string>(sessionGaps);
  for (const fileEntry of sessionStatus.perFile) {
    for (const gapMsg of fileEntry.status.gaps) {
      if (!perFileGapMessages.has(gapMsg)) {
        perFileGapMessages.add(gapMsg);
        let action = 'Review';
        if (gapMsg.includes('No domain events')) {
          action = 'Add events';
        } else if (gapMsg.includes('No boundary assumptions')) {
          action = 'Add assumptions';
        } else if (gapMsg.includes('Missing') && (gapMsg.includes('inbound') || gapMsg.includes('outbound') || gapMsg.includes('internal'))) {
          action = 'Add event';
        } else if (gapMsg.includes('Only one aggregate')) {
          action = 'Broaden scope';
        } else if (gapMsg.includes('POSSIBLE')) {
          action = 'Review confidence';
        }
        gaps.push({ message: gapMsg, action, aggregate: fileEntry.role });
      }
    }
  }

  // Derive heuristic prompts from aggregates and event landscape
  const prompts: ExplorationPrompt[] = [];

  for (const agg of aggregateCoverage.slice(0, 3)) {
    prompts.push({
      question: `What happens when ${agg} fails to process?`,
      type: 'event',
    });
  }

  prompts.push({
    question: 'What timeout or retry scenarios should be captured as events?',
    type: 'event',
  });

  prompts.push({
    question: 'Are there audit or compliance events that must be recorded?',
    type: 'assumption',
  });

  // Pick a prominent event name from any file for the "who needs to know" prompt
  const firstEvent = files[0]?.data.domain_events[0];
  if (firstEvent) {
    prompts.push({
      question: `Who needs to know when ${firstEvent.name} happens?`,
      type: 'assumption',
    });
  }

  // Derive pattern suggestions from detected aggregates (max 3)
  const patterns: ExplorationPattern[] = [];
  const aggSet = new Set(aggregateCoverage.map((a) => a.toLowerCase()));

  if ((aggSet.has('order') || aggSet.has('payment')) && patterns.length < 3) {
    patterns.push({
      description: 'Saga/Compensation: coordinate multi-step transactions with rollback events',
      events: ['OrderCancelled', 'PaymentRefunded'],
    });
  }

  if ((aggSet.has('user') || aggSet.has('account')) && patterns.length < 3) {
    patterns.push({
      description: 'Identity Lifecycle: track account state transitions and security events',
      events: ['AccountLocked', 'PasswordReset'],
    });
  }

  if (aggregateCoverage.length > 0 && patterns.length < 3) {
    const agg = aggregateCoverage[0];
    patterns.push({
      description: `Audit Trail: record every significant change to ${agg} for compliance and debugging`,
      events: [`${agg}Changed`, `${agg}Archived`],
    });
  }

  return { score: overallScore, gaps, prompts, patterns };
}
