/**
 * Tests for PresenceTracker.
 *
 * Uses vi.useFakeTimers() to simulate time progression without real delays.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresenceTracker } from './presence.js';

describe('PresenceTracker', () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    tracker = new PresenceTracker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // heartbeat
  // ---------------------------------------------------------------------------

  describe('Given a participant sends a heartbeat', () => {
    it('creates a presence entry with status online', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      const presence = tracker.getPresence('SESS1');

      expect(presence).toHaveLength(1);
      expect(presence[0]).toMatchObject({
        participantId: 'p-001',
        participantName: 'Alice',
        status: 'online',
      });
    });

    it('stores an ISO lastSeen timestamp', () => {
      const now = new Date('2024-01-01T12:00:00.000Z').getTime();
      vi.setSystemTime(now);

      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      const presence = tracker.getPresence('SESS1');

      expect(presence[0].lastSeen).toBe('2024-01-01T12:00:00.000Z');
    });

    it('retains participantName on repeated heartbeats (no name passed)', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.heartbeat('SESS1', 'p-001'); // no name

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].participantName).toBe('Alice');
    });

    it('tracks participants across multiple sessions independently', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.heartbeat('SESS2', 'p-002', 'Bob');

      expect(tracker.getPresence('SESS1')).toHaveLength(1);
      expect(tracker.getPresence('SESS2')).toHaveLength(1);
      expect(tracker.getPresence('SESS1')[0].participantId).toBe('p-001');
      expect(tracker.getPresence('SESS2')[0].participantId).toBe('p-002');
    });
  });

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  describe('Given time passes after the last heartbeat', () => {
    it('status is online within 30 seconds', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(29_000);

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].status).toBe('online');
    });

    it('status transitions to recent after 30 seconds', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(31_000);

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].status).toBe('recent');
    });

    it('status transitions to recent within 5 minutes', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(4 * 60_000 + 59_000); // 4m59s

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].status).toBe('recent');
    });

    it('status transitions to offline after 5 minutes', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(5 * 60_000 + 1_000); // 5m1s

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].status).toBe('offline');
    });

    it('status returns to online after a fresh heartbeat', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(10 * 60_000); // 10 minutes — offline

      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      const presence = tracker.getPresence('SESS1');
      expect(presence[0].status).toBe('online');
    });
  });

  // ---------------------------------------------------------------------------
  // setView
  // ---------------------------------------------------------------------------

  describe('Given setView is called', () => {
    it('updates currentView for an existing participant', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.setView('SESS1', 'p-001', 'Conflicts');

      const presence = tracker.getPresence('SESS1');
      expect(presence[0].currentView).toBe('Conflicts');
    });

    it('is a no-op for a participant not yet tracked', () => {
      tracker.setView('SESS1', 'p-unknown', 'Flow');

      const presence = tracker.getPresence('SESS1');
      expect(presence).toHaveLength(0);
    });

    it('is a no-op for an unknown session', () => {
      expect(() => tracker.setView('UNKNOWN', 'p-001', 'Flow')).not.toThrow();
    });

    it('omits currentView from PresenceInfo when not set', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');

      const presence = tracker.getPresence('SESS1');
      expect('currentView' in presence[0]).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // disconnect
  // ---------------------------------------------------------------------------

  describe('Given a participant disconnects', () => {
    it('removes the participant from presence', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.heartbeat('SESS1', 'p-002', 'Bob');

      tracker.disconnect('SESS1', 'p-001');

      const presence = tracker.getPresence('SESS1');
      expect(presence).toHaveLength(1);
      expect(presence[0].participantId).toBe('p-002');
    });

    it('returns empty array for a session when all participants disconnect', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.disconnect('SESS1', 'p-001');

      expect(tracker.getPresence('SESS1')).toHaveLength(0);
    });

    it('is a no-op for an unknown participant', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      expect(() => tracker.disconnect('SESS1', 'p-unknown')).not.toThrow();

      expect(tracker.getPresence('SESS1')).toHaveLength(1);
    });

    it('is a no-op for an unknown session', () => {
      expect(() => tracker.disconnect('UNKNOWN', 'p-001')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getPresence
  // ---------------------------------------------------------------------------

  describe('Given getPresence is called for an unknown session', () => {
    it('returns an empty array', () => {
      expect(tracker.getPresence('NOSESSION')).toEqual([]);
    });
  });

  describe('Given multiple participants are in a session', () => {
    it('returns all participants', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      tracker.heartbeat('SESS1', 'p-002', 'Bob');
      tracker.heartbeat('SESS1', 'p-003', 'Carol');

      expect(tracker.getPresence('SESS1')).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------

  describe('Given cleanup is called', () => {
    it('removes entries older than 30 minutes', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(31 * 60_000); // 31 minutes

      tracker.cleanup();

      expect(tracker.getPresence('SESS1')).toHaveLength(0);
    });

    it('retains entries younger than 30 minutes', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(29 * 60_000); // 29 minutes

      tracker.cleanup();

      expect(tracker.getPresence('SESS1')).toHaveLength(1);
    });

    it('only removes stale entries, leaving fresh ones intact', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');
      vi.advanceTimersByTime(31 * 60_000); // p-001 now stale

      tracker.heartbeat('SESS1', 'p-002', 'Bob'); // p-002 just joined
      tracker.cleanup();

      const presence = tracker.getPresence('SESS1');
      expect(presence).toHaveLength(1);
      expect(presence[0].participantId).toBe('p-002');
    });
  });

  // ---------------------------------------------------------------------------
  // onChange notifications
  // ---------------------------------------------------------------------------

  describe('Given an onChange listener is registered', () => {
    it('fires when a heartbeat is recorded', () => {
      const calls: Array<{ sessionCode: string; count: number }> = [];
      tracker.onChange((code, presence) => calls.push({ sessionCode: code, count: presence.length }));

      tracker.heartbeat('SESS1', 'p-001', 'Alice');

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ sessionCode: 'SESS1', count: 1 });
    });

    it('fires when setView is called for a known participant', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');

      const calls: string[] = [];
      tracker.onChange((_code, presence) => {
        if (presence[0]?.currentView) calls.push(presence[0].currentView);
      });

      tracker.setView('SESS1', 'p-001', 'Flow');

      expect(calls).toContain('Flow');
    });

    it('fires when a participant disconnects', () => {
      tracker.heartbeat('SESS1', 'p-001', 'Alice');

      const counts: number[] = [];
      tracker.onChange((_code, presence) => counts.push(presence.length));

      tracker.disconnect('SESS1', 'p-001');

      expect(counts[counts.length - 1]).toBe(0);
    });

    it('can be unsubscribed', () => {
      const calls: number[] = [];
      const unsub = tracker.onChange(() => calls.push(1));
      unsub();

      tracker.heartbeat('SESS1', 'p-001', 'Alice');

      expect(calls).toHaveLength(0);
    });
  });
});
