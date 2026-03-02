import { describe, it, expect } from 'vitest';
import { deriveIntegrationData, deriveComplianceStatus } from './integration-data.js';
import type { LoadedFile, DomainEvent, BoundaryAssumption } from '../schema/types.js';
import type { Overlap } from './comparison.js';

function makeFile(
  role: string,
  events: Partial<DomainEvent>[] = [],
  assumptions: Partial<BoundaryAssumption>[] = [],
): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: {
      metadata: {
        role,
        scope: 'test',
        goal: 'test',
        generated_at: '2026-02-27T10:00:00Z',
        event_count: events.length,
        assumption_count: assumptions.length,
      },
      domain_events: events.map((e) => ({
        name: e.name ?? 'DefaultEvent',
        aggregate: e.aggregate ?? 'DefaultAgg',
        trigger: e.trigger ?? 'trigger',
        payload: e.payload ?? [],
        integration: e.integration ?? { direction: 'internal' as const },
        confidence: e.confidence ?? ('CONFIRMED' as const),
        ...e,
      })),
      boundary_assumptions: assumptions.map((a) => ({
        id: a.id ?? 'BA-1',
        type: a.type ?? ('contract' as const),
        statement: a.statement ?? 'test assumption',
        affects_events: a.affects_events ?? [],
        confidence: a.confidence ?? ('LIKELY' as const),
        verify_with: a.verify_with ?? 'someone',
        ...a,
      })),
    },
  };
}

function makeOverlap(kind: Overlap['kind'], label: string, roles: string[]): Overlap {
  return {
    kind,
    label,
    roles,
    details: `${label} overlap between ${roles.join(', ')}`,
  };
}

describe('deriveIntegrationData', () => {
  describe('Given no files', () => {
    it('returns empty result with go verdict', () => {
      const result = deriveIntegrationData([], [], []);
      expect(result.checks).toEqual([]);
      expect(result.nodes).toEqual([]);
      expect(result.connections).toEqual([]);
      expect(result.verdict).toBe('go');
      expect(result.verdictSummary).toBe('');
      expect(result.contractCount).toBe(0);
      expect(result.aggregateCount).toBe(0);
    });
  });

  describe('Given files with no conflicts or shared events', () => {
    it('returns pass checks for contract assumptions', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }], [
          { id: 'BA-1', type: 'contract', statement: 'API contract with B' },
        ]),
      ];
      const result = deriveIntegrationData(files, [], []);
      const warnCheck = result.checks.find((c) => c.id === 'assumption-BA-1');
      expect(warnCheck).toBeDefined();
      expect(warnCheck?.status).toBe('warn');
    });
  });

  describe('Given files with conflicts', () => {
    it('produces no-go verdict with fail checks', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'EventA', aggregate: 'AggA' }]),
      ];
      const conflicts = [makeOverlap('assumption-conflict', 'EventA', ['role-a', 'role-b'])];
      const result = deriveIntegrationData(files, conflicts, []);
      expect(result.verdict).toBe('no-go');
      const failCheck = result.checks.find((c) => c.status === 'fail');
      expect(failCheck).toBeDefined();
      expect(failCheck?.label).toBe('EventA');
    });
  });

  describe('Given files with shared events across different aggregates', () => {
    it('creates boundary connections between aggregates', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggB' }]),
      ];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const result = deriveIntegrationData(files, [], sharedEvents);
      expect(result.connections.length).toBeGreaterThan(0);
      expect(result.connections[0].from).toBe('agga');
      expect(result.connections[0].to).toBe('aggb');
      expect(result.connections[0].status).toBe('pass');
    });

    it('marks connections as fail when event is also a conflict', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggB' }]),
      ];
      const conflicts = [makeOverlap('assumption-conflict', 'SharedEvent', ['role-a', 'role-b'])];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const result = deriveIntegrationData(files, conflicts, sharedEvents);
      const conn = result.connections.find((c) => c.label === 'SharedEvent');
      expect(conn?.status).toBe('fail');
    });
  });

  describe('verdict summary', () => {
    it('shows No checks when empty', () => {
      const files = [makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }])];
      const result = deriveIntegrationData(files, [], []);
      expect(result.verdictSummary).toBe('No checks');
    });

    it('includes conflict and pass counts', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }, { name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'EventA', aggregate: 'AggA' }, { name: 'SharedEvent', aggregate: 'AggB' }]),
      ];
      const conflicts = [makeOverlap('assumption-conflict', 'EventA', ['role-a', 'role-b'])];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const result = deriveIntegrationData(files, conflicts, sharedEvents);
      expect(result.verdictSummary).toContain('1 conflict');
      expect(result.verdictSummary).toContain('1 passing');
    });
  });
});

describe('deriveComplianceStatus', () => {
  describe('Given fewer than 2 files', () => {
    it('returns pass with no details', () => {
      const result = deriveComplianceStatus([makeFile('role-a')], [], 0);
      expect(result.status).toBe('pass');
      expect(result.details).toEqual([]);
    });
  });

  describe('Given 2+ files with no conflicts', () => {
    it('returns pass with no details', () => {
      const files = [makeFile('role-a'), makeFile('role-b')];
      const result = deriveComplianceStatus(files, [], 0);
      expect(result.status).toBe('pass');
    });
  });

  describe('Given 2+ files with 1-3 conflicts', () => {
    it('returns warn status', () => {
      const files = [makeFile('role-a'), makeFile('role-b')];
      const conflicts = [makeOverlap('assumption-conflict', 'EventX', ['role-a', 'role-b'])];
      const result = deriveComplianceStatus(files, conflicts, 1);
      expect(result.status).toBe('warn');
      expect(result.details.length).toBe(1);
    });
  });

  describe('Given 2+ files with more than 3 conflicts', () => {
    it('returns fail status', () => {
      const files = [makeFile('role-a'), makeFile('role-b')];
      const conflicts = [
        makeOverlap('assumption-conflict', 'EventA', ['role-a', 'role-b']),
        makeOverlap('assumption-conflict', 'EventB', ['role-a', 'role-b']),
        makeOverlap('assumption-conflict', 'EventC', ['role-a', 'role-b']),
        makeOverlap('assumption-conflict', 'EventD', ['role-a', 'role-b']),
      ];
      const result = deriveComplianceStatus(files, conflicts, 4);
      expect(result.status).toBe('fail');
    });
  });
});
