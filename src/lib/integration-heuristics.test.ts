import { describe, it, expect } from 'vitest';
import {
  suggestResolutionHeuristic,
  runIntegrationChecks,
  deriveOverallStatus,
  type IntegrationCheckInput,
} from './integration-heuristics.js';

// ---------------------------------------------------------------------------
// suggestResolutionHeuristic
// ---------------------------------------------------------------------------

describe('suggestResolutionHeuristic', () => {
  describe('Given a same-name overlap', () => {
    it('Then returns merge approach with confidence 0.8', () => {
      const result = suggestResolutionHeuristic('same-name', 'OrderPlaced');
      expect(result.approach).toBe('merge');
      expect(result.confidence).toBe(0.8);
      expect(result.resolution).toContain('OrderPlaced');
      expect(result.reasoning).toBeTruthy();
    });
  });

  describe('Given a same-aggregate overlap', () => {
    it('Then returns split approach with confidence 0.6', () => {
      const result = suggestResolutionHeuristic('same-aggregate', 'OrderAggregate');
      expect(result.approach).toBe('split');
      expect(result.confidence).toBe(0.6);
      expect(result.resolution).toContain('OrderAggregate');
      expect(result.reasoning).toBeTruthy();
    });
  });

  describe('Given an assumption-conflict overlap', () => {
    it('Then returns pick-left approach with confidence 0.5', () => {
      const result = suggestResolutionHeuristic('assumption-conflict', 'PaymentOwnership');
      expect(result.approach).toBe('pick-left');
      expect(result.confidence).toBe(0.5);
      expect(result.resolution).toContain('PaymentOwnership');
      expect(result.reasoning).toBeTruthy();
    });
  });

  describe('Given an unknown overlap kind', () => {
    it('Then returns custom approach with confidence 0.3', () => {
      const result = suggestResolutionHeuristic('unknown-kind', 'SomeLabel');
      expect(result.approach).toBe('custom');
      expect(result.confidence).toBe(0.3);
      expect(result.resolution).toContain('SomeLabel');
      expect(result.reasoning).toBeTruthy();
    });

    it('Then includes the unknown kind in the resolution text', () => {
      const result = suggestResolutionHeuristic('my-exotic-kind', 'Label');
      expect(result.resolution).toContain('my-exotic-kind');
    });
  });
});

// ---------------------------------------------------------------------------
// runIntegrationChecks
// ---------------------------------------------------------------------------

const baseInput: IntegrationCheckInput = {
  jam: null,
  contracts: null,
  workItems: [],
  allAggregates: [],
  allEventNames: [],
};

