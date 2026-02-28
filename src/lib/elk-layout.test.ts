import { describe, it, expect } from 'vitest';
import { runElkLayout, eventNodeId, NODE_W, NODE_H } from './elk-layout.js';
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

describe('eventNodeId', () => {
  it('when given aggregate and event name, returns scoped id', () => {
    // Source: discovered during implementation
    expect(eventNodeId('Order', 'OrderPlaced')).toBe('Order::OrderPlaced');
  });
});

describe('runElkLayout', () => {
  describe('given a file with an outbound event connecting to an external system', () => {
    it('when laid out, returns one compound for the aggregate', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.compounds).toHaveLength(1);
      expect(result.compounds[0].id).toBe('Order');
    });

    it('when laid out, places OrderPlaced as a child node inside the Order compound', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = await runElkLayout(files);

      const childId = eventNodeId('Order', 'OrderPlaced');
      const childNode = result.nodes.find((n) => n.id === childId);
      expect(childNode).toBeDefined();
      expect(childNode?.kind).toBe('aggregate');
      expect(childNode?.label).toBe('OrderPlaced');
    });

    it('when laid out, returns external system as a standalone node with kind=external', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = await runElkLayout(files);

      const extNode = result.nodes.find((n) => n.id === 'PaymentService');
      expect(extNode).toBeDefined();
      expect(extNode?.kind).toBe('external');
    });

    it('when laid out, includes an edge group from the event child to the external system', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = await runElkLayout(files);

      const childId = eventNodeId('Order', 'OrderPlaced');
      const group = result.edgeGroups.find(
        (g) => g.from === childId && g.to === 'PaymentService',
      );
      expect(group).toBeDefined();
      expect(group?.edges[0].label).toBe('OrderPlaced');
    });
  });

  describe('given internal (self-loop) events only', () => {
    it('when laid out, returns one compound with one child event node', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [{ name: 'StateUpdated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = await runElkLayout(files);

      expect(result.compounds).toHaveLength(1);
      expect(result.compounds[0].childIds).toHaveLength(1);
      expect(result.nodes).toHaveLength(1); // only the child event node
    });

    it('when laid out, returns a self-loop edge group on the child event node', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [{ name: 'StateUpdated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = await runElkLayout(files);

      const childId = eventNodeId('Order', 'StateUpdated');
      const selfLoop = result.edgeGroups.find(
        (g) => g.from === childId && g.to === childId,
      );
      expect(selfLoop).toBeDefined();
      expect(selfLoop?.edges[0].label).toBe('StateUpdated');
    });
  });

  describe('given empty files array', () => {
    it('when called with no files, returns empty result', async () => {
      // Source: discovered during implementation
      const result = await runElkLayout([]);

      expect(result.compounds).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
      expect(result.edgeGroups).toHaveLength(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('given multiple files with overlapping aggregates', () => {
    it('when laid out, deduplicates compound nodes', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'Shared', direction: 'internal' }]),
        makeFile('role-b', [{ name: 'EventB', aggregate: 'Shared', direction: 'internal' }]),
      ];

      const result = await runElkLayout(files);

      const sharedCompounds = result.compounds.filter((c) => c.id === 'Shared');
      expect(sharedCompounds).toHaveLength(1);
    });

    it('when laid out, groups both events as children of the shared compound', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('role-a', [{ name: 'EventA', aggregate: 'Shared', direction: 'internal' }]),
        makeFile('role-b', [{ name: 'EventB', aggregate: 'Shared', direction: 'internal' }]),
      ];

      const result = await runElkLayout(files);

      const compound = result.compounds.find((c) => c.id === 'Shared');
      expect(compound?.childIds).toHaveLength(2);
    });
  });

  describe('given an inbound event from external', () => {
    it('when laid out, places external as source with edge to child event node', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'PaymentReceived', aggregate: 'Order', direction: 'inbound', channel: 'StripeWebhook' },
        ]),
      ];

      const result = await runElkLayout(files);

      const extNode = result.nodes.find((n) => n.id === 'StripeWebhook');
      expect(extNode?.kind).toBe('external');

      const childId = eventNodeId('Order', 'PaymentReceived');
      const group = result.edgeGroups.find(
        (g) => g.from === 'StripeWebhook' && g.to === childId,
      );
      expect(group).toBeDefined();
    });
  });

  describe('layout dimensions', () => {
    it('when multiple compounds and externals exist, returns width and height larger than one node', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'A', aggregate: 'Agg1', direction: 'outbound', channel: 'Ext1' },
          { name: 'B', aggregate: 'Agg2', direction: 'outbound', channel: 'Ext2' },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.width).toBeGreaterThan(NODE_W);
      expect(result.height).toBeGreaterThan(NODE_H);
    });
  });
});
