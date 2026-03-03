import { describe, it, expect } from 'vitest';
import { sortWorkItemsByPriority } from './breakdown-editor.js';
import type { WorkItem } from '../../schema/types.js';
import type { PriorityTier } from '../../schema/types.js';

function makeItem(id: string, linkedEvents: string[]): WorkItem {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    complexity: 'M',
    linkedEvents,
    dependencies: [],
  };
}

describe('sortWorkItemsByPriority', () => {
  it('returns empty array for empty input', () => {
    expect(sortWorkItemsByPriority([], new Map())).toEqual([]);
  });

  it('sorts must_have before should_have before could_have before unranked', () => {
    const tiers = new Map<string, PriorityTier>([
      ['event-a', 'could_have'],
      ['event-b', 'must_have'],
      ['event-c', 'should_have'],
    ]);

    const items = [
      makeItem('could', ['event-a']),
      makeItem('unranked', []),
      makeItem('must', ['event-b']),
      makeItem('should', ['event-c']),
    ];

    const sorted = sortWorkItemsByPriority(items, tiers);
    expect(sorted.map((i) => i.id)).toEqual(['must', 'should', 'could', 'unranked']);
  });

  it('preserves original order within the same tier (stable sort)', () => {
    const tiers = new Map<string, PriorityTier>([
      ['event-a', 'should_have'],
      ['event-b', 'should_have'],
    ]);

    const items = [
      makeItem('first', ['event-a']),
      makeItem('second', ['event-b']),
      makeItem('third', ['event-a']),
    ];

    const sorted = sortWorkItemsByPriority(items, tiers);
    expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third']);
  });

  it('uses the best (highest) tier when an item links multiple events', () => {
    const tiers = new Map<string, PriorityTier>([
      ['event-low', 'could_have'],
      ['event-high', 'must_have'],
    ]);

    const items = [
      makeItem('mixed', ['event-low', 'event-high']),
      makeItem('low-only', ['event-low']),
    ];

    const sorted = sortWorkItemsByPriority(items, tiers);
    // mixed should appear first because one of its events is must_have
    expect(sorted.map((i) => i.id)).toEqual(['mixed', 'low-only']);
  });

  it('treats items with no linked events as unranked (lowest priority)', () => {
    const tiers = new Map<string, PriorityTier>([['event-a', 'could_have']]);

    const items = [
      makeItem('no-events', []),
      makeItem('could', ['event-a']),
    ];

    const sorted = sortWorkItemsByPriority(items, tiers);
    expect(sorted.map((i) => i.id)).toEqual(['could', 'no-events']);
  });

  it('does not mutate the original array', () => {
    const tiers = new Map<string, PriorityTier>([
      ['a', 'should_have'],
      ['b', 'must_have'],
    ]);
    const items = [makeItem('first', ['a']), makeItem('second', ['b'])];
    const originalOrder = items.map((i) => i.id);

    sortWorkItemsByPriority(items, tiers);

    expect(items.map((i) => i.id)).toEqual(originalOrder);
  });
});
