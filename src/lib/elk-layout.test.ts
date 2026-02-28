import { describe, it, expect } from 'vitest';
import { runElkLayout, NODE_W, NODE_H } from './elk-layout.js';
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

describe('runElkLayout', () => {
  describe('given a file with two aggregates connected by an outbound event', () => {
    it('returns positioned nodes with valid x/y coordinates', async () => {
      const files = [
        makeFile('ops', [
          {
            name: 'OrderPlaced',
            aggregate: 'Order',
            direction: 'outbound',
            channel: 'PaymentService',
          },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.nodes.length).toBe(2); // Order + PaymentService
      for (const node of result.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns node ids matching aggregate and external names', async () => {
      const files = [
        makeFile('ops', [
          {
            name: 'OrderPlaced',
            aggregate: 'Order',
            direction: 'outbound',
            channel: 'PaymentService',
          },
        ]),
      ];

      const result = await runElkLayout(files);

      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(['Order', 'PaymentService'].sort());
    });

    it('marks aggregate nodes with kind=aggregate and external nodes with kind=external', async () => {
      const files = [
        makeFile('ops', [
          {
            name: 'OrderPlaced',
            aggregate: 'Order',
            direction: 'outbound',
            channel: 'PaymentService',
          },
        ]),
      ];

      const result = await runElkLayout(files);

      const orderNode = result.nodes.find((n) => n.id === 'Order');
      const externalNode = result.nodes.find((n) => n.id === 'PaymentService');
      expect(orderNode?.kind).toBe('aggregate');
      expect(externalNode?.kind).toBe('external');
    });

    it('includes edge group connecting Order to PaymentService', async () => {
      const files = [
        makeFile('ops', [
          {
            name: 'OrderPlaced',
            aggregate: 'Order',
            direction: 'outbound',
            channel: 'PaymentService',
          },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.edgeGroups.length).toBeGreaterThan(0);
      const group = result.edgeGroups.find(
        (g) => g.from === 'Order' && g.to === 'PaymentService',
      );
      expect(group).toBeDefined();
      expect(group?.edges[0].label).toBe('OrderPlaced');
    });
  });

  describe('given internal (self-loop) events only', () => {
    it('returns single aggregate node with valid position', async () => {
      const files = [
        makeFile('ops', [
          { name: 'StateUpdated', aggregate: 'Order', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.nodes.length).toBe(1);
      const node = result.nodes[0];
      expect(node.kind).toBe('aggregate');
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
    });

    it('returns a self-loop edge group', async () => {
      const files = [
        makeFile('ops', [
          { name: 'StateUpdated', aggregate: 'Order', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      const selfLoop = result.edgeGroups.find(
        (g) => g.from === 'Order' && g.to === 'Order',
      );
      expect(selfLoop).toBeDefined();
      expect(selfLoop?.edges[0].label).toBe('StateUpdated');
    });
  });

  describe('given empty files array', () => {
    it('returns empty nodes and edge groups', async () => {
      const result = await runElkLayout([]);

      expect(result.nodes).toHaveLength(0);
      expect(result.edgeGroups).toHaveLength(0);
    });

    it('returns positive width and height', async () => {
      const result = await runElkLayout([]);

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('given a single aggregate with no edges', () => {
    it('returns one node with valid x/y', async () => {
      const files = [
        makeFile('ops', [
          { name: 'SomethingHappened', aggregate: 'Inventory', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.nodes.length).toBe(1);
      const node = result.nodes[0];
      expect(node.id).toBe('Inventory');
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe('given multiple files with overlapping aggregates', () => {
    it('deduplicates aggregate nodes', async () => {
      const files = [
        makeFile('role-a', [
          { name: 'EventA', aggregate: 'Shared', direction: 'internal' },
        ]),
        makeFile('role-b', [
          { name: 'EventB', aggregate: 'Shared', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      const sharedNodes = result.nodes.filter((n) => n.id === 'Shared');
      expect(sharedNodes.length).toBe(1);
    });

    it('groups both events into the same self-loop edge group', async () => {
      const files = [
        makeFile('role-a', [
          { name: 'EventA', aggregate: 'Shared', direction: 'internal' },
        ]),
        makeFile('role-b', [
          { name: 'EventB', aggregate: 'Shared', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      const selfLoop = result.edgeGroups.find(
        (g) => g.from === 'Shared' && g.to === 'Shared',
      );
      expect(selfLoop).toBeDefined();
      expect(selfLoop?.edges.length).toBe(2);
    });
  });

  describe('given an inbound event from external', () => {
    it('places external node as source with kind=external', async () => {
      const files = [
        makeFile('ops', [
          {
            name: 'PaymentReceived',
            aggregate: 'Order',
            direction: 'inbound',
            channel: 'StripeWebhook',
          },
        ]),
      ];

      const result = await runElkLayout(files);

      const externalNode = result.nodes.find((n) => n.id === 'StripeWebhook');
      expect(externalNode?.kind).toBe('external');

      const group = result.edgeGroups.find(
        (g) => g.from === 'StripeWebhook' && g.to === 'Order',
      );
      expect(group).toBeDefined();
    });
  });

  describe('layout dimensions', () => {
    it('returns width and height larger than a single node', async () => {
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
