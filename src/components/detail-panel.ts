import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface DetailEventEntry {
  name: string;
  trigger: string;
  confidence: string;
  direction: string;
  channel?: string;
}

export interface DetailNodeData {
  kind: 'aggregate' | 'external';
  id: string;
  label: string;
  colorIndex: number;
  events: DetailEventEntry[];
  connectedSystems?: string[];
}

const CONFIDENCE_COLOR: Record<string, string> = {
  CONFIRMED: '#16a34a',
  LIKELY: '#2563eb',
  POSSIBLE: '#d97706',
};

const AGG_COLORS = ['#4338ca', '#0d9488', '#c026d3', '#ea580c', '#2563eb', '#dc2626', '#65a30d', '#0891b2'];
const AGG_BGS = ['#e0e7ff', '#ccfbf1', '#fae8ff', '#fff7ed', '#dbeafe', '#ffe4e6', '#ecfccb', '#cffafe'];

const TRIGGER_LABELS: Record<string, string> = {
  command: 'User Command',
  event: 'Domain Event',
  query: 'Query',
  schedule: 'Scheduled Task',
  external: 'External System',
};

const DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Inbound (receives)',
  outbound: 'Outbound (sends)',
  internal: 'Internal',
};

@customElement('detail-panel')
export class DetailPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .panel {
      position: fixed;
      top: 56px; /* below the header */
      right: 0;
      width: 320px;
      height: calc(100vh - 56px);
      background: #ffffff;
      border-left: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      z-index: 50;
      transform: translateX(100%);
      transition: transform 200ms ease;
      overflow: hidden;
    }

    .panel.open {
      transform: translateX(0);
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      gap: 8px;
      flex-shrink: 0;
    }

    .panel-header-info {
      flex: 1;
      min-width: 0;
    }

    .panel-kind-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--sl-color-neutral-500, #6b7280);
      margin-bottom: 4px;
    }

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      line-height: 1.3;
      word-break: break-word;
    }

    .close-btn {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border: none;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      color: #6b7280;
      font-size: 18px;
      line-height: 1;
      padding: 0;
      transition: background 0.15s;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b7280;
      margin-bottom: 8px;
      margin-top: 16px;
    }

    .section-label:first-child {
      margin-top: 0;
    }

    .summary-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: #f3f4f6;
      color: #374151;
    }

    .pill.aggregate {
      color: var(--agg-text);
      background: var(--agg-bg);
      border: 1px solid var(--agg-stroke);
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .event-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      background: #fafafa;
    }

    .event-name {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
      word-break: break-word;
    }

    .event-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .meta-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 12px;
    }

    .meta-key {
      color: #6b7280;
      flex-shrink: 0;
      width: 110px;
    }

    .meta-val {
      color: #1f2937;
      font-weight: 500;
      word-break: break-word;
    }

    .confidence-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      color: white;
    }

    .systems-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .system-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #fef3c7;
      border: 1px solid #d97706;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #92400e;
    }

    .empty-state {
      color: #9ca3af;
      font-size: 13px;
      font-style: italic;
    }
  `;

  /** The node data to display. Set to null to close the panel. */
  @property({ attribute: false }) nodeData: DetailNodeData | null = null;

  private _onClose() {
    this.dispatchEvent(
      new CustomEvent('detail-panel-close', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderConfidenceBadge(confidence: string) {
    const color = CONFIDENCE_COLOR[confidence] ?? '#64748b';
    return html`<span class="confidence-badge" style="background:${color}">${confidence}</span>`;
  }

  private _renderAggregatePanel(data: DetailNodeData) {
    const aggColor = AGG_COLORS[data.colorIndex] ?? AGG_COLORS[0];
    const aggBg = AGG_BGS[data.colorIndex] ?? AGG_BGS[0];

    return html`
      <div class="section-label">About this aggregate</div>
      <div class="summary-pills">
        <span class="pill aggregate"
          style="--agg-text:${AGG_COLORS[data.colorIndex] ?? '#374151'};--agg-bg:${aggBg};--agg-stroke:${aggColor}">
          ${data.events.length} domain event${data.events.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div class="section-label" style="margin-top:16px">Domain Events</div>
      ${data.events.length === 0
        ? html`<div class="empty-state">No events in this aggregate.</div>`
        : html`
          <div class="event-list">
            ${data.events.map((ev) => this._renderEventCard(ev))}
          </div>
        `}

      ${data.connectedSystems && data.connectedSystems.length > 0
        ? html`
          <div class="section-label" style="margin-top:20px">Connected External Systems</div>
          <div class="systems-list">
            ${data.connectedSystems.map(
              (sys) => html`<div class="system-item">&#8594; ${sys}</div>`,
            )}
          </div>
        `
        : nothing}
    `;
  }

  private _renderEventCard(ev: DetailEventEntry) {
    const triggerLabel = TRIGGER_LABELS[ev.trigger] ?? ev.trigger;
    const directionLabel = DIRECTION_LABELS[ev.direction] ?? ev.direction;

    return html`
      <div class="event-card">
        <div class="event-name">${ev.name}</div>
        <div class="event-meta">
          <div class="meta-row">
            <span class="meta-key">Confidence Level</span>
            <span class="meta-val">${this._renderConfidenceBadge(ev.confidence)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">What triggers this?</span>
            <span class="meta-val">${triggerLabel}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">Integration</span>
            <span class="meta-val">${directionLabel}</span>
          </div>
          ${ev.channel
            ? html`
              <div class="meta-row">
                <span class="meta-key">Channel</span>
                <span class="meta-val">${ev.channel}</span>
              </div>
            `
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderExternalPanel(data: DetailNodeData) {
    return html`
      <div class="section-label">About this external system</div>
      <div class="summary-pills">
        <span class="pill">${data.events.length} connected event${data.events.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="section-label" style="margin-top:16px">Connected Events</div>
      ${data.events.length === 0
        ? html`<div class="empty-state">No events connected to this system.</div>`
        : html`
          <div class="event-list">
            ${data.events.map((ev) => html`
              <div class="event-card">
                <div class="event-name">${ev.name}</div>
                <div class="event-meta">
                  <div class="meta-row">
                    <span class="meta-key">Direction</span>
                    <span class="meta-val">${ev.direction === 'inbound' ? 'System sends to aggregate' : 'Aggregate sends to system'}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-key">Confidence Level</span>
                    <span class="meta-val">${this._renderConfidenceBadge(ev.confidence)}</span>
                  </div>
                </div>
              </div>
            `)}
          </div>
        `}
    `;
  }

  render() {
    const isOpen = this.nodeData !== null;
    const data = this.nodeData;

    return html`
      <div class="panel ${isOpen ? 'open' : ''}">
        ${data
          ? html`
            <div class="panel-header">
              <div class="panel-header-info">
                <div class="panel-kind-label">
                  ${data.kind === 'aggregate' ? 'Aggregate' : 'External System'}
                </div>
                <div class="panel-title">${data.label}</div>
              </div>
              <button class="close-btn" @click=${this._onClose} title="Close panel" aria-label="Close detail panel">
                &times;
              </button>
            </div>
            <div class="panel-body">
              ${data.kind === 'aggregate'
                ? this._renderAggregatePanel(data)
                : this._renderExternalPanel(data)}
            </div>
          `
          : nothing}
      </div>
    `;
  }
}
