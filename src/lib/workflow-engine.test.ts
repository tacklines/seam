import { describe, it, expect } from 'vitest';
import {
  buildArtifactInventory,
  inferPhase,
  computeWorkflowStatus,
  detectPhaseTransition,
  sessionToSessionData,
  type ArtifactInventory,
  type SessionData,
} from './workflow-engine.js';
import type { JamArtifacts, ContractBundle, IntegrationReport } from '../schema/types.js';

// Helpers to build test fixtures

function makeJam(overrides: Partial<JamArtifacts> = {}): JamArtifacts {
  return {
    startedAt: '2026-01-01T00:00:00Z',
    ownershipMap: [],
    resolutions: [],
    unresolved: [],
    ...overrides,
  };
}

function makeContracts(overrides: Partial<ContractBundle> = {}): ContractBundle {
  return {
    generatedAt: '2026-01-01T00:00:00Z',
    eventContracts: [],
    boundaryContracts: [],
    ...overrides,
  };
}

function makeIntegrationReport(
  overallStatus: IntegrationReport['overallStatus'],
  overrides: Partial<IntegrationReport> = {}
): IntegrationReport {
  return {
    generatedAt: '2026-01-01T00:00:00Z',
    sourceContracts: [],
    checks: [],
    overallStatus,
    summary: `Integration ${overallStatus}`,
    ...overrides,
  };
}

function makeSession(overrides: {
  participantCount?: number;
  submissionCount?: number;
  jam?: JamArtifacts | null;
  contracts?: ContractBundle | null;
  integrationReport?: IntegrationReport | null;
}) {
  return {
    participantCount: overrides.participantCount ?? 1,
    submissionCount: overrides.submissionCount ?? 0,
    jam: overrides.jam ?? null,
    contracts: overrides.contracts ?? null,
    integrationReport: overrides.integrationReport ?? null,
  };
}

// ─── buildArtifactInventory ────────────────────────────────────────────────

describe('buildArtifactInventory', () => {
  it('returns zeros and nulls for a minimal session', () => {
    const inventory = buildArtifactInventory(makeSession({ participantCount: 1 }));
    expect(inventory).toEqual<ArtifactInventory>({
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
    });
  });

  it('counts submissions correctly', () => {
    const inventory = buildArtifactInventory(makeSession({ submissionCount: 3 }));
    expect(inventory.submissionCount).toBe(3);
  });

  it('reflects jam artifact counts', () => {
    const jam = makeJam({
      ownershipMap: [
        { aggregate: 'OrderAggregate', ownerRole: 'backend', assignedBy: 'user1', assignedAt: '2026-01-01T00:00:00Z' },
      ],
      resolutions: [
        {
          overlapLabel: 'overlap-1',
          resolution: 'merged',
          chosenApproach: 'keep both',
          resolvedBy: ['user1'],
          resolvedAt: '2026-01-01T00:00:00Z',
        },
      ],
      unresolved: [
        { id: 'u1', description: 'open question', flaggedBy: 'user2', flaggedAt: '2026-01-01T00:00:00Z' },
      ],
    });

    const inventory = buildArtifactInventory(makeSession({ jam }));
    expect(inventory.hasJam).toBe(true);
    expect(inventory.ownershipCount).toBe(1);
    expect(inventory.resolutionCount).toBe(1);
    expect(inventory.unresolvedCount).toBe(1);
  });

  it('counts event contracts', () => {
    const contracts = makeContracts({
      eventContracts: [
        {
          eventName: 'OrderPlaced',
          aggregate: 'Order',
          version: '1.0',
          schema: {},
          owner: 'backend',
          consumers: ['frontend'],
          producedBy: 'order-service',
        },
      ],
    });
    const inventory = buildArtifactInventory(makeSession({ contracts }));
    expect(inventory.hasContracts).toBe(true);
    expect(inventory.contractCount).toBe(1);
  });

  it('captures integration report status', () => {
    const inventoryFail = buildArtifactInventory(
      makeSession({ integrationReport: makeIntegrationReport('fail') })
    );
    expect(inventoryFail.hasIntegrationReport).toBe(true);
    expect(inventoryFail.integrationStatus).toBe('fail');

    const inventoryPass = buildArtifactInventory(
      makeSession({ integrationReport: makeIntegrationReport('pass') })
    );
    expect(inventoryPass.integrationStatus).toBe('pass');

    const inventoryWarn = buildArtifactInventory(
      makeSession({ integrationReport: makeIntegrationReport('warn') })
    );
    expect(inventoryWarn.integrationStatus).toBe('warn');
  });
});

// ─── inferPhase ───────────────────────────────────────────────────────────

