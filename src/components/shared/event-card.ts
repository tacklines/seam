import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DomainEvent } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';

const CONFIDENCE_VARIANT: Record<string, string> = {
  CONFIRMED: 'success',
  LIKELY: 'primary',
  POSSIBLE: 'warning',
};

const DIRECTION_VARIANT: Record<string, string> = {
  outbound: 'danger',
  inbound: 'primary',
  internal: 'neutral',
};

@customElement('event-card')
export class EventCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      background: #fff;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      border-left: 3px solid #d1d5db;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      padding: 0.75rem 1rem;
      transition: box-shadow 0.15s ease;
    }

    .card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .card.highlight {
      border-left-color: #e11d48;
      background: #fff1f2;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(225, 29, 72, 0.15);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }

    .event-name {
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--sl-font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .badges {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .badges sl-badge::part(base) {
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
    }

    .meta {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.5;
    }

    .meta strong {
      color: #4b5563;
    }

    sl-details {
      margin-top: 0.375rem;
    }

    sl-details::part(base) {
      border: none;
    }

    sl-details::part(header) {
      padding: 0.25rem 0;
      font-size: 12px;
      color: #6b7280;
    }

    sl-details::part(content) {
      padding: 0;
    }

    .payload-table {
      width: 100%;
      font-size: 12px;
      border-collapse: collapse;
    }

    .payload-table th,
    .payload-table td {
      text-align: left;
      padding: 0.125rem 0.375rem 0.125rem 0;
      font-family: var(--sl-font-mono);
    }

    .payload-table th {
      color: #9ca3af;
      font-weight: normal;
    }

    .notes {
      margin-top: 0.375rem;
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
      padding-left: 0.5rem;
      border-left: 2px solid #e5e7eb;
    }
  `;

  @property({ attribute: false }) event!: DomainEvent;
  @property({ type: String }) aggregateColor = '';
  @property({ type: Boolean }) highlight = false;

  render() {
    const e = this.event;
    const cardStyle = this.aggregateColor && !this.highlight
      ? `border-left-color: ${this.aggregateColor}`
      : '';

    return html`
      <div class="card ${this.highlight ? 'highlight' : ''}" style=${cardStyle}>
        <div class="header">
          <span class="event-name">${e.name}</span>
          <div class="badges">
            <sl-badge
              variant=${CONFIDENCE_VARIANT[e.confidence] ?? 'neutral'}
              pill
              ?filled=${e.confidence === 'CONFIRMED'}
            >${e.confidence}</sl-badge>
            <sl-badge
              variant=${DIRECTION_VARIANT[e.integration.direction] ?? 'neutral'}
              pill
            >${e.integration.direction}</sl-badge>
          </div>
        </div>
        <div class="meta">
          <strong>${t('eventCard.trigger')}</strong> ${e.trigger}
        </div>
        ${e.state_change ? html`<div class="meta"><strong>${t('eventCard.state')}</strong> ${e.state_change}</div>` : nothing}
        ${e.integration.channel ? html`<div class="meta"><strong>${t('eventCard.channel')}</strong> ${e.integration.channel}</div>` : nothing}
        ${e.payload.length > 0 ? html`
          <sl-details summary="${t('eventCard.payload', { count: e.payload.length })}">
            <table class="payload-table">
              <thead><tr><th>${t('eventCard.payloadField')}</th><th>${t('eventCard.payloadType')}</th></tr></thead>
              <tbody>
                ${e.payload.map(
                  (f) => html`<tr><td>${f.field}</td><td>${f.type}</td></tr>`
                )}
              </tbody>
            </table>
          </sl-details>
        ` : nothing}
        ${e.notes ? html`<div class="notes">${e.notes}</div>` : nothing}
      </div>
    `;
  }
}
