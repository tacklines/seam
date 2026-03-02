/**
 * Presence tracking for real-time collaboration awareness.
 *
 * Tracks connection status (online/recent/offline) and current view
 * per participant per session. Exposes a singleton instance for use
 * by HTTP endpoints and WebSocket broadcasts.
 *
 * Status thresholds:
 *   online  — heartbeat received within 30 seconds
 *   recent  — heartbeat received within 5 minutes
 *   offline — no heartbeat in more than 5 minutes
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresenceInfo {
  participantId: string;
  participantName: string;
  status: 'online' | 'recent' | 'offline';
  lastSeen: string; // ISO timestamp
  currentView?: string; // tab name they're viewing
}

interface PresenceEntry {
  participantId: string;
  participantName: string;
  lastSeen: number; // Date.now() ms
  currentView?: string;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const ONLINE_THRESHOLD_MS = 30_000;   // 30 seconds
const RECENT_THRESHOLD_MS = 5 * 60_000; // 5 minutes

function computeStatus(lastSeenMs: number, nowMs: number): 'online' | 'recent' | 'offline' {
  const elapsed = nowMs - lastSeenMs;
  if (elapsed <= ONLINE_THRESHOLD_MS) return 'online';
  if (elapsed <= RECENT_THRESHOLD_MS) return 'recent';
  return 'offline';
}

// ---------------------------------------------------------------------------
// PresenceTracker
// ---------------------------------------------------------------------------

export class PresenceTracker {
  // sessionCode -> participantId -> entry
  private readonly sessions = new Map<string, Map<string, PresenceEntry>>();

  // Listeners called when presence changes (for SSE/WebSocket broadcast)
  private readonly changeListeners = new Set<(sessionCode: string, presence: PresenceInfo[]) => void>();

  // ---------------------------------------------------------------------------
  // Mutation methods
  // ---------------------------------------------------------------------------

  /**
   * Record a heartbeat for a participant. Creates the entry if it doesn't exist.
   * participantName is used on first call; subsequent calls may omit it.
   */
  heartbeat(sessionCode: string, participantId: string, participantName = ''): void {
    const session = this.getOrCreateSession(sessionCode);
    const existing = session.get(participantId);
    session.set(participantId, {
      participantId,
      participantName: existing?.participantName ?? participantName,
      lastSeen: Date.now(),
      currentView: existing?.currentView,
    });
    this.notifyChange(sessionCode);
  }

  /**
   * Update the current view for a participant.
   * No-op if the participant is not tracked (heartbeat must come first).
   */
  setView(sessionCode: string, participantId: string, view: string): void {
    const session = this.sessions.get(sessionCode);
    if (!session) return;
    const entry = session.get(participantId);
    if (!entry) return;
    entry.currentView = view;
    this.notifyChange(sessionCode);
  }

  /**
   * Remove a participant from presence tracking (e.g., on WebSocket close).
   */
  disconnect(sessionCode: string, participantId: string): void {
    const session = this.sessions.get(sessionCode);
    if (!session) return;
    session.delete(participantId);
    if (session.size === 0) {
      this.sessions.delete(sessionCode);
    }
    this.notifyChange(sessionCode);
  }

  /**
   * Remove entries that have been offline for more than 30 minutes.
   * Called periodically to prevent unbounded memory growth.
   */
  cleanup(): void {
    const STALE_THRESHOLD_MS = 30 * 60_000; // 30 minutes
    const now = Date.now();
    const staleSessions: string[] = [];

    for (const [sessionCode, session] of this.sessions) {
      const staleParticipants: string[] = [];
      for (const [participantId, entry] of session) {
        if (now - entry.lastSeen > STALE_THRESHOLD_MS) {
          staleParticipants.push(participantId);
        }
      }
      for (const pid of staleParticipants) {
        session.delete(pid);
      }
      if (session.size === 0) {
        staleSessions.push(sessionCode);
      }
    }

    for (const code of staleSessions) {
      this.sessions.delete(code);
    }
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Return current presence info for all tracked participants in a session.
   */
  getPresence(sessionCode: string): PresenceInfo[] {
    const session = this.sessions.get(sessionCode);
    if (!session) return [];
    const now = Date.now();
    return Array.from(session.values()).map((entry) => ({
      participantId: entry.participantId,
      participantName: entry.participantName,
      status: computeStatus(entry.lastSeen, now),
      lastSeen: new Date(entry.lastSeen).toISOString(),
      ...(entry.currentView !== undefined ? { currentView: entry.currentView } : {}),
    }));
  }

  // ---------------------------------------------------------------------------
  // Change notifications
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to presence changes. Listener is called with the session code
   * and the updated PresenceInfo[] whenever any participant's presence changes.
   * Returns an unsubscribe function.
   */
  onChange(listener: (sessionCode: string, presence: PresenceInfo[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrCreateSession(sessionCode: string): Map<string, PresenceEntry> {
    let session = this.sessions.get(sessionCode);
    if (!session) {
      session = new Map();
      this.sessions.set(sessionCode, session);
    }
    return session;
  }

  private notifyChange(sessionCode: string): void {
    const presence = this.getPresence(sessionCode);
    const snapshot = Array.from(this.changeListeners);
    for (const listener of snapshot) {
      listener(sessionCode, presence);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const presenceTracker = new PresenceTracker();