describe('inferPhase', () => {
  function inv(overrides: Partial<ArtifactInventory>): ArtifactInventory {
    return {
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
      ...overrides,
    };
  }

  it('returns lobby when no submissions exist', () => {
    expect(inferPhase(inv({ submissionCount: 0 }))).toBe('lobby');
  });

  it('returns lobby with zero participants', () => {
    expect(inferPhase(inv({ participantCount: 0, submissionCount: 0 }))).toBe('lobby');
  });

  it('returns prep with exactly one submission', () => {
    expect(inferPhase(inv({ submissionCount: 1 }))).toBe('prep');
  });

  it('returns compare with two or more submissions', () => {
    expect(inferPhase(inv({ submissionCount: 2 }))).toBe('compare');
    expect(inferPhase(inv({ submissionCount: 5 }))).toBe('compare');
  });

  it('returns jam when jam exists regardless of submission count', () => {
    expect(inferPhase(inv({ submissionCount: 2, hasJam: true }))).toBe('jam');
    expect(inferPhase(inv({ submissionCount: 0, hasJam: true }))).toBe('jam');
  });

  it('returns formalize when contracts are loaded', () => {
    expect(inferPhase(inv({ hasJam: true, hasContracts: true }))).toBe('formalize');
  });

  it('returns integrate when integration report exists but status is not pass', () => {
    expect(
      inferPhase(inv({ hasContracts: true, hasIntegrationReport: true, integrationStatus: 'fail' }))
    ).toBe('integrate');
    expect(
      inferPhase(inv({ hasContracts: true, hasIntegrationReport: true, integrationStatus: 'warn' }))
    ).toBe('integrate');
  });

  it('returns done when integration report overallStatus is pass', () => {
    expect(
      inferPhase(inv({ hasIntegrationReport: true, integrationStatus: 'pass' }))
    ).toBe('done');
  });

  it('prioritizes done over integrate when status is pass', () => {
    // Even without contracts loaded explicitly, if integrationStatus is pass → done
    expect(
      inferPhase(inv({ hasIntegrationReport: true, integrationStatus: 'pass' }))
    ).toBe('done');
  });
});

// ─── computeWorkflowStatus ────────────────────────────────────────────────

