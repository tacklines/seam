import { describe, it, expect } from 'vitest';
import { DecompositionService } from './decomposition-service.js';
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

function makeService(session: Session | null): DecompositionService {
  const getSession = (code: string) =>
    session && session.code === code ? session : null;
  return new DecompositionService(getSession);
}

// ---------------------------------------------------------------------------
// createWorkItem
// ---------------------------------------------------------------------------

describe('DecompositionService.createWorkItem', () => {
  it('creates a new work item and assigns an id', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.createWorkItem('TEST01', {
      title: 'Build payment flow',
      description: 'Implement end-to-end payment handling',
      acceptanceCriteria: ['Payments succeed', 'Errors are handled'],
      complexity: 'M',
      linkedEvents: ['PaymentSucceeded'],
      dependencies: [],
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(result!.title).toBe('Build payment flow');
    expect(result!.complexity).toBe('M');
    expect(session.workItems).toHaveLength(1);
    expect(session.workItems[0].id).toBe(result!.id);
  });

  it('returns null when the session does not exist', () => {
    const svc = makeService(null);
    const result = svc.createWorkItem('NOCODE', {
      title: 'Orphan item',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: [],
      dependencies: [],
    });
    expect(result).toBeNull();
  });

  it('creates multiple distinct work items with unique ids', () => {
    const session = makeSession();
    const svc = makeService(session);

    const a = svc.createWorkItem('TEST01', {
      title: 'Item A',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: ['EventA'],
      dependencies: [],
    });
    const b = svc.createWorkItem('TEST01', {
      title: 'Item B',
      description: '',
      acceptanceCriteria: [],
      complexity: 'L',
      linkedEvents: ['EventB'],
      dependencies: [],
    });

    expect(a!.id).not.toBe(b!.id);
    expect(session.workItems).toHaveLength(2);
  });

  it('emits WorkItemCreated domain event when eventStore is provided', () => {
    const session = makeSession();
    const emitted: unknown[] = [];
    const eventStore = {
      append: (_code: string, event: unknown) => emitted.push(event),
      getEvents: () => [],
    } as any;

    const svc = new DecompositionService(
      (code) => (code === 'TEST01' ? session : null),
      eventStore
    );

    svc.createWorkItem('TEST01', {
      title: 'Ship it',
      description: '',
      acceptanceCriteria: [],
      complexity: 'XL',
      linkedEvents: ['OrderShipped'],
      dependencies: [],
    });

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as any).type).toBe('WorkItemCreated');
    expect((emitted[0] as any).workItem.title).toBe('Ship it');
  });
});

// ---------------------------------------------------------------------------
// getDecomposition
// ---------------------------------------------------------------------------

