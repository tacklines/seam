import { describe, it, expect } from 'vitest';
import { deriveAgreementsData } from './agreements-data.js';
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

describe('deriveAgreementsData', () => {
  describe('Given no files', () => {
    it('returns empty aggregates and roles', () => {
      const result = deriveAgreementsData([], []);
      expect(result.overlaps).toEqual([]);
      expect(result.aggregates).toEqual([]);
      expect(result.roles).toEqual([]);
    });
  });

  describe('Given files with events', () => {
    it('collects unique roles and aggregates', () => {
      const files = [
        makeFile('role-a', [
          { name: 'EventA', aggregate: 'AggA' },
          { name: 'EventB', aggregate: 'AggB' },
        ]),
        makeFile('role-b', [
          { name: 'EventC', aggregate: 'AggA' }, // same aggregate as role-a
        ]),
      ];
      const result = deriveAgreementsData(files, []);
      expect(result.roles).toContain('role-a');
      expect(result.roles).toContain('role-b');
      expect(result.roles.length).toBe(2);
      // AggA appears in both files but should only be listed once
      expect(result.aggregates.filter((a) => a === 'AggA').length).toBe(1);
      expect(result.aggregates).toContain('AggB');
    });

    it('passes through overlaps unchanged', () => {
      const files = [makeFile('role-a'), makeFile('role-b')];
      const overlaps: Overlap[] = [
        { kind: 'same-name', label: 'SomeEvent', roles: ['role-a', 'role-b'], details: 'overlap' },
      ];
      const result = deriveAgreementsData(files, overlaps);
      expect(result.overlaps).toBe(overlaps);
    });
  });
});
