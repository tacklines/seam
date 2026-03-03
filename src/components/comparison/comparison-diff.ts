import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LoadedFile } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';

import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';

// ── Types ──────────────────────────────────────────────────────────────────

type DiffStatus = 'shared' | 'only-a' | 'only-b';

interface DiffNode {
  eventName: string;
  aggregate: string;
  status: DiffStatus;
}

interface LayoutDiffNode {
  x: number;
  y: number;
  width: number;
  height: number;
  node: DiffNode;
}

// ── Constants ──────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 50;

const STATUS_FILL: Record<DiffStatus, string> = {
  shared: '#bbf7d0',
  'only-a': '#dbeafe',
  'only-b': '#fed7aa',
};

const STATUS_STROKE: Record<DiffStatus, string> = {
  shared: '#16a34a',
  'only-a': '#2563eb',
  'only-b': '#ea580c',
};


// ── Helpers ────────────────────────────────────────────────────────────────

function computeDiff(fileA: LoadedFile, fileB: LoadedFile): DiffNode[] {
  const eventsA = new Map<string, string>(); // name -> aggregate
  for (const e of fileA.data.domain_events) {
    eventsA.set(e.name, e.aggregate);
  }

  const eventsB = new Map<string, string>();
  for (const e of fileB.data.domain_events) {
    eventsB.set(e.name, e.aggregate);
  }

  const nodes: DiffNode[] = [];
  const seen = new Set<string>();

  for (const [name, aggregate] of eventsA) {
    seen.add(name);
    nodes.push({
      eventName: name,
      aggregate,
      status: eventsB.has(name) ? 'shared' : 'only-a',
    });
  }

  for (const [name, aggregate] of eventsB) {
    if (!seen.has(name)) {
      nodes.push({ eventName: name, aggregate, status: 'only-b' });
    }
  }

  return nodes;
}

async function runDiffLayout(diffNodes: DiffNode[]): Promise<{
  layoutNodes: LayoutDiffNode[];
  width: number;
  height: number;
}> {
  if (diffNodes.length === 0) {
    return { layoutNodes: [], width: 800, height: 400 };
  }

  const elk = new ELK();

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    },
    children: diffNodes.map((node, i) => ({
      id: `diff-${i}`,
      width: NODE_W,
      height: NODE_H,
      labels: [{ text: node.eventName }],
    })),
    edges: [],
  };

  const laid = await elk.layout(graph);

  const layoutNodes: LayoutDiffNode[] = (laid.children ?? []).map((child, i) => ({
    x: child.x ?? 0,
    y: child.y ?? 0,
    width: child.width ?? NODE_W,
    height: child.height ?? NODE_H,
    node: diffNodes[i],
  }));

  const w = typeof laid.width === 'number' && laid.width > 0 ? laid.width + 80 : 800;
  const h = typeof laid.height === 'number' && laid.height > 0 ? laid.height + 80 : 400;

  return { layoutNodes, width: w, height: h };
}

// ── Component ──────────────────────────────────────────────────────────────

