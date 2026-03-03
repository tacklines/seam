/**
 * Session connection lifecycle manager.
 *
 * Manages the WebSocket connection and updates the app-level store
 * when session events arrive. Lives in state/ so components don't need to
 * own connection lifecycle — navigation away no longer drops state.
 *
 * Architecture: state/ must not import from components/. No Lit imports here.
 *
 * Protocol:
 *   Client → Server: { type: "join", sessionCode: string }
 *   Server → Client: { type: "connected" }
 *   Server → Client: { type: "joined", sessionCode: string }
 *   Server → Client: { type: "event", event: DomainEvent }
 *   Server → Client: { type: "error", message: string }
 */

import { store } from './app-state.js';
import type { SessionParticipant, SessionSubmission } from './app-state.js';
import type { EventPriority, Vote, WorkItem, WorkItemDependency, OwnershipAssignment, ConflictResolution, Requirement } from '../schema/types.js';

const WS_BASE = (typeof process !== 'undefined' && (process.env as Record<string, string>)['VITE_WS_URL'])
  ? (process.env as Record<string, string>)['VITE_WS_URL']
  : 'ws://localhost:3002';

// ---------------------------------------------------------------------------
// Reconnect constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 2;

// ---------------------------------------------------------------------------
// Module-level connection state
// ---------------------------------------------------------------------------

let activeSocket: WebSocket | null = null;
let activeSessionCode: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = INITIAL_BACKOFF_MS;
let intentionalDisconnect = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect to the WebSocket server and join the given session's event stream.
 * Updates the store when participant or submission events arrive.
 * Safe to call multiple times — closes any existing connection first.
 */
export function connectSession(code: string): void {
  intentionalDisconnect = false;
  activeSessionCode = code;
  backoffMs = INITIAL_BACKOFF_MS;

  disconnectSession();
  openSocket(code);
}

/**
 * Disconnect from the WebSocket and clear session state from the store.
 * Safe to call even if no connection is active.
 */
export function disconnectSession(): void {
  intentionalDisconnect = true;
  activeSessionCode = null;

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function openSocket(code: string): void {
  const ws = new WebSocket(WS_BASE);
  activeSocket = ws;

  ws.addEventListener('open', () => {
    backoffMs = INITIAL_BACKOFF_MS;
    ws.send(JSON.stringify({ type: 'join', sessionCode: code }));
  });

  ws.addEventListener('message', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: string;
        event?: {
          type: string;
          sessionCode?: string;
          // ParticipantJoined
          participantId?: string;
          participantName?: string;
          participantType?: string;
          // ArtifactSubmitted
          artifactId?: string;
          fileName?: string;
          artifactType?: string;
          version?: number;
          // PrioritySet
          eventName?: string;
          tier?: 'must_have' | 'should_have' | 'could_have';
          // VoteCast
          direction?: 'up' | 'down';
          // WorkItemCreated
          aggregate?: string;
          workItem?: WorkItem;
          // DependencySet
          fromItemId?: string;
          toItemId?: string;
          // ResolutionRecorded
          overlapLabel?: string;
          resolution?: string;
          chosenApproach?: string;
          resolvedBy?: string[];
          // OwnershipAssigned
          ownerRole?: string;
          assignedBy?: string;
        };
        sessionCode?: string;
        requirements?: Requirement[];
        message?: string;
      };

      if (msg.type === 'event' && msg.event) {
        handleDomainEvent(msg.event);
      }

      if (msg.type === 'requirements_updated' && msg.requirements) {
        handleRequirementsUpdate(msg.requirements);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener('close', () => {
    if (activeSocket === ws) {
      activeSocket = null;
    }
    if (!intentionalDisconnect && activeSessionCode) {
      scheduleReconnect(activeSessionCode);
    }
  });

  ws.addEventListener('error', () => {
    // error event is always followed by close — reconnect is handled there
  });
}

function scheduleReconnect(code: string): void {
  if (reconnectTimer !== null) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!intentionalDisconnect && activeSessionCode === code) {
      backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, MAX_BACKOFF_MS);
      openSocket(code);
    }
  }, backoffMs);
}

