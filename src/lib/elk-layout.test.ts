import { describe, it, expect } from 'vitest';
import { runElkLayout, eventNodeId, elkSectionToPath, straightEdgePath, NODE_W, NODE_H } from './elk-layout.js';
import type { EdgeSection } from './elk-layout.js';
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

    it('when laid out, returns no edge group for internal events', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [{ name: 'StateUpdated', aggregate: 'Order', direction: 'internal' }]),
      ];

      const result = await runElkLayout(files);

      expect(result.edgeGroups).toHaveLength(0);
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

  describe('horizontal packing of disconnected bounded contexts', () => {
    it('when three disconnected aggregates exist, layout is wider than it is tall', async () => {
      // Regression: ELK was stacking disconnected components vertically.
      // With separateConnectedComponents=true and aspectRatio=1.6, ELK should
      // pack them side-by-side producing a wider-than-tall layout.
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'AggregateA', direction: 'internal' },
          { name: 'EventB', aggregate: 'AggregateB', direction: 'internal' },
          { name: 'EventC', aggregate: 'AggregateC', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      // Three disconnected aggregates should be packed horizontally
      expect(result.compounds).toHaveLength(3);
      // Overall layout should be landscape-oriented (wider than tall)
      expect(result.width).toBeGreaterThan(result.height);
    });

    it('when three disconnected aggregates exist, they are not all in a single vertical column', async () => {
      // A single vertical column would have all compounds at roughly the same x coordinate.
      // With horizontal packing, compounds should span a meaningful x range (> NODE_W).
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'AggregateA', direction: 'internal' },
          { name: 'EventB', aggregate: 'AggregateB', direction: 'internal' },
          { name: 'EventC', aggregate: 'AggregateC', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      const xs = result.compounds.map((c) => c.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      // Compounds should spread across more than one node width horizontally
      expect(maxX - minX).toBeGreaterThan(NODE_W);
    });

    it('when four disconnected aggregates exist, layout is wider than tall', async () => {
      const files = [
        makeFile('ops', [
          { name: 'E1', aggregate: 'Agg1', direction: 'internal' },
          { name: 'E2', aggregate: 'Agg2', direction: 'internal' },
          { name: 'E3', aggregate: 'Agg3', direction: 'internal' },
          { name: 'E4', aggregate: 'Agg4', direction: 'internal' },
        ]),
      ];

      const result = await runElkLayout(files);

      expect(result.width).toBeGreaterThan(result.height);
    });
  });

  describe('edge group sections', () => {
    it('when outbound edge exists, edge group has sections array', async () => {
      // Source: discovered during implementation
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];

      const result = await runElkLayout(files);

      const childId = eventNodeId('Order', 'OrderPlaced');
      const group = result.edgeGroups.find((g) => g.from === childId && g.to === 'PaymentService');
      // sections may be populated or empty depending on ELK output, but array exists
      expect(group).toBeDefined();
      expect(Array.isArray(group?.sections)).toBe(true);
    });
  });

  describe('given a collapsed aggregate', () => {
    it('when aggregate is collapsed, returns a collapsedAggregates entry instead of a compound', async () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      expect(result.collapsedAggregates).toHaveLength(1);
      expect(result.collapsedAggregates[0].id).toBe('Order');
      expect(result.collapsedAggregates[0].eventCount).toBe(1);
    });

    it('when aggregate is collapsed, no compound is returned for that aggregate', async () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      const orderCompound = result.compounds.find((c) => c.id === 'Order');
      expect(orderCompound).toBeUndefined();
    });

    it('when aggregate is collapsed, edges reference aggregate id not child event id', async () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      const group = result.edgeGroups.find(
        (g) => g.from === 'Order' && g.to === 'PaymentService',
      );
      expect(group).toBeDefined();
      expect(group?.edges[0].label).toBe('OrderPlaced');
    });

    it('when aggregate is collapsed, internal events are excluded from edge groups', async () => {
      const files = [
        makeFile('ops', [
          { name: 'StateUpdated', aggregate: 'Order', direction: 'internal' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      expect(result.edgeGroups).toHaveLength(0);
    });

    it('when aggregate is collapsed, collapsed aggregate node appears in nodes for edge routing', async () => {
      const files = [
        makeFile('ops', [
          { name: 'OrderPlaced', aggregate: 'Order', direction: 'outbound', channel: 'PaymentService' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      const aggNode = result.nodes.find((n) => n.id === 'Order');
      expect(aggNode).toBeDefined();
      expect(aggNode?.kind).toBe('aggregate');
    });

    it('when aggregate is collapsed with multiple events, eventCount reflects all events', async () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'Order', direction: 'internal' },
          { name: 'EventB', aggregate: 'Order', direction: 'internal' },
          { name: 'EventC', aggregate: 'Order', direction: 'internal' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      expect(result.collapsedAggregates[0].eventCount).toBe(3);
    });

    it('when only one aggregate is collapsed out of two, the other remains expanded', async () => {
      const files = [
        makeFile('ops', [
          { name: 'EventA', aggregate: 'Order', direction: 'internal' },
          { name: 'EventB', aggregate: 'Customer', direction: 'internal' },
        ]),
      ];
      const collapsed = new Set(['Order']);

      const result = await runElkLayout(files, collapsed);

      expect(result.collapsedAggregates).toHaveLength(1);
      expect(result.compounds).toHaveLength(1);
      expect(result.compounds[0].id).toBe('Customer');
    });
  });
});

describe('elkSectionToPath', () => {
  describe('given a section with no bend points', () => {
    it('when called, returns an M...L straight path', () => {
      // Source: discovered during implementation
      const section: EdgeSection = {
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 100, y: 80 },
      };
      const path = elkSectionToPath(section);
      expect(path).toBe('M10 20 L100 80');
    });

    it('when called with empty bend points array, returns a straight path', () => {
      // Source: discovered during implementation
      const section: EdgeSection = {
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 50, y: 50 },
        bendPoints: [],
      };
      const path = elkSectionToPath(section);
      expect(path).toBe('M0 0 L50 50');
    });
  });

  describe('given a section with bend points', () => {
    it('when called with one bend point, returns a path starting with M and containing Q', () => {
      // Source: discovered during implementation
      const section: EdgeSection = {
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 100, y: 100 },
        bendPoints: [{ x: 50, y: 20 }],
      };
      const path = elkSectionToPath(section);
      expect(path).toMatch(/^M0 0/);
      expect(path).toContain('Q');
    });

    it('when called with multiple bend points, produces a smooth path', () => {
      // Source: discovered during implementation
      const section: EdgeSection = {
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 200, y: 0 },
        bendPoints: [
          { x: 50, y: 50 },
          { x: 100, y: 0 },
          { x: 150, y: 50 },
        ],
      };
      const path = elkSectionToPath(section);
      expect(path).toMatch(/^M0 0/);
      // Should end near endPoint
      expect(path).toContain('200');
    });
  });
});

describe('straightEdgePath', () => {
  describe('given zero perpendicular offset', () => {
    it('when called, returns a simple M...L straight line', () => {
      // Source: discovered during implementation
      const path = straightEdgePath(10, 20, 100, 80, 0);
      expect(path).toBe('M10 20 L100 80');
    });
  });

  describe('given non-zero perpendicular offset', () => {
    it('when called, returns a cubic bezier path with C control points', () => {
      // Source: discovered during implementation
      const path = straightEdgePath(0, 0, 100, 0, 20);
      expect(path).toMatch(/^M0 0 C/);
    });

    it('when called with negative offset, produces a path on the opposite side', () => {
      // Source: discovered during implementation
      const pathPos = straightEdgePath(0, 0, 100, 0, 20);
      const pathNeg = straightEdgePath(0, 0, 100, 0, -20);
      // Different offsets produce different paths
      expect(pathPos).not.toBe(pathNeg);
    });
  });
});
