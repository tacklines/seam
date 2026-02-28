/**
 * ELK-based layout for the flow diagram.
 *
 * Pure async function: takes LoadedFile[] data, returns positioned nodes and
 * edge groups ready for SVG rendering. No DOM dependencies.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { LoadedFile } from '../schema/types.js';
import { getAllAggregates } from './grouping.js';
import { getAggregateColorIndex } from './aggregate-colors.js';

export const NODE_W = 160;
export const NODE_H = 56;

export interface LayoutNode {
  id: string;
  label: string;
  kind: 'aggregate' | 'external';
  colorIndex: number;
  /** Top-left x from ELK output */
  x: number;
  /** Top-left y from ELK output */
  y: number;
}

export interface LayoutEdge {
  label: string;
  trigger: string;
  confidence: string;
  direction: string;
}

export interface LayoutEdgeGroup {
  from: string;
  to: string;
  edges: LayoutEdge[];
}

export interface ElkLayoutResult {
  nodes: LayoutNode[];
  edgeGroups: LayoutEdgeGroup[];
  /** Width of the laid-out graph, for SVG viewBox */
  width: number;
  /** Height of the laid-out graph, for SVG viewBox */
  height: number;
}

/**
 * Run ELK layered layout on the given files.
 *
 * Aggregates and external systems become ELK nodes.
 * Domain events become ELK edges between their source/target.
 * Internal (self-loop) events are returned in edgeGroups but excluded from
 * ELK edges (ELK layered does not support self-loops well).
 */
export async function runElkLayout(files: LoadedFile[]): Promise<ElkLayoutResult> {
  const allAggregates = getAllAggregates(files);
  const aggregates = new Set<string>();
  const externals = new Set<string>();

  interface RawEdge extends LayoutEdge {
    source: string;
    target: string;
  }

  const rawEdges: RawEdge[] = [];

  for (const file of files) {
    for (const event of file.data.domain_events) {
      aggregates.add(event.aggregate);

      if (event.integration.direction === 'outbound') {
        const target = event.integration.channel ?? 'External';
        externals.add(target);
        rawEdges.push({
          source: event.aggregate,
          target,
          label: event.name,
          trigger: event.trigger,
          direction: 'outbound',
          confidence: event.confidence,
        });
      } else if (event.integration.direction === 'inbound') {
        const source = event.integration.channel ?? 'External';
        externals.add(source);
        rawEdges.push({
          source,
          target: event.aggregate,
          label: event.name,
          trigger: event.trigger,
          direction: 'inbound',
          confidence: event.confidence,
        });
      } else {
        // internal / self-loop — included in edgeGroups but not in ELK graph
        rawEdges.push({
          source: event.aggregate,
          target: event.aggregate,
          label: event.name,
          trigger: event.trigger,
          direction: 'internal',
          confidence: event.confidence,
        });
      }
    }
  }

  // Build node metadata map
  const nodeMetaMap = new Map<
    string,
    { kind: 'aggregate' | 'external'; colorIndex: number }
  >();

  for (const id of externals) {
    nodeMetaMap.set(id, { kind: 'external', colorIndex: -1 });
  }
  for (const id of aggregates) {
    nodeMetaMap.set(id, {
      kind: 'aggregate',
      colorIndex: getAggregateColorIndex(id, allAggregates),
    });
  }

  // Build ELK children (one node per aggregate/external)
  const elkChildren: ElkNode[] = [...nodeMetaMap.keys()].map((id) => ({
    id,
    width: NODE_W,
    height: NODE_H,
  }));

  // Build ELK edges (exclude self-loops — ELK layered dislikes them)
  let edgeCounter = 0;
  const elkEdges = rawEdges
    .filter((e) => e.source !== e.target)
    .map((e) => ({
      id: `e${edgeCounter++}`,
      sources: [e.source],
      targets: [e.target],
    }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: elkChildren,
    edges: elkEdges,
  };

  const elk = new ELK();
  const laid = await elk.layout(elkGraph);

  // Extract positioned nodes from ELK output
  const nodes: LayoutNode[] = (laid.children ?? []).map((child) => {
    const meta = nodeMetaMap.get(child.id) ?? { kind: 'aggregate' as const, colorIndex: 0 };
    return {
      id: child.id,
      label: child.id,
      kind: meta.kind,
      colorIndex: meta.colorIndex,
      x: child.x ?? 0,
      y: child.y ?? 0,
    };
  });

  // Build edge groups (same grouping logic as the d3 component)
  const groupMap = new Map<string, LayoutEdgeGroup>();
  for (const edge of rawEdges) {
    const key = `${edge.source}::${edge.target}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { from: edge.source, to: edge.target, edges: [] };
      groupMap.set(key, group);
    }
    group.edges.push({
      label: edge.label,
      trigger: edge.trigger,
      confidence: edge.confidence,
      direction: edge.direction,
    });
  }

  // Compute bounding box from ELK output (or fall back to node extents)
  const layoutWidth =
    typeof laid.width === 'number' && laid.width > 0
      ? laid.width + 80
      : Math.max(...nodes.map((n) => n.x + NODE_W), 400) + 80;
  const layoutHeight =
    typeof laid.height === 'number' && laid.height > 0
      ? laid.height + 80
      : Math.max(...nodes.map((n) => n.y + NODE_H), 300) + 80;

  return {
    nodes,
    edgeGroups: [...groupMap.values()],
    width: layoutWidth,
    height: layoutHeight,
  };
}
