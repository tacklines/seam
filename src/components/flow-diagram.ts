import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LoadedFile } from '../schema/types.js';
import type { Confidence, Direction } from '../schema/types.js';
import { getAllAggregates } from '../lib/grouping.js';
import { getAggregateColorIndex } from '../lib/aggregate-colors.js';
import { runElkLayout, NODE_W, NODE_H, elkSectionToPath, straightEdgePath } from '../lib/elk-layout.js';
import type { LayoutNode, LayoutCompound, LayoutEdgeGroup } from '../lib/elk-layout.js';
import { isEdgeGroupVisible } from '../lib/edge-filters.js';
import { zoom as d3Zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';
import type { MinimapNode, MinimapEdge, ViewTransform, GraphBounds } from './flow-minimap.js';
import { store } from '../state/app-state.js';

// Hardcoded palette matching --agg-color-N and --agg-bg-N CSS vars
// (SVG attributes can't resolve CSS custom properties)
const AGG_COLORS = ['#4338ca', '#0d9488', '#c026d3', '#ea580c', '#2563eb', '#dc2626', '#65a30d', '#0891b2'];
const AGG_BGS = ['#e0e7ff', '#ccfbf1', '#fae8ff', '#fff7ed', '#dbeafe', '#ffe4e6', '#ecfccb', '#cffafe'];
const AGG_TEXT = ['#312e81', '#134e4a', '#86198f', '#9a3412', '#1e40af', '#991b1b', '#3f6212', '#155e75'];
const AGG_CONTAINER_BG = ['#f0f0ff', '#f0fdfb', '#fdf4ff', '#fff9f0', '#eff6ff', '#fff1f2', '#f7fee7', '#ecfeff'];

const EXTERNAL_FILL = '#fef3c7';
const EXTERNAL_STROKE = '#d97706';
const EXTERNAL_TEXT = '#92400e';

/** Header height inside a compound node */
const COMPOUND_HEADER_H = 28;

// Default SVG dimensions used before ELK returns layout dimensions
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;

const CONFIDENCE_COLOR: Record<string, string> = {
  CONFIRMED: '#16a34a',
  LIKELY: '#2563eb',
  POSSIBLE: '#d97706',
};

@customElement('flow-diagram')
export class FlowDiagram extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .diagram-wrapper {
      position: relative;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      background: #fafbfc;
      min-height: 400px;
      overflow: hidden;
    }
    .diagram-wrapper svg {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
      cursor: grab;
    }
    .zoom-controls {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 10;
    }
    .zoom-controls button {
      width: 32px;
      height: 32px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #374151;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .zoom-controls button:hover {
      background: #f3f4f6;
    }
    .tooltip {
      position: absolute;
      pointer-events: none;
      background: #1e293b;
      color: white;
      font-size: 12px;
      line-height: 1.4;
      padding: 6px 10px;
      border-radius: 6px;
      max-width: 260px;
      z-index: 20;
      white-space: pre-line;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .tooltip::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 8px;
      height: 8px;
      background: #1e293b;
    }
    .edge-group {
      transition: opacity 0.2s ease;
    }
    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--sl-color-neutral-500);
    }
    .legend {
      display: flex;
      gap: 1rem;
      margin-top: 0.5rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      flex-wrap: wrap;
      padding: 0 4px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .legend-divider {
      width: 1px;
      height: 16px;
      background: #d1d5db;
      align-self: center;
    }
  `;

  @property({ attribute: false }) files: LoadedFile[] = [];
  @property() searchQuery = '';

  @state() private _layoutNodes: LayoutNode[] = [];
  @state() private _layoutCompounds: LayoutCompound[] = [];
  @state() private _edgeGroups: LayoutEdgeGroup[] = [];
  @state() private _svgWidth = DEFAULT_WIDTH;
  @state() private _svgHeight = DEFAULT_HEIGHT;
  @state() private _transform = '';
  @state() private _selectedAggregate: string | null = null;
  @state() private _tooltip: { x: number; y: number; text: string } | null = null;
  @state() private _matchedNodeIndices: number[] = [];
  @state() private _currentMatchIndex = -1;
  @state() private _filters: { confidence: Set<Confidence>; direction: Set<Direction> } = store.get().filters;

  /** Minimap-ready node data, exposed for parent wiring */
  @state() minimapNodes: MinimapNode[] = [];
  /** Minimap-ready edge data, exposed for parent wiring */
  @state() minimapEdges: MinimapEdge[] = [];
  /** Current view transform, exposed for parent wiring */
  @state() viewTransform: ViewTransform = { x: 0, y: 0, k: 1 };
  /** Graph bounds for minimap scaling */
  @state() graphBounds: GraphBounds = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

  private _zoom: ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private _prevFiles: LoadedFile[] = [];
  private _prevSearchQuery = '';
  private _updatingFromMinimap = false;
  private _unsubscribeStore: (() => void) | null = null;

  private async _runElkLayout(): Promise<void> {
    if (this.files.length === 0) {
      this._layoutNodes = [];
      this._layoutCompounds = [];
      this._edgeGroups = [];
      this._svgWidth = DEFAULT_WIDTH;
      this._svgHeight = DEFAULT_HEIGHT;
      return;
    }

    const result = await runElkLayout(this.files);
    this._layoutNodes = result.nodes;
    this._layoutCompounds = result.compounds;
    this._edgeGroups = result.edgeGroups;
    this._svgWidth = result.width;
    this._svgHeight = result.height;
  }

  private _setupZoom(): void {
    const svgEl = this.renderRoot.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) return;

    this._zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const { x, y, k } = event.transform;
        this._transform = `translate(${x},${y}) scale(${k})`;
        this.viewTransform = { x, y, k };

        if (!this._updatingFromMinimap) {
          this.dispatchEvent(
            new CustomEvent('view-transform-changed', {
              detail: { x, y, k },
              bubbles: true,
              composed: true,
            }),
          );
        }
      });

    select(svgEl).call(this._zoom);
  }

  /** Apply a transform from the minimap without triggering a re-entrant loop */
  applyMinimapTransform(transform: ViewTransform): void {
    const svgEl = this._getSvgEl();
    if (!svgEl || !this._zoom) return;
    this._updatingFromMinimap = true;
    select(svgEl).call(
      this._zoom.transform,
      zoomIdentity.translate(transform.x, transform.y).scale(transform.k),
    );
    this._updatingFromMinimap = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribeStore = store.subscribe(() => {
      this._filters = store.get().filters;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeStore?.();
    this._unsubscribeStore = null;
  }

  firstUpdated(): void {
    this._setupZoom();
  }

  updated(changed: Map<string, unknown>): void {
    // Re-run layout when files change
    if (this.files !== this._prevFiles) {
      this._prevFiles = this.files;

      // Reset zoom on file change
      this._transform = '';
      this.viewTransform = { x: 0, y: 0, k: 1 };

      this._runElkLayout().then(() => {
        this._computeMinimapData(this._layoutNodes, this._layoutCompounds, this._edgeGroups);
        // Re-attach zoom (SVG may have been recreated if going from empty to loaded)
        this.updateComplete.then(() => {
          this._setupZoom();
          if (this.searchQuery) {
            this._updateSearch();
          }
        });
      });
    }

    // Re-run search when query changes
    if (this.searchQuery !== this._prevSearchQuery) {
      this._prevSearchQuery = this.searchQuery;
      this._updateSearch();
    }
  }

  private _computeMinimapData(nodes: LayoutNode[], compounds: LayoutCompound[], edgeGroups: LayoutEdgeGroup[]): void {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // For minimap: show compound containers as colored rects, external nodes too
    const minimapNodes: MinimapNode[] = [];

    for (const compound of compounds) {
      minimapNodes.push({
        id: compound.id,
        x: compound.x,
        y: compound.y,
        width: compound.width,
        height: compound.height,
        color: AGG_COLORS[compound.colorIndex] ?? AGG_COLORS[0],
      });
    }

    for (const node of nodes) {
      if (node.kind === 'external') {
        minimapNodes.push({
          id: node.id,
          x: node.x,
          y: node.y,
          width: NODE_W,
          height: NODE_H,
          color: EXTERNAL_STROKE,
        });
      }
    }

    this.minimapNodes = minimapNodes;

    // Edges for minimap: connect compound containers to external nodes
    this.minimapEdges = edgeGroups
      .filter((g) => g.from !== g.to)
      .map((g) => {
        const fromNode = nodeMap.get(g.from);
        const toNode = nodeMap.get(g.to);
        if (!fromNode || !toNode) return null;
        return {
          x1: fromNode.x + NODE_W / 2,
          y1: fromNode.y + NODE_H / 2,
          x2: toNode.x + NODE_W / 2,
          y2: toNode.y + NODE_H / 2,
        };
      })
      .filter((e): e is MinimapEdge => e !== null);

    this.graphBounds = { width: this._svgWidth, height: this._svgHeight };

    this.dispatchEvent(
      new CustomEvent('graph-data-changed', {
        detail: {
          minimapNodes: this.minimapNodes,
          minimapEdges: this.minimapEdges,
          graphBounds: this.graphBounds,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _getSvgEl(): SVGSVGElement | null {
    return this.renderRoot.querySelector('svg') as SVGSVGElement | null;
  }

  private _zoomIn() {
    const svgEl = this._getSvgEl();
    if (!svgEl || !this._zoom) return;
    this._zoom.scaleBy(select(svgEl), 1.3);
  }

  private _zoomOut() {
    const svgEl = this._getSvgEl();
    if (!svgEl || !this._zoom) return;
    this._zoom.scaleBy(select(svgEl), 0.77);
  }

  private _zoomReset() {
    const svgEl = this._getSvgEl();
    if (!svgEl || !this._zoom) return;
    this._zoom.transform(select(svgEl), zoomIdentity);
  }

  private _updateSearch(): void {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this._matchedNodeIndices = [];
      this._currentMatchIndex = -1;
      this._dispatchMatchCount(0, -1);
      return;
    }

    // Search matches on leaf event nodes and external nodes
    const indices: number[] = [];
    for (let i = 0; i < this._layoutNodes.length; i++) {
      if (this._layoutNodes[i].label.toLowerCase().includes(query)) {
        indices.push(i);
      }
    }
    // Also search compound (aggregate) names and add all their children
    for (const compound of this._layoutCompounds) {
      if (compound.label.toLowerCase().includes(query)) {
        for (const childId of compound.childIds) {
          const idx = this._layoutNodes.findIndex((n) => n.id === childId);
          if (idx >= 0 && !indices.includes(idx)) {
            indices.push(idx);
          }
        }
      }
    }

    this._matchedNodeIndices = indices;
    if (indices.length > 0) {
      this._currentMatchIndex = 0;
      this.focusMatch(0);
    } else {
      this._currentMatchIndex = -1;
    }
    this._dispatchMatchCount(indices.length, indices.length > 0 ? 0 : -1);
  }

  private _dispatchMatchCount(count: number, current: number): void {
    this.dispatchEvent(
      new CustomEvent('search-match-count', {
        detail: { count, current },
        bubbles: true,
        composed: true,
      }),
    );
  }

  focusMatch(index: number): void {
    if (index < 0 || index >= this._matchedNodeIndices.length) return;
    this._currentMatchIndex = index;

    const nodeIndex = this._matchedNodeIndices[index];
    const node = this._layoutNodes[nodeIndex];
    if (!node) return;

    const svgEl = this._getSvgEl();
    if (!svgEl || !this._zoom) return;

    const cx = this._nodeCx(node);
    const cy = this._nodeCy(node);

    const svgRect = svgEl.getBoundingClientRect();
    const viewW = svgRect.width;
    const viewH = svgRect.height;

    const currentTransform = zoomTransform(svgEl);
    const k = Math.max(currentTransform.k, 1);

    const tx = viewW / 2 - cx * k;
    const ty = viewH / 2 - cy * k;

    this._zoom.transform(select(svgEl), zoomIdentity.translate(tx, ty).scale(k));
    this._dispatchMatchCount(this._matchedNodeIndices.length, index);
  }

  nextMatch(): void {
    if (this._matchedNodeIndices.length === 0) return;
    const next = (this._currentMatchIndex + 1) % this._matchedNodeIndices.length;
    this.focusMatch(next);
  }

  private get _searchActive(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  private _isMatchedNode(nodeIndex: number): boolean {
    return this._matchedNodeIndices.includes(nodeIndex);
  }

  private _onCompoundClick(compoundId: string) {
    this._selectedAggregate = this._selectedAggregate === compoundId ? null : compoundId;
    this.dispatchEvent(
      new CustomEvent('aggregate-select', {
        detail: this._selectedAggregate,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _showTooltip(e: MouseEvent, text: string) {
    const wrapper = this.renderRoot.querySelector('.diagram-wrapper') as HTMLElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    this._tooltip = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      text,
    };
  }

  private _hideTooltip() {
    this._tooltip = null;
  }

  /**
   * Center x of a node (ELK gives top-left, rendering uses center for edges).
   */
  private _nodeCx(node: LayoutNode): number {
    return node.x + NODE_W / 2;
  }

  /**
   * Center y of a node.
   */
  private _nodeCy(node: LayoutNode): number {
    return node.y + NODE_H / 2;
  }

  /**
   * Get the SVG marker-end URL for a given confidence level.
   * Color-matched arrowheads for visual clarity.
   */
  private _arrowMarker(confidence: string): string {
    switch (confidence) {
      case 'CONFIRMED': return 'url(#arrow-confirmed)';
      case 'LIKELY': return 'url(#arrow-likely)';
      case 'POSSIBLE': return 'url(#arrow-possible)';
      default: return 'url(#arrow-default)';
    }
  }

  /**
   * Build an SVG path from ELK section data if available, otherwise fall back to a straight/offset line.
   * elkSection carries absolute coordinates from the ELK layout engine.
   */
  private _edgePath(
    x1: number, y1: number,
    x2: number, y2: number,
    perpOffset: number,
    elkSection?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] } | undefined,
  ): string {
    if (elkSection) {
      return elkSectionToPath(elkSection);
    }
    return straightEdgePath(x1, y1, x2, y2, perpOffset);
  }

  private _renderEdgeGroup(group: LayoutEdgeGroup, nodeMap: Map<string, LayoutNode>, matchedNodeIds: Set<string>): unknown {
    const from = nodeMap.get(group.from);
    const to = nodeMap.get(group.to);
    if (!from || !to) return nothing;

    // Filter-based ghosting: opacity 0.1 when no edges in group pass active filters
    const passesFilter = isEdgeGroupVisible(group, this._filters.confidence, this._filters.direction);
    // Search-based dimming: opacity 0.2 when search active and neither endpoint matches
    const searchDimmed = this._searchActive && !matchedNodeIds.has(group.from) && !matchedNodeIds.has(group.to);

    const edgeOpacity = !passesFilter ? 0.1 : searchDimmed ? 0.2 : 1;
    const pointerEvents = !passesFilter ? 'none' : 'auto';

    const fromCx = this._nodeCx(from);
    const fromCy = this._nodeCy(from);
    const toCx = this._nodeCx(to);
    const toCy = this._nodeCy(to);

    // ── Self-loop (internal events) ──────────────────────────────────────────
    if (from.id === to.id) {
      return group.edges.map((edge, i) => {
        const loopOffset = i * 20;
        // Loop hangs off the right side of the node
        const rx = from.x + NODE_W; // right edge of node
        const ry = from.y + NODE_H / 2; // vertical center
        const loopW = 32 + loopOffset;
        const loopH = 20 + loopOffset;
        // Arc: start at right-center, loop right and back
        const startX = rx;
        const startY = ry - 6;
        const endX = rx;
        const endY = ry + 6;
        const pathId = `loop-${group.from.replace(/[^a-zA-Z0-9]/g, '_')}-${i}`;
        const color = CONFIDENCE_COLOR[edge.confidence] ?? '#64748b';
        const tooltipText = `${edge.label}\nTrigger: ${edge.trigger}\nConfidence: ${edge.confidence}`;

        // Cubic bezier: go out to the right and loop back
        const cpX = rx + loopW;
        const loopPath = `M${startX} ${startY} C${cpX} ${startY - loopH} ${cpX} ${endY + loopH} ${endX} ${endY}`;

        return svg`
          <g class="edge-group" opacity=${edgeOpacity} style="pointer-events:${pointerEvents}"
            @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
            @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
            @mouseleave=${() => this._hideTooltip()}>
            <defs>
              <path id=${pathId} d=${loopPath} />
            </defs>
            <use href="#${pathId}" fill="none" stroke=${color} stroke-width="1.5"
              marker-end=${this._arrowMarker(edge.confidence)} />
            <text font-size="9" font-family="'JetBrains Mono', monospace" fill=${color}>
              <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${edge.label}</textPath>
            </text>
          </g>
        `;
      });
    }

    // ── Multi-edge bundling (4+ edges) ──────────────────────────────────────
    const count = group.edges.length;
    const isBundled = count >= 4;

    // Compute direction vector from source center to target center
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Edge start/end at node boundary (offset from center by half node size)
    const x1 = fromCx + nx * (NODE_W / 2);
    const y1 = fromCy + ny * (NODE_H / 2);
    const x2 = toCx - nx * (NODE_W / 2);
    const y2 = toCy - ny * (NODE_H / 2);

    if (isBundled) {
      // Use the first available ELK section as the routed path for the bundle
      const bundleSection = group.sections?.[0];
      const bundlePathId = `bundle-${group.from.replace(/[^a-zA-Z0-9]/g, '_')}-${group.to.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const bundlePath = this._edgePath(x1, y1, x2, y2, 0, bundleSection);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const tooltipText = group.edges.map((e) => `${e.label} (${e.confidence})`).join('\n');

      return svg`
        <g class="edge-group" opacity=${edgeOpacity} style="pointer-events:${pointerEvents}"
          @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mouseleave=${() => this._hideTooltip()}>
          <defs>
            <path id=${bundlePathId} d=${bundlePath} />
          </defs>
          <use href="#${bundlePathId}" fill="none" stroke="#64748b" stroke-width="3.5"
            stroke-opacity="0.55" marker-end="url(#arrow-bundle)" />
          <!-- Count badge at midpoint -->
          <circle cx=${mx} cy=${my} r="13" fill="#475569" />
          <text x=${mx} y=${my + 4} text-anchor="middle" fill="white" font-size="11" font-weight="700">${count}</text>
        </g>
      `;
    }

    // ── Regular edges (1-3 per group) ───────────────────────────────────────
    // Offset edges perpendicular to each other to avoid overlap
    const perpX = -ny;
    const perpY = nx;
    const spreadTotal = (count - 1) * 14;

    return group.edges.map((edge, i) => {
      const offset = -spreadTotal / 2 + i * 14;
      const ox1 = x1 + perpX * offset;
      const oy1 = y1 + perpY * offset;
      const ox2 = x2 + perpX * offset;
      const oy2 = y2 + perpY * offset;

      const color = CONFIDENCE_COLOR[edge.confidence] ?? '#64748b';
      const tooltipText = `${edge.label}\nTrigger: ${edge.trigger}\nConfidence: ${edge.confidence}`;

      // Use ELK section if available for this edge index, else computed offset line
      const elkSection = group.sections?.[i];
      const pathData = this._edgePath(ox1, oy1, ox2, oy2, offset, elkSection);

      // Stable path ID for textPath referencing
      const pathId = `edge-${group.from.replace(/[^a-zA-Z0-9]/g, '_')}-${group.to.replace(/[^a-zA-Z0-9]/g, '_')}-${i}`;

      return svg`
        <g class="edge-group" opacity=${edgeOpacity} style="pointer-events:${pointerEvents}"
          @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mouseleave=${() => this._hideTooltip()}>
          <defs>
            <path id=${pathId} d=${pathData} />
          </defs>
          <!-- Wider invisible hit area for easier hover -->
          <use href="#${pathId}" fill="none" stroke="transparent" stroke-width="10" />
          <!-- Visible edge line -->
          <use href="#${pathId}" fill="none" stroke=${color} stroke-width="1.5"
            marker-end=${this._arrowMarker(edge.confidence)} />
          <!-- Label along path using textPath for natural placement -->
          <text
            font-size="10"
            font-family="'JetBrains Mono', monospace"
            fill=${color}
            paint-order="stroke"
            stroke="white"
            stroke-width="3"
            stroke-linejoin="round">
            <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${edge.label}</textPath>
          </text>
        </g>
      `;
    });
  }

  private _fitLabel(label: string, maxChars: number = 18): { lines: string[]; fontSize: number } {
    const fontSize = 11;

    if (label.length <= maxChars) {
      return { lines: [label], fontSize };
    }

    // Try to split on word boundaries (spaces, hyphens, camelCase)
    const parts = label.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s\-_]+/);
    const lines: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = part.length > maxChars ? part.slice(0, maxChars - 1) + '\u2026' : part;
      }
    }
    if (current) lines.push(current);

    // Cap at 2 lines
    if (lines.length > 2) {
      lines.length = 2;
      const last = lines[1];
      if (last.length > maxChars - 1) {
        lines[1] = last.slice(0, maxChars - 1) + '\u2026';
      } else {
        lines[1] = last + '\u2026';
      }
    }

    return { lines, fontSize: lines.length > 1 ? 10 : fontSize };
  }

  /** Render a compound aggregate container with its header */
  private _renderCompound(compound: LayoutCompound, matchedNodeIds: Set<string>): unknown {
    const isSelected = this._selectedAggregate === compound.id;
    const fill = AGG_CONTAINER_BG[compound.colorIndex] ?? AGG_CONTAINER_BG[0];
    const stroke = AGG_COLORS[compound.colorIndex] ?? AGG_COLORS[0];
    const headerFill = AGG_BGS[compound.colorIndex] ?? AGG_BGS[0];
    const textColor = AGG_TEXT[compound.colorIndex] ?? AGG_TEXT[0];
    const strokeWidth = isSelected ? 3 : 1.5;

    // Dim compound container if search is active and none of its children match
    const anyChildMatched = compound.childIds.some((id) => matchedNodeIds.has(id));
    const opacity = this._searchActive && !anyChildMatched ? 0.25 : 1;

    const { x, y, width, height } = compound;
    const { lines, fontSize } = this._fitLabel(compound.label, Math.floor(width / 7));

    return svg`
      <g
        class="compound-node"
        opacity=${opacity}
        style="cursor: pointer"
        @click=${() => this._onCompoundClick(compound.id)}>
        <!-- Container background -->
        <rect
          x=${x} y=${y}
          width=${width} height=${height}
          rx="12"
          fill=${fill}
          stroke=${stroke}
          stroke-width=${strokeWidth}
          filter="url(#shadow-light)"
        />
        <!-- Header bar -->
        <rect
          x=${x} y=${y}
          width=${width} height=${COMPOUND_HEADER_H}
          rx="12"
          fill=${headerFill}
          stroke="none"
        />
        <!-- Header bottom flush (cover rounded corners at bottom of header) -->
        <rect
          x=${x} y=${y + COMPOUND_HEADER_H - 6}
          width=${width} height="6"
          fill=${headerFill}
          stroke="none"
        />
        <!-- Header label -->
        ${lines.map(
          (line, i) => svg`
            <text
              x=${x + width / 2}
              y=${y + 10 + (i + 1) * (fontSize + 2)}
              text-anchor="middle"
              font-weight="700"
              font-size=${fontSize}
              font-family="'JetBrains Mono', monospace"
              fill=${textColor}
            >${line}</text>
          `,
        )}
        <!-- Selected indicator -->
        ${isSelected ? svg`
          <rect
            x=${x - 4} y=${y - 4}
            width=${width + 8} height=${height + 8}
            rx="16"
            fill="none"
            stroke="#2563eb"
            stroke-width="2.5"
            stroke-dasharray="6 3"
          />
        ` : nothing}
      </g>
    `;
  }

  /** Render a leaf event node (child inside a compound, or external system) */
  private _renderNode(node: LayoutNode, nodeIndex: number): unknown {
    const isExternal = node.kind === 'external';

    const fill = isExternal ? EXTERNAL_FILL : (AGG_BGS[node.colorIndex] ?? AGG_BGS[0]);
    const stroke = isExternal ? EXTERNAL_STROKE : (AGG_COLORS[node.colorIndex] ?? AGG_COLORS[0]);
    const textColor = isExternal ? EXTERNAL_TEXT : (AGG_TEXT[node.colorIndex] ?? AGG_TEXT[0]);
    const strokeWidth = 1.5;

    // Search state
    const isMatched = this._isMatchedNode(nodeIndex);
    const isFocused = this._searchActive && this._currentMatchIndex >= 0 &&
      this._matchedNodeIndices[this._currentMatchIndex] === nodeIndex;
    const opacity = this._searchActive && !isMatched ? 0.2 : 1;

    // ELK gives absolute top-left coordinates
    const x = node.x;
    const y = node.y;
    const { lines, fontSize } = this._fitLabel(node.label);

    // Vertical centering
    const lineHeight = fontSize + 3;
    const textBlockHeight = lines.length * lineHeight;
    const startY = y + NODE_H / 2 - textBlockHeight / 2 + fontSize * 0.8;

    const tooltipText = isExternal
      ? `External: ${node.label}`
      : `Event: ${node.label}`;

    return svg`
      <g
        class="node"
        style="cursor: default"
        opacity=${opacity}
        @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
        @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
        @mouseleave=${() => this._hideTooltip()}>
        ${isFocused
          ? svg`<rect
              x=${x - 3} y=${y - 3}
              width=${NODE_W + 6} height=${NODE_H + 6}
              rx="11"
              fill="none"
              stroke="#2563eb"
              stroke-width="2.5"
              stroke-dasharray="5 3"
            />`
          : nothing}
        <rect
          x=${x} y=${y}
          width=${NODE_W} height=${NODE_H}
          rx=${isExternal ? 8 : 6}
          fill=${fill}
          stroke=${stroke}
          stroke-width=${strokeWidth}
          filter="url(#shadow)"
        />
        ${lines.map(
          (line, i) => svg`
            <text
              x=${x + NODE_W / 2}
              y=${startY + i * lineHeight}
              text-anchor="middle"
              font-weight="500"
              font-size=${fontSize}
              font-family="'JetBrains Mono', monospace"
              fill=${textColor}
            >${line}</text>
          `,
        )}
      </g>
    `;
  }

  render() {
    if (this.files.length === 0) {
      return html`<div class="empty">Load a storm-prep YAML file to view the event flow diagram</div>`;
    }

    const allAggregates = getAllAggregates(this.files);
    const nodeMap = new Map(this._layoutNodes.map((n) => [n.id, n]));

    const matchedNodeIds = new Set(
      this._matchedNodeIndices.map((i) => this._layoutNodes[i]?.id).filter(Boolean) as string[],
    );

    return html`
      <div class="diagram-wrapper">
        <svg
          viewBox="0 0 ${this._svgWidth} ${this._svgHeight}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <!-- Per-confidence-color arrowhead markers for crisp directional arrows -->
            <marker id="arrow-confirmed" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3, 0 6" fill="${CONFIDENCE_COLOR['CONFIRMED']}" />
            </marker>
            <marker id="arrow-likely" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3, 0 6" fill="${CONFIDENCE_COLOR['LIKELY']}" />
            </marker>
            <marker id="arrow-possible" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3, 0 6" fill="${CONFIDENCE_COLOR['POSSIBLE']}" />
            </marker>
            <marker id="arrow-default" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>
            <marker id="arrow-bundle" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3, 0 6" fill="#475569" />
            </marker>
            <filter id="shadow" x="-4%" y="-4%" width="108%" height="116%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.10" />
            </filter>
            <filter id="shadow-light" x="-4%" y="-4%" width="108%" height="116%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.06" />
            </filter>
          </defs>

          <g transform=${this._transform || nothing}>
            <!-- Compound aggregate containers (behind everything) -->
            ${this._layoutCompounds.map((c) => this._renderCompound(c, matchedNodeIds))}

            <!-- Edges between event nodes and external nodes -->
            ${this._edgeGroups.map((g) => this._renderEdgeGroup(g, nodeMap, matchedNodeIds))}

            <!-- Leaf nodes (event children + external systems) -->
            ${this._layoutNodes.map((n, i) => this._renderNode(n, i))}
          </g>
        </svg>

        <div class="zoom-controls">
          <button @click=${this._zoomIn} title="Zoom in">+</button>
          <button @click=${this._zoomOut} title="Zoom out">&minus;</button>
          <button @click=${this._zoomReset} title="Reset zoom" style="font-size:12px">&#8634;</button>
        </div>

        ${this._tooltip
          ? html`
              <div class="tooltip" style="left:${this._tooltip.x}px;top:${this._tooltip.y}px">
                ${this._tooltip.text}
              </div>
            `
          : nothing}
      </div>

      <div class="legend">
        ${allAggregates.map((agg) => {
          const idx = getAggregateColorIndex(agg, allAggregates);
          return html`
            <div class="legend-item">
              <div class="legend-swatch" style="background:${AGG_BGS[idx]};border:2px solid ${AGG_COLORS[idx]}"></div>
              ${agg}
            </div>
          `;
        })}
        <div class="legend-item">
          <div class="legend-swatch" style="background:${EXTERNAL_FILL};border:2px solid ${EXTERNAL_STROKE}"></div>
          External
        </div>
        <div class="legend-divider"></div>
        ${Object.entries(CONFIDENCE_COLOR).map(
          ([name, color]) => html`
            <div class="legend-item">
              <div class="legend-swatch" style="background:${color}"></div>
              ${name}
            </div>
          `,
        )}
      </div>
    `;
  }
}