describe('computeWorkflowStatus', () => {
  it('returns lobby status for an empty session', () => {
    const status = computeWorkflowStatus(makeSession({ participantCount: 1, submissionCount: 0 }));
    expect(status.currentPhase).toBe('lobby');
    expect(status.nextAction).toBe('Share the join code and wait for participants');
    expect(status.phases).toHaveLength(7);
  });

  it('returns correct nextAction for each phase', () => {
    expect(
      computeWorkflowStatus(makeSession({ submissionCount: 1 })).nextAction
    ).toBe('Each participant should submit their storm-prep YAML');

    expect(
      computeWorkflowStatus(makeSession({ submissionCount: 2 })).nextAction
    ).toBe('Review the comparison view to identify overlaps');

    expect(
      computeWorkflowStatus(makeSession({ submissionCount: 2, jam: makeJam() })).nextAction
    ).toBe('Start resolving conflicts in the jam session');

    expect(
      computeWorkflowStatus(makeSession({ jam: makeJam(), contracts: makeContracts() })).nextAction
    ).toBe('Generate contracts from the jam session results');

    expect(
      computeWorkflowStatus(
        makeSession({ contracts: makeContracts(), integrationReport: makeIntegrationReport('fail') })
      ).nextAction
    ).toBe('Review integration check results');

    expect(
      computeWorkflowStatus(
        makeSession({ integrationReport: makeIntegrationReport('pass') })
      ).nextAction
    ).toBe('All checks pass! Export contracts and start building');
  });

  it('includes artifactInventory in the result', () => {
    const status = computeWorkflowStatus(makeSession({ submissionCount: 2 }));
    expect(status.artifactInventory.submissionCount).toBe(2);
  });

  // ── Phase completion logic ──────────────────────────────────────────────

  describe('phase completion logic', () => {
    it('lobby phase: complete when submissionCount >= 1', () => {
      const withSub = computeWorkflowStatus(makeSession({ submissionCount: 1 }));
      const lobbyWithSub = withSub.phases.find((p) => p.phase === 'lobby')!;
      expect(lobbyWithSub.isComplete).toBe(true);

      const noSub = computeWorkflowStatus(makeSession({ submissionCount: 0 }));
      const lobbyNoSub = noSub.phases.find((p) => p.phase === 'lobby')!;
      expect(lobbyNoSub.isComplete).toBe(false);
    });

    it('prep phase: complete when submissionCount >= 2', () => {
      const one = computeWorkflowStatus(makeSession({ submissionCount: 1 }));
      expect(one.phases.find((p) => p.phase === 'prep')!.isComplete).toBe(false);

      const two = computeWorkflowStatus(makeSession({ submissionCount: 2 }));
      expect(two.phases.find((p) => p.phase === 'prep')!.isComplete).toBe(true);
    });

    it('compare phase: complete when jam exists', () => {
      const noJam = computeWorkflowStatus(makeSession({ submissionCount: 2 }));
      expect(noJam.phases.find((p) => p.phase === 'compare')!.isComplete).toBe(false);

      const withJam = computeWorkflowStatus(makeSession({ submissionCount: 2, jam: makeJam() }));
      expect(withJam.phases.find((p) => p.phase === 'compare')!.isComplete).toBe(true);
    });

    it('jam phase: complete when contracts exist', () => {
      const noContracts = computeWorkflowStatus(makeSession({ jam: makeJam() }));
      expect(noContracts.phases.find((p) => p.phase === 'jam')!.isComplete).toBe(false);

      const withContracts = computeWorkflowStatus(
        makeSession({ jam: makeJam(), contracts: makeContracts() })
      );
      expect(withContracts.phases.find((p) => p.phase === 'jam')!.isComplete).toBe(true);
    });

    it('formalize phase: complete when integration report exists', () => {
      const noReport = computeWorkflowStatus(
        makeSession({ jam: makeJam(), contracts: makeContracts() })
      );
      expect(noReport.phases.find((p) => p.phase === 'formalize')!.isComplete).toBe(false);

      const withReport = computeWorkflowStatus(
        makeSession({ contracts: makeContracts(), integrationReport: makeIntegrationReport('fail') })
      );
      expect(withReport.phases.find((p) => p.phase === 'formalize')!.isComplete).toBe(true);
    });

    it('integrate phase: complete when overallStatus is pass', () => {
      const failing = computeWorkflowStatus(
        makeSession({ integrationReport: makeIntegrationReport('fail') })
      );
      expect(failing.phases.find((p) => p.phase === 'integrate')!.isComplete).toBe(false);

      const passing = computeWorkflowStatus(
        makeSession({ integrationReport: makeIntegrationReport('pass') })
      );
      expect(passing.phases.find((p) => p.phase === 'integrate')!.isComplete).toBe(true);
    });

    it('done phase: isComplete is true only in done state', () => {
      const notDone = computeWorkflowStatus(makeSession({ submissionCount: 0 }));
      expect(notDone.phases.find((p) => p.phase === 'done')!.isComplete).toBe(false);

      const done = computeWorkflowStatus(
        makeSession({ integrationReport: makeIntegrationReport('pass') })
      );
      expect(done.phases.find((p) => p.phase === 'done')!.isComplete).toBe(true);
    });

    it('phases before currentPhase are always complete', () => {
      // In jam phase: lobby, prep, compare should all be complete
      const jamStatus = computeWorkflowStatus(makeSession({ submissionCount: 2, jam: makeJam() }));
      const beforeJam = jamStatus.phases.filter((p) =>
        ['lobby', 'prep', 'compare'].includes(p.phase)
      );
      for (const p of beforeJam) {
        expect(p.isComplete).toBe(true);
      }
    });
  });

  // ── Phase metadata ──────────────────────────────────────────────────────

  describe('phase metadata', () => {
    it('includes all 7 phases in order', () => {
      const status = computeWorkflowStatus(makeSession({}));
      const phases = status.phases.map((p) => p.phase);
      expect(phases).toEqual(['lobby', 'prep', 'compare', 'jam', 'formalize', 'integrate', 'done']);
    });

    it('provides human-readable labels for all phases', () => {
      const status = computeWorkflowStatus(makeSession({}));
      const labels = Object.fromEntries(status.phases.map((p) => [p.phase, p.label]));
      expect(labels).toEqual({
        lobby: 'Lobby',
        prep: 'Prep',
        compare: 'Compare',
        jam: 'Jam',
        formalize: 'Formalize',
        integrate: 'Integrate',
        done: 'Done',
      });
    });

    it('provides descriptions for all phases', () => {
      const status = computeWorkflowStatus(makeSession({}));
      for (const p of status.phases) {
        expect(p.description.length).toBeGreaterThan(0);
      }
    });
  });
});

// ─── detectPhaseTransition ────────────────────────────────────────────────

