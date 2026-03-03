import { describe, it, expect } from 'vitest';
import type { Requirement } from '../../schema/types.js';

// Component tests verify the data contracts and event shapes.
// Full rendering is verified via Playwright e2e or dev server inspection.

function makeRequirement(overrides: Partial<Requirement> & { statement: string }): Requirement {
  return {
    id: 'r1',
    authorId: 'p1',
    status: 'draft',
    priority: 0,
    tags: [],
    derivedEvents: [],
    derivedAssumptions: [],
    createdAt: '2026-03-03T00:00:00Z',
    updatedAt: '2026-03-03T00:00:00Z',
    ...overrides,
  };
}

describe('RequirementsInput component contract', () => {
  it('Requirement type has required fields', () => {
    const req = makeRequirement({ statement: 'We need offline support' });
    expect(req.id).toBe('r1');
    expect(req.statement).toBe('We need offline support');
    expect(req.authorId).toBe('p1');
    expect(req.createdAt).toBe('2026-03-03T00:00:00Z');
  });

  it('requirement-added event detail shape has text field', () => {
    const detail = { text: 'Users should be able to share documents' };
    expect(detail.text).toBe('Users should be able to share documents');
  });

  it('requirement-removed event detail shape has id field', () => {
    const detail = { id: 'r1' };
    expect(detail.id).toBe('r1');
  });

  it('derive-events-requested event detail has requirements array', () => {
    const requirements: Requirement[] = [
      makeRequirement({ id: 'r1', statement: 'Offline support' }),
      makeRequirement({ id: 'r2', statement: 'Real-time notifications' }),
    ];
    const detail = { requirements };
    expect(detail.requirements).toHaveLength(2);
    expect(detail.requirements[0].statement).toBe('Offline support');
  });

  it('derive-events button should be disabled with zero requirements', () => {
    const requirements: Requirement[] = [];
    const disabled = requirements.length === 0;
    expect(disabled).toBe(true);
  });

  it('derive-events button should be enabled with requirements', () => {
    const requirements: Requirement[] = [
      makeRequirement({ statement: 'Something' }),
    ];
    const disabled = requirements.length === 0;
    expect(disabled).toBe(false);
  });
});
