import { describe, it, expect } from 'vitest';
import { sortWorkItemsByPriority, addCriterion, removeCriterion } from './breakdown-editor.js';
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

describe('addCriterion', () => {
  it('appends a trimmed criterion to the acceptanceCriteria array', () => {
    const item = makeItem('wi-1', []);
    const updated = addCriterion(item, 'User can log in');
    expect(updated.acceptanceCriteria).toEqual(['User can log in']);
  });

  it('trims whitespace from the criterion text', () => {
    const item = makeItem('wi-1', []);
    const updated = addCriterion(item, '  Handles edge case  ');
    expect(updated.acceptanceCriteria).toEqual(['Handles edge case']);
  });

  it('appends to existing criteria', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['First criterion'] };
    const updated = addCriterion(item, 'Second criterion');
    expect(updated.acceptanceCriteria).toEqual(['First criterion', 'Second criterion']);
  });

  it('returns the original item unchanged when text is empty', () => {
    const item = makeItem('wi-1', []);
    const updated = addCriterion(item, '');
    expect(updated).toBe(item);
  });

  it('returns the original item unchanged when text is whitespace-only', () => {
    const item = makeItem('wi-1', []);
    const updated = addCriterion(item, '   ');
    expect(updated).toBe(item);
  });

  it('does not mutate the original item', () => {
    const item = makeItem('wi-1', []);
    addCriterion(item, 'New criterion');
    expect(item.acceptanceCriteria).toEqual([]);
  });
});

describe('removeCriterion', () => {
  it('removes the criterion at the given index', () => {
    const item = {
      ...makeItem('wi-1', []),
      acceptanceCriteria: ['First', 'Second', 'Third'],
    };
    const updated = removeCriterion(item, 1);
    expect(updated.acceptanceCriteria).toEqual(['First', 'Third']);
  });

  it('removes the first criterion', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['A', 'B'] };
    const updated = removeCriterion(item, 0);
    expect(updated.acceptanceCriteria).toEqual(['B']);
  });

  it('removes the last criterion', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['A', 'B'] };
    const updated = removeCriterion(item, 1);
    expect(updated.acceptanceCriteria).toEqual(['A']);
  });

  it('removes the only criterion leaving an empty array', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['Solo'] };
    const updated = removeCriterion(item, 0);
    expect(updated.acceptanceCriteria).toEqual([]);
  });

  it('returns the original item unchanged when index is out of range (positive)', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['Only'] };
    const updated = removeCriterion(item, 5);
    expect(updated).toBe(item);
  });

  it('returns the original item unchanged when index is negative', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['Only'] };
    const updated = removeCriterion(item, -1);
    expect(updated).toBe(item);
  });

  it('does not mutate the original item', () => {
    const item = { ...makeItem('wi-1', []), acceptanceCriteria: ['A', 'B'] };
    removeCriterion(item, 0);
    expect(item.acceptanceCriteria).toEqual(['A', 'B']);
  });
});
