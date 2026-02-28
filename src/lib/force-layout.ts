/**
 * Force-directed layout for the flow diagram.
 *
 * Pure synchronous function: takes LoadedFile[] data, returns positioned nodes
 * and edge groups compatible with the existing SVG rendering pipeline.
 * Uses d3-force simulation run synchronously (no animation).
 *
 * Returns the same types as runElkLayout so the rendering code is unchanged:
 *   LayoutNode[], LayoutCompound[], LayoutEdgeGroup[]
 *
 * Key differences from ELK layout:
 * - Edges are straight lines (no bend points / sections)
 * - Compound positions are derived from their children's final positions
 * - Simulation runs synchronously via sim.tick(N)
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { LoadedFile } from '../schema/types.js';
import { getAllAggregates } from './grouping.js';
import { getAggregateColorIndex } from './aggregate-colors.js';
import {
  NODE_W,
  NODE_H,
  COMPOUND_PADDING_TOP,
  COMPOUND_PADDING_SIDE,
  COMPOUND_PADDING_BOTTOM,
  eventNodeId,
} from './elk-layout.js';
import type {
  LayoutNode,
  LayoutCompound,
  LayoutEdgeGroup,
  LayoutEdge,
} from './elk-layout.js';

export interface ForceLayoutResult {
  compounds: LayoutCompound[];
  nodes: LayoutNode[];
  edgeGroups: LayoutEdgeGroup[];
  width: number;
  height: number;
}

/** Internal d3 simulation node */
interface SimNode extends SimulationNodeDatum {
  id: string;
  /** Aggregate ID for cluster force; undefined for external nodes */
  aggregate?: string;
}

/** Internal d3 simulation link */
type SimLink = SimulationLinkDatum<SimNode>;

/** Number of ticks to run before sampling final positions */
const TICKS = 300;

/** Padding added to the bounding box for the viewBox */
const VIEWBOX_PADDING = 80;

/**
 * Run a force-directed layout on the loaded files.
 *
 * Aggregates become compound containers (their bounds are computed from
 * their children's final positions). Domain events are simulation nodes
 * clustered around their aggregate. External systems are free-floating.
 */
