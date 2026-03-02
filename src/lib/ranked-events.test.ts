import { describe, it, expect } from 'vitest';
import { deriveRankedEvents, deriveComparisonPriorities } from './ranked-events.js';
import type { LoadedFile, DomainEvent } from '../schema/types.js';

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

describe('deriveRankedEvents', () => {
  describe('Given no files', () => {
    it('returns empty array', () => {
      expect(deriveRankedEvents([], new Map())).toEqual([]);
    });
  });

  describe('Given a single file with events', () => {
    it('returns ranked events sorted by compositeScore descending', () => {
      const files = [
        makeFile('role-a', [
          { name: 'HighPriEvent', aggregate: 'AggA', confidence: 'CONFIRMED', integration: { direction: 'outbound' } },
          { name: 'LowPriEvent', aggregate: 'AggA', confidence: 'POSSIBLE', integration: { direction: 'internal' } },
        ]),
      ];
      const ranked = deriveRankedEvents(files, new Map());
      expect(ranked.length).toBe(2);
      expect(ranked[0].name).toBe('HighPriEvent');
      expect(ranked[0].compositeScore).toBeGreaterThan(ranked[1].compositeScore);
    });

    it('assigns must_have tier to CONFIRMED outbound events', () => {
      const files = [
        makeFile('role-a', [
          { name: 'ConfirmedOutbound', aggregate: 'AggA', confidence: 'CONFIRMED', integration: { direction: 'outbound' } },
        ]),
      ];
      const ranked = deriveRankedEvents(files, new Map());
      expect(ranked[0].tier).toBe('must_have');
    });

    it('assigns could_have tier to POSSIBLE internal events', () => {
      const files = [
        makeFile('role-a', [
          { name: 'PossibleInternal', aggregate: 'AggA', confidence: 'POSSIBLE', integration: { direction: 'internal' } },
        ]),
      ];
      const ranked = deriveRankedEvents(files, new Map());
      expect(ranked[0].tier).toBe('could_have');
    });
  });

  describe('Given tier overrides', () => {
    it('applies manual tier override', () => {
      const files = [
        makeFile('role-a', [
          { name: 'PossibleInternal', aggregate: 'AggA', confidence: 'POSSIBLE', integration: { direction: 'internal' } },
        ]),
      ];
      const overrides = new Map([['PossibleInternal', 'must_have']]);
      const ranked = deriveRankedEvents(files, overrides);
      expect(ranked[0].tier).toBe('must_have');
    });
  });

  describe('Given same event in multiple files', () => {
    it('deduplicates by name and counts cross refs', () => {
      const files = [
        makeFile('role-a', [{ name: 'SharedEvent', aggregate: 'AggA', confidence: 'CONFIRMED', integration: { direction: 'outbound' } }]),
        makeFile('role-b', [{ name: 'SharedEvent', aggregate: 'AggA', confidence: 'CONFIRMED', integration: { direction: 'outbound' } }]),
      ];
      const ranked = deriveRankedEvents(files, new Map());
      expect(ranked.length).toBe(1);
      expect(ranked[0].crossRefs).toBe(2);
    });
  });
});

describe('deriveComparisonPriorities', () => {
  it('maps ranked events to EventPriority format', () => {
    const files = [
      makeFile('role-a', [
        { name: 'EventA', aggregate: 'AggA', confidence: 'CONFIRMED', integration: { direction: 'outbound' } },
      ]),
    ];
    const priorities = deriveComparisonPriorities(files, new Map());
    expect(priorities.length).toBe(1);
    expect(priorities[0].eventName).toBe('EventA');
    expect(priorities[0].participantId).toBe('local');
    expect(['must_have', 'should_have', 'could_have']).toContain(priorities[0].tier);
  });

  it('returns empty array for empty files', () => {
    expect(deriveComparisonPriorities([], new Map())).toEqual([]);
  });
});
