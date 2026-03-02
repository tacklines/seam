import { type WorkflowStatus } from './workflow-engine.js';
import { t } from './i18n.js';

export interface SuggestionContext {
  sessionCode: string;
  participantNames?: string[];
}

/**
 * Optional CTA attached to a suggestion. When present, the suggestion bar
 * renders an action button that navigates the user to the relevant panel.
 */
export interface SuggestionAction {
  label: string;
  /** Tab panel name to navigate to (e.g., 'comparison', 'priority') */
  navigateTo?: string;
}

/**
 * A contextual suggestion shown in the suggestion bar.
 * `text` is always present; `action` is optional and drives a CTA button.
 */
export interface Suggestion {
  text: string;
  /** Optional CTA. When present, the suggestion bar shows a button. */
  action?: SuggestionAction;
}

/**
 * Transform a WorkflowStatus into a contextual Suggestion for the
 * suggestion bar UI.
 *
 * The function maps both the engine phase and sub-state within a phase
 * (via artifactInventory) to the most actionable, context-specific suggestion.
 * It uses session-specific details (code, counts) rather than generic phrases.
 *
 * See: docs/experience-design.md — suggestion bar mapping table
 */
export function formatSuggestion(status: WorkflowStatus, context: SuggestionContext): Suggestion {
  const { currentPhase, artifactInventory } = status;
  const { sessionCode } = context;
  const {
    participantCount,
    submissionCount,
    unresolvedCount,
    hasIntegrationReport,
    integrationStatus,
  } = artifactInventory;

  switch (currentPhase) {
    case 'lobby': {
      if (participantCount === 0) {
        return { text: `Share code ${sessionCode} with your team to get started` };
      }
      // Participants joined but no submissions yet
      return { text: `Everyone's here. Each person submits their domain events independently` };
    }

    case 'prep': {
      if (submissionCount === 0) {
        return { text: `Share code ${sessionCode} with your team to get started` };
      }
      if (submissionCount === 1) {
        return { text: `Waiting for other participants. Meanwhile, check your completeness score in the sidebar` };
      }
      // 2+ submissions still in prep (shouldn't happen per inferPhase, but handle gracefully)
      return {
        text: `${submissionCount} perspectives submitted. The Conflicts tab shows where they overlap`,
        action: { label: t('suggestion.cta.viewConflicts'), navigateTo: 'comparison' },
      };
    }

    case 'compare': {
      return {
        text: `${submissionCount} perspectives submitted. The Conflicts tab shows where they overlap`,
        action: { label: t('suggestion.cta.viewConflicts'), navigateTo: 'comparison' },
      };
    }

    case 'jam': {
      if (unresolvedCount > 0) {
        return { text: `${unresolvedCount} conflict${unresolvedCount === 1 ? '' : 's'} found. Start with the highest-priority ones` };
      }
      // All conflicts resolved
      return {
        text: `All conflicts resolved. Ready to formalize into contracts`,
        action: { label: t('suggestion.cta.viewContracts'), navigateTo: 'contracts' },
      };
    }

    case 'formalize': {
      if (!hasIntegrationReport) {
        return { text: `Building against contracts. Run an integration check when ready` };
      }
      // Integration report exists but we're still in formalize (shouldn't normally occur)
      return { text: `Building against contracts. Run an integration check when ready` };
    }

    case 'integrate': {
      if (integrationStatus === 'fail') {
        return { text: `Integration checks failed. Review the errors and fix before shipping` };
      }
      if (integrationStatus === 'warn') {
        return { text: `Integration checks passed with warnings. Review before shipping` };
      }
      return { text: `Integration checks running. Review results in the integration panel` };
    }

    case 'done': {
      return {
        text: `All systems go. Ship it.`,
        action: { label: t('suggestion.cta.viewIntegration'), navigateTo: 'integration' },
      };
    }

    default: {
      // Exhaustive check — TypeScript will flag unhandled cases at compile time
      const _exhaustive: never = currentPhase;
      return _exhaustive;
    }
  }
}
