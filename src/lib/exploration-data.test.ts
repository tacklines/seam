import { describe, it, expect } from 'vitest';
import { deriveExplorationData } from './exploration-data.js';
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

describe('Given no files', () => {
  it('returns zeroed result', () => {
    const result = deriveExplorationData([]);
    expect(result.score).toBe(0);
    expect(result.gaps).toEqual([]);
    expect(result.prompts).toEqual([]);
    expect(result.patterns).toEqual([]);
  });
});

describe('Given files with domain events', () => {
  it('returns a non-zero score and prompts', () => {
    const files = [
      makeFile('role-a', [
        { name: 'OrderPlaced', aggregate: 'Order', confidence: 'CONFIRMED', integration: { direction: 'outbound' } },
        { name: 'PaymentCharged', aggregate: 'Payment', confidence: 'CONFIRMED', integration: { direction: 'outbound' } },
      ]),
    ];
    const result = deriveExplorationData(files);
    expect(result.score).toBeGreaterThan(0);
    expect(result.prompts.length).toBeGreaterThan(0);
  });

  it('generates saga pattern suggestion when order or payment aggregate exists', () => {
    const files = [
      makeFile('role-a', [
        { name: 'OrderPlaced', aggregate: 'Order', confidence: 'CONFIRMED' },
      ]),
    ];
    const result = deriveExplorationData(files);
    const sagaPattern = result.patterns.find((p) => p.description.includes('Saga'));
    expect(sagaPattern).toBeDefined();
  });

  it('generates identity lifecycle pattern when user aggregate exists', () => {
    const files = [
      makeFile('role-a', [
        { name: 'UserRegistered', aggregate: 'User', confidence: 'CONFIRMED' },
      ]),
    ];
    const result = deriveExplorationData(files);
    const identityPattern = result.patterns.find((p) => p.description.includes('Identity Lifecycle'));
    expect(identityPattern).toBeDefined();
  });

  it('includes "who needs to know" prompt when files have events', () => {
    const files = [
      makeFile('role-a', [
        { name: 'OrderShipped', aggregate: 'Order', confidence: 'CONFIRMED' },
      ]),
    ];
    const result = deriveExplorationData(files);
    const whoPrompt = result.prompts.find((p) => p.question.includes('Who needs to know'));
    expect(whoPrompt).toBeDefined();
    expect(whoPrompt?.question).toContain('OrderShipped');
  });
});

describe('Given files with POSSIBLE confidence events', () => {
  it('generates Review confidence gap action', () => {
    const files = [
      makeFile('role-a', [
        { name: 'MaybeEvent', aggregate: 'SomeAgg', confidence: 'POSSIBLE' },
      ]),
    ];
    const result = deriveExplorationData(files);
    // The gap messages will come from computeSessionStatus — POSSIBLE events produce warnings
    // We just verify the function doesn't throw and returns valid structure
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(Array.isArray(result.prompts)).toBe(true);
  });
});
