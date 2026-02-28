import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LoadedFile } from '../schema/types.js';
import { getAllAggregates } from '../lib/grouping.js';
import { getAggregateColorIndex } from '../lib/aggregate-colors.js';
import { runElkLayout, NODE_W, NODE_H } from '../lib/elk-layout.js';
import type { LayoutNode, LayoutEdgeGroup } from '../lib/elk-layout.js';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';
import type { MinimapNode, MinimapEdge, ViewTransform, GraphBounds } from './flow-minimap.js';

// Hardcoded palette matching --agg-color-N and --agg-bg-N CSS vars
// (SVG attributes can't resolve CSS custom properties)
const AGG_COLORS = ['#4338ca', '#0d9488', '#c026d3', '#ea580c', '#2563eb', '#dc2626', '#65a30d', '#0891b2'];
const AGG_BGS = ['#e0e7ff', '#ccfbf1', '#fae8ff', '#fff7ed', '#dbeafe', '#ffe4e6', '#ecfccb', '#cffafe'];
const AGG_TEXT = ['#312e81', '#134e4a', '#86198f', '#9a3412', '#1e40af', '#991b1b', '#3f6212', '#155e75'];

const EXTERNAL_FILL = '#fef3c7';
const EXTERNAL_STROKE = '#d97706';
const EXTERNAL_TEXT = '#92400e';

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

  @state() private _layoutNodes: LayoutNode[] = [];
  @state() private _edgeGroups: LayoutEdgeGroup[] = [];
  @state() private _svgWidth = DEFAULT_WIDTH;
  @state() private _svgHeight = DEFAULT_HEIGHT;
  @state() private _transform = '';
  @state() private _selectedAggregate: string | null = null;
  @state() private _tooltip: { x: number; y: number; text: string } | null = null;

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
  private _updatingFromMinimap = false;

  private async _runElkLayout(): Promise<void> {
    if (this.files.length === 0) {
      this._layoutNodes = [];
      this._edgeGroups = [];
      this._svgWidth = DEFAULT_WIDTH;
      this._svgHeight = DEFAULT_HEIGHT;
      return;
    }

    const result = await runElkLayout(this.files);
    this._layoutNodes = result.nodes;
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
        this._computeMinimapData(this._layoutNodes, this._edgeGroups);
        // Re-attach zoom (SVG may have been recreated if going from empty to loaded)
        this.updateComplete.then(() => this._setupZoom());
      });
    }
  }

  private _computeMinimapData(nodes: LayoutNode[], edgeGroups: LayoutEdgeGroup[]): void {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    this.minimapNodes = nodes.map((n) => {
      const isAggregate = n.kind === 'aggregate';
      const color = isAggregate
        ? AGG_COLORS[n.colorIndex] ?? AGG_COLORS[0]
        : EXTERNAL_STROKE;
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        width: NODE_W,
        height: NODE_H,
        color,
      };
    });

    this.minimapEdges = edgeGroups
      .filter((g) => g.from !== g.to)
      .map((g) => {
        const from = nodeMap.get(g.from);
        const to = nodeMap.get(g.to);
        if (!from || !to) return null;
        return {
          x1: from.x + NODE_W / 2,
          y1: from.y + NODE_H / 2,
          x2: to.x + NODE_W / 2,
          y2: to.y + NODE_H / 2,
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

  private _onNodeClick(nodeId: string, kind: string) {
    if (kind !== 'aggregate') return;
    this._selectedAggregate = this._selectedAggregate === nodeId ? null : nodeId;
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

  private _renderEdgeGroup(group: LayoutEdgeGroup, nodeMap: Map<string, LayoutNode>): unknown {
    const from = nodeMap.get(group.from);
    const to = nodeMap.get(group.to);
    if (!from || !to) return nothing;

    const fromCx = this._nodeCx(from);
    const fromCy = this._nodeCy(from);
    const toCx = this._nodeCx(to);
    const toCy = this._nodeCy(to);

    // Self-loop
    if (from.id === to.id) {
      return group.edges.map((edge, i) => {
        const loopOffset = i * 16;
        const rx = fromCx + NODE_W / 2;
        const ry = fromCy;
        const bulge = 30 + loopOffset;
        const tipY = ry + 1;
        const color = CONFIDENCE_COLOR[edge.confidence] ?? '#64748b';
        const tooltipText = `${edge.label}\nTrigger: ${edge.trigger}\nConfidence: ${edge.confidence}`;

        return svg`
          <g class="edge-group"
            @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
            @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
            @mouseleave=${() => this._hideTooltip()}>
            <path
              d="M${rx} ${ry - 8} C${rx + bulge} ${ry - bulge} ${rx + bulge} ${ry + bulge} ${rx} ${tipY + 8}"
              fill="none"
              stroke=${color}
              stroke-width="1.5"
              marker-end="url(#arrowhead)"
            />
            <rect
              x=${rx + bulge - 2}
              y=${ry - 7}
              width=${edge.label.length * 6.2 + 8}
              height="14"
              rx="3"
              fill="white"
              fill-opacity="0.92"
            />
            <text
              x=${rx + bulge + 2}
              y=${ry + 4}
              fill=${color}
              font-size="10"
              font-family="'JetBrains Mono', monospace"
            >${edge.label}</text>
          </g>
        `;
      });
    }

    // Multi-edge bundling
    const count = group.edges.length;
    const isBundled = count > 3;

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
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const cpx1 = x1 + dx * 0.35;
      const cpy1 = y1 + dy * 0.35;
      const cpx2 = x1 + dx * 0.65;
      const cpy2 = y1 + dy * 0.65;
      const tooltipText = group.edges.map((e) => `${e.label} (${e.confidence})`).join('\n');

      return svg`
        <g class="edge-group"
          @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mouseleave=${() => this._hideTooltip()}>
          <path
            d="M${x1} ${y1} C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${x2} ${y2}"
            fill="none"
            stroke="#64748b"
            stroke-width="2.5"
            stroke-opacity="0.6"
            marker-end="url(#arrowhead)"
          />
          <circle cx=${mx} cy=${my} r="12" fill="#475569" />
          <text x=${mx} y=${my + 4} text-anchor="middle" fill="white" font-size="11" font-weight="700">${count}</text>
        </g>
      `;
    }

    // Regular edges (1-3 per group), offset perpendicular to avoid overlap
    const perpX = -ny; // perpendicular direction
    const perpY = nx;
    const spreadTotal = (count - 1) * 14;

    return group.edges.map((edge, i) => {
      const offset = -spreadTotal / 2 + i * 14;
      const ox1 = x1 + perpX * offset;
      const oy1 = y1 + perpY * offset;
      const ox2 = x2 + perpX * offset;
      const oy2 = y2 + perpY * offset;

      // Bezier control points
      const cpx1 = ox1 + dx * 0.35 + perpX * offset * 0.3;
      const cpy1 = oy1 + dy * 0.35 + perpY * offset * 0.3;
      const cpx2 = ox1 + dx * 0.65 + perpX * offset * 0.3;
      const cpy2 = oy1 + dy * 0.65 + perpY * offset * 0.3;

      const mx = (ox1 + ox2) / 2;
      const my = (oy1 + oy2) / 2;
      const color = CONFIDENCE_COLOR[edge.confidence] ?? '#64748b';
      const tooltipText = `${edge.label}\nTrigger: ${edge.trigger}\nConfidence: ${edge.confidence}`;

      return svg`
        <g class="edge-group"
          @mouseenter=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mousemove=${(e: MouseEvent) => this._showTooltip(e, tooltipText)}
          @mouseleave=${() => this._hideTooltip()}>
          <path
            d="M${ox1} ${oy1} C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${ox2} ${oy2}"
            fill="none"
            stroke=${color}
            stroke-width="1.5"
            marker-end="url(#arrowhead)"
          />
          <rect
            x=${mx - edge.label.length * 3 - 4}
            y=${my - 8}
            width=${edge.label.length * 6.2 + 8}
            height="14"
            rx="3"
            fill="white"
            fill-opacity="0.92"
          />
          <text
            x=${mx}
            y=${my + 3}
            text-anchor="middle"
            fill=${color}
            font-size="10"
            font-family="'JetBrains Mono', monospace"
          >${edge.label}</text>
        </g>
      `;
    });
  }

  private _fitLabel(label: string): { lines: string[]; fontSize: number } {
    const maxCharsPerLine = 18; // approx chars that fit at font-size 13 in NODE_W with padding
    const fontSize = 13;

    if (label.length <= maxCharsPerLine) {
      return { lines: [label], fontSize };
    }

    // Try to split on word boundaries (spaces, hyphens, camelCase)
    const parts = label.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s\-_]+/);
    const lines: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = part.length > maxCharsPerLine ? part.slice(0, maxCharsPerLine - 1) + '\u2026' : part;
      }
    }
    if (current) lines.push(current);

    // Cap at 2 lines
    if (lines.length > 2) {
      lines.length = 2;
      const last = lines[1];
      if (last.length > maxCharsPerLine - 1) {
        lines[1] = last.slice(0, maxCharsPerLine - 1) + '\u2026';
      } else {
        lines[1] = last + '\u2026';
      }
    }

    return { lines, fontSize: lines.length > 1 ? 12 : fontSize };
  }

  private _renderNode(node: LayoutNode): unknown {
    const isSelected = this._selectedAggregate === node.id;
    const isAggregate = node.kind === 'aggregate';

    const fill = isAggregate ? AGG_BGS[node.colorIndex] ?? AGG_BGS[0] : EXTERNAL_FILL;
    const stroke = isAggregate ? AGG_COLORS[node.colorIndex] ?? AGG_COLORS[0] : EXTERNAL_STROKE;
    const textColor = isAggregate ? AGG_TEXT[node.colorIndex] ?? AGG_TEXT[0] : EXTERNAL_TEXT;
    const strokeWidth = isSelected ? 3.5 : 2;

    // ELK gives top-left (x, y) directly
    const x = node.x;
    const y = node.y;
    const { lines, fontSize } = this._fitLabel(node.label);

    // Vertical centering: offset based on number of lines
    const lineHeight = fontSize + 3;
    const textBlockHeight = lines.length * lineHeight;
    const startY = y + NODE_H / 2 - textBlockHeight / 2 + fontSize * 0.8;

    return svg`
      <g
        class="node"
        style="cursor: ${isAggregate ? 'pointer' : 'default'}"
        @click=${() => this._onNodeClick(node.id, node.kind)}>
        <rect
          x=${x} y=${y}
          width=${NODE_W} height=${NODE_H}
          rx="10"
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
              font-weight="600"
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

    return html`
      <div class="diagram-wrapper">
        <svg
          viewBox="0 0 ${this._svgWidth} ${this._svgHeight}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <filter id="shadow" x="-4%" y="-4%" width="108%" height="116%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.08" />
            </filter>
          </defs>

          <g transform=${this._transform || nothing}>
            <!-- Edges behind nodes -->
            ${this._edgeGroups.map((g) => this._renderEdgeGroup(g, nodeMap))}

            <!-- Nodes on top -->
            ${this._layoutNodes.map((n) => this._renderNode(n))}
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
