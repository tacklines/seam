import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationService } from './delegation-service.js';
import { EventStore } from '../session/event-store.js';
import type { Session } from '../../lib/session-store.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(code: string = 'TEST01'): Session {
  return {
    code,
    createdAt: new Date().toISOString(),
    status: 'active',
    participants: new Map(),
    submissions: [],
    messages: [],
    jam: null,
    contracts: null,
    integrationReport: null,
    config: DEFAULT_SESSION_CONFIG,
    priorities: [],
    votes: [],
    workItems: [],
    workItemDependencies: [],
    drafts: [],
    requirements: [],
  };
}

function makeService(
  session: Session | null,
  eventStore?: EventStore
): DelegationService {
  const getSession = (code: string) =>
    session && session.code === code ? session : null;
  return new DelegationService(getSession, eventStore);
}

// ---------------------------------------------------------------------------
// setDelegationLevel
// ---------------------------------------------------------------------------

describe('DelegationService.setDelegationLevel', () => {
  it('returns the new level when session exists', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.setDelegationLevel('TEST01', 'semi_autonomous');

    expect(result).toBe('semi_autonomous');
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);

    const result = svc.setDelegationLevel('MISSING', 'autonomous');

    expect(result).toBeNull();
  });

  it('emits DelegationChanged event with correct fields', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    svc.setDelegationLevel('TEST01', 'autonomous', 'user-42');

    const events = store.getEventsByType('TEST01', 'DelegationChanged');
    expect(events).toHaveLength(1);
    const evt = events[0] as { type: string; level: string; changedBy: string; sessionCode: string };
    expect(evt.type).toBe('DelegationChanged');
    expect(evt.level).toBe('autonomous');
    expect(evt.changedBy).toBe('user-42');
    expect(evt.sessionCode).toBe('TEST01');
  });

  it('defaults changedBy to "system" when not provided', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    svc.setDelegationLevel('TEST01', 'assisted');

    const events = store.getEventsByType('TEST01', 'DelegationChanged');
    expect(events).toHaveLength(1);
    const evt = events[0] as { changedBy: string };
    expect(evt.changedBy).toBe('system');
  });

  it('does not emit an event when no eventStore is provided', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session); // no store

    svc.setDelegationLevel('TEST01', 'autonomous');

    expect(store.getEventCount('TEST01')).toBe(0);
  });

  it('accepts all three valid delegation levels', () => {
    const session = makeSession();
    const svc = makeService(session);

    expect(svc.setDelegationLevel('TEST01', 'assisted')).toBe('assisted');
    expect(svc.setDelegationLevel('TEST01', 'semi_autonomous')).toBe('semi_autonomous');
    expect(svc.setDelegationLevel('TEST01', 'autonomous')).toBe('autonomous');
  });
});

// ---------------------------------------------------------------------------
// requestApproval
// ---------------------------------------------------------------------------

describe('DelegationService.requestApproval', () => {
  it('returns a PendingApproval with generated id and defaults', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(result!.agentId).toBe('agent-1');
    expect(result!.action).toBe('Create work item');
    expect(result!.expiresAt).toBeTruthy();
    // expiresAt should be in the future
    expect(new Date(result!.expiresAt) > new Date()).toBe(true);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);

    const result = svc.requestApproval('MISSING', {
      agentId: 'agent-1',
      action: 'Create work item',
    });

    expect(result).toBeNull();
  });

  it('includes optional reasoning when provided', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
      reasoning: 'This work item represents the core domain event',
    });

    expect(result!.reasoning).toBe('This work item represents the core domain event');
  });

  it('accepts a custom expiresAt', () => {
    const session = makeSession();
    const svc = makeService(session);
    const customExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

    const result = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
      expiresAt: customExpiry,
    });

    expect(result!.expiresAt).toBe(customExpiry);
  });

  it('emits ApprovalRequested event with correct fields', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    const result = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Deploy contract',
      reasoning: 'Contract is finalized',
    });

    const events = store.getEventsByType('TEST01', 'ApprovalRequested');
    expect(events).toHaveLength(1);
    const evt = events[0] as {
      type: string;
      agentId: string;
      action: string;
      reasoning: string;
      expiresAt: string;
      eventId: string;
    };
    expect(evt.type).toBe('ApprovalRequested');
    expect(evt.agentId).toBe('agent-1');
    expect(evt.action).toBe('Deploy contract');
    expect(evt.reasoning).toBe('Contract is finalized');
    expect(evt.expiresAt).toBe(result!.expiresAt);
    // eventId used as approvalId
    expect(evt.eventId).toBe(result!.id);
  });

  it('multiple approvals accumulate independently', () => {
    const session = makeSession();
    const svc = makeService(session);

    const a1 = svc.requestApproval('TEST01', { agentId: 'agent-1', action: 'Action A' });
    const a2 = svc.requestApproval('TEST01', { agentId: 'agent-2', action: 'Action B' });

    expect(a1!.id).not.toBe(a2!.id);

    const pending = svc.getPendingApprovals('TEST01');
    expect(pending).toHaveLength(2);
  });

  it('does not emit event when no eventStore is provided', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session); // no store

    svc.requestApproval('TEST01', { agentId: 'agent-1', action: 'Action' });

    expect(store.getEventCount('TEST01')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decideApproval
// ---------------------------------------------------------------------------

describe('DelegationService.decideApproval', () => {
  it('approves a pending request and removes it from the queue', () => {
    const session = makeSession();
    const svc = makeService(session);

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
    })!;

    const result = svc.decideApproval('TEST01', approval.id, 'approved', 'human-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe(approval.id);

    // Should no longer be in pending list
    const pending = svc.getPendingApprovals('TEST01');
    expect(pending).toHaveLength(0);
  });

  it('rejects a pending request and removes it from the queue', () => {
    const session = makeSession();
    const svc = makeService(session);

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Deploy contract',
    })!;

    const result = svc.decideApproval('TEST01', approval.id, 'rejected', 'human-2');

    expect(result).not.toBeNull();

    const pending = svc.getPendingApprovals('TEST01');
    expect(pending).toHaveLength(0);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);

    const result = svc.decideApproval('MISSING', 'some-id', 'approved', 'human-1');

    expect(result).toBeNull();
  });

  it('returns null when approvalId is not found', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.decideApproval('TEST01', 'nonexistent-id', 'approved', 'human-1');

    expect(result).toBeNull();
  });

  it('returns null for an expired approval', () => {
    const session = makeSession();
    const svc = makeService(session);

    // Create approval that expired in the past
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
      expiresAt: pastExpiry,
    })!;

    const result = svc.decideApproval('TEST01', approval.id, 'approved', 'human-1');

    expect(result).toBeNull();
  });

  it('emits ApprovalDecided event with correct fields', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Create work item',
    })!;

    svc.decideApproval('TEST01', approval.id, 'approved', 'human-1');

    const events = store.getEventsByType('TEST01', 'ApprovalDecided');
    expect(events).toHaveLength(1);
    const evt = events[0] as {
      type: string;
      approvalId: string;
      decision: string;
      decidedBy: string;
    };
    expect(evt.type).toBe('ApprovalDecided');
    expect(evt.approvalId).toBe(approval.id);
    expect(evt.decision).toBe('approved');
    expect(evt.decidedBy).toBe('human-1');
  });

  it('returns null for session with no approvals map', () => {
    const session = makeSession();
    const svc = makeService(session);

    // No requestApproval was called, so no map exists for this session
    const result = svc.decideApproval('TEST01', 'any-id', 'approved', 'human-1');

    expect(result).toBeNull();
  });

  it('does not emit event when no eventStore is provided', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session); // no store

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Action',
    })!;

    svc.decideApproval('TEST01', approval.id, 'approved', 'human-1');

    expect(store.getEventCount('TEST01')).toBe(0);
  });

  it('handles approval and rejection of separate requests independently', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    const a1 = svc.requestApproval('TEST01', { agentId: 'agent-1', action: 'Action A' })!;
    const a2 = svc.requestApproval('TEST01', { agentId: 'agent-2', action: 'Action B' })!;

    svc.decideApproval('TEST01', a1.id, 'approved', 'human-1');

    // a2 still pending
    const pending = svc.getPendingApprovals('TEST01');
    expect(pending).toHaveLength(1);
    expect(pending![0].id).toBe(a2.id);
  });
});

