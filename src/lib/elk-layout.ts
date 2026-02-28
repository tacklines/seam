/**
 * ELK-based layout for the flow diagram.
 *
 * Pure async function: takes LoadedFile[] data, returns positioned nodes and
 * edge groups ready for SVG rendering. No DOM dependencies.
 *
 * Compound node structure:
 * - Aggregates are compound (parent) ELK nodes
 * - Domain events are child nodes inside their parent aggregate
 * - External systems are standalone leaf nodes
 * - Edges connect event-child nodes to external system nodes (or other event nodes)
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { LoadedFile } from '../schema/types.js';
import { getAllAggregates } from './grouping.js';
import { getAggregateColorIndex } from './aggregate-colors.js';

export const NODE_W = 160;
export const NODE_H = 44;

/** Padding inside an aggregate container (top for header, sides, bottom) */
export const COMPOUND_PADDING_TOP = 32; // space for header label
export const COMPOUND_PADDING_SIDE = 12;
export const COMPOUND_PADDING_BOTTOM = 12;

export interface LayoutNode {
  id: string;
  label: string;
  kind: 'aggregate' | 'external';
  colorIndex: number;
  /** Top-left x from ELK output (absolute coordinates) */
  x: number;
  /** Top-left y from ELK output (absolute coordinates) */
  y: number;
}

/** A compound aggregate container rendered in the SVG */
export interface LayoutCompound {
  id: string;
  label: string;
  colorIndex: number;
  /** Top-left x */
  x: number;
  /** Top-left y */
  y: number;
  width: number;
  height: number;
  /** IDs of child event nodes contained within */
  childIds: string[];
}

export interface LayoutEdge {
  label: string;
  trigger: string;
  confidence: string;
  direction: string;
}

/** A single point in a path */
export interface PathPoint {
  x: number;
  y: number;
}

/** Edge routing data returned by ELK for one edge */
export interface EdgeSection {
  startPoint: PathPoint;
  endPoint: PathPoint;
  bendPoints?: PathPoint[];
}

export interface LayoutEdgeGroup {
  from: string;
  to: string;
  edges: LayoutEdge[];
  /**
   * ELK-computed edge sections indexed by edge position in `edges` array.
   * May be undefined if ELK did not return routing data for this group.
   */
  sections?: EdgeSection[];
}

export interface ElkLayoutResult {
  /** Compound aggregate containers */
  compounds: LayoutCompound[];
  /** Collapsed aggregate summary nodes */
  collapsedAggregates: CollapsedAggregate[];
  /** All leaf nodes: domain event children + external system nodes */
  nodes: LayoutNode[];
  edgeGroups: LayoutEdgeGroup[];
  /** Width of the laid-out graph, for SVG viewBox */
  width: number;
  /** Height of the laid-out graph, for SVG viewBox */
  height: number;
}

/**
 * Generate a stable unique ID for a domain event node within an aggregate.
 * Using aggregate::eventName to avoid collisions across aggregates.
 */
export function eventNodeId(aggregate: string, eventName: string): string {
  return `${aggregate}::${eventName}`;
}

/**
 * Build an SVG path string from an ELK EdgeSection.
 *
 * ELK SPLINES routing returns startPoint, optional bendPoints, endPoint.
 * We render this as a smooth polyline using quadratic Bezier curves
 * through each bend point, producing a visually clean routed path.
 *
 * Source: discovered during implementation
 */
export function elkSectionToPath(section: EdgeSection): string {
  const { startPoint, endPoint, bendPoints } = section;

  if (!bendPoints || bendPoints.length === 0) {
    // Straight line
    return `M${startPoint.x} ${startPoint.y} L${endPoint.x} ${endPoint.y}`;
  }

  const all = [startPoint, ...bendPoints, endPoint];
  let d = `M${all[0].x} ${all[0].y}`;

  if (all.length === 2) {
    d += ` L${all[1].x} ${all[1].y}`;
  } else {
    // Smooth curve through all points using cubic bezier with chord-length tangents
    // Use a simple approach: straight segments with rounded joins via quadratic bezier
    for (let i = 1; i < all.length - 1; i++) {
      const mid = {
        x: (all[i].x + all[i + 1].x) / 2,
        y: (all[i].y + all[i + 1].y) / 2,
      };
      d += ` Q${all[i].x} ${all[i].y} ${mid.x} ${mid.y}`;
    }
    const last = all[all.length - 1];
    d += ` L${last.x} ${last.y}`;
  }

  return d;
}

/**
 * Build an SVG path string for a straight edge between two points.
 * Returns a cubic bezier with mild curvature proportional to distance
 * to avoid stacking on top of other edges.
 *
 * Source: discovered during implementation
 */