function handleDomainEvent(event: {
  type: string;
  sessionCode?: string;
  // ParticipantJoined
  participantId?: string;
  participantName?: string;
  participantType?: string;
  // ArtifactSubmitted
  artifactId?: string;
  fileName?: string;
  artifactType?: string;
  version?: number;
  // PrioritySet
  eventName?: string;
  tier?: 'must_have' | 'should_have' | 'could_have';
  // VoteCast
  direction?: 'up' | 'down';
  // WorkItemCreated
  aggregate?: string;
  workItem?: WorkItem;
  // DependencySet
  fromItemId?: string;
  toItemId?: string;
  // ResolutionRecorded
  overlapLabel?: string;
  resolution?: string;
  chosenApproach?: string;
  resolvedBy?: string[];
  // OwnershipAssigned
  ownerRole?: string;
  assignedBy?: string;
}): void {
  const current = store.get().sessionState;

  if (event.type === 'ParticipantJoined') {
    if (!current) return;
    const participant: SessionParticipant = {
      id: event.participantId ?? '',
      name: event.participantName ?? '',
      joinedAt: new Date().toISOString(),
      type: (event.participantType as SessionParticipant['type']) ?? 'human',
    };
    const already = current.session.participants.find((p) => p.id === participant.id);
    if (!already) {
      store.updateSession({
        ...current.session,
        participants: [...current.session.participants, participant],
      });
    }
    return;
  }

  if (event.type === 'ArtifactSubmitted') {
    if (!current) return;
    const submission: SessionSubmission = {
      participantId: event.participantId ?? '',
      fileName: event.fileName ?? '',
      submittedAt: new Date().toISOString(),
    };
    const already = current.session.submissions.find(
      (s) => s.participantId === submission.participantId && s.fileName === submission.fileName
    );
    if (!already) {
      store.updateSession({
        ...current.session,
        submissions: [...current.session.submissions, submission],
      });
    }
    return;
  }

  if (event.type === 'PrioritySet') {
    if (!current) return;
    const priority: EventPriority = {
      eventName: event.eventName ?? '',
      participantId: event.participantId ?? '',
      tier: event.tier ?? 'should_have',
      setAt: new Date().toISOString(),
    };
    // Replace existing priority for same participant + event, or append
    const existing = current.session.priorities.filter(
      (p) => !(p.participantId === priority.participantId && p.eventName === priority.eventName)
    );
    store.updateSession({
      ...current.session,
      priorities: [...existing, priority],
    });
    return;
  }

  if (event.type === 'VoteCast') {
    if (!current) return;
    const vote: Vote = {
      participantId: event.participantId ?? '',
      eventName: event.eventName ?? '',
      direction: event.direction ?? 'up',
      castAt: new Date().toISOString(),
    };
    // Replace existing vote for same participant + event, or append
    const existing = current.session.votes.filter(
      (v) => !(v.participantId === vote.participantId && v.eventName === vote.eventName)
    );
    store.updateSession({
      ...current.session,
      votes: [...existing, vote],
    });
    return;
  }

  if (event.type === 'WorkItemCreated') {
    if (!current) return;
    if (!event.workItem) return;
    const already = current.session.workItems.find((w) => w.id === event.workItem!.id);
    if (!already) {
      store.updateSession({
        ...current.session,
        workItems: [...current.session.workItems, event.workItem],
      });
    }
    return;
  }

  if (event.type === 'DependencySet') {
    if (!current) return;
    const dependency: WorkItemDependency = {
      fromId: event.fromItemId ?? '',
      toId: event.toItemId ?? '',
      participantId: event.participantId ?? '',
      setAt: new Date().toISOString(),
    };
    const already = current.session.workItemDependencies.find(
      (d) => d.fromId === dependency.fromId && d.toId === dependency.toId
    );
    if (!already) {
      store.updateSession({
        ...current.session,
        workItemDependencies: [...current.session.workItemDependencies, dependency],
      });
    }
    return;
  }

  if (event.type === 'ResolutionRecorded') {
    if (!current) return;
    const resolution: ConflictResolution = {
      overlapLabel: event.overlapLabel ?? '',
      resolution: event.resolution ?? '',
      chosenApproach: event.chosenApproach ?? '',
      resolvedBy: event.resolvedBy ?? [],
      resolvedAt: new Date().toISOString(),
    };
    const already = current.session.resolutions.find(
      (r) => r.overlapLabel === resolution.overlapLabel
    );
    if (!already) {
      store.updateSession({
        ...current.session,
        resolutions: [...current.session.resolutions, resolution],
      });
    }
    return;
  }

  if (event.type === 'OwnershipAssigned') {
    if (!current) return;
    const assignment: OwnershipAssignment = {
      aggregate: event.aggregate ?? '',
      ownerRole: event.ownerRole ?? '',
      assignedBy: event.assignedBy ?? '',
      assignedAt: new Date().toISOString(),
    };
    // Replace existing ownership for same aggregate, or append
    const existing = current.session.ownershipMap.filter(
      (o) => o.aggregate !== assignment.aggregate
    );
    store.updateSession({
      ...current.session,
      ownershipMap: [...existing, assignment],
    });
    return;
  }
}


/**
 * Handle a requirements_updated broadcast from the server.
 * Replaces the local requirements list with the authoritative server state.
 */
function handleRequirementsUpdate(requirements: Requirement[]): void {
  const current = store.get().sessionState;
  if (!current) return;

  store.updateSession({
    ...current.session,
    requirements,
  });
}
