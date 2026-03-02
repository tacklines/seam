import { describe, it, expect } from 'vitest';
import { deriveContractEntries, deriveContractsData, deriveProvenanceChain } from './contract-data.js';
import type { LoadedFile, DomainEvent } from '../schema/types.js';
import type { Overlap } from './comparison.js';

function makeFile(role: string, events: Partial<DomainEvent>[] = []): LoadedFile {
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
        assumption_count: 0,
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
      boundary_assumptions: [],
    },
  };
}

function makeOverlap(kind: Overlap['kind'], label: string, roles: string[]): Overlap {
  return { kind, label, roles, details: `${label} overlap` };
}

describe('deriveContractEntries', () => {
  describe('Given fewer than 2 files', () => {
    it('returns empty array', () => {
      expect(deriveContractEntries([makeFile('role-a')], [])).toEqual([]);
    });
  });

  describe('Given 2 files with no shared events', () => {
    it('returns empty array', () => {
      const files = [makeFile('role-a'), makeFile('role-b')];
      expect(deriveContractEntries(files, [])).toEqual([]);
    });
  });

  describe('Given 2 files with shared event on same aggregate', () => {
    it('returns pass status entry', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA', trigger: 'user action' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggA', trigger: 'user action' }]),
      ];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const entries = deriveContractEntries(files, sharedEvents);
      expect(entries.length).toBe(1);
      expect(entries[0].eventName).toBe('SharedEvent');
      expect(entries[0].status).toBe('pass');
    });
  });

  describe('Given 2 files with shared event on different aggregates', () => {
    it('returns fail status entry', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggB' }]),
      ];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const entries = deriveContractEntries(files, sharedEvents);
      expect(entries[0].status).toBe('fail');
    });
  });

  describe('Given 2 files with shared event with differing triggers', () => {
    it('returns warn status entry', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA', trigger: 'trigger-1' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggA', trigger: 'trigger-2' }]),
      ];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const entries = deriveContractEntries(files, sharedEvents);
      expect(entries[0].status).toBe('warn');
    });
  });
});

describe('deriveContractsData', () => {
  describe('Given fewer than 2 files', () => {
    it('returns empty bundle', () => {
      const result = deriveContractsData([makeFile('role-a')], []);
      expect(result.bundle.eventContracts).toEqual([]);
      expect(result.bundle.boundaryContracts).toEqual([]);
      expect(result.schemas).toEqual({});
    });
  });

  describe('Given 2 files with shared events', () => {
    it('creates event and boundary contracts', () => {
      const files = [
        makeFile('role-a', [{ name: 'OrderPlaced', aggregate: 'Order' }]),
        makeFile('role-b', [{ name: 'OrderPlaced', aggregate: 'Order' }]),
      ];
      const sharedOverlaps = [makeOverlap('same-name', 'OrderPlaced', ['role-a', 'role-b'])];
      const result = deriveContractsData(files, sharedOverlaps);
      expect(result.bundle.eventContracts.length).toBe(1);
      expect(result.bundle.eventContracts[0].eventName).toBe('OrderPlaced');
      expect(result.bundle.eventContracts[0].version).toBe('0.0.1-draft');
      expect(result.bundle.boundaryContracts.length).toBe(1);
      expect(result.bundle.boundaryContracts[0].boundaryName).toBe('Order');
      expect(result.schemas['OrderPlaced']).toBeDefined();
    });
  });
});

describe('deriveProvenanceChain', () => {
  describe('Given fewer than 2 files', () => {
    it('returns empty chain', () => {
      expect(deriveProvenanceChain([makeFile('role-a')], [], [])).toEqual([]);
    });
  });

  describe('Given 2 files with conflicts and shared events', () => {
    it('builds chain with participant, conflict, and resolution steps', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'EventA', aggregate: 'AggA' }]),
      ];
      const conflicts = [makeOverlap('assumption-conflict', 'ConflictEvent', ['role-a', 'role-b'])];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const chain = deriveProvenanceChain(files, conflicts, sharedEvents);
      expect(chain.filter((s) => s.kind === 'participant').length).toBe(2);
      expect(chain.filter((s) => s.kind === 'conflict').length).toBe(1);
      expect(chain.filter((s) => s.kind === 'resolution').length).toBe(1);
    });

    it('includes event count in participant detail', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }, { name: 'EventB', aggregate: 'AggA' }]),
        makeFile('role-b', []),
      ];
      const chain = deriveProvenanceChain(files, [], []);
      const participantA = chain.find((s) => s.kind === 'participant' && s.label === 'role-a');
      expect(participantA?.detail).toContain('2 events');
    });
  });
});