export function straightEdgePath(
  x1: number, y1: number,
  x2: number, y2: number,
  perpOffset = 0,
): string {
  if (perpOffset === 0) {
    return `M${x1} ${y1} L${x2} ${y2}`;
  }
  // Perpendicular offset vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;

  const cpx1 = x1 + dx * 0.35 + nx * perpOffset;
  const cpy1 = y1 + dy * 0.35 + ny * perpOffset;
  const cpx2 = x1 + dx * 0.65 + nx * perpOffset;
  const cpy2 = y1 + dy * 0.65 + ny * perpOffset;

  return `M${x1} ${y1} C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${x2} ${y2}`;
}

/** A collapsed aggregate rendered as a compact summary node */
export interface CollapsedAggregate {
  id: string;
  label: string;
  colorIndex: number;
  x: number;
  y: number;
  /** Number of child events hidden inside */
  eventCount: number;
}

/** Gap between connected-component bounding boxes during reflow */
const COMPONENT_GAP = 60;
/** Target aspect ratio for component reflow (wider is more landscape) */
const TARGET_ASPECT_RATIO = 1.6;

/**
 * Reflow top-level ELK nodes into rows so that disconnected components
 * are arranged side-by-side rather than stacked in a single column.
 *
 * ELK's layered algorithm stacks disconnected components vertically when
 * `elk.direction: RIGHT`. This function identifies connected components
 * using union-find, computes each component's bounding box, and arranges
 * those boxes in rows targeting TARGET_ASPECT_RATIO.
 *
 * Returns a map from node ID to {dx, dy} offset to apply to ELK positions.
 */
export function computeComponentReflowOffsets(
  topNodes: ReadonlyArray<{ id: string; x: number; y: number; width: number; height: number }>,
  edges: ReadonlyArray<{ sourceId: string; targetId: string }>,
): Map<string, { dx: number; dy: number }> {
  if (topNodes.length === 0) {
    return new Map();
  }

  // Build a map from child node ID -> top-level parent ID.
  // For compound nodes, child IDs are like "Aggregate::EventName".
  // We need to map each edge endpoint (which may be a child ID) to a top-level node ID.
  const topNodeIds = new Set(topNodes.map((n) => n.id));
  const childToTop = new Map<string, string>();
  for (const node of topNodes) {
    childToTop.set(node.id, node.id);
    // Child nodes in compound have IDs like "AggId::ChildId" — map them to the parent
    // We don't have child IDs here, but edges reference child node IDs.
    // Child IDs are not top-level, so we check the prefix pattern "parentId::"
    // and add a general lookup: any edge endpoint that starts with parentId + "::" maps to parentId
  }

  // Union-Find for top-level node IDs
  const parent = new Map<string, string>(topNodes.map((n) => [n.id, n.id]));

  function find(id: string): string {
    const p = parent.get(id);
    if (p === undefined || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // For each edge, resolve both endpoints to top-level node IDs and union them
  for (const edge of edges) {
    // Resolve source to top-level node
    let srcTop = edge.sourceId;
    if (!topNodeIds.has(srcTop)) {
      // Try to find a top-level node whose ID is a prefix
      for (const topId of topNodeIds) {
        if (srcTop.startsWith(topId + '::')) {
          srcTop = topId;
          break;
        }
      }
    }
    // Resolve target to top-level node
    let tgtTop = edge.targetId;
    if (!topNodeIds.has(tgtTop)) {
      for (const topId of topNodeIds) {
        if (tgtTop.startsWith(topId + '::')) {
          tgtTop = topId;
          break;
        }
      }
    }

    if (topNodeIds.has(srcTop) && topNodeIds.has(tgtTop)) {
      union(srcTop, tgtTop);
    }
  }

  // Group top-level nodes by connected component root
  const componentMap = new Map<string, typeof topNodes[0][]>();
  for (const node of topNodes) {
    const root = find(node.id);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root)!.push(node);
  }

  const components = [...componentMap.values()];

  // If only one component (or all disconnected nodes have no reflow benefit), skip
  if (components.length <= 1) {
    return new Map();
  }

  // Compute bounding box for each component (using current ELK x/y positions)
  const componentBBoxes = components.map((nodes) => {
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    return { nodes, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  });

  // Sort components: larger (wider) first, then by area
  componentBBoxes.sort((a, b) => b.width * b.height - a.width * a.height);

  // Arrange components in rows targeting TARGET_ASPECT_RATIO.
  // Strategy: compute target columns = ceil(sqrt(n * TARGET_ASPECT_RATIO)), then
  // fill rows up to that column count. This ensures components are spread horizontally
  // regardless of absolute sizes.
  const n = componentBBoxes.length;
  const targetCols = Math.max(2, Math.ceil(Math.sqrt(n * TARGET_ASPECT_RATIO)));

  const rows: typeof componentBBoxes[] = [];
  for (let i = 0; i < n; i += targetCols) {
    rows.push(componentBBoxes.slice(i, i + targetCols));
  }

  // Compute new positions for each component bounding box
  const offsets = new Map<string, { dx: number; dy: number }>();
  const margin = 12;
  let cursorY = margin;

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((c) => c.height));
    let cursorX = margin;

    for (const comp of row) {
      // The offset needed to move this component to (cursorX, cursorY)
      const dx = cursorX - comp.minX;
      const dy = cursorY - comp.minY;

      for (const node of comp.nodes) {
        offsets.set(node.id, { dx, dy });
      }

      cursorX += comp.width + COMPONENT_GAP;
    }

    cursorY += rowHeight + COMPONENT_GAP;
  }

  return offsets;
}

