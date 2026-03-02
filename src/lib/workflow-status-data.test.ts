import { describe, it, expect } from 'vitest';
import { deriveWorkflowStatus } from './workflow-status-data.js';
import type { LoadedFile, DomainEvent, UnresolvedItem } from '../schema/types.js';
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

describe('deriveWorkflowStatus', () => {
  describe('Given no files', () => {
    it('returns a workflow status in lobby or prep phase', () => {
      const status = deriveWorkflowStatus([], [], [], [], []);
      expect(status).toBeDefined();
      expect(status.currentPhase).toBeDefined();
    });
  });

  describe('Given 2 files with no overlaps', () => {
    it('returns a workflow status', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'EventB', aggregate: 'AggB' }]),
      ];
      const status = deriveWorkflowStatus(files, [], [], [], []);
      expect(status).toBeDefined();
      expect(status.artifactInventory.participantCount).toBe(2);
      expect(status.artifactInventory.submissionCount).toBe(2);
    });
  });

  describe('Given files with overlaps', () => {
    it('includes jam artifacts in workflow status', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
      ];
      const overlaps = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const status = deriveWorkflowStatus(files, overlaps, [], sharedEvents, []);
      // Jam is derived from overlaps, so hasJam should be true
      expect(status.artifactInventory.hasJam).toBe(true);
    });

    it('includes contract data when shared events exist', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggA' }]),
      ];
      const overlaps = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const sharedEvents = [makeOverlap('same-name', 'SharedEvent', ['role-a', 'role-b'])];
      const status = deriveWorkflowStatus(files, overlaps, [], sharedEvents, []);
      expect(status.artifactInventory.hasContracts).toBe(true);
    });
  });

  describe('Given flagged items', () => {
    it('passes flagged items to jam as unresolved', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'AggA' }]),
        makeFile('role-b', [{ name: 'EventA', aggregate: 'AggA' }]),
      ];
      const overlaps = [makeOverlap('same-name', 'EventA', ['role-a', 'role-b'])];
      const flaggedItems: UnresolvedItem[] = [
        { id: 'item-1', description: 'Needs review', flaggedBy: 'role-a', flaggedAt: '2026-01-01T00:00:00Z' },
      ];
      const status = deriveWorkflowStatus(files, overlaps, [], [], flaggedItems);
      expect(status.artifactInventory.unresolvedCount).toBe(1);
    });
  });
});
