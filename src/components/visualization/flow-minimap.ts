import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

const MINIMAP_W = 200;
const MINIMAP_H = 140;

export interface MinimapNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface MinimapEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export interface GraphBounds {
  width: number;
  height: number;
}

@customElement('flow-minimap')
export class FlowMinimap extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: absolute;
      bottom: 12px;
      right: 12px;
      z-index: 15;
    }

    .minimap-container {
      width: ${MINIMAP_W}px;
      height: ${MINIMAP_H}px;
      background: rgba(250, 251, 252, 0.92);
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      user-select: none;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .viewport-rect {
      cursor: grab;
    }

    .viewport-rect:active {
      cursor: grabbing;
    }
  `;

  /** Positioned nodes for the minimap (simplified) */
  @property({ attribute: false }) nodes: MinimapNode[] = [];

  /** Simplified edges for the minimap */
  @property({ attribute: false }) edges: MinimapEdge[] = [];

  /** Current zoom/pan transform from the main view */
  @property({ attribute: false }) viewTransform: ViewTransform = { x: 0, y: 0, k: 1 };

  /** Full graph bounds in graph-space coordinates */
  @property({ attribute: false }) graphBounds: GraphBounds = { width: 800, height: 500 };

  @state() private _isDragging = false;
  private _dragStartTransform: ViewTransform = { x: 0, y: 0, k: 1 };
  private _dragStartMouse: { x: number; y: number } = { x: 0, y: 0 };

  private _onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return;

    this._isDragging = true;
    this._dragStartTransform = { ...this.viewTransform };
    this._dragStartMouse = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._isDragging) return;
    e.preventDefault();

    const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const scaleX = this.graphBounds.width / MINIMAP_W;
    const scaleY = this.graphBounds.height / MINIMAP_H;

    const dx = (currentX - this._dragStartMouse.x) * scaleX;
    const dy = (currentY - this._dragStartMouse.y) * scaleY;

    // Moving the viewport rect means translating the view in the opposite direction
    const newX = this._dragStartTransform.x - dx * this._dragStartTransform.k;
    const newY = this._dragStartTransform.y - dy * this._dragStartTransform.k;

    this.dispatchEvent(
      new CustomEvent('minimap-navigate', {
        detail: { x: newX, y: newY, k: this._dragStartTransform.k },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onPointerUp(e: PointerEvent): void {
    if (!this._isDragging) return;
    this._isDragging = false;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  }

  private _computeViewportRect(): { x: number; y: number; w: number; h: number } {
    const { x, y, k } = this.viewTransform;
    const gw = this.graphBounds.width;
    const gh = this.graphBounds.height;

    // The SVG viewBox is graphBounds. The zoom transform maps graph coords to screen.
    // Visible region in graph space: top-left = (-x/k, -y/k), size = (gw/k, gh/k)
    const visibleX = -x / k;
    const visibleY = -y / k;
    const visibleW = gw / k;
    const visibleH = gh / k;

    // Scale to minimap coords
    const scaleX = MINIMAP_W / gw;
    const scaleY = MINIMAP_H / gh;

    return {
      x: visibleX * scaleX,
      y: visibleY * scaleY,
      w: visibleW * scaleX,
      h: visibleH * scaleY,
    };
  }

  render() {
    if (this.nodes.length === 0) return nothing;

    const gw = this.graphBounds.width;
    const gh = this.graphBounds.height;
    const viewport = this._computeViewportRect();

    // Clamp viewport rect to minimap boundaries for display
    const vx = Math.max(0, viewport.x);
    const vy = Math.max(0, viewport.y);
    const vw = Math.min(MINIMAP_W - vx, viewport.w);
    const vh = Math.min(MINIMAP_H - vy, viewport.h);

    return html`
      <div
        class="minimap-container"
        role="img"
        aria-label="Flow diagram minimap showing ${this.nodes.length} nodes. Drag the blue viewport rectangle to navigate."
      >
        <svg
          viewBox="0 0 ${MINIMAP_W} ${MINIMAP_H}"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Scale the graph content to minimap size -->
          <g transform="scale(${MINIMAP_W / gw}, ${MINIMAP_H / gh})">
            <!-- Simplified edges -->
            ${this.edges.map(
              (e) => svg`
                <line
                  x1=${e.x1} y1=${e.y1}
                  x2=${e.x2} y2=${e.y2}
                  stroke="#9ca3af"
                  stroke-width=${2 * (gw / MINIMAP_W)}
                  stroke-opacity="0.5"
                />
              `,
            )}

            <!-- Simplified nodes -->
            ${this.nodes.map(
              (n) => svg`
                <rect
                  x=${n.x} y=${n.y}
                  width=${n.width} height=${n.height}
                  rx=${4 * (gw / MINIMAP_W)}
                  fill=${n.color}
                  fill-opacity="0.85"
                />
              `,
            )}
          </g>

          <!-- Viewport overlay rectangle (in minimap coords, draggable) -->
          <rect
            class="viewport-rect"
            x=${vx}
            y=${vy}
            width=${Math.max(4, vw)}
            height=${Math.max(4, vh)}
            fill="rgba(59, 130, 246, 0.12)"
            stroke="#3b82f6"
            stroke-width="1.5"
            rx="2"
            @pointerdown=${this._onPointerDown}
            @pointermove=${this._onPointerMove}
            @pointerup=${this._onPointerUp}
            @pointercancel=${this._onPointerUp}
          />
        </svg>
      </div>
    `;
  }
}
