import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { WorkItem } from '../../schema/types.js';

/** Computed layout node for SVG rendering. */
interface LayoutNode {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

/** Computed edge for SVG rendering. */
interface LayoutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const NODE_W = 120;
const NODE_H = 44;
const LAYER_GAP = 80;
const NODE_GAP = 16;
const SVG_PADDING = 24;

/**
 * Topological sort — returns work item IDs in dependency order.
 * Items with no dependencies come first (layer 0).
 */
function computeLayers(workItems: WorkItem[]): Map<string, number> {
  const layerMap = new Map<string, number>();
  const depMap = new Map<string, string[]>();

  for (const wi of workItems) {
    depMap.set(wi.id, wi.dependencies ?? []);
  }

  function getLayer(id: string, visited: Set<string>): number {
    if (layerMap.has(id)) return layerMap.get(id)!;
    if (visited.has(id)) return 0; // Cycle guard
    visited.add(id);
    const deps = depMap.get(id) ?? [];
    const maxDepLayer = deps.reduce((max, depId) => {
      return Math.max(max, getLayer(depId, visited));
    }, -1);
    const layer = maxDepLayer + 1;
    layerMap.set(id, layer);
    visited.delete(id);
    return layer;
  }

  for (const wi of workItems) {
    getLayer(wi.id, new Set());
  }

  return layerMap;
}

/**
 * Compute SVG layout for work items using a simple layered algorithm.
 * Layers flow left-to-right, nodes are stacked vertically within each layer.
 */
function computeLayout(workItems: WorkItem[]): { nodes: LayoutNode[]; edges: LayoutEdge[]; svgWidth: number; svgHeight: number } {
  if (workItems.length === 0) {
    return { nodes: [], edges: [], svgWidth: 0, svgHeight: 0 };
  }

  const layerMap = computeLayers(workItems);
  const maxLayer = Math.max(...Array.from(layerMap.values()));

  // Group nodes by layer
  const byLayer: Map<number, WorkItem[]> = new Map();
  for (const wi of workItems) {
    const layer = layerMap.get(wi.id) ?? 0;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(wi);
  }

  // Compute SVG dimensions
  const maxNodesInLayer = Math.max(...Array.from(byLayer.values()).map((arr) => arr.length));
  const svgWidth = (maxLayer + 1) * (NODE_W + LAYER_GAP) - LAYER_GAP + SVG_PADDING * 2;
  const svgHeight = maxNodesInLayer * (NODE_H + NODE_GAP) - NODE_GAP + SVG_PADDING * 2;

  // Place nodes
  const nodes: LayoutNode[] = [];
  const nodeById = new Map<string, LayoutNode>();

  for (const [layer, items] of byLayer) {
    const x = SVG_PADDING + layer * (NODE_W + LAYER_GAP);
    const totalH = items.length * NODE_H + (items.length - 1) * NODE_GAP;
    const startY = (svgHeight - totalH) / 2;

    items.forEach((wi, i) => {
      const y = startY + i * (NODE_H + NODE_GAP);
      const title = wi.title ? (wi.title.length > 14 ? wi.title.slice(0, 13) + '…' : wi.title) : `WI-${wi.id.slice(-4)}`;
      const node: LayoutNode = { id: wi.id, title, x, y, width: NODE_W, height: NODE_H, layer };
      nodes.push(node);
      nodeById.set(wi.id, node);
    });
  }

  // Compute edges
  const edges: LayoutEdge[] = [];
  for (const wi of workItems) {
    for (const depId of (wi.dependencies ?? [])) {
      const fromNode = nodeById.get(depId);
      const toNode = nodeById.get(wi.id);
      if (fromNode && toNode) {
        edges.push({
          fromId: depId,
          toId: wi.id,
          x1: fromNode.x + fromNode.width,
          y1: fromNode.y + fromNode.height / 2,
          x2: toNode.x,
          y2: toNode.y + toNode.height / 2,
        });
      }
    }
  }

  return { nodes, edges, svgWidth, svgHeight };
}

/**
 * Dependency Graph — a miniature SVG directed graph of work item dependencies.
 *
 * Work items are nodes arranged in topological layers (left-to-right).
 * Dependencies are directed edges (arrows).
 * Drag from one node to another to create a dependency.
 *
 * Accessibility: a visually-hidden `<table>` provides the same information
 * to screen readers.
 *
 * @fires dependency-created - A new dependency was created by dragging.
 *   Detail: `{ fromId: string; toId: string }`
 */
@customElement('dependency-graph')
export class DependencyGraph extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }

    .header-title {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0;
    }

    /* ---- Empty state ---- */
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: var(--sl-color-neutral-400, #9ca3af);
      border: 1px dashed var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
    }

    .empty-hint {
      font-size: 0.75rem;
      margin-top: 0.25rem;
      font-style: italic;
    }

    /* ---- SVG container ---- */
    .svg-container {
      overflow-x: auto;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
      background: var(--sl-color-neutral-50, #f9fafb);
    }

    /* ---- Graph nodes ---- */
    .graph-node {
      cursor: grab;
      user-select: none;
    }

    .graph-node:active {
      cursor: grabbing;
    }

    .node-rect {
      fill: #fff;
      stroke: var(--sl-color-neutral-300, #d1d5db);
      stroke-width: 1.5;
      rx: 6;
      transition: stroke 0.15s ease, fill 0.15s ease;
    }

    .node-rect:hover {
      stroke: var(--sl-color-primary-400, #60a5fa);
      fill: var(--sl-color-primary-50, #eff6ff);
    }

    .graph-node.drag-source .node-rect {
      stroke: var(--sl-color-primary-500, #3b82f6);
      stroke-width: 2;
      fill: var(--sl-color-primary-50, #eff6ff);
    }

    .graph-node.drag-over .node-rect {
      stroke: #16a34a;
      stroke-width: 2;
      fill: #dcfce7;
    }

    .node-text {
      font-size: 11px;
      font-family: var(--sl-font-mono, monospace);
      fill: var(--sl-color-neutral-700, #374151);
      dominant-baseline: middle;
      text-anchor: middle;
      pointer-events: none;
    }

    /* ---- Edges ---- */
    .edge-path {
      fill: none;
      stroke: var(--sl-color-neutral-400, #9ca3af);
      stroke-width: 1.5;
      marker-end: url(#arrowhead);
    }

    /* ---- Hint text ---- */
    .drag-hint {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      text-align: center;
      margin-top: 0.5rem;
      font-style: italic;
    }

    /* ---- Visually hidden (SR-only) table ---- */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;

  /** Work items to display as nodes. Dependencies come from workItems[i].dependencies. */
  @property({ type: Array }) workItems: WorkItem[] = [];

  @state() private _dragSourceId: string | null = null;
  @state() private _dragOverId: string | null = null;

  // ---- Drag to connect ----

  private _handleNodeMouseDown(e: MouseEvent, nodeId: string) {
    e.preventDefault();
    this._dragSourceId = nodeId;
    // Attach global listeners for drag
    const onMouseUp = (upEvent: MouseEvent) => {
      this._handleGlobalMouseUp(upEvent);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mouseup', onMouseUp);
  }

  private _handleNodeMouseEnter(nodeId: string) {
    if (this._dragSourceId !== null && this._dragSourceId !== nodeId) {
      this._dragOverId = nodeId;
    }
  }

  private _handleNodeMouseLeave() {
    this._dragOverId = null;
  }

  private _handleGlobalMouseUp(_e: MouseEvent) {
    if (this._dragSourceId && this._dragOverId && this._dragSourceId !== this._dragOverId) {
      this.dispatchEvent(
        new CustomEvent('dependency-created', {
          bubbles: true,
          composed: true,
          detail: { fromId: this._dragSourceId, toId: this._dragOverId },
        })
      );
    }
    this._dragSourceId = null;
    this._dragOverId = null;
  }

  // ---- Render ----

  private _renderEdge(edge: LayoutEdge, idx: number) {
    // Curved bezier path
    const mx = (edge.x1 + edge.x2) / 2;
    const d = `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`;

    return html`
      <path
        key="${idx}"
        class="edge-path"
        d="${d}"
        aria-hidden="true"
      />
    `;
  }

  private _renderNode(node: LayoutNode) {
    const isDragSource = this._dragSourceId === node.id;
    const isDragOver = this._dragOverId === node.id;
    const nodeClass = `graph-node ${isDragSource ? 'drag-source' : ''} ${isDragOver ? 'drag-over' : ''}`;

    return html`
      <g
        class="${nodeClass}"
        role="button"
        tabindex="0"
        aria-label="${t('dependencyGraph.dragHint')}: ${node.title}"
        title="${node.title}"
        @mousedown=${(e: MouseEvent) => this._handleNodeMouseDown(e, node.id)}
        @mouseenter=${() => this._handleNodeMouseEnter(node.id)}
        @mouseleave=${this._handleNodeMouseLeave}
      >
        <rect
          class="node-rect"
          x="${node.x}"
          y="${node.y}"
          width="${node.width}"
          height="${node.height}"
          rx="6"
        />
        <text
          class="node-text"
          x="${node.x + node.width / 2}"
          y="${node.y + node.height / 2}"
        >${node.title}</text>
      </g>
    `;
  }

  private _renderSRTable(hasDependencies: boolean) {
    if (!hasDependencies) {
      return html`
        <div class="sr-only" role="region" aria-label="${t('dependencyGraph.ariaLabel')}">
          <p>${t('dependencyGraph.noDependencies')}</p>
        </div>
      `;
    }

    const depPairs: Array<{ from: WorkItem; to: WorkItem }> = [];
    const wiById = new Map(this.workItems.map((wi) => [wi.id, wi]));
    for (const wi of this.workItems) {
      for (const depId of (wi.dependencies ?? [])) {
        const dep = wiById.get(depId);
        if (dep) depPairs.push({ from: dep, to: wi });
      }
    }

    return html`
      <table class="sr-only" aria-label="${t('dependencyGraph.ariaLabel')}">
        <caption>${t('dependencyGraph.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">${t('dependencyGraph.col.to')}</th>
            <th scope="col">${t('dependencyGraph.col.from')}</th>
          </tr>
        </thead>
        <tbody>
          ${depPairs.map(
            ({ from, to }) => html`
              <tr>
                <td>${to.title || to.id}</td>
                <td>${from.title || from.id}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
    `;
  }

  override render() {
    if (this.workItems.length === 0) {
      return html`
        <div>
          <h3 class="header-title" style="margin: 0 0 0.75rem;">${t('dependencyGraph.title')}</h3>
          <div class="empty">
            <span>${t('dependencyGraph.empty')}</span>
            <span class="empty-hint">${t('dependencyGraph.emptyHint')}</span>
          </div>
        </div>
      `;
    }

    const { nodes, edges, svgWidth, svgHeight } = computeLayout(this.workItems);

    const hasDependencies = edges.length > 0;

    return html`
      <div>
        <!-- Header -->
        <div class="header">
          <h3 class="header-title">${t('dependencyGraph.title')}</h3>
        </div>

        <!-- SVG graph -->
        <div class="svg-container">
          <svg
            width="${svgWidth}"
            height="${Math.max(svgHeight, 80)}"
            viewBox="0 0 ${svgWidth} ${Math.max(svgHeight, 80)}"
            aria-hidden="true"
            role="img"
          >
            <!-- Arrowhead marker definition -->
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 8 3, 0 6"
                  fill="var(--sl-color-neutral-400, #9ca3af)"
                />
              </marker>
            </defs>

            <!-- Edges (rendered below nodes) -->
            ${edges.map((edge, idx) => this._renderEdge(edge, idx))}

            <!-- Nodes -->
            ${nodes.map((node) => this._renderNode(node))}

            <!-- No dependencies placeholder text -->
            ${!hasDependencies && nodes.length > 0
              ? html`
                <text
                  x="${svgWidth / 2}"
                  y="${Math.max(svgHeight, 80) - 12}"
                  text-anchor="middle"
                  font-size="11"
                  fill="#9ca3af"
                  font-style="italic"
                >${t('dependencyGraph.noDependenciesHint')}</text>
              `
              : nothing}
          </svg>
        </div>

        <!-- Drag hint -->
        <p class="drag-hint" aria-hidden="true">${t('dependencyGraph.dragHint')}</p>

        <!-- Screen reader accessible table -->
        ${this._renderSRTable(hasDependencies)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dependency-graph': DependencyGraph;
  }
}