@customElement('comparison-diff')
export class ComparisonDiff extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }

    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .select-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex: 1;
      min-width: 180px;
    }

    .select-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #374151;
    }

    .select-label .badge {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    .svg-wrapper {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #fafbfc;
      overflow: auto;
      min-height: 300px;
    }

    svg {
      display: block;
    }

    .legend {
      display: flex;
      gap: 1.5rem;
      margin-top: 0.75rem;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: #374151;
    }

    .legend-swatch {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 2px solid;
      flex-shrink: 0;
    }

    .summary {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.75rem;
    }
  `;

  /** Array of loaded perspective files. */
  @property({ attribute: false }) files: LoadedFile[] = [];

  @state() private _fileAIndex = 0;
  @state() private _fileBIndex = 1;
  @state() private _diffNodes: DiffNode[] = [];
  @state() private _layoutNodes: LayoutDiffNode[] = [];
  @state() private _svgWidth = 800;
  @state() private _svgHeight = 400;
  @state() private _loading = false;

  // Recompute diff whenever files or selections change
  override updated(changed: Map<string, unknown>) {
    if (changed.has('files') || changed.has('_fileAIndex') || changed.has('_fileBIndex')) {
      void this._recompute();
    }
  }

  private async _recompute() {
    const fileA = this.files[this._fileAIndex];
    const fileB = this.files[this._fileBIndex];
    if (!fileA || !fileB || fileA === fileB) {
      this._diffNodes = [];
      this._layoutNodes = [];
      return;
    }

    this._loading = true;
    const diff = computeDiff(fileA, fileB);
    this._diffNodes = diff;

    const { layoutNodes, width, height } = await runDiffLayout(diff);
    this._layoutNodes = layoutNodes;
    this._svgWidth = width;
    this._svgHeight = height;
    this._loading = false;
  }

  private _onSelectA(e: Event) {
    const select = e.target as HTMLSelectElement;
    const idx = parseInt((select as unknown as { value: string }).value, 10);
    if (!isNaN(idx)) this._fileAIndex = idx;
  }

  private _onSelectB(e: Event) {
    const select = e.target as HTMLSelectElement;
    const idx = parseInt((select as unknown as { value: string }).value, 10);
    if (!isNaN(idx)) this._fileBIndex = idx;
  }

  render() {
    if (this.files.length < 2) {
      return html`<div class="empty">${t('comparisonDiff.empty')}</div>`;
    }

    const sharedCount = this._diffNodes.filter((n) => n.status === 'shared').length;
    const onlyACount = this._diffNodes.filter((n) => n.status === 'only-a').length;
    const onlyBCount = this._diffNodes.filter((n) => n.status === 'only-b').length;

    return html`
      <div class="controls">
        <div class="select-group">
          <div class="select-label">
            <span class="badge" style="background:${STATUS_FILL['only-a']};border-color:${STATUS_STROKE['only-a']}"></span>
            ${t('comparisonDiff.fileA')}
          </div>
          <sl-select
            value=${String(this._fileAIndex)}
            @sl-change=${this._onSelectA}
            size="small"
          >
            ${this.files.map(
              (f, i) => html`<sl-option value=${String(i)}>${f.role} (${f.filename})</sl-option>`
            )}
          </sl-select>
        </div>

        <div class="select-group">
          <div class="select-label">
            <span class="badge" style="background:${STATUS_FILL['only-b']};border-color:${STATUS_STROKE['only-b']}"></span>
            ${t('comparisonDiff.fileB')}
          </div>
          <sl-select
            value=${String(this._fileBIndex)}
            @sl-change=${this._onSelectB}
            size="small"
          >
            ${this.files.map(
              (f, i) => html`<sl-option value=${String(i)}>${f.role} (${f.filename})</sl-option>`
            )}
          </sl-select>
        </div>
      </div>

      ${this._fileAIndex === this._fileBIndex
        ? html`<div class="empty">${t('comparisonDiff.selectDifferentFiles')}</div>`
        : nothing}

      ${this._loading
        ? html`<div class="empty">${t('comparisonDiff.computing')}</div>`
        : nothing}

      ${!this._loading && this._fileAIndex !== this._fileBIndex && this._layoutNodes.length > 0
        ? html`
            <div class="summary" role="status" aria-live="polite">
              ${t('comparisonDiff.summary', { total: this._diffNodes.length, shared: sharedCount, onlyA: onlyACount, onlyB: onlyBCount })}
            </div>
            <div class="svg-wrapper" role="img" aria-label="${t('comparisonDiff.svgAriaLabel', { shared: sharedCount, onlyA: onlyACount, onlyB: onlyBCount })}">
              ${this._renderSvg()}
            </div>
            ${this._renderLegend()}
            <table class="sr-only" aria-label="${t('comparisonDiff.tableAriaLabel')}">
              <caption>${t('comparisonDiff.tableCaption', { total: this._diffNodes.length })}</caption>
              <thead><tr><th>${t('comparisonDiff.col.eventName')}</th><th>${t('comparisonDiff.col.aggregate')}</th><th>${t('comparisonDiff.col.status')}</th></tr></thead>
              <tbody>
                ${this._diffNodes.map(
                  (n) => html`<tr><td>${n.eventName}</td><td>${n.aggregate}</td><td>${t(`comparisonDiff.status.${n.status}`)}</td></tr>`
                )}
              </tbody>
            </table>
          `
        : nothing}

      ${!this._loading && this._fileAIndex !== this._fileBIndex && this._diffNodes.length === 0
        ? html`<div class="empty">${t('comparisonDiff.noEvents')}</div>`
        : nothing}
    `;
  }

  private _renderSvg() {
    return html`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width=${this._svgWidth}
        height=${this._svgHeight}
        viewBox="0 0 ${this._svgWidth} ${this._svgHeight}"
        role="img"
        aria-label="${t('comparisonDiff.svgAriaLabelShort')}"
      >
        ${this._layoutNodes.map((ln) => this._renderNode(ln))}
      </svg>
    `;
  }

  private _renderNode(ln: LayoutDiffNode) {
    const { x, y, width, height, node } = ln;
    const fill = STATUS_FILL[node.status];
    const stroke = STATUS_STROKE[node.status];
    const cx = x + width / 2;
    const labelY1 = y + height / 2 - 6;
    const labelY2 = y + height / 2 + 12;

    return svg`
      <g>
        <rect
          x=${x}
          y=${y}
          width=${width}
          height=${height}
          rx="8"
          fill=${fill}
          stroke=${stroke}
          stroke-width="1.5"
        />
        <text
          x=${cx}
          y=${labelY1}
          text-anchor="middle"
          font-size="12"
          font-weight="600"
          fill="#111827"
          font-family="system-ui, sans-serif"
        >${this._truncate(node.eventName, 18)}</text>
        <text
          x=${cx}
          y=${labelY2}
          text-anchor="middle"
          font-size="10"
          fill="#6b7280"
          font-family="system-ui, sans-serif"
        >${this._truncate(node.aggregate, 22)}</text>
      </g>
    `;
  }

  private _truncate(text: string, maxChars: number): string {
    return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
  }

  private _renderLegend() {
    const statuses: DiffStatus[] = ['shared', 'only-a', 'only-b'];
    return html`
      <div class="legend">
        ${statuses.map(
          (s) => html`
            <div class="legend-item">
              <div
                class="legend-swatch"
                style="background:${STATUS_FILL[s]};border-color:${STATUS_STROKE[s]}"
              ></div>
              ${t(`comparisonDiff.status.${s}`)}
            </div>
          `
        )}
      </div>
    `;
  }
}