// ---------------------------------------------------------------------------
// getPendingApprovals
// ---------------------------------------------------------------------------

describe('DelegationService.getPendingApprovals', () => {
  it('returns empty array when session has no approval requests', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.getPendingApprovals('TEST01');

    expect(result).toEqual([]);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);

    const result = svc.getPendingApprovals('MISSING');

    expect(result).toBeNull();
  });

  it('returns all pending approvals for a session', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.requestApproval('TEST01', { agentId: 'agent-1', action: 'Action A' });
    svc.requestApproval('TEST01', { agentId: 'agent-2', action: 'Action B' });

    const result = svc.getPendingApprovals('TEST01');

    expect(result).toHaveLength(2);
  });

  it('filters out expired approvals', () => {
    const session = makeSession();
    const svc = makeService(session);

    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

    svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Expired action',
      expiresAt: pastExpiry,
    });
    svc.requestApproval('TEST01', {
      agentId: 'agent-2',
      action: 'Active action',
      expiresAt: futureExpiry,
    });

    const result = svc.getPendingApprovals('TEST01');

    expect(result).toHaveLength(1);
    expect(result![0].agentId).toBe('agent-2');
  });

  it('does not return approvals from a different session', () => {
    const session1 = makeSession('AAA111');
    const session2 = makeSession('BBB222');

    const getSession = (code: string) => {
      if (code === 'AAA111') return session1;
      if (code === 'BBB222') return session2;
      return null;
    };
    const svc = new DelegationService(getSession);

    svc.requestApproval('AAA111', { agentId: 'agent-1', action: 'Action A' });

    const result = svc.getPendingApprovals('BBB222');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Event emission — combined workflow
// ---------------------------------------------------------------------------

describe('DelegationService — full workflow with eventStore', () => {
  it('emits events in order across the approval lifecycle', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    svc.setDelegationLevel('TEST01', 'assisted', 'human-1');

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Propose contract',
      reasoning: 'Contract ready for review',
    })!;

    svc.decideApproval('TEST01', approval.id, 'approved', 'human-1');

    const events = store.getEvents('TEST01');
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('DelegationChanged');
    expect(events[1].type).toBe('ApprovalRequested');
    expect(events[2].type).toBe('ApprovalDecided');
  });

  it('uses eventId as the approvalId linkage between ApprovalRequested and ApprovalDecided', () => {
    const session = makeSession();
    const store = new EventStore();
    const svc = makeService(session, store);

    const approval = svc.requestApproval('TEST01', {
      agentId: 'agent-1',
      action: 'Some action',
    })!;

    svc.decideApproval('TEST01', approval.id, 'rejected', 'human-1');

    const requested = store.getEventsByType('TEST01', 'ApprovalRequested')[0] as { eventId: string };
    const decided = store.getEventsByType('TEST01', 'ApprovalDecided')[0] as { approvalId: string };

    expect(requested.eventId).toBe(approval.id);
    expect(decided.approvalId).toBe(approval.id);
  });
});
