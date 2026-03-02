import { describe, it, expect } from 'vitest';
import { generateEventGapHints } from './event-gap-hints.js';
import type { DomainEvent } from '../schema/types.js';

function makeEvent(name: string, aggregate: string): DomainEvent {
  return {
    name,
    aggregate,
    trigger: 'test trigger',
    payload: [],
    integration: { direction: 'internal' },
    confidence: 'CONFIRMED',
  };
}

describe('generateEventGapHints', () => {
  describe('Pattern 1: XCreated without XFailed', () => {
    it('suggests XFailed when XCreated exists without XFailed', () => {
      const events = [makeEvent('OrderCreated', 'Order')];
      const hints = generateEventGapHints(events);
      const hint = hints.find((h) => h.name === 'OrderFailed');
      expect(hint).toBeDefined();
      expect(hint!.aggregate).toBe('Order');
      expect(hint!.nearEventId).toBe('Order::OrderCreated');
      expect(hint!.reason).toContain('OrderFailed');
    });

    it('does not suggest XFailed when XFailed already exists', () => {
      const events = [
        makeEvent('OrderCreated', 'Order'),
        makeEvent('OrderFailed', 'Order'),
      ];
      const hints = generateEventGapHints(events);
      expect(hints.find((h) => h.name === 'OrderFailed')).toBeUndefined();
    });

    it('works for multiple aggregates independently', () => {
      const events = [
        makeEvent('UserCreated', 'User'),
        makeEvent('PaymentCreated', 'Payment'),
        makeEvent('PaymentFailed', 'Payment'),
      ];
      const hints = generateEventGapHints(events);
      expect(hints.find((h) => h.name === 'UserFailed')).toBeDefined();
      expect(hints.find((h) => h.name === 'PaymentFailed')).toBeUndefined();
    });
  });

  describe('Pattern 2: XRequested without XCompleted or XRejected', () => {
    it('suggests both XCompleted and XRejected when only XRequested exists', () => {
      const events = [makeEvent('PaymentRequested', 'Payment')];
      const hints = generateEventGapHints(events);
      const completed = hints.find((h) => h.name === 'PaymentCompleted');
      const rejected = hints.find((h) => h.name === 'PaymentRejected');
      expect(completed).toBeDefined();
      expect(rejected).toBeDefined();
      expect(completed!.nearEventId).toBe('Payment::PaymentRequested');
      expect(rejected!.nearEventId).toBe('Payment::PaymentRequested');
    });

    it('only suggests XRejected when XCompleted already exists', () => {
      const events = [
        makeEvent('PaymentRequested', 'Payment'),
        makeEvent('PaymentCompleted', 'Payment'),
      ];
      const hints = generateEventGapHints(events);
      expect(hints.find((h) => h.name === 'PaymentCompleted')).toBeUndefined();
      expect(hints.find((h) => h.name === 'PaymentRejected')).toBeDefined();
    });

    it('only suggests XCompleted when XRejected already exists', () => {
      const events = [
        makeEvent('PaymentRequested', 'Payment'),
        makeEvent('PaymentRejected', 'Payment'),
      ];
      const hints = generateEventGapHints(events);
      expect(hints.find((h) => h.name === 'PaymentCompleted')).toBeDefined();
      expect(hints.find((h) => h.name === 'PaymentRejected')).toBeUndefined();
    });

    it('suggests no hints when both XCompleted and XRejected exist', () => {
      const events = [
        makeEvent('PaymentRequested', 'Payment'),
        makeEvent('PaymentCompleted', 'Payment'),
        makeEvent('PaymentRejected', 'Payment'),
      ];
      const hints = generateEventGapHints(events);
      const requestHints = hints.filter((h) => h.name.startsWith('Payment'));
      expect(requestHints.length).toBe(0);
    });
  });

  describe('Pattern 3: XPlaced without XCancelled', () => {
    it('suggests XCancelled when XPlaced exists without XCancelled', () => {
      const events = [makeEvent('OrderPlaced', 'Order')];
      const hints = generateEventGapHints(events);
      const hint = hints.find((h) => h.name === 'OrderCancelled');
      expect(hint).toBeDefined();
      expect(hint!.aggregate).toBe('Order');
      expect(hint!.nearEventId).toBe('Order::OrderPlaced');
    });

    it('does not suggest XCancelled when it already exists', () => {
      const events = [
        makeEvent('OrderPlaced', 'Order'),
        makeEvent('OrderCancelled', 'Order'),
      ];
      const hints = generateEventGapHints(events);
      expect(hints.find((h) => h.name === 'OrderCancelled')).toBeUndefined();
    });
  });

  describe('Pattern 4: Command events without failure events for aggregate', () => {
    it('suggests a failure event when aggregate has Submitted events but no failure events', () => {
      const events = [makeEvent('OrderSubmitted', 'Order')];
      const hints = generateEventGapHints(events);
      const hint = hints.find((h) => h.aggregate === 'Order' && h.name.endsWith('Failed'));
      expect(hint).toBeDefined();
      expect(hint!.reason).toContain('Order');
      expect(hint!.reason).toContain('OrderSubmitted');
    });

    it('suggests a failure event when aggregate has Initiated events but no failure events', () => {
      const events = [makeEvent('WorkflowInitiated', 'Workflow')];
      const hints = generateEventGapHints(events);
      const hint = hints.find((h) => h.aggregate === 'Workflow' && h.name.endsWith('Failed'));
      expect(hint).toBeDefined();
    });

    it('does not suggest aggregate failure when aggregate already has Cancelled event', () => {
      const events = [
        makeEvent('OrderSubmitted', 'Order'),
        makeEvent('OrderCancelled', 'Order'),
      ];
      const hints = generateEventGapHints(events);
      // Pattern 4 should not add hint since aggregate has a failure-type event
      const p4Hints = hints.filter((h) => h.id.endsWith('-cmd'));
      expect(p4Hints.length).toBe(0);
    });

    it('does not suggest aggregate failure when aggregate already has Failed event', () => {
      const events = [
        makeEvent('OrderSubmitted', 'Order'),
        makeEvent('OrderFailed', 'Order'),
      ];
      const hints = generateEventGapHints(events);
      const p4Hints = hints.filter((h) => h.id.endsWith('-cmd'));
      expect(p4Hints.length).toBe(0);
    });
  });

  describe('empty and no-op cases', () => {
    it('returns empty array for no events', () => {
      expect(generateEventGapHints([])).toEqual([]);
    });

    it('returns no hints for events that have no patterns', () => {
      const events = [makeEvent('DomainEventHappened', 'Context')];
      const hints = generateEventGapHints(events);
      expect(hints).toEqual([]);
    });

    it('hint IDs are unique', () => {
      const events = [
        makeEvent('OrderCreated', 'Order'),
        makeEvent('OrderPlaced', 'Order'),
        makeEvent('OrderRequested', 'Order'),
      ];
      const hints = generateEventGapHints(events);
      const ids = hints.map((h) => h.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
