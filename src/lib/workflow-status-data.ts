import type { AppState } from '../state/app-state.js';
import type { Overlap } from './comparison.js';
import type { JamArtifacts, UnresolvedItem, ContractBundle } from '../schema/types.js';
import { computeWorkflowStatus } from './workflow-engine.js';
import { deriveContractsData } from './contract-data.js';
import { deriveIntegrationData, buildIntegrationReport } from './integration-data.js';

/**
 * Derive a WorkflowStatus from the loaded files and available artifacts.
 * Jam, contracts, and integration report are derived from existing state
 * so the phase ribbon and suggestion bar can progress past early phases.
 * Pure derivation — no side effects.
 */
export function deriveWorkflowStatus(
  files: AppState['files'],
  overlaps: Overlap[],
  conflicts: Overlap[],
  sharedEvents: Overlap[],
  flaggedItems: UnresolvedItem[],
) {
  // Derive jam artifacts from overlaps and flagged items
  const jam: JamArtifacts | null = overlaps.length > 0
    ? {
        startedAt: new Date().toISOString(),
        ownershipMap: [],
        resolutions: overlaps
          .filter(o => o.roles.length >= 2)
          .map(o => ({
            overlapLabel: o.label,
            resolution: `Shared by ${o.roles.join(', ')}`,
            chosenApproach: 'merge' as const,
            resolvedBy: o.roles,
            resolvedAt: new Date().toISOString(),
          })),
        unresolved: flaggedItems,
      }
    : null;

  // Derive contracts from the current bundle
  const contractsData = deriveContractsData(files, sharedEvents);
  const contracts: ContractBundle | null =
    contractsData.bundle.eventContracts.length > 0 ? contractsData.bundle : null;

  // Derive integration report from integration data
  const integrationData = deriveIntegrationData(files, conflicts, sharedEvents);
  const integrationReport = buildIntegrationReport(
    integrationData,
    contractsData.bundle.eventContracts.map(ec => ec.eventName),
  );

  return computeWorkflowStatus({
    participantCount: files.length,
    submissionCount: files.length,
    jam,
    contracts,
    integrationReport,
  });
}