describe('runIntegrationChecks', () => {
  describe('Check 1: aggregate-ownership', () => {
    it('Passes when all aggregates are owned', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        jam: {
          startedAt: '2024-01-01T00:00:00Z',
          ownershipMap: [
            { aggregate: 'Order', ownerRole: 'backend', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00Z' },
          ],
          resolutions: [],
          unresolved: [],
        },
        allAggregates: ['Order'],
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'aggregate-ownership');
      expect(check?.status).toBe('pass');
    });

    it('Fails when some aggregates are unowned', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        jam: {
          startedAt: '2024-01-01T00:00:00Z',
          ownershipMap: [],
          resolutions: [],
          unresolved: [],
        },
        allAggregates: ['Order', 'Payment'],
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'aggregate-ownership');
      expect(check?.status).toBe('fail');
      expect(check?.message).toContain('Order');
      expect(check?.severity).toBe('error');
    });

    it('Warns when no aggregates exist', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        allAggregates: [],
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'aggregate-ownership');
      expect(check?.status).toBe('warn');
    });
  });

  describe('Check 2: conflicts-resolved', () => {
    it('Warns when jam not started', () => {
      const checks = runIntegrationChecks({ ...baseInput, jam: null });
      const check = checks.find((c) => c.name === 'conflicts-resolved');
      expect(check?.status).toBe('warn');
    });

    it('Passes when jam has no unresolved items', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        jam: {
          startedAt: '2024-01-01T00:00:00Z',
          ownershipMap: [],
          resolutions: [],
          unresolved: [],
        },
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'conflicts-resolved');
      expect(check?.status).toBe('pass');
    });

    it('Fails when jam has unresolved items', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        jam: {
          startedAt: '2024-01-01T00:00:00Z',
          ownershipMap: [],
          resolutions: [],
          unresolved: [
            { id: '1', description: 'Open question', flaggedBy: 'Alice', flaggedAt: '2024-01-01T00:00:00Z' },
          ],
        },
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'conflicts-resolved');
      expect(check?.status).toBe('fail');
      expect(check?.severity).toBe('error');
    });
  });

  describe('Check 3: contract-coverage', () => {
    it('Warns when no contracts loaded', () => {
      const checks = runIntegrationChecks({ ...baseInput, contracts: null });
      const check = checks.find((c) => c.name === 'contract-coverage');
      expect(check?.status).toBe('warn');
    });

    it('Passes when coverage is >= 80%', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        contracts: {
          generatedAt: '2024-01-01T00:00:00Z',
          eventContracts: [
            { eventName: 'A', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
            { eventName: 'B', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
            { eventName: 'C', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
            { eventName: 'D', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
            { eventName: 'E', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
          ],
          boundaryContracts: [],
        },
        allEventNames: ['A', 'B', 'C', 'D', 'E'], // 100% coverage
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'contract-coverage');
      expect(check?.status).toBe('pass');
    });

    it('Fails when coverage is below 80%', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        contracts: {
          generatedAt: '2024-01-01T00:00:00Z',
          eventContracts: [
            { eventName: 'A', aggregate: 'X', version: '1', schema: {}, owner: 'r', consumers: [], producedBy: 'r' },
          ],
          boundaryContracts: [],
        },
        allEventNames: ['A', 'B', 'C', 'D', 'E'], // 20% coverage
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'contract-coverage');
      expect(check?.status).toBe('fail');
      expect(check?.severity).toBe('error');
    });
  });

  describe('Check 4: work-items-exist', () => {
    it('Fails when no work items exist', () => {
      const checks = runIntegrationChecks({ ...baseInput, workItems: [] });
      const check = checks.find((c) => c.name === 'work-items-exist');
      expect(check?.status).toBe('fail');
      expect(check?.severity).toBe('error');
    });

    it('Passes when at least one work item exists', () => {
      const input: IntegrationCheckInput = {
        ...baseInput,
        workItems: [
          {
            id: '1',
            title: 'Build order flow',
            description: 'Implement the order placement flow',
            acceptanceCriteria: ['Order is created'],
            complexity: 'M',
            linkedEvents: ['OrderPlaced'],
            dependencies: [],
          },
        ],
      };
      const checks = runIntegrationChecks(input);
      const check = checks.find((c) => c.name === 'work-items-exist');
      expect(check?.status).toBe('pass');
    });
  });

  describe('All checks present', () => {
    it('Returns exactly 4 checks', () => {
      const checks = runIntegrationChecks(baseInput);
      expect(checks).toHaveLength(4);
    });

    it('Each check has name, status, message, and severity', () => {
      const checks = runIntegrationChecks(baseInput);
      for (const check of checks) {
        expect(check.name).toBeTruthy();
        expect(check.status).toBeTruthy();
        expect(check.message).toBeTruthy();
        expect(check.severity).toBeTruthy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// deriveOverallStatus
// ---------------------------------------------------------------------------

describe('deriveOverallStatus', () => {
  it('Returns pass when all checks pass', () => {
    const checks = [
      { name: 'a', status: 'pass' as const, message: '', severity: 'info' as const },
      { name: 'b', status: 'pass' as const, message: '', severity: 'info' as const },
    ];
    expect(deriveOverallStatus(checks)).toBe('pass');
  });

  it('Returns warn when any check warns', () => {
    const checks = [
      { name: 'a', status: 'pass' as const, message: '', severity: 'info' as const },
      { name: 'b', status: 'warn' as const, message: '', severity: 'warn' as const },
    ];
    expect(deriveOverallStatus(checks)).toBe('warn');
  });

  it('Returns fail when any check fails', () => {
    const checks = [
      { name: 'a', status: 'warn' as const, message: '', severity: 'warn' as const },
      { name: 'b', status: 'fail' as const, message: '', severity: 'error' as const },
    ];
    expect(deriveOverallStatus(checks)).toBe('fail');
  });

  it('Returns fail when mix of fail and warn exists (fail takes priority)', () => {
    const checks = [
      { name: 'a', status: 'pass' as const, message: '', severity: 'info' as const },
      { name: 'b', status: 'warn' as const, message: '', severity: 'warn' as const },
      { name: 'c', status: 'fail' as const, message: '', severity: 'error' as const },
    ];
    expect(deriveOverallStatus(checks)).toBe('fail');
  });

  it('Returns pass for empty checks', () => {
    expect(deriveOverallStatus([])).toBe('pass');
  });
});