describe('detectPhaseTransition', () => {
  it('returns null when before and after are identical', () => {
    const session = makeSession({ participantCount: 1, submissionCount: 0 });
    expect(detectPhaseTransition(session, session)).toBeNull();
  });

  it('returns null when phase does not change', () => {
    const before = makeSession({ submissionCount: 0 });
    const after = makeSession({ submissionCount: 0, participantCount: 2 });
    expect(detectPhaseTransition(before, after)).toBeNull();
  });

  it('detects lobby → prep transition when submissionCount goes from 0 to 1', () => {
    const before = makeSession({ submissionCount: 0 });
    const after = makeSession({ submissionCount: 1 });
    const transition = detectPhaseTransition(before, after);
    expect(transition).not.toBeNull();
    expect(transition!.from).toBe('lobby');
    expect(transition!.to).toBe('prep');
  });

  it('detects prep → compare transition when submissionCount goes from 1 to 2', () => {
    const before = makeSession({ submissionCount: 1 });
    const after = makeSession({ submissionCount: 2 });
    const transition = detectPhaseTransition(before, after);
    expect(transition).not.toBeNull();
    expect(transition!.from).toBe('prep');
    expect(transition!.to).toBe('compare');
  });

  it('detects jam → formalize transition when contracts are added', () => {
    const before = makeSession({ jam: makeJam() });
    const after = makeSession({ jam: makeJam(), contracts: makeContracts() });
    const transition = detectPhaseTransition(before, after);
    expect(transition).not.toBeNull();
    expect(transition!.from).toBe('jam');
    expect(transition!.to).toBe('formalize');
  });

  it('detects formalize → integrate transition when integration report is added', () => {
    const before = makeSession({ contracts: makeContracts() });
    const after = makeSession({ contracts: makeContracts(), integrationReport: makeIntegrationReport('fail') });
    const transition = detectPhaseTransition(before, after);
    expect(transition).not.toBeNull();
    expect(transition!.from).toBe('formalize');
    expect(transition!.to).toBe('integrate');
  });

  it('detects integrate → done transition when integration status becomes pass', () => {
    const before = makeSession({ integrationReport: makeIntegrationReport('fail') });
    const after = makeSession({ integrationReport: makeIntegrationReport('pass') });
    const transition = detectPhaseTransition(before, after);
    expect(transition).not.toBeNull();
    expect(transition!.from).toBe('integrate');
    expect(transition!.to).toBe('done');
  });

  it('includes human-readable labels in the returned transition', () => {
    const before = makeSession({ submissionCount: 0 });
    const after = makeSession({ submissionCount: 1 });
    const transition = detectPhaseTransition(before, after);
    expect(transition!.fromLabel).toBe('Lobby');
    expect(transition!.toLabel).toBe('Prep');
  });
});

// ─── sessionToSessionData ─────────────────────────────────────────────────

describe('sessionToSessionData', () => {
  it('maps participants Map size to participantCount', () => {
    const participants = new Map<string, unknown>([
      ['id1', { id: 'id1', name: 'Alice', joinedAt: '2026-01-01T00:00:00Z' }],
      ['id2', { id: 'id2', name: 'Bob', joinedAt: '2026-01-01T00:00:00Z' }],
    ]);
    const session = {
      participants,
      submissions: [],
      jam: null,
      contracts: null,
      integrationReport: null,
    };
    const data = sessionToSessionData(session);
    expect(data.participantCount).toBe(2);
  });

  it('maps submissions array length to submissionCount', () => {
    const participants = new Map<string, unknown>();
    const session = {
      participants,
      submissions: [{} as never, {} as never, {} as never],
      jam: null,
      contracts: null,
      integrationReport: null,
    };
    const data = sessionToSessionData(session);
    expect(data.submissionCount).toBe(3);
  });

  it('passes through jam, contracts, and integrationReport', () => {
    const jam = makeJam();
    const contracts = makeContracts();
    const integrationReport = makeIntegrationReport('pass');
    const session = {
      participants: new Map<string, unknown>(),
      submissions: [],
      jam,
      contracts,
      integrationReport,
    };
    const data = sessionToSessionData(session);
    expect(data.jam).toBe(jam);
    expect(data.contracts).toBe(contracts);
    expect(data.integrationReport).toBe(integrationReport);
  });

  it('produces a SessionData that correctly infers the phase', () => {
    const participants = new Map<string, unknown>([['id1', {}]]);
    const session = {
      participants,
      submissions: [{} as never, {} as never],
      jam: null,
      contracts: null,
      integrationReport: null,
    };
    const data: SessionData = sessionToSessionData(session);
    expect(data.participantCount).toBe(1);
    expect(data.submissionCount).toBe(2);
    const inventory = buildArtifactInventory(data);
    expect(inferPhase(inventory)).toBe('compare');
  });
});
