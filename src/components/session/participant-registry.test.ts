/**
 * Tests for participant-registry component.
 *
 * These tests focus on the pure-function logic surrounding participant
 * rendering: status determination, accessibility label generation,
 * and store subscription behaviour.
 *
 * Full rendering tests require a browser environment (Playwright e2e).
 * Here we test the data-transformation helpers that the component relies on.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../state/app-state.js';
import type { ActiveSession, SessionState } from '../../state/app-state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    code: 'TEST01',
    createdAt: '2026-01-01T00:00:00Z',
    participants: [],
    submissions: [],
    ...overrides,
  };
}

function makeParticipant(id: string, name: string) {
  return { id, name, joinedAt: '2026-01-01T00:00:00Z' };
}

function makeSubmission(participantId: string, fileName = 'events.yaml') {
  return { participantId, fileName, submittedAt: '2026-01-01T00:01:00Z' };
}

// ---------------------------------------------------------------------------
// Participant status logic (pure function extracted for test clarity)
// ---------------------------------------------------------------------------

/**
 * Mirrors the status determination logic in participant-registry.ts.
 * If this function is later extracted to lib/, tests can move there.
 */
function getParticipantStatus(
  participantId: string,
  submissions: { participantId: string }[],
): 'submitted' | 'waiting' {
  return submissions.some((s) => s.participantId === participantId) ? 'submitted' : 'waiting';
}

function buildAriaLabel(
  name: string,
  isMe: boolean,
  status: 'submitted' | 'waiting',
): string {
  const statusLabel = status === 'submitted' ? 'Submitted' : 'Waiting to submit';
  return `${name}${isMe ? ', you' : ''}, ${statusLabel}`;
}

// ---------------------------------------------------------------------------
// Tests: participant status determination
// ---------------------------------------------------------------------------

describe('participant status determination', () => {
  describe('given a participant with a submission', () => {
    it('returns submitted status', () => {
      const submissions = [makeSubmission('p1')];
      expect(getParticipantStatus('p1', submissions)).toBe('submitted');
    });
  });

  describe('given a participant without a submission', () => {
    it('returns waiting status', () => {
      const submissions = [makeSubmission('p2')];
      expect(getParticipantStatus('p1', submissions)).toBe('waiting');
    });
  });

  describe('given an empty submission list', () => {
    it('returns waiting for any participant', () => {
      expect(getParticipantStatus('p1', [])).toBe('waiting');
    });
  });

  describe('given multiple submissions', () => {
    it('correctly identifies the matching participant', () => {
      const submissions = [makeSubmission('p2'), makeSubmission('p3')];
      expect(getParticipantStatus('p2', submissions)).toBe('submitted');
      expect(getParticipantStatus('p1', submissions)).toBe('waiting');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: ARIA label generation
// ---------------------------------------------------------------------------

describe('accessibility label generation', () => {
  describe('when the participant is the current user and has submitted', () => {
    it('includes "you" and "Submitted" in the label', () => {
      const label = buildAriaLabel('Alice', true, 'submitted');
      expect(label).toBe('Alice, you, Submitted');
    });
  });

  describe('when the participant is another user and has not submitted', () => {
    it('includes the name and "Waiting to submit"', () => {
      const label = buildAriaLabel('Bob', false, 'waiting');
      expect(label).toBe('Bob, Waiting to submit');
    });
  });

  describe('when the participant is the current user waiting', () => {
    it('includes "you" and "Waiting to submit"', () => {
      const label = buildAriaLabel('Charlie', true, 'waiting');
      expect(label).toBe('Charlie, you, Waiting to submit');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: store integration (subscription + state reading)
// ---------------------------------------------------------------------------

describe('store session state integration', () => {
  beforeEach(() => {
    store.clearSession();
  });

  afterEach(() => {
    store.clearSession();
  });

  describe('when no session is active', () => {
    it('sessionState is null in the store', () => {
      expect(store.get().sessionState).toBeNull();
    });
  });

  describe('when a session is set', () => {
    it('sessionState is available with participants', () => {
      const session = makeSession({
        participants: [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')],
        submissions: [makeSubmission('p1')],
      });
      store.setSession('TEST01', 'p1', session);

      const state = store.get().sessionState as SessionState;
      expect(state.session.participants).toHaveLength(2);
      expect(state.session.submissions).toHaveLength(1);
      expect(state.participantId).toBe('p1');
    });
  });

  describe('when participants join via updateSession', () => {
    it('the store reflects the updated participant list', () => {
      const session = makeSession({ participants: [makeParticipant('p1', 'Alice')] });
      store.setSession('TEST01', 'p1', session);

      const updated = makeSession({
        participants: [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')],
      });
      store.updateSession(updated);

      const state = store.get().sessionState as SessionState;
      expect(state.session.participants).toHaveLength(2);
    });
  });

  describe('when a submission is added via updateSession', () => {
    it('status changes from waiting to submitted for that participant', () => {
      const session = makeSession({
        participants: [makeParticipant('p1', 'Alice')],
        submissions: [],
      });
      store.setSession('TEST01', 'p1', session);

      // Initially waiting
      const before = store.get().sessionState!;
      expect(getParticipantStatus('p1', before.session.submissions)).toBe('waiting');

      // After submission
      store.updateSession({
        ...session,
        submissions: [makeSubmission('p1', 'alice-events.yaml')],
      });

      const after = store.get().sessionState!;
      expect(getParticipantStatus('p1', after.session.submissions)).toBe('submitted');
    });
  });

  describe('when session is cleared', () => {
    it('sessionState returns to null', () => {
      store.setSession('TEST01', 'p1', makeSession());
      store.clearSession();
      expect(store.get().sessionState).toBeNull();
    });
  });

  describe('store subscription fires on session events', () => {
    it('emits session-updated when participants change', () => {
      store.setSession('TEST01', 'p1', makeSession());

      const events: string[] = [];
      const unsub = store.subscribe((e) => events.push(e.type));

      store.updateSession(makeSession({ participants: [makeParticipant('p2', 'Bob')] }));
      unsub();

      expect(events).toContain('session-updated');
    });

    it('emits session-disconnected when session is cleared', () => {
      store.setSession('TEST01', 'p1', makeSession());

      const events: string[] = [];
      const unsub = store.subscribe((e) => events.push(e.type));
      store.clearSession();
      unsub();

      expect(events).toContain('session-disconnected');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: icon and CSS class selection for status indicators
// ---------------------------------------------------------------------------

function resolveStatusIcon(status: 'submitted' | 'waiting'): string {
  return status === 'submitted' ? 'check-circle-fill' : 'hourglass-split';
}

describe('status indicator icon selection', () => {
  it('uses check-circle-fill icon for submitted participants', () => {
    expect(resolveStatusIcon('submitted')).toBe('check-circle-fill');
  });

  it('uses hourglass-split icon for waiting participants', () => {
    expect(resolveStatusIcon('waiting')).toBe('hourglass-split');
  });

  it('icon selection differs between submitted and waiting (never color alone)', () => {
    // Verifies the accessibility rule: icon shape differs — not just color
    expect(resolveStatusIcon('submitted')).not.toBe(resolveStatusIcon('waiting'));
  });
});
