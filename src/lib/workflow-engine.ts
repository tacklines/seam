import { JamArtifacts, ContractBundle, IntegrationReport } from '../schema/types.js';

export type WorkflowPhase = 'lobby' | 'prep' | 'compare' | 'jam' | 'formalize' | 'integrate' | 'done';

export interface PhaseInfo {
  phase: WorkflowPhase;
  label: string;
  description: string;
  isComplete: boolean;
}

export interface WorkflowStatus {
  currentPhase: WorkflowPhase;
  phases: PhaseInfo[];
  artifactInventory: ArtifactInventory;
  nextAction: string;
}

export interface ArtifactInventory {
  participantCount: number;
  submissionCount: number;
  hasJam: boolean;
  resolutionCount: number;
  ownershipCount: number;
  unresolvedCount: number;
  hasContracts: boolean;
  contractCount: number;
  hasIntegrationReport: boolean;
  integrationStatus: string | null;
}

export interface SessionData {
  participantCount: number;
  submissionCount: number;
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
}

const PHASE_METADATA: Record<WorkflowPhase, { label: string; description: string }> = {
  lobby: {
    label: 'Lobby',
    description: 'Waiting for participants to join the session',
  },
  prep: {
    label: 'Prep',
    description: 'Submit your storm-prep findings independently',
  },
  compare: {
    label: 'Compare',
    description: 'Review and compare all submitted findings',
  },
  jam: {
    label: 'Jam',
    description: 'Resolve conflicts and assign aggregate ownership',
  },
  formalize: {
    label: 'Formalize',
    description: 'Generate event contracts from jam decisions',
  },
  integrate: {
    label: 'Integrate',
    description: 'Run integration checks across contracts',
  },
  done: {
    label: 'Done',
    description: 'All integration checks pass — ready to build',
  },
};

const NEXT_ACTIONS: Record<WorkflowPhase, string> = {
  lobby: 'Share the join code and wait for participants',
  prep: 'Each participant should submit their storm-prep YAML',
  compare: 'Review the comparison view to identify overlaps',
  jam: 'Start resolving conflicts in the jam session',
  formalize: 'Generate contracts from the jam session results',
  integrate: 'Review integration check results',
  done: 'All checks pass! Export contracts and start building',
};

const PHASE_ORDER: WorkflowPhase[] = [
  'lobby',
  'prep',
  'compare',
  'jam',
  'formalize',
  'integrate',
  'done',
];

export function buildArtifactInventory(session: SessionData): ArtifactInventory {
  const { participantCount, submissionCount, jam, contracts, integrationReport } = session;

  return {
    participantCount,
    submissionCount,
    hasJam: jam !== null,
    resolutionCount: jam?.resolutions.length ?? 0,
    ownershipCount: jam?.ownershipMap.length ?? 0,
    unresolvedCount: jam?.unresolved.length ?? 0,
    hasContracts: contracts !== null,
    contractCount: contracts?.eventContracts.length ?? 0,
    hasIntegrationReport: integrationReport !== null,
    integrationStatus: integrationReport?.overallStatus ?? null,
  };
}

export function inferPhase(inventory: ArtifactInventory): WorkflowPhase {
  if (inventory.integrationStatus === 'pass') {
    return 'done';
  }
  if (inventory.hasIntegrationReport) {
    return 'integrate';
  }
  if (inventory.hasContracts) {
    return 'formalize';
  }
  if (inventory.hasJam) {
    return 'jam';
  }
  if (inventory.submissionCount >= 2) {
    return 'compare';
  }
  if (inventory.submissionCount >= 1) {
    return 'prep';
  }
  return 'lobby';
}

function buildPhaseInfo(phase: WorkflowPhase, currentPhase: WorkflowPhase, inventory: ArtifactInventory): PhaseInfo {
  const meta = PHASE_METADATA[phase];
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  let isComplete: boolean;

  if (phase === 'done') {
    // done is the terminal state — mark it complete only if we're actually in it
    isComplete = currentPhase === 'done';
  } else if (phaseIndex < currentIndex) {
    // A phase before the current phase is always complete
    isComplete = true;
  } else {
    // Use explicit completion conditions for the current/future phases
    switch (phase) {
      case 'lobby':
        isComplete = inventory.submissionCount >= 1;
        break;
      case 'prep':
        isComplete = inventory.submissionCount >= 2;
        break;
      case 'compare':
        isComplete = inventory.hasJam;
        break;
      case 'jam':
        isComplete = inventory.hasContracts;
        break;
      case 'formalize':
        isComplete = inventory.hasIntegrationReport;
        break;
      case 'integrate':
        isComplete = inventory.integrationStatus === 'pass';
        break;
      default:
        isComplete = false;
    }
  }

  return {
    phase,
    label: meta.label,
    description: meta.description,
    isComplete,
  };
}

export function computeWorkflowStatus(session: SessionData): WorkflowStatus {
  const artifactInventory = buildArtifactInventory(session);
  const currentPhase = inferPhase(artifactInventory);

  const phases = PHASE_ORDER.map((phase) =>
    buildPhaseInfo(phase, currentPhase, artifactInventory)
  );

  return {
    currentPhase,
    phases,
    artifactInventory,
    nextAction: NEXT_ACTIONS[currentPhase],
  };
}

export interface PhaseTransition {
  from: WorkflowPhase;
  to: WorkflowPhase;
  fromLabel: string;
  toLabel: string;
}

export function detectPhaseTransition(
  before: SessionData,
  after: SessionData
): PhaseTransition | null {
  const beforeInventory = buildArtifactInventory(before);
  const afterInventory = buildArtifactInventory(after);
  const beforePhase = inferPhase(beforeInventory);
  const afterPhase = inferPhase(afterInventory);

  if (beforePhase === afterPhase) return null;

  return {
    from: beforePhase,
    to: afterPhase,
    fromLabel: PHASE_METADATA[beforePhase].label,
    toLabel: PHASE_METADATA[afterPhase].label,
  };
}

export function sessionToSessionData(session: {
  participants: Map<string, unknown>;
  submissions: unknown[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
}): SessionData {
  return {
    participantCount: session.participants.size,
    submissionCount: session.submissions.length,
    jam: session.jam,
    contracts: session.contracts,
    integrationReport: session.integrationReport,
  };
}