describe('DecompositionService.getDecomposition', () => {
  it('returns all work items for the session', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.createWorkItem('TEST01', {
      title: 'Item A',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: [],
      dependencies: [],
    });
    svc.createWorkItem('TEST01', {
      title: 'Item B',
      description: '',
      acceptanceCriteria: [],
      complexity: 'M',
      linkedEvents: [],
      dependencies: [],
    });

    const items = svc.getDecomposition('TEST01');
    expect(items).not.toBeNull();
    expect(items!).toHaveLength(2);
    expect(items!.map((i) => i.title)).toContain('Item A');
    expect(items!.map((i) => i.title)).toContain('Item B');
  });

  it('returns empty array when no work items have been created', () => {
    const session = makeSession();
    const svc = makeService(session);

    const items = svc.getDecomposition('TEST01');
    expect(items).toEqual([]);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    expect(svc.getDecomposition('NOCODE')).toBeNull();
  });

  it('returns a copy — mutations do not affect session state', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.createWorkItem('TEST01', {
      title: 'Item A',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: [],
      dependencies: [],
    });

    const items = svc.getDecomposition('TEST01')!;
    items.push({} as any);

    expect(session.workItems).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setDependency
// ---------------------------------------------------------------------------

describe('DecompositionService.setDependency', () => {
  it('records a dependency between two work items', () => {
    const session = makeSession();
    const svc = makeService(session);

    const result = svc.setDependency('TEST01', {
      fromId: 'item-1',
      toId: 'item-2',
      participantId: 'p1',
    });

    expect(result).not.toBeNull();
    expect(result!.fromId).toBe('item-1');
    expect(result!.toId).toBe('item-2');
    expect(result!.participantId).toBe('p1');
    expect(result!.setAt).toBeTruthy();
    expect(session.workItemDependencies).toHaveLength(1);
  });

  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    const result = svc.setDependency('NOCODE', {
      fromId: 'item-1',
      toId: 'item-2',
      participantId: 'p1',
    });
    expect(result).toBeNull();
  });

  it('is idempotent: second call with same fromId+toId returns existing record', () => {
    const session = makeSession();
    const svc = makeService(session);

    const first = svc.setDependency('TEST01', {
      fromId: 'item-1',
      toId: 'item-2',
      participantId: 'p1',
    });

    const second = svc.setDependency('TEST01', {
      fromId: 'item-1',
      toId: 'item-2',
      participantId: 'p2',
    });

    // Should return the same existing record
    expect(second!.setAt).toBe(first!.setAt);
    expect(second!.participantId).toBe('p1');
    // Only one dependency should exist
    expect(session.workItemDependencies).toHaveLength(1);
  });

  it('allows different dependencies with the same fromId but different toIds', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.setDependency('TEST01', { fromId: 'item-1', toId: 'item-2', participantId: 'p1' });
    svc.setDependency('TEST01', { fromId: 'item-1', toId: 'item-3', participantId: 'p1' });

    expect(session.workItemDependencies).toHaveLength(2);
  });

  it('emits DependencySet domain event on first creation', () => {
    const session = makeSession();
    const emitted: unknown[] = [];
    const eventStore = {
      append: (_code: string, event: unknown) => emitted.push(event),
      getEvents: () => [],
    } as any;

    const svc = new DecompositionService(
      (code) => (code === 'TEST01' ? session : null),
      eventStore
    );

    svc.setDependency('TEST01', { fromId: 'item-1', toId: 'item-2', participantId: 'p1' });

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as any).type).toBe('DependencySet');
    expect((emitted[0] as any).fromItemId).toBe('item-1');
    expect((emitted[0] as any).toItemId).toBe('item-2');
  });

  it('does not emit an event on duplicate setDependency calls', () => {
    const session = makeSession();
    const emitted: unknown[] = [];
    const eventStore = {
      append: (_code: string, event: unknown) => emitted.push(event),
      getEvents: () => [],
    } as any;

    const svc = new DecompositionService(
      (code) => (code === 'TEST01' ? session : null),
      eventStore
    );

    svc.setDependency('TEST01', { fromId: 'item-1', toId: 'item-2', participantId: 'p1' });
    svc.setDependency('TEST01', { fromId: 'item-1', toId: 'item-2', participantId: 'p1' });

    expect(emitted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getCoverageMatrix
// ---------------------------------------------------------------------------

describe('DecompositionService.getCoverageMatrix', () => {
  it('returns null when session does not exist', () => {
    const svc = makeService(null);
    expect(svc.getCoverageMatrix('NOCODE')).toBeNull();
  });

  it('returns empty array when no work items have been created', () => {
    const session = makeSession();
    const svc = makeService(session);
    expect(svc.getCoverageMatrix('TEST01')).toEqual([]);
  });

  it('returns a coverage entry for each linked event', () => {
    const session = makeSession();
    const svc = makeService(session);

    const item = svc.createWorkItem('TEST01', {
      title: 'Handle payment',
      description: '',
      acceptanceCriteria: [],
      complexity: 'M',
      linkedEvents: ['PaymentSucceeded', 'PaymentFailed'],
      dependencies: [],
    });

    const matrix = svc.getCoverageMatrix('TEST01')!;
    expect(matrix).toHaveLength(2);

    const paymentSucceeded = matrix.find((e) => e.eventName === 'PaymentSucceeded');
    expect(paymentSucceeded).toBeDefined();
    expect(paymentSucceeded!.covered).toBe(true);
    expect(paymentSucceeded!.workItemIds).toContain(item!.id);
  });

  it('includes all work item ids that cover an event', () => {
    const session = makeSession();
    const svc = makeService(session);

    const item1 = svc.createWorkItem('TEST01', {
      title: 'Item 1',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: ['OrderPlaced'],
      dependencies: [],
    });
    const item2 = svc.createWorkItem('TEST01', {
      title: 'Item 2',
      description: '',
      acceptanceCriteria: [],
      complexity: 'M',
      linkedEvents: ['OrderPlaced', 'OrderShipped'],
      dependencies: [],
    });

    const matrix = svc.getCoverageMatrix('TEST01')!;

    const orderPlaced = matrix.find((e) => e.eventName === 'OrderPlaced');
    expect(orderPlaced).toBeDefined();
    expect(orderPlaced!.workItemIds).toContain(item1!.id);
    expect(orderPlaced!.workItemIds).toContain(item2!.id);
    expect(orderPlaced!.covered).toBe(true);

    const orderShipped = matrix.find((e) => e.eventName === 'OrderShipped');
    expect(orderShipped).toBeDefined();
    expect(orderShipped!.workItemIds).toHaveLength(1);
    expect(orderShipped!.workItemIds[0]).toBe(item2!.id);
  });

  it('deduplicates event names that appear in multiple work items', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.createWorkItem('TEST01', {
      title: 'Item 1',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: ['SharedEvent'],
      dependencies: [],
    });
    svc.createWorkItem('TEST01', {
      title: 'Item 2',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: ['SharedEvent'],
      dependencies: [],
    });

    const matrix = svc.getCoverageMatrix('TEST01')!;
    // SharedEvent should appear exactly once in the matrix
    const entries = matrix.filter((e) => e.eventName === 'SharedEvent');
    expect(entries).toHaveLength(1);
    expect(entries[0].workItemIds).toHaveLength(2);
  });

  it('returns entries sorted alphabetically by event name', () => {
    const session = makeSession();
    const svc = makeService(session);

    svc.createWorkItem('TEST01', {
      title: 'Item',
      description: '',
      acceptanceCriteria: [],
      complexity: 'S',
      linkedEvents: ['Zebra', 'Apple', 'Mango'],
      dependencies: [],
    });

    const matrix = svc.getCoverageMatrix('TEST01')!;
    const names = matrix.map((e) => e.eventName);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });
});
