import { describe, it, expect, vi } from 'vitest';
import { AgreementService } from './agreement-service.js';
import { EventStore } from '../session/event-store.js';
import type { Session } from '../../lib/session-store.js';
import type { JamArtifacts } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(code = 'ABCDEF', jam: JamArtifacts | null = null): Session {
  return {
    code,
    createdAt: new Date().toISOString(),
    participants: new Map(),
    submissions: [],
    messages: [],
    jam,
    contracts: null,
    integrationReport: null,
  };
}

function makeJam(): JamArtifacts {
  return {
    startedAt: new Date().toISOString(),
    ownershipMap: [],
    resolutions: [],
    unresolved: [],
  };
}

function makeGetSession(session: Session | null) {
  return (_code: string) => session;
}

// ---------------------------------------------------------------------------
// startJam
// ---------------------------------------------------------------------------

describe('AgreementService.startJam', () => {
  describe('Given a valid session with no jam', () => {
    it('When startJam is called, Then it creates jam artifacts on the session', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      const jam = svc.startJam('ABCDEF');
      expect(jam).not.toBeNull();
      expect(jam!.ownershipMap).toEqual([]);
      expect(jam!.resolutions).toEqual([]);
      expect(jam!.unresolved).toEqual([]);
      expect(typeof jam!.startedAt).toBe('string');
    });

    it('When startJam is called, Then session.jam is set', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      svc.startJam('ABCDEF');
      expect(session.jam).not.toBeNull();
    });
  });

  describe('Given a session with jam already started', () => {
    it('When startJam is called again, Then it returns the existing jam', () => {
      const jam = makeJam();
      const session = makeSession('ABCDEF', jam);
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.startJam('ABCDEF');
      expect(result).toBe(jam);
    });
  });

  describe('Given an unknown session', () => {
    it('When startJam is called, Then it returns null', () => {
      const svc = new AgreementService(makeGetSession(null));
      expect(svc.startJam('XXXXXX')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------

describe('AgreementService.resolveConflict', () => {
  describe('Given a session with jam started', () => {
    it('When resolveConflict is called, Then it adds a resolution with resolvedAt timestamp', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.resolveConflict('ABCDEF', {
        overlapLabel: 'OrderPlaced vs OrderCreated',
        resolution: 'Merged into OrderPlaced',
        chosenApproach: 'merge',
        resolvedBy: ['Alice', 'Bob'],
      });
      expect(result).not.toBeNull();
      expect(result!.overlapLabel).toBe('OrderPlaced vs OrderCreated');
      expect(result!.chosenApproach).toBe('merge');
      expect(result!.resolvedBy).toEqual(['Alice', 'Bob']);
      expect(typeof result!.resolvedAt).toBe('string');
    });

    it('When resolveConflict is called, Then the resolution is added to session.jam.resolutions', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      svc.resolveConflict('ABCDEF', {
        overlapLabel: 'test',
        resolution: 'resolved',
        chosenApproach: 'merge',
        resolvedBy: ['Alice'],
      });
      expect(session.jam!.resolutions).toHaveLength(1);
    });
  });

  describe('Given a session with no jam', () => {
    it('When resolveConflict is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.resolveConflict('ABCDEF', {
        overlapLabel: 'test',
        resolution: 'test',
        chosenApproach: 'merge',
        resolvedBy: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('Given an EventStore is provided', () => {
    it('When resolveConflict succeeds, Then a ResolutionRecorded event is emitted', () => {
      const session = makeSession('ABCDEF', makeJam());
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.resolveConflict('ABCDEF', {
        overlapLabel: 'OrderPlaced vs OrderCreated',
        resolution: 'Merged into OrderPlaced',
        chosenApproach: 'merge',
        resolvedBy: ['Alice', 'Bob'],
      });
      const events = eventStore.getEvents('ABCDEF');
      const resEvent = events.find((e) => e.type === 'ResolutionRecorded');
      expect(resEvent).toBeDefined();
      expect((resEvent as { overlapLabel: string }).overlapLabel).toBe('OrderPlaced vs OrderCreated');
      expect((resEvent as { chosenApproach: string }).chosenApproach).toBe('merge');
      expect((resEvent as { resolvedBy: string[] }).resolvedBy).toEqual(['Alice', 'Bob']);
    });

    it('When resolveConflict returns null (no jam), Then no event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.resolveConflict('ABCDEF', {
        overlapLabel: 'test',
        resolution: 'test',
        chosenApproach: 'merge',
        resolvedBy: [],
      });
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When resolveConflict is called, Then it works without emitting events (backward compat)', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.resolveConflict('ABCDEF', {
        overlapLabel: 'test',
        resolution: 'resolved',
        chosenApproach: 'merge',
        resolvedBy: ['Alice'],
      });
      expect(result).not.toBeNull();
      expect(session.jam!.resolutions).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// assignOwnership
// ---------------------------------------------------------------------------

describe('AgreementService.assignOwnership', () => {
  describe('Given a session with jam started', () => {
    it('When assignOwnership is called, Then it adds the assignment with assignedAt timestamp', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.assignOwnership('ABCDEF', {
        aggregate: 'Order',
        ownerRole: 'Sales',
        assignedBy: 'Alice',
      });
      expect(result).not.toBeNull();
      expect(result!.aggregate).toBe('Order');
      expect(result!.ownerRole).toBe('Sales');
      expect(result!.assignedBy).toBe('Alice');
      expect(typeof result!.assignedAt).toBe('string');
    });

    it('When assignOwnership is called for the same aggregate twice, Then it replaces the existing assignment', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Fulfillment', assignedBy: 'Bob' });
      expect(session.jam!.ownershipMap).toHaveLength(1);
      expect(session.jam!.ownershipMap[0].ownerRole).toBe('Fulfillment');
    });
  });

  describe('Given a session with no jam', () => {
    it('When assignOwnership is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      expect(svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' })).toBeNull();
    });
  });

  describe('Given an EventStore is provided', () => {
    it('When assignOwnership succeeds, Then an OwnershipAssigned event is emitted', () => {
      const session = makeSession('ABCDEF', makeJam());
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.assignOwnership('ABCDEF', {
        aggregate: 'Order',
        ownerRole: 'Sales',
        assignedBy: 'Alice',
      });
      const events = eventStore.getEvents('ABCDEF');
      const ownEvent = events.find((e) => e.type === 'OwnershipAssigned');
      expect(ownEvent).toBeDefined();
      expect((ownEvent as { aggregate: string }).aggregate).toBe('Order');
      expect((ownEvent as { ownerRole: string }).ownerRole).toBe('Sales');
      expect((ownEvent as { assignedBy: string }).assignedBy).toBe('Alice');
    });

    it('When assignOwnership returns null, Then no event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When assignOwnership is called, Then it works without emitting events (backward compat)', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      expect(result).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// flagUnresolved
// ---------------------------------------------------------------------------

describe('AgreementService.flagUnresolved', () => {
  describe('Given a session with jam started', () => {
    it('When flagUnresolved is called, Then it adds an item with a generated id and flaggedAt timestamp', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.flagUnresolved('ABCDEF', {
        description: 'Need to discuss Payment aggregate ownership',
        flaggedBy: 'Alice',
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBeTruthy();
      expect(result!.description).toBe('Need to discuss Payment aggregate ownership');
      expect(result!.flaggedBy).toBe('Alice');
      expect(typeof result!.flaggedAt).toBe('string');
    });

    it('When flagUnresolved is called with relatedOverlap, Then it is included in the result', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.flagUnresolved('ABCDEF', {
        description: 'TBD',
        flaggedBy: 'Alice',
        relatedOverlap: 'OrderPlaced vs OrderCreated',
      });
      expect(result!.relatedOverlap).toBe('OrderPlaced vs OrderCreated');
    });

    it('When flagUnresolved is called multiple times, Then each item gets a unique id', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const a = svc.flagUnresolved('ABCDEF', { description: 'A', flaggedBy: 'Alice' });
      const b = svc.flagUnresolved('ABCDEF', { description: 'B', flaggedBy: 'Bob' });
      expect(a!.id).not.toBe(b!.id);
    });
  });

  describe('Given a session with no jam', () => {
    it('When flagUnresolved is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      expect(svc.flagUnresolved('ABCDEF', { description: 'TBD', flaggedBy: 'Alice' })).toBeNull();
    });
  });

  describe('Given an EventStore is provided', () => {
    it('When flagUnresolved succeeds, Then an ItemFlagged event is emitted', () => {
      const session = makeSession('ABCDEF', makeJam());
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.flagUnresolved('ABCDEF', {
        description: 'Unclear payment aggregate ownership',
        flaggedBy: 'Alice',
      });
      const events = eventStore.getEvents('ABCDEF');
      const flagEvent = events.find((e) => e.type === 'ItemFlagged');
      expect(flagEvent).toBeDefined();
      expect((flagEvent as { description: string }).description).toBe('Unclear payment aggregate ownership');
      expect((flagEvent as { flaggedBy: string }).flaggedBy).toBe('Alice');
    });

    it('When flagUnresolved is called with relatedOverlap, Then the event includes relatedOverlap', () => {
      const session = makeSession('ABCDEF', makeJam());
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.flagUnresolved('ABCDEF', {
        description: 'TBD',
        flaggedBy: 'Alice',
        relatedOverlap: 'OrderPlaced vs OrderCreated',
      });
      const events = eventStore.getEvents('ABCDEF');
      const flagEvent = events.find((e) => e.type === 'ItemFlagged');
      expect((flagEvent as { relatedOverlap?: string }).relatedOverlap).toBe('OrderPlaced vs OrderCreated');
    });

    it('When flagUnresolved returns null, Then no event is emitted', () => {
      const session = makeSession();
      const eventStore = new EventStore();
      const svc = new AgreementService(makeGetSession(session), eventStore);
      svc.flagUnresolved('ABCDEF', { description: 'TBD', flaggedBy: 'Alice' });
      expect(eventStore.getSessionCodes()).toHaveLength(0);
    });
  });

  describe('Given no EventStore is provided', () => {
    it('When flagUnresolved is called, Then it works without emitting events (backward compat)', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      const result = svc.flagUnresolved('ABCDEF', { description: 'TBD', flaggedBy: 'Alice' });
      expect(result).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// exportJam
// ---------------------------------------------------------------------------

describe('AgreementService.exportJam', () => {
  describe('Given a session with jam started and artifacts', () => {
    it('When exportJam is called, Then it returns all jam artifacts', () => {
      const session = makeSession('ABCDEF', makeJam());
      const svc = new AgreementService(makeGetSession(session));
      svc.resolveConflict('ABCDEF', {
        overlapLabel: 'test',
        resolution: 'resolved',
        chosenApproach: 'merge',
        resolvedBy: ['Alice'],
      });
      svc.assignOwnership('ABCDEF', { aggregate: 'Order', ownerRole: 'Sales', assignedBy: 'Alice' });
      svc.flagUnresolved('ABCDEF', { description: 'TBD', flaggedBy: 'Alice' });

      const jam = svc.exportJam('ABCDEF');
      expect(jam).not.toBeNull();
      expect(jam!.resolutions).toHaveLength(1);
      expect(jam!.ownershipMap).toHaveLength(1);
      expect(jam!.unresolved).toHaveLength(1);
    });
  });

  describe('Given a session with no jam', () => {
    it('When exportJam is called, Then it returns null', () => {
      const session = makeSession();
      const svc = new AgreementService(makeGetSession(session));
      expect(svc.exportJam('ABCDEF')).toBeNull();
    });
  });

  describe('Given an unknown session', () => {
    it('When exportJam is called, Then it returns null', () => {
      const svc = new AgreementService(makeGetSession(null));
      expect(svc.exportJam('XXXXXX')).toBeNull();
    });
  });
});
