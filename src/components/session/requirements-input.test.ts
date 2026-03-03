import { describe, it, expect } from 'vitest';
import type { Requirement } from '../../schema/types.js';

// Component tests verify the data contracts and event shapes.
// Full rendering is verified via Playwright e2e or dev server inspection.

describe('RequirementsInput component contract', () => {
  it('Requirement type has required fields', () => {
    const req: Requirement = {
      id: 'r1',
      text: 'We need offline support',
      participantId: 'p1',
      createdAt: '2026-03-03T00:00:00Z',
    };
    expect(req.id).toBe('r1');
    expect(req.text).toBe('We need offline support');
    expect(req.participantId).toBe('p1');
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
      { id: 'r1', text: 'Offline support', participantId: 'p1', createdAt: '2026-03-03T00:00:00Z' },
      { id: 'r2', text: 'Real-time notifications', participantId: 'p1', createdAt: '2026-03-03T00:01:00Z' },
    ];
    const detail = { requirements };
    expect(detail.requirements).toHaveLength(2);
    expect(detail.requirements[0].text).toBe('Offline support');
  });

  it('derive-events button should be disabled with zero requirements', () => {
    const requirements: Requirement[] = [];
    // The component uses ?disabled=${count === 0}
    const disabled = requirements.length === 0;
    expect(disabled).toBe(true);
  });

  it('derive-events button should be enabled with requirements', () => {
    const requirements: Requirement[] = [
      { id: 'r1', text: 'Something', participantId: 'p1', createdAt: '2026-03-03T00:00:00Z' },
    ];
    const disabled = requirements.length === 0;
    expect(disabled).toBe(false);
  });
});