/**
 * Run ELK layered layout with compound nodes.
 *
 * Aggregates become compound parent ELK nodes.
 * Domain events become child nodes inside their parent aggregate.
 * External systems become standalone leaf nodes.
 * Edges connect event-child nodes to external system nodes.
 * Internal events are self-loops on the aggregate's own event nodes (excluded from ELK edges).
 *
 * @param files - Loaded YAML files to lay out
 * @param collapsedAggregates - Set of aggregate IDs that should be collapsed to a single node
 */
export async function runElkLayout(
  files: LoadedFile[],
  collapsedAggregates: Set<string> = new Set(),
): Promise<ElkLayoutResult> {
  if (files.length === 0) {
    return { compounds: [], collapsedAggregates: [], nodes: [], edgeGroups: [], width: 800, height: 500 };
  }

  const allAggregates = getAllAggregates(files);

  // Collect all domain events per aggregate
  const aggregateEvents = new Map<string, Array<{ name: string; trigger: string; confidence: string; direction: string; channel?: string }>>();
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

      if (event.integration.direction === 'outbound' && event.integration.channel) {
        externals.add(event.integration.channel);
      } else if (event.integration.direction === 'inbound' && event.integration.channel) {
        externals.add(event.integration.channel);
      }
    }
  }

  // Build ELK compound children (aggregates as parents)
  // Collapsed aggregates become simple leaf nodes instead of compounds with children
  const elkCompoundChildren: ElkNode[] = [];

  for (const [aggId, events] of aggregateEvents) {
    if (collapsedAggregates.has(aggId)) {
      // Collapsed aggregate: single leaf node sized like a regular node
      elkCompoundChildren.push({
        id: aggId,
        width: NODE_W,
        height: NODE_H,
      });
    } else {
      const childNodes: ElkNode[] = events.map((ev) => ({
        id: eventNodeId(aggId, ev.name),
        width: NODE_W,
        height: NODE_H,
      }));

      elkCompoundChildren.push({
        id: aggId,
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': '12',
          'elk.padding': `[top=${COMPOUND_PADDING_TOP},left=${COMPOUND_PADDING_SIDE},bottom=${COMPOUND_PADDING_BOTTOM},right=${COMPOUND_PADDING_SIDE}]`,
        },
        children: childNodes,
        // ELK will compute width/height from children
      });
    }
  }

  // External system nodes (standalone leaf nodes)
  const elkExternalChildren: ElkNode[] = [...externals].map((id) => ({
    id,
    width: NODE_W,
    height: NODE_H,
  }));

  // Build ELK edges (connect event child nodes to external nodes)
  // Track edge ID -> group key so we can attach ELK section data after layout
  // For collapsed aggregates, redirect child-node edges to the aggregate node itself.
  // Self-loops within a collapsed aggregate are dropped entirely.
  let edgeCounter = 0;
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  const edgeIdToGroupKey = new Map<string, string>();

  for (const file of files) {
    for (const event of file.data.domain_events) {
      const rawChildId = eventNodeId(event.aggregate, event.name);
      const isCollapsed = collapsedAggregates.has(event.aggregate);
      // When the aggregate is collapsed, edges use the aggregate ID as endpoint
      const effectiveChildId = isCollapsed ? event.aggregate : rawChildId;

      if (event.integration.direction === 'outbound' && event.integration.channel) {
        const id = `e${edgeCounter++}`;
        elkEdges.push({ id, sources: [effectiveChildId], targets: [event.integration.channel] });
        edgeIdToGroupKey.set(id, `${effectiveChildId}::${event.integration.channel}`);
      } else if (event.integration.direction === 'inbound' && event.integration.channel) {
        const id = `e${edgeCounter++}`;
        elkEdges.push({ id, sources: [event.integration.channel], targets: [effectiveChildId] });
        edgeIdToGroupKey.set(id, `${event.integration.channel}::${effectiveChildId}`);
      }
      // internal events: self-loop, included only for expanded aggregates
      // (collapsed aggregates hide internals entirely — no ELK edge)
    }
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // Pack disconnected bounded contexts side-by-side (landscape) instead of stacking vertically
      'elk.separateConnectedComponents': 'true',
      'elk.aspectRatio': '1.6',
    },
    children: [...elkCompoundChildren, ...elkExternalChildren],
    edges: elkEdges,
  };

  const elk = new ELK();
  const laid = await elk.layout(elkGraph);

  // Post-process: compute reflow offsets to arrange disconnected components side-by-side.
  // ELK's layered algorithm stacks disconnected components vertically; we fix this here.
  const topNodesForReflow = (laid.children ?? []).map((n) => ({
    id: n.id,
    x: n.x ?? 0,
    y: n.y ?? 0,
    width: n.width ?? NODE_W,
    height: n.height ?? NODE_H,
  }));
  const edgesForReflow = elkEdges.map((e) => ({
    sourceId: e.sources[0] ?? '',
    targetId: e.targets[0] ?? '',
  }));
  const reflowOffsets = computeComponentReflowOffsets(topNodesForReflow, edgesForReflow);

  /** Apply reflow offset to a top-level node's position */
  function applyOffset(topNodeId: string, x: number, y: number): { x: number; y: number } {
    const off = reflowOffsets.get(topNodeId);
    if (!off) return { x, y };
    return { x: x + off.dx, y: y + off.dy };
  }

  // Extract compound (aggregate) layouts
  const compounds: LayoutCompound[] = [];
  const collapsedAggregatesList: CollapsedAggregate[] = [];
  const nodes: LayoutNode[] = [];

  for (const topNode of laid.children ?? []) {
    if (externals.has(topNode.id)) {
      // External system — leaf node
      const colorIndex = -1;
      const pos = applyOffset(topNode.id, topNode.x ?? 0, topNode.y ?? 0);
      nodes.push({
        id: topNode.id,
        label: topNode.id,
        kind: 'external',
        colorIndex,
        x: pos.x,
        y: pos.y,
      });
    } else if (collapsedAggregates.has(topNode.id)) {
      // Collapsed aggregate — single leaf node, not a compound
      const colorIndex = getAggregateColorIndex(topNode.id, allAggregates);
      const eventCount = aggregateEvents.get(topNode.id)?.length ?? 0;
      const pos = applyOffset(topNode.id, topNode.x ?? 0, topNode.y ?? 0);
      collapsedAggregatesList.push({
        id: topNode.id,
        label: topNode.id,
        colorIndex,
        x: pos.x,
        y: pos.y,
        eventCount,
      });
      // Also add to nodes[] so edge rendering can find positions via nodeMap
      nodes.push({
        id: topNode.id,
        label: topNode.id,
        kind: 'aggregate',
        colorIndex,
        x: pos.x,
        y: pos.y,
      });
    } else {
      // Expanded aggregate compound node
      const colorIndex = getAggregateColorIndex(topNode.id, allAggregates);
      const rawParentX = topNode.x ?? 0;
      const rawParentY = topNode.y ?? 0;
      const pos = applyOffset(topNode.id, rawParentX, rawParentY);
      const parentX = pos.x;
      const parentY = pos.y;
      const compoundWidth = topNode.width ?? NODE_W + COMPOUND_PADDING_SIDE * 2;
      const compoundHeight = topNode.height ?? NODE_H + COMPOUND_PADDING_TOP + COMPOUND_PADDING_BOTTOM;

      const childIds: string[] = [];

      // Extract child event nodes (coordinates are relative to parent in ELK)
      for (const child of topNode.children ?? []) {
        childIds.push(child.id);
        nodes.push({
          id: child.id,
          label: child.id.includes('::') ? child.id.split('::')[1] : child.id,
          kind: 'aggregate',
          colorIndex,
          // Absolute position = parent offset + child relative position
          x: parentX + (child.x ?? 0),
          y: parentY + (child.y ?? 0),
        });
      }

      compounds.push({
        id: topNode.id,
        label: topNode.id,
        colorIndex,
        x: parentX,
        y: parentY,
        width: compoundWidth,
        height: compoundHeight,
        childIds,
      });
    }
  }

  // Build edge groups for rendering
  // Group by (fromId, toId) for display
  // For collapsed aggregates, redirect child-node IDs to the aggregate ID.
  // Internal events within a collapsed aggregate are dropped entirely.
  const groupMap = new Map<string, LayoutEdgeGroup>();

  for (const file of files) {
    for (const event of file.data.domain_events) {
      const rawChildId = eventNodeId(event.aggregate, event.name);
      const isCollapsed = collapsedAggregates.has(event.aggregate);

      let fromId: string;
      let toId: string;

      if (event.integration.direction === 'outbound' && event.integration.channel) {
        fromId = isCollapsed ? event.aggregate : rawChildId;
        toId = event.integration.channel;
      } else if (event.integration.direction === 'inbound' && event.integration.channel) {
        fromId = event.integration.channel;
        toId = isCollapsed ? event.aggregate : rawChildId;
      } else {
        // internal — no edge needed; skip entirely
        continue;
      }

      const key = `${fromId}::${toId}`;
      let group = groupMap.get(key);
      if (!group) {
        group = { from: fromId, to: toId, edges: [], sections: [] };
        groupMap.set(key, group);
      }
      group.edges.push({
        label: event.name,
        trigger: event.trigger,
        confidence: event.confidence,
        direction: event.integration.direction,
      });
    }
  }

  // Build a lookup: child-node ID -> top-level node ID (for edge reflow offset lookup)
  const childToTopNode = new Map<string, string>();
  for (const topNode of laid.children ?? []) {
    childToTopNode.set(topNode.id, topNode.id);
    for (const child of topNode.children ?? []) {
      childToTopNode.set(child.id, topNode.id);
    }
  }

  /** Look up the reflow offset for a node (child or top-level) */
  function getEdgeOffset(nodeId: string): { dx: number; dy: number } {
    const topId = childToTopNode.get(nodeId) ?? nodeId;
    return reflowOffsets.get(topId) ?? { dx: 0, dy: 0 };
  }

  // Extract ELK-computed edge sections (bend points) and attach to groups.
  // Apply reflow offsets to all edge path coordinates so they match repositioned nodes.
  // Edges always connect nodes in the same connected component, so source and target
  // have the same reflow offset.
  for (const elkEdge of laid.edges ?? []) {
    const groupKey = edgeIdToGroupKey.get(elkEdge.id ?? '');
    if (!groupKey) continue;
    const group = groupMap.get(groupKey);
    if (!group) continue;

    if (elkEdge.sections && elkEdge.sections.length > 0) {
      const sec = elkEdge.sections[0];
      // Use source node offset (same as target since they're in the same component)
      const off = getEdgeOffset(elkEdge.sources?.[0] ?? '');
      const section: EdgeSection = {
        startPoint: { x: sec.startPoint.x + off.dx, y: sec.startPoint.y + off.dy },
        endPoint: { x: sec.endPoint.x + off.dx, y: sec.endPoint.y + off.dy },
        bendPoints: sec.bendPoints?.map((p) => ({ x: p.x + off.dx, y: p.y + off.dy })),
      };
      group.sections = group.sections ?? [];
      group.sections.push(section);
    }
  }

  // Bounding box: compute from actual node positions after reflow.
  // This is more accurate than ELK's reported dimensions when reflow offsets were applied.
  const allPositionedNodes = [
    ...compounds.map((c) => ({ x: c.x, y: c.y, w: c.width, h: c.height })),
    ...nodes.filter((n) => n.kind === 'external').map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H })),
    ...collapsedAggregatesList.map((c) => ({ x: c.x, y: c.y, w: NODE_W, h: NODE_H })),
  ];

  let layoutWidth: number;
  let layoutHeight: number;

  if (allPositionedNodes.length > 0) {
    const maxRight = Math.max(...allPositionedNodes.map((n) => n.x + n.w));
    const maxBottom = Math.max(...allPositionedNodes.map((n) => n.y + n.h));
    layoutWidth = maxRight + 80;
    layoutHeight = maxBottom + 80;
  } else if (typeof laid.width === 'number' && laid.width > 0) {
    layoutWidth = laid.width + 80;
    layoutHeight = typeof laid.height === 'number' && laid.height > 0 ? laid.height + 80 : 500;
  } else {
    layoutWidth = 800;
    layoutHeight = 500;
  }

  return {
    compounds,
    collapsedAggregates: collapsedAggregatesList,
    nodes,
    edgeGroups: [...groupMap.values()],
    width: layoutWidth,
    height: layoutHeight,
  };
}
