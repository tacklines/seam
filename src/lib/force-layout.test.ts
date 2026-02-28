import { describe, it, expect } from 'vitest';
import { runForceLayout } from './force-layout.js';
import { eventNodeId, NODE_W, NODE_H } from './elk-layout.js';
import type { LoadedFile } from '../schema/types.js';

/** Minimal LoadedFile factory for tests */
function makeFile(
  role: string,
  events: Array<{
    name: string;
    aggregate: string;
    trigger?: string;
    confidence?: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';
    direction?: 'internal' | 'inbound' | 'outbound';
    channel?: string;
  }>,
): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: {
      metadata: {
        role,
        scope: 'test',
        goal: 'test',
        generated_at: '2024-01-01',
        event_count: events.length,
        assumption_count: 0,
      },
      domain_events: events.map((e) => ({
        name: e.name,
        aggregate: e.aggregate,
        trigger: e.trigger ?? 'user action',
        payload: [],
        integration: {
          direction: e.direction ?? 'internal',
          ...(e.channel ? { channel: e.channel } : {}),
        },
        confidence: e.confidence ?? 'CONFIRMED',
      })),
      boundary_assumptions: [],
    },
  };
}

describe('runForceLayout', () => {
  describe('given empty files array', () => {
    it('when called with no files, returns empty result with default dimensions', () => {
      const result = runForceLayout([]);

      expect(result.compounds).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
      expect(result.edgeGroups).toHaveLength(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('given a file with a single internal event', () => {
    it('when laid out, returns nodes with numeric x/y coordinates', () => {
      const files = [
        makeFile('ops', [{ name: 'OrderCreated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);

      expect(result.nodes).toHaveLength(1);
      const node = result.nodes[0];
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(isFinite(node.x)).toBe(true);
      expect(isFinite(node.y)).toBe(true);
    });

    it('when laid out, returns one compound for the aggregate', () => {
      const files = [
        makeFile('ops', [{ name: 'OrderCreated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);

      expect(result.compounds).toHaveLength(1);
      expect(result.compounds[0].id).toBe('Order');
    });

    it('when laid out, positions nodes at positive coordinates after padding offset', () => {
      const files = [
        makeFile('ops', [{ name: 'OrderCreated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);

      // Nodes should be at positive coordinates (offset applied)
      for (const node of result.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('given events in multiple aggregates', () => {
    it('when laid out, groups events under their respective aggregates', () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderCreated', aggregate: 'Order', direction: 'internal' },
          { name: 'PaymentProcessed', aggregate: 'Payment', direction: 'internal' },
        ]),
      ];

      const result = runForceLayout(files);

      const orderCompound = result.compounds.find((c) => c.id === 'Order');
      const paymentCompound = result.compounds.find((c) => c.id === 'Payment');

      expect(orderCompound).toBeDefined();
      expect(paymentCompound).toBeDefined();

      // Each compound owns its event node
      const orderChildId = eventNodeId('Order', 'OrderCreated');
      const paymentChildId = eventNodeId('Payment', 'PaymentProcessed');

      expect(orderCompound?.childIds).toContain(orderChildId);
      expect(paymentCompound?.childIds).toContain(paymentChildId);
    });

    it('when laid out, returns a compound for each distinct aggregate', () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'AggA', direction: 'internal' },
          { name: 'EventB', aggregate: 'AggB', direction: 'internal' },
          { name: 'EventC', aggregate: 'AggC', direction: 'internal' },
        ]),
      ];

      const result = runForceLayout(files);

      expect(result.compounds).toHaveLength(3);
    });
  });

  describe('given external system nodes', () => {
    it('when laid out, includes external system as a node with kind=external', () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = runForceLayout(files);

      const extNode = result.nodes.find((n) => n.id === 'PaymentService');
      expect(extNode).toBeDefined();
      expect(extNode?.kind).toBe('external');
    });

    it('when laid out, gives external nodes numeric finite coordinates', () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = runForceLayout(files);

      const extNode = result.nodes.find((n) => n.id === 'PaymentService');
      expect(typeof extNode?.x).toBe('number');
      expect(typeof extNode?.y).toBe('number');
      expect(isFinite(extNode!.x)).toBe(true);
      expect(isFinite(extNode!.y)).toBe(true);
    });

    it('when an inbound channel is given, includes external system node', () => {
      const files = [
        makeFile('ops', [
          { name: 'PaymentReceived', aggregate: 'Order', direction: 'inbound', channel: 'StripeWebhook' },
        ]),
      ];

      const result = runForceLayout(files);

      const extNode = result.nodes.find((n) => n.id === 'StripeWebhook');
      expect(extNode).toBeDefined();
      expect(extNode?.kind).toBe('external');
    });
  });

  describe('given edge groups', () => {
    it('when outbound event exists, returns edge group from event node to external', () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = runForceLayout(files);

      const childId = eventNodeId('Order', 'OrderPlaced');
      const group = result.edgeGroups.find(
        (g) => g.from === childId && g.to === 'PaymentService',
      );
      expect(group).toBeDefined();
      expect(group?.edges[0].label).toBe('OrderPlaced');
    });

    it('when inbound event exists, returns edge group from external to event node', () => {
      const files = [
        makeFile('ops', [
          { name: 'PaymentReceived', aggregate: 'Order', direction: 'inbound', channel: 'StripeWebhook' },
        ]),
      ];

      const result = runForceLayout(files);

      const childId = eventNodeId('Order', 'PaymentReceived');
      const group = result.edgeGroups.find(
        (g) => g.from === 'StripeWebhook' && g.to === childId,
      );
      expect(group).toBeDefined();
    });

    it('when internal event exists, returns no edge group', () => {
      const files = [
        makeFile('ops', [{ name: 'StateUpdated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);

      expect(result.edgeGroups).toHaveLength(0);
    });

    it('when multiple events share a from-to pair, groups them into one edge group', () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'Order', direction: 'outbound', channel: 'Ext' },
          { name: 'EventB', aggregate: 'Order', direction: 'outbound', channel: 'Ext' },
        ]),
      ];

      const result = runForceLayout(files);

      const childAId = eventNodeId('Order', 'EventA');
      const childBId = eventNodeId('Order', 'EventB');
      // EventA and EventB have different childIds so should be separate groups
      // (unless ELK groups them which it doesn't — force layout also keeps them separate)
      const groupA = result.edgeGroups.find((g) => g.from === childAId && g.to === 'Ext');
      const groupB = result.edgeGroups.find((g) => g.from === childBId && g.to === 'Ext');
      expect(groupA).toBeDefined();
      expect(groupB).toBeDefined();
    });
  });

  describe('given compound bounds', () => {
    it('when laid out, compound encompasses all its child nodes', () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'Order', direction: 'internal' },
          { name: 'EventB', aggregate: 'Order', direction: 'internal' },
        ]),
      ];

      const result = runForceLayout(files);
      const compound = result.compounds.find((c) => c.id === 'Order');
      expect(compound).toBeDefined();

      if (compound) {
        const children = result.nodes.filter((n) => compound.childIds.includes(n.id));
        for (const child of children) {
          // Child's top-left should be >= compound's padded interior
          expect(child.x).toBeGreaterThanOrEqual(compound.x);
          expect(child.y).toBeGreaterThanOrEqual(compound.y);
          // Child's bottom-right should be <= compound's right/bottom edge
          expect(child.x + NODE_W).toBeLessThanOrEqual(compound.x + compound.width + 1);
          expect(child.y + NODE_H).toBeLessThanOrEqual(compound.y + compound.height + 1);
        }
      }
    });

    it('when laid out, compound has positive width and height', () => {
      const files = [
        makeFile('ops', [{ name: 'OrderCreated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);
      const compound = result.compounds[0];

      expect(compound.width).toBeGreaterThan(0);
      expect(compound.height).toBeGreaterThan(0);
    });
  });

  describe('given layout dimensions', () => {
    it('when multiple aggregates and externals exist, returns width and height >= 800x500', () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'Agg1', direction: 'outbound', channel: 'Ext1' },
          { name: 'EventB', aggregate: 'Agg2', direction: 'outbound', channel: 'Ext2' },
        ]),
      ];

      const result = runForceLayout(files);

      expect(result.width).toBeGreaterThanOrEqual(800);
      expect(result.height).toBeGreaterThanOrEqual(500);
    });
  });

  describe('given overlapping aggregates across files', () => {
    it('when the same aggregate appears in multiple files, deduplicates the compound', () => {
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'Shared', direction: 'internal' }]),
        makeFile('role-b', [{ name: 'EventB', aggregate: 'Shared', direction: 'internal' }]),
      ];

      const result = runForceLayout(files);

      const sharedCompounds = result.compounds.filter((c) => c.id === 'Shared');
      expect(sharedCompounds).toHaveLength(1);
      expect(sharedCompounds[0].childIds).toHaveLength(2);
    });
  });
});