export function runForceLayout(files: LoadedFile[]): ForceLayoutResult {
  if (files.length === 0) {
    return { compounds: [], nodes: [], edgeGroups: [], width: 800, height: 500 };
  }

  const allAggregates = getAllAggregates(files);

  // Collect events per aggregate and external systems
  const aggregateEvents = new Map<
    string,
    Array<{ name: string; trigger: string; confidence: string; direction: string; channel?: string }>
  >();
  const externals = new Set<string>();

  for (const file of files) {
    for (const event of file.data.domain_events) {
      const agg = event.aggregate;
      if (!aggregateEvents.has(agg)) {
        aggregateEvents.set(agg, []);
      }
      aggregateEvents.get(agg)!.push({
        name: event.name,
        trigger: event.trigger,
        confidence: event.confidence,
        direction: event.integration.direction,
        channel: event.integration.channel,
      });

      if (event.integration.channel &&
          (event.integration.direction === 'outbound' || event.integration.direction === 'inbound')) {
        externals.add(event.integration.channel);
      }
    }
  }

  // Build simulation nodes
  const simNodes: SimNode[] = [];
  const nodeIndex = new Map<string, SimNode>();

  // Aggregate centroids — virtual nodes used by the cluster force
  // (not rendered; used only to pull children into clusters)
  const centroidNodes = new Map<string, SimNode>();
  const aggregateList = [...aggregateEvents.keys()];

  for (let i = 0; i < aggregateList.length; i++) {
    const agg = aggregateList[i];
    // Spread centroids evenly around a circle to reduce initial overlap
    const angle = (i / aggregateList.length) * Math.PI * 2;
    const radius = 300;
    const centroid: SimNode = {
      id: `__centroid__${agg}`,
      aggregate: agg,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      // Fix centroids so event children cluster around stable points
      fx: Math.cos(angle) * radius,
      fy: Math.sin(angle) * radius,
    };
    centroidNodes.set(agg, centroid);
  }

  // Event (leaf) nodes
  for (const [aggId, events] of aggregateEvents) {
    const centroid = centroidNodes.get(aggId)!;
    for (const ev of events) {
      const id = eventNodeId(aggId, ev.name);
      const simNode: SimNode = {
        id,
        aggregate: aggId,
        // Start near their centroid with small jitter
        x: (centroid.fx ?? 0) + (Math.random() - 0.5) * 60,
        y: (centroid.fy ?? 0) + (Math.random() - 0.5) * 60,
      };
      simNodes.push(simNode);
      nodeIndex.set(id, simNode);
    }
  }

  // External system nodes — start at the periphery
  const extList = [...externals];
  for (let i = 0; i < extList.length; i++) {
    const ext = extList[i];
    const angle = (i / (extList.length || 1)) * Math.PI * 2;
    const simNode: SimNode = {
      id: ext,
      // No aggregate — free-floating
      x: Math.cos(angle) * 500,
      y: Math.sin(angle) * 500,
    };
    simNodes.push(simNode);
    nodeIndex.set(ext, simNode);
  }

  // All nodes for the simulation (centroids are fixed guides, not rendered)
  const allSimNodes: SimNode[] = [...centroidNodes.values(), ...simNodes];

  // Build links: event nodes -> their centroid (cluster pull)
  const centroidLinks: SimLink[] = [];
  for (const [aggId, events] of aggregateEvents) {
    const centroid = centroidNodes.get(aggId)!;
    for (const ev of events) {
      const childId = eventNodeId(aggId, ev.name);
      centroidLinks.push({ source: nodeIndex.get(childId)!, target: centroid });
    }
  }

  // Build links: event nodes <-> external systems (for flow topology)
  const edgeLinks: SimLink[] = [];
  for (const file of files) {
    for (const event of file.data.domain_events) {
      const childId = eventNodeId(event.aggregate, event.name);
      const childNode = nodeIndex.get(childId);
      if (!childNode) continue;

      if (event.integration.channel &&
          (event.integration.direction === 'outbound' || event.integration.direction === 'inbound')) {
        const extNode = nodeIndex.get(event.integration.channel);
        if (extNode) {
          edgeLinks.push({ source: childNode, target: extNode });
        }
      }
    }
  }

  // Run d3-force simulation synchronously
  const simulation = forceSimulation<SimNode>(allSimNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>([...centroidLinks, ...edgeLinks])
        .id((d) => d.id)
        .distance((link) => {
          // Shorter distance to centroid (cluster tightness) vs inter-system distance
          const target = link.target as SimNode;
          return target.id.startsWith('__centroid__') ? 80 : 220;
        })
        .strength((link) => {
          const target = link.target as SimNode;
          return target.id.startsWith('__centroid__') ? 0.8 : 0.3;
        }),
    )
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(0, 0))
    .force(
      'collide',
      forceCollide<SimNode>().radius(Math.max(NODE_W, NODE_H) * 0.8).strength(0.9),
    )
    .force(
      'clusterX',
      forceX<SimNode>().x((d) => {
        if (d.aggregate) {
          const centroid = centroidNodes.get(d.aggregate);
          return centroid?.fx ?? 0;
        }
        return 0;
      }).strength(0.2),
    )
    .force(
      'clusterY',
      forceY<SimNode>().y((d) => {
        if (d.aggregate) {
          const centroid = centroidNodes.get(d.aggregate);
          return centroid?.fy ?? 0;
        }
        return 0;
      }).strength(0.2),
    )
    .stop(); // Don't start the async loop

  // Run ticks synchronously
  for (let i = 0; i < TICKS; i++) {
    simulation.tick();
  }

  // Compute bounding box of all rendered nodes (not centroids)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of simNodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + NODE_W > maxX) maxX = x + NODE_W;
    if (y + NODE_H > maxY) maxY = y + NODE_H;
  }

  // Translate all nodes so the top-left is at (VIEWBOX_PADDING, VIEWBOX_PADDING)
  const offsetX = VIEWBOX_PADDING - minX;
  const offsetY = VIEWBOX_PADDING - minY;

  // Build LayoutNode[] (leaf event nodes + external system nodes)
  const layoutNodes: LayoutNode[] = [];

  for (const [aggId, events] of aggregateEvents) {
    const colorIndex = getAggregateColorIndex(aggId, allAggregates);
    for (const ev of events) {
      const id = eventNodeId(aggId, ev.name);
      const simNode = nodeIndex.get(id)!;
      layoutNodes.push({
        id,
        label: ev.name,
        kind: 'aggregate',
        colorIndex,
        x: (simNode.x ?? 0) + offsetX,
        y: (simNode.y ?? 0) + offsetY,
      });
    }
  }

  for (const ext of externals) {
    const simNode = nodeIndex.get(ext)!;
    layoutNodes.push({
      id: ext,
      label: ext,
      kind: 'external',
      colorIndex: -1,
      x: (simNode.x ?? 0) + offsetX,
      y: (simNode.y ?? 0) + offsetY,
    });
  }

  // Build LayoutCompound[] — bounds derived from child positions
  const layoutCompounds: LayoutCompound[] = [];

  for (const [aggId, events] of aggregateEvents) {
    const colorIndex = getAggregateColorIndex(aggId, allAggregates);
    const childIds = events.map((ev) => eventNodeId(aggId, ev.name));

    // Find bounds of all children
    let cMinX = Infinity;
    let cMinY = Infinity;
    let cMaxX = -Infinity;
    let cMaxY = -Infinity;

    for (const childId of childIds) {
      const n = layoutNodes.find((ln) => ln.id === childId);
      if (!n) continue;
      if (n.x < cMinX) cMinX = n.x;
      if (n.y < cMinY) cMinY = n.y;
      if (n.x + NODE_W > cMaxX) cMaxX = n.x + NODE_W;
      if (n.y + NODE_H > cMaxY) cMaxY = n.y + NODE_H;
    }

    // Apply padding around the children
    const compoundX = cMinX - COMPOUND_PADDING_SIDE;
    const compoundY = cMinY - COMPOUND_PADDING_TOP;
    const compoundW = (cMaxX - cMinX) + COMPOUND_PADDING_SIDE * 2;
    const compoundH = (cMaxY - cMinY) + COMPOUND_PADDING_TOP + COMPOUND_PADDING_BOTTOM;

    layoutCompounds.push({
      id: aggId,
      label: aggId,
      colorIndex,
      x: compoundX,
      y: compoundY,
      width: compoundW,
      height: compoundH,
      childIds,
    });
  }

  // Build LayoutEdgeGroup[] — straight lines (no ELK sections)
  const groupMap = new Map<string, LayoutEdgeGroup>();

  for (const file of files) {
    for (const event of file.data.domain_events) {
      const childId = eventNodeId(event.aggregate, event.name);

      let fromId: string;
      let toId: string;

      if (event.integration.direction === 'outbound' && event.integration.channel) {
        fromId = childId;
        toId = event.integration.channel;
      } else if (event.integration.direction === 'inbound' && event.integration.channel) {
        fromId = event.integration.channel;
        toId = childId;
      } else {
        // internal — no edge needed; skip entirely
        continue;
      }

      const key = `${fromId}::${toId}`;
      let group = groupMap.get(key);
      if (!group) {
        // No sections for force layout — straight-line rendering
        group = { from: fromId, to: toId, edges: [] };
        groupMap.set(key, group);
      }

      const edge: LayoutEdge = {
        label: event.name,
        trigger: event.trigger,
        confidence: event.confidence,
        direction: event.integration.direction,
      };
      group.edges.push(edge);
    }
  }

  // Compute final viewBox dimensions
  const graphWidth = (maxX - minX) + VIEWBOX_PADDING * 2;
  const graphHeight = (maxY - minY) + VIEWBOX_PADDING * 2;

  return {
    compounds: layoutCompounds,
    nodes: layoutNodes,
    edgeGroups: [...groupMap.values()],
    width: Math.max(graphWidth, 800),
    height: Math.max(graphHeight, 500),
  };
}
