import { describe, it, expect } from 'vitest';
import { formatSuggestion, type SuggestionContext } from './format-suggestion.js';
import { type WorkflowStatus, type ArtifactInventory } from './workflow-engine.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeInventory(overrides: Partial<ArtifactInventory> = {}): ArtifactInventory {
  return {
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
    ...overrides,
  };
}

function makeStatus(
  currentPhase: WorkflowStatus['currentPhase'],
  inventoryOverrides: Partial<ArtifactInventory> = {}
): WorkflowStatus {
  return {
    currentPhase,
    phases: [],
    artifactInventory: makeInventory(inventoryOverrides),
    nextAction: '',
  };
}

const defaultContext: SuggestionContext = {
  sessionCode: 'ABC123',
};

// ─── Lobby phase ──────────────────────────────────────────────────────────────

describe('formatSuggestion — lobby phase', () => {
  it('includes session code when no participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toContain('ABC123');
    expect(result.text).toContain('Share');
  });

  it('tells team to share the code when zero participants', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/share code ABC123/i);
  });

  it('acknowledges participants when they have joined but no submissions exist', () => {
    const status = makeStatus('lobby', { participantCount: 3, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/everyone.?s here/i);
    expect(result.text).toContain('domain events');
  });

  it('does not include session code when participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 2, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).not.toContain('ABC123');
  });

  it('works with an empty session code when no participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const ctx: SuggestionContext = { sessionCode: '' };
    const result = formatSuggestion(status, ctx);
    // Should still produce a Suggestion with non-empty text
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('works with a single participant who has joined', () => {
    const status = makeStatus('lobby', { participantCount: 1, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/everyone.?s here/i);
  });

  it('returns no action for lobby phase', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeUndefined();
  });
});

// ─── Prep phase ───────────────────────────────────────────────────────────────

describe('formatSuggestion — prep phase', () => {
  it('tells others to wait and check completeness when one submission exists', () => {
    const status = makeStatus('prep', { submissionCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/waiting for other participants/i);
    expect(result.text).toMatch(/completeness/i);
  });

  it('does not include session code for single-submission state', () => {
    const status = makeStatus('prep', { submissionCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).not.toContain('ABC123');
  });

  it('returns a View Conflicts action when 2+ submissions exist in prep', () => {
    const status = makeStatus('prep', { submissionCount: 2 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeDefined();
    expect(result.action?.navigateTo).toBe('comparison');
  });
});

// ─── Compare phase ────────────────────────────────────────────────────────────

describe('formatSuggestion — compare phase', () => {
  it('shows submission count and mentions Conflicts tab', () => {
    const status = makeStatus('compare', { submissionCount: 3 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toContain('3');
    expect(result.text).toMatch(/conflicts/i);
  });

  it('works with exactly two submissions', () => {
    const status = makeStatus('compare', { submissionCount: 2 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toContain('2');
    expect(result.text).toMatch(/perspectives/i);
  });

  it('returns a View Conflicts action navigating to comparison panel', () => {
    const status = makeStatus('compare', { submissionCount: 3 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeDefined();
    expect(result.action?.navigateTo).toBe('comparison');
    expect(result.action?.label).toMatch(/conflicts/i);
  });
});

// ─── Jam phase ────────────────────────────────────────────────────────────────

describe('formatSuggestion — jam phase', () => {
  it('includes unresolved count when conflicts remain', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 5 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toContain('5');
    expect(result.text).toMatch(/conflict/i);
    expect(result.text).toMatch(/highest-priority/i);
  });

  it('uses singular "conflict" when unresolvedCount is 1', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/1 conflict found/i);
    // Must not say "conflicts" (plural)
    expect(result.text).not.toMatch(/1 conflicts/i);
  });

  it('uses plural "conflicts" when unresolvedCount is > 1', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 4 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/4 conflicts found/i);
  });

  it('signals ready-to-formalize when all conflicts are resolved', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/all conflicts resolved/i);
    expect(result.text).toMatch(/formalize/i);
  });

  it('returns no action when conflicts remain', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 3 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeUndefined();
  });

  it('returns a View Contracts action when all conflicts are resolved', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeDefined();
    expect(result.action?.navigateTo).toBe('contracts');
    expect(result.action?.label).toMatch(/contracts/i);
  });
});

// ─── Formalize phase ──────────────────────────────────────────────────────────

describe('formatSuggestion — formalize phase', () => {
  it('prompts to run an integration check when contracts are loaded', () => {
    const status = makeStatus('formalize', { hasContracts: true });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/integration check/i);
  });

  it('mentions building against contracts', () => {
    const status = makeStatus('formalize', { hasContracts: true });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/contracts/i);
  });
});

// ─── Integrate phase ──────────────────────────────────────────────────────────

describe('formatSuggestion — integrate phase', () => {
  it('reports failure message when integration status is fail', () => {
    const status = makeStatus('integrate', {
      hasIntegrationReport: true,
      integrationStatus: 'fail',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/failed/i);
  });

  it('reports warnings when integration status is warn', () => {
    const status = makeStatus('integrate', {
      hasIntegrationReport: true,
      integrationStatus: 'warn',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/warn/i);
  });
});

// ─── Done phase ───────────────────────────────────────────────────────────────

describe('formatSuggestion — done phase', () => {
  it('returns the "all systems go" message when integration passes', () => {
    const status = makeStatus('done', {
      hasIntegrationReport: true,
      integrationStatus: 'pass',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result.text).toMatch(/all systems go/i);
    expect(result.text).toMatch(/ship/i);
  });

  it('returns a View Integration action navigating to integration panel', () => {
    const status = makeStatus('done', {
      hasIntegrationReport: true,
      integrationStatus: 'pass',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result.action).toBeDefined();
    expect(result.action?.navigateTo).toBe('integration');
    expect(result.action?.label).toMatch(/integration/i);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('formatSuggestion — edge cases', () => {
  it('handles zero participants in lobby gracefully', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const ctx: SuggestionContext = { sessionCode: 'XYZ' };
    const result = formatSuggestion(status, ctx);
    expect(result.text).toContain('XYZ');
  });

  it('accepts optional participantNames without error', () => {
    const status = makeStatus('lobby', { participantCount: 2 });
    const ctx: SuggestionContext = {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    };
    const result = formatSuggestion(status, ctx);
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('returns a non-empty text string for every phase', () => {
    const phases: WorkflowStatus['currentPhase'][] = [
      'lobby',
      'prep',
      'compare',
      'jam',
      'formalize',
      'integrate',
      'done',
    ];
    for (const phase of phases) {
      const status = makeStatus(phase, {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        unresolvedCount: 0,
        hasContracts: true,
        hasIntegrationReport: true,
        integrationStatus: phase === 'done' ? 'pass' : 'fail',
      });
      const result = formatSuggestion(status, defaultContext);
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    }
  });

  it('returns a Suggestion object (not a string) for every phase', () => {
    const phases: WorkflowStatus['currentPhase'][] = [
      'lobby',
      'prep',
      'compare',
      'jam',
      'formalize',
      'integrate',
      'done',
    ];
    for (const phase of phases) {
      const status = makeStatus(phase, {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        unresolvedCount: 0,
        hasContracts: true,
        hasIntegrationReport: true,
        integrationStatus: 'pass',
      });
      const result = formatSuggestion(status, defaultContext);
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('text');
    }
  });
});
