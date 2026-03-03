import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { WorkflowStatus } from '../lib/workflow-engine.js';

// Register the component
import '../components/shared/phase-ribbon.js';

const meta: Meta = {
  title: 'Shared/PhaseRibbon',
  tags: ['autodocs'],
  render: (args) => html`
    <div style="border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;">
      <phase-ribbon
        .status=${args.status as WorkflowStatus | undefined}
        @phase-navigate=${(e: CustomEvent) => console.log('phase-navigate', e.detail)}
      ></phase-ribbon>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** No status provided — all phases render dimmed (initial state before data loads). */
export const NoStatus: Story = {
  name: 'No Status (loading)',
  args: {
    status: undefined,
  },
};

/** Spark: lobby phase, no submissions yet. */
export const SparkPhase: Story = {
  name: 'Spark (lobby)',
  args: {
    status: {
      currentPhase: 'lobby',
      phases: [],
      artifactInventory: {
        participantCount: 1,
        submissionCount: 0,
        hasJam: false,
        resolutionCount: 0,
        ownershipCount: 0,
        unresolvedCount: 0,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Share the join code and wait for participants',
    } satisfies WorkflowStatus,
  },
};

/** Explore: prep phase, one submission. Spark is complete. */
export const ExplorePhase: Story = {
  name: 'Explore (one submission)',
  args: {
    status: {
      currentPhase: 'prep',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 1,
        hasJam: false,
        resolutionCount: 0,
        ownershipCount: 0,
        unresolvedCount: 0,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Each participant should submit their perspective file',
    } satisfies WorkflowStatus,
  },
};

/** Rank: prep phase, two or more submissions. Spark + Explore complete. */
export const RankPhase: Story = {
  name: 'Rank (multiple submissions)',
  args: {
    status: {
      currentPhase: 'prep',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: false,
        resolutionCount: 0,
        ownershipCount: 0,
        unresolvedCount: 0,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Each participant should submit their perspective file',
    } satisfies WorkflowStatus,
  },
};

/** Slice: compare phase, 2+ submissions, no jam yet. */
export const SlicePhase: Story = {
  name: 'Slice (compare phase)',
  args: {
    status: {
      currentPhase: 'compare',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: false,
        resolutionCount: 0,
        ownershipCount: 0,
        unresolvedCount: 0,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Review the comparison view to identify overlaps',
    } satisfies WorkflowStatus,
  },
};

/** Agree: jam phase, resolving conflicts. */
export const AgreePhase: Story = {
  name: 'Agree (jam phase)',
  args: {
    status: {
      currentPhase: 'jam',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 3,
        ownershipCount: 2,
        unresolvedCount: 1,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Start resolving conflicts in the jam session',
    } satisfies WorkflowStatus,
  },
};

/** Build: formalize phase, contracts generated. */
export const BuildPhase: Story = {
  name: 'Build (formalize phase)',
  args: {
    status: {
      currentPhase: 'formalize',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 5,
        ownershipCount: 4,
        unresolvedCount: 0,
        hasContracts: true,
        contractCount: 8,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Generate contracts from the jam session results',
    } satisfies WorkflowStatus,
  },
};

/** Ship: integrate phase, integration report loaded. */
export const ShipPhase: Story = {
  name: 'Ship (integrate phase)',
  args: {
    status: {
      currentPhase: 'integrate',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 5,
        ownershipCount: 4,
        unresolvedCount: 0,
        hasContracts: true,
        contractCount: 8,
        hasIntegrationReport: true,
        integrationStatus: 'pass',
      },
      nextAction: 'Review integration check results',
    } satisfies WorkflowStatus,
  },
};

/** All complete: done phase, integration passes. */
export const AllComplete: Story = {
  name: 'All Complete (done)',
  args: {
    status: {
      currentPhase: 'done',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 5,
        ownershipCount: 4,
        unresolvedCount: 0,
        hasContracts: true,
        contractCount: 8,
        hasIntegrationReport: true,
        integrationStatus: 'pass',
      },
      nextAction: 'All checks pass! Export contracts and start building',
    } satisfies WorkflowStatus,
  },
};
