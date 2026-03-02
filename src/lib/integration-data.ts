import type { AppState } from '../state/app-state.js';
import type { Overlap } from './comparison.js';
import type { IntegrationCheck, BoundaryNode, BoundaryConnection } from '../components/visualization/integration-dashboard.js';
import type { ComplianceDetail } from '../components/artifact/compliance-badge.js';
import type { IntegrationReport } from '../schema/types.js';

export type { IntegrationCheck, BoundaryNode, BoundaryConnection };

/**
 * Derive integration dashboard data (checks, nodes, connections, verdict, counts)
 * from loaded files and comparison data.
 * Pure derivation — no side effects.
 */
export function deriveIntegrationData(
  files: AppState['files'],
  conflicts: Overlap[],
  sharedEvents: Overlap[],
): {
  checks: IntegrationCheck[];
  nodes: BoundaryNode[];
  connections: BoundaryConnection[];
  verdict: 'go' | 'no-go' | 'caution';
  verdictSummary: string;
  contractCount: number;
  aggregateCount: number;
} {
  if (files.length === 0) {
    return {
      checks: [],
      nodes: [],
      connections: [],
      verdict: 'go',
      verdictSummary: '',
      contractCount: 0,
      aggregateCount: 0,
    };
  }

  // Build a set of event names that have conflicts
  const conflictEventNames = new Set<string>(conflicts.map((c) => c.label));

  const checks: IntegrationCheck[] = [];

  // For each conflict (assumption-conflict), create a 'fail' check
  for (const conflict of conflicts) {
    checks.push({
      id: `conflict-${conflict.label}`,
      label: conflict.label,
      description: `Conflicting boundary assumptions between roles: ${conflict.roles.join(', ')}`,
      status: 'fail',
      details: conflict.details,
      owner: conflict.roles[0],
    });
  }

  // For each shared event with no conflict, create a 'pass' check
  for (const shared of sharedEvents) {
    if (!conflictEventNames.has(shared.label)) {
      checks.push({
        id: `shared-${shared.label}`,
        label: shared.label,
        description: `Shared event across roles: ${shared.roles.join(', ')}`,
        status: 'pass',
        details: shared.details,
        owner: shared.roles[0],
      });
    }
  }

  // For boundary assumptions of type 'contract' (integration points needing verification), create 'warn' checks
  for (const file of files) {
    for (const assumption of file.data.boundary_assumptions) {
      if (assumption.type === 'contract') {
        checks.push({
          id: `assumption-${assumption.id}`,
          label: assumption.id,
          description: assumption.statement,
          status: 'warn',
          details: assumption.verify_with ? `Verify with: ${assumption.verify_with}` : undefined,
          owner: file.role,
        });
      }
    }
  }

  // Build BoundaryNodes: one per unique aggregate across all files
  const aggregateSet = new Set<string>();
  for (const file of files) {
    for (const ev of file.data.domain_events) {
      aggregateSet.add(ev.aggregate);
    }
  }
  const nodes: BoundaryNode[] = [...aggregateSet].map((agg) => ({
    id: agg.toLowerCase().replace(/\s+/g, '-'),
    label: agg,
  }));

  // Build BoundaryConnections: one per shared event between aggregates
  // The 'from' aggregate is the event's primary aggregate; 'to' is the aggregate
  // of the same event in the other file(s) when they differ, or the role's aggregate
  const connections: BoundaryConnection[] = [];
  const seenConnectionKeys = new Set<string>();
  for (const shared of sharedEvents) {
    const eventName = shared.label;
    // Find aggregates from different files for this event
    const aggregatesForEvent: string[] = [];
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        if (ev.name === eventName) {
          aggregatesForEvent.push(ev.aggregate);
          break;
        }
      }
    }
    // Create connections between distinct aggregates
    for (let i = 0; i < aggregatesForEvent.length - 1; i++) {
      const fromAgg = aggregatesForEvent[i].toLowerCase().replace(/\s+/g, '-');
      const toAgg = aggregatesForEvent[i + 1].toLowerCase().replace(/\s+/g, '-');
      if (fromAgg === toAgg) continue;
      const key = `${fromAgg}->${toAgg}`;
      if (seenConnectionKeys.has(key)) continue;
      seenConnectionKeys.add(key);
      const hasConflict = conflictEventNames.has(eventName);
      connections.push({
        from: fromAgg,
        to: toAgg,
        status: hasConflict ? 'fail' : 'pass',
        label: eventName,
      });
    }
  }

  // Determine verdict
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const verdict: 'go' | 'no-go' | 'caution' = failCount > 0 ? 'no-go' : warnCount > 0 ? 'caution' : 'go';

  // Build human-readable summary
  const parts: string[] = [];
  if (failCount > 0) parts.push(`${failCount} conflict${failCount !== 1 ? 's' : ''}`);
  if (warnCount > 0) parts.push(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`);
  if (passCount > 0) parts.push(`${passCount} passing`);
  const verdictSummary = parts.length > 0 ? parts.join(', ') : 'No checks';

  return {
    checks,
    nodes,
    connections,
    verdict,
    verdictSummary,
    contractCount: sharedEvents.length,
    aggregateCount: aggregateSet.size,
  };
}

/**
 * Build an IntegrationReport from integration check data and contract names.
 * Returns null when there are no checks.
 * Pure derivation — no side effects.
 */
export function buildIntegrationReport(
  integrationData: { checks: IntegrationCheck[]; verdictSummary: string },
  sourceContracts: string[],
): IntegrationReport | null {
  if (integrationData.checks.length === 0) return null;
  return {
    generatedAt: new Date().toISOString(),
    sourceContracts,
    checks: integrationData.checks.map(c => ({
      name: c.label,
      status: c.status,
      message: c.description,
      details: c.details,
    })),
    overallStatus: integrationData.checks.every(c => c.status === 'pass')
      ? 'pass'
      : integrationData.checks.some(c => c.status === 'fail')
        ? 'fail'
        : 'warn',
    summary: integrationData.verdictSummary,
  };
}

/**
 * Derive compliance status for the header compliance badge.
 * Pure derivation — no side effects.
 */
export function deriveComplianceStatus(
  files: AppState['files'],
  conflicts: Overlap[],
  conflictCount: number,
): { status: 'pass' | 'warn' | 'fail'; details: ComplianceDetail[] } {
  if (files.length < 2) {
    return { status: 'pass', details: [] };
  }
  if (conflictCount === 0) {
    return { status: 'pass', details: [] };
  }
  const details: ComplianceDetail[] = conflicts.map((conflict) => ({
    eventName: conflict.label,
    owner: conflict.roles.join(', '),
    issue: conflict.details,
    severity: 'warning' as const,
  }));
  const status = conflictCount > 3 ? 'fail' : 'warn';
  return { status, details };
}
