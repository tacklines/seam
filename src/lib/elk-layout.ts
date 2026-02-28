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
export const COMPOUND_PADDING_TOP = 36; // space for header label
export const COMPOUND_PADDING_SIDE = 16;
export const COMPOUND_PADDING_BOTTOM = 16;

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

/**
 * Run ELK layered layout with compound nodes.
 *
 * Aggregates become compound parent ELK nodes.
 * Domain events become child nodes inside their parent aggregate.
 * External systems become standalone leaf nodes.
 * Edges connect event-child nodes to external system nodes.
 * Internal events are self-loops on the aggregate's own event nodes (excluded from ELK edges).
 */
export async function runElkLayout(files: LoadedFile[]): Promise<ElkLayoutResult> {
  if (files.length === 0) {
    return { compounds: [], nodes: [], edgeGroups: [], width: 800, height: 500 };
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
  const elkCompoundChildren: ElkNode[] = [];

  for (const [aggId, events] of aggregateEvents) {
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
        'elk.spacing.nodeNode': '20',
        'elk.padding': `[top=${COMPOUND_PADDING_TOP},left=${COMPOUND_PADDING_SIDE},bottom=${COMPOUND_PADDING_BOTTOM},right=${COMPOUND_PADDING_SIDE}]`,
      },
      children: childNodes,
      // ELK will compute width/height from children
    });
  }

  // External system nodes (standalone leaf nodes)
  const elkExternalChildren: ElkNode[] = [...externals].map((id) => ({
    id,
    width: NODE_W,
    height: NODE_H,
  }));

  // Build ELK edges (connect event child nodes to external nodes)
  // Track edge ID -> group key so we can attach ELK section data after layout
  let edgeCounter = 0;
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  const edgeIdToGroupKey = new Map<string, string>();

  for (const file of files) {
    for (const event of file.data.domain_events) {
      const childId = eventNodeId(event.aggregate, event.name);
      if (event.integration.direction === 'outbound' && event.integration.channel) {
        const id = `e${edgeCounter++}`;
        elkEdges.push({ id, sources: [childId], targets: [event.integration.channel] });
        edgeIdToGroupKey.set(id, `${childId}::${event.integration.channel}`);
      } else if (event.integration.direction === 'inbound' && event.integration.channel) {
        const id = `e${edgeCounter++}`;
        elkEdges.push({ id, sources: [event.integration.channel], targets: [childId] });
        edgeIdToGroupKey.set(id, `${event.integration.channel}::${childId}`);
      }
      // internal events: no ELK edge (self-contained within aggregate)
    }
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: [...elkCompoundChildren, ...elkExternalChildren],
    edges: elkEdges,
  };

  const elk = new ELK();
  const laid = await elk.layout(elkGraph);

  // Extract compound (aggregate) layouts
  const compounds: LayoutCompound[] = [];
  const nodes: LayoutNode[] = [];

  for (const topNode of laid.children ?? []) {
    if (externals.has(topNode.id)) {
      // External system — leaf node
      const colorIndex = -1;
      nodes.push({
        id: topNode.id,
        label: topNode.id,
        kind: 'external',
        colorIndex,
        x: topNode.x ?? 0,
        y: topNode.y ?? 0,
      });
    } else {
      // Aggregate compound node
      const colorIndex = getAggregateColorIndex(topNode.id, allAggregates);
      const parentX = topNode.x ?? 0;
      const parentY = topNode.y ?? 0;
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
        // internal — self-loop on the child event node
        fromId = childId;
        toId = childId;
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

  // Extract ELK-computed edge sections (bend points) and attach to groups
  // ELK returns edges at the root level with sections containing routed paths
  for (const elkEdge of laid.edges ?? []) {
    const groupKey = edgeIdToGroupKey.get(elkEdge.id ?? '');
    if (!groupKey) continue;
    const group = groupMap.get(groupKey);
    if (!group) continue;

    if (elkEdge.sections && elkEdge.sections.length > 0) {
      const sec = elkEdge.sections[0];
      const section: EdgeSection = {
        startPoint: { x: sec.startPoint.x, y: sec.startPoint.y },
        endPoint: { x: sec.endPoint.x, y: sec.endPoint.y },
        bendPoints: sec.bendPoints?.map((p) => ({ x: p.x, y: p.y })),
      };
      group.sections = group.sections ?? [];
      group.sections.push(section);
    }
  }

  // Bounding box
  const layoutWidth =
    typeof laid.width === 'number' && laid.width > 0
      ? laid.width + 80
      : 800;
  const layoutHeight =
    typeof laid.height === 'number' && laid.height > 0
      ? laid.height + 80
      : 500;

  return {
    compounds,
    nodes,
    edgeGroups: [...groupMap.values()],
    width: layoutWidth,
    height: layoutHeight,
  };
}
