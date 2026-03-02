/**
 * Heuristic functions for Phase V-VII MCP tools.
 *
 * All functions are pure (data in, data out) with no DOM or side-effect
 * dependencies. They implement deterministic, testable heuristics — not LLM
 * calls — for suggesting resolutions and running integration checks.
 */

import type {
  JamArtifacts,
  ContractBundle,
  WorkItem,
  IntegrationCheck,
  IntegrationCheckStatus,
} from '../schema/types.js';

// ---------------------------------------------------------------------------
// suggest_resolution heuristic
// ---------------------------------------------------------------------------

export type ResolutionApproach = 'merge' | 'pick-left' | 'split' | 'custom';

export interface ResolutionSuggestion {
  approach: ResolutionApproach;
  resolution: string;
  confidence: number;
  reasoning: string;
}

/**
 * Produce a heuristic resolution suggestion for a given overlap.
 *
 * Rules:
 *   same-name       → merge, confidence 0.8
 *   same-aggregate  → split, confidence 0.6
 *   assumption-conflict → pick-left, confidence 0.5
 *   default         → custom, confidence 0.3
 */
export function suggestResolutionHeuristic(
  overlapKind: string,
  overlapLabel: string
): ResolutionSuggestion {
  switch (overlapKind) {
    case 'same-name':
      return {
        approach: 'merge',
        confidence: 0.8,
        resolution: `Merge duplicate definitions of "${overlapLabel}" into a single canonical event with agreed-upon fields.`,
        reasoning:
          'When the same event name appears in multiple roles, the most likely intent is a shared concept. Merging preserves the name and reconciles payload differences.',
      };

    case 'same-aggregate':
      return {
        approach: 'split',
        confidence: 0.6,
        resolution: `Split "${overlapLabel}" ownership so each role owns a distinct sub-aggregate or bounded context.`,
        reasoning:
          'An aggregate claimed by multiple roles suggests overlapping responsibility. Splitting clarifies ownership and reduces coupling.',
      };

    case 'assumption-conflict':
      return {
        approach: 'pick-left',
        confidence: 0.5,
        resolution: `Adopt the assumption stated by the first role for "${overlapLabel}" and document the alternative for later review.`,
        reasoning:
          'Assumption conflicts are hard to resolve without more context. Defaulting to the first role\'s view (pick-left) ensures progress while flagging the disagreement for follow-up.',
      };

    default:
      return {
        approach: 'custom',
        confidence: 0.3,
        resolution: `Review "${overlapLabel}" manually — no automatic suggestion applies to this overlap type ("${overlapKind}").`,
        reasoning:
          'No heuristic rule matched this overlap kind. Manual review by participants is recommended.',
      };
  }
}

// ---------------------------------------------------------------------------
// run_integration_checks heuristic
// ---------------------------------------------------------------------------

export interface IntegrationCheckInput {
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  workItems: WorkItem[];
  /** All unique aggregate names referenced in submissions */
  allAggregates: string[];
  /** All unique event names referenced in submissions */
  allEventNames: string[];
}

export interface HeuristicIntegrationCheck extends IntegrationCheck {
  severity: 'error' | 'warn' | 'info';
}

/**
 * Run heuristic integration checks against the current session state.
 *
 * Checks:
 *   1. All aggregates have owners (in jam ownershipMap)
 *   2. All conflicts resolved (no unresolved items in jam)
 *   3. Contract coverage >80% of events
 *   4. Work items exist (at least 1)
 */
export function runIntegrationChecks(
  input: IntegrationCheckInput
): HeuristicIntegrationCheck[] {
  const checks: HeuristicIntegrationCheck[] = [];

  // Check 1: All aggregates have owners
  {
    const assignedAggregates = new Set(
      input.jam?.ownershipMap.map((o) => o.aggregate) ?? []
    );
    const unowned = input.allAggregates.filter(
      (agg) => !assignedAggregates.has(agg)
    );

    if (input.allAggregates.length === 0) {
      checks.push({
        name: 'aggregate-ownership',
        status: 'warn',
        message: 'No aggregates found in session submissions',
        severity: 'warn',
      });
    } else if (unowned.length === 0) {
      checks.push({
        name: 'aggregate-ownership',
        status: 'pass',
        message: `All ${input.allAggregates.length} aggregate(s) have ownership assignments`,
        severity: 'info',
      });
    } else {
      checks.push({
        name: 'aggregate-ownership',
        status: 'fail',
        message: `${unowned.length} aggregate(s) have no ownership assignment: ${unowned.join(', ')}`,
        details: 'Run assign_ownership for each unowned aggregate before shipping',
        severity: 'error',
      });
    }
  }

  // Check 2: All conflicts resolved (no unresolved items)
  {
    const unresolvedCount = input.jam?.unresolved.length ?? 0;

    if (!input.jam) {
      checks.push({
        name: 'conflicts-resolved',
        status: 'warn',
        message: 'Jam session not started — conflict resolution status unknown',
        severity: 'warn',
      });
    } else if (unresolvedCount === 0) {
      checks.push({
        name: 'conflicts-resolved',
        status: 'pass',
        message: 'No unresolved items in jam session',
        severity: 'info',
      });
    } else {
      checks.push({
        name: 'conflicts-resolved',
        status: 'fail',
        message: `${unresolvedCount} unresolved item(s) remain in the jam session`,
        details: 'Resolve or remove all flagged items before shipping',
        severity: 'error',
      });
    }
  }

  // Check 3: Contract coverage >80%
  {
    if (!input.contracts || input.contracts.eventContracts.length === 0) {
      checks.push({
        name: 'contract-coverage',
        status: 'warn',
        message: 'No contracts loaded — coverage cannot be computed',
        severity: 'warn',
      });
    } else {
      const contractedNames = new Set(
        input.contracts.eventContracts.map((ec) => ec.eventName)
      );
      const totalEvents = input.allEventNames.length;
      const coveredEvents =
        totalEvents === 0
          ? 0
          : input.allEventNames.filter((n) => contractedNames.has(n)).length;
      const coverage = totalEvents === 0 ? 0 : coveredEvents / totalEvents;
      const pct = Math.round(coverage * 100);

      if (coverage >= 0.8) {
        checks.push({
          name: 'contract-coverage',
          status: 'pass',
          message: `Contract coverage is ${pct}% (${coveredEvents}/${totalEvents} events)`,
          severity: 'info',
        });
      } else {
        checks.push({
          name: 'contract-coverage',
          status: 'fail',
          message: `Contract coverage is only ${pct}% (${coveredEvents}/${totalEvents} events) — threshold is 80%`,
          details: 'Load contracts that cover more events, or generate contracts from agreements',
          severity: 'error',
        });
      }
    }
  }

  // Check 4: Work items exist
  {
    if (input.workItems.length === 0) {
      checks.push({
        name: 'work-items-exist',
        status: 'fail',
        message: 'No work items have been created — decomposition is required before shipping',
        details: 'Create at least one work item using the decomposition tools',
        severity: 'error',
      });
    } else {
      checks.push({
        name: 'work-items-exist',
        status: 'pass',
        message: `${input.workItems.length} work item(s) exist`,
        severity: 'info',
      });
    }
  }

  return checks;
}

/**
 * Derive an overall integration status from a set of checks.
 * fail if any check fails, warn if any warn, pass otherwise.
 */
export function deriveOverallStatus(
  checks: IntegrationCheck[]
): IntegrationCheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}
