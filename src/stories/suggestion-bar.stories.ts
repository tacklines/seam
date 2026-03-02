import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { WorkflowStatus } from '../lib/workflow-engine.js';
import type { SuggestionContext } from '../lib/format-suggestion.js';

// Register the component
import '../components/shared/suggestion-bar.js';

const meta: Meta = {
  title: 'Shared/SuggestionBar',
  tags: ['autodocs'],
  render: (args) => html`
    <div style="border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; max-width: 800px;">
      <div style="background: #f9fafb; padding: 1rem; height: 120px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 0.875rem;">
        Main content area
      </div>
      <suggestion-bar
        .status=${args.status as WorkflowStatus | undefined}
        .context=${args.context as SuggestionContext | undefined}
        @suggestion-dismissed=${() => console.log('suggestion-dismissed')}
      ></suggestion-bar>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** Lobby: no participants yet. Suggestion prompts sharing the session code. */
export const LobbyNoParticipants: Story = {
  name: 'Lobby — No participants',
  args: {
    context: {
      sessionCode: 'ABC123',
    } satisfies SuggestionContext,
    status: {
      currentPhase: 'lobby',
      phases: [],
      artifactInventory: {
        participantCount: 0,
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

/** Lobby: participants joined. Suggestion encourages independent submission. */
export const LobbyWithParticipants: Story = {
  name: 'Lobby — Participants joined',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    } satisfies SuggestionContext,
    status: {
      currentPhase: 'lobby',
      phases: [],
      artifactInventory: {
        participantCount: 2,
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
      nextAction: 'Each participant should submit their storm-prep YAML',
    } satisfies WorkflowStatus,
  },
};

/** Prep: one submission in. Waiting for more participants. */
export const PrepOneSubmission: Story = {
  name: 'Prep — 1 submission',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    } satisfies SuggestionContext,
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
      nextAction: 'Each participant should submit their storm-prep YAML',
    } satisfies WorkflowStatus,
  },
};

/** Compare: multiple submissions, prompts opening the Conflicts tab. */
export const ComparePhase: Story = {
  name: 'Compare — Review conflicts',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob', 'Charlie'],
    } satisfies SuggestionContext,
    status: {
      currentPhase: 'compare',
      phases: [],
      artifactInventory: {
        participantCount: 3,
        submissionCount: 3,
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

/** Jam: unresolved conflicts remain. Prompts starting with highest priority. */
export const JamWithConflicts: Story = {
  name: 'Jam — Unresolved conflicts',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    } satisfies SuggestionContext,
    status: {
      currentPhase: 'jam',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 2,
        ownershipCount: 1,
        unresolvedCount: 3,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Start resolving conflicts in the jam session',
    } satisfies WorkflowStatus,
  },
};

/** Jam: all conflicts resolved. Prompts moving to formalize. */
export const JamAllResolved: Story = {
  name: 'Jam — All resolved',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    } satisfies SuggestionContext,
    status: {
      currentPhase: 'jam',
      phases: [],
      artifactInventory: {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        resolutionCount: 5,
        ownershipCount: 4,
        unresolvedCount: 0,
        hasContracts: false,
        contractCount: 0,
        hasIntegrationReport: false,
        integrationStatus: null,
      },
      nextAction: 'Generate contracts from the jam session results',
    } satisfies WorkflowStatus,
  },
};

/** Done: integration passes. Ship it. */
export const Done: Story = {
  name: 'Done — All systems go',
  args: {
    context: {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    } satisfies SuggestionContext,
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

/** No status provided — bar renders nothing (loading or before session). */
export const NoStatus: Story = {
  name: 'No status (renders nothing)',
  args: {
    status: undefined,
    context: undefined,
  },
};
