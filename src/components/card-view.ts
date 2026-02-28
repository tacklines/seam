import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LoadedFile, Confidence, Direction } from '../schema/types.js';
import { getAllAggregates } from '../lib/grouping.js';
import { getAggregateColor } from '../lib/aggregate-colors.js';
import { EventFilterController } from './controllers/event-filter-controller.js';

import '@shoelace-style/shoelace/dist/components/tag/tag.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import './event-card.js';
import './assumption-list.js';

@customElement('card-view')
export class CardView extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* --- Stats bar --- */
    .stats-bar {
      display: flex;
      gap: 1.25rem;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      margin-bottom: 1rem;
      background: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
    }

    .stat-group {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .stat-label {
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .stat-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .stat-dot--confirmed { background: var(--sl-color-success-600); }
    .stat-dot--likely { background: var(--sl-color-primary-600); }
    .stat-dot--possible { background: var(--sl-color-warning-600); }
    .stat-dot--inbound { background: var(--sl-color-primary-600); }
    .stat-dot--outbound { background: var(--sl-color-danger-600); }
    .stat-dot--internal { background: var(--sl-color-neutral-500); }

    /* --- Role sections --- */
    .role-section {
      margin-bottom: 2rem;
    }

    .role-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--sl-color-neutral-200);
    }

    .role-name {
      font-size: var(--sl-font-size-x-large);
      font-weight: var(--sl-font-weight-bold);
    }

    /* --- Aggregate collapsible sections --- */
    .aggregate-group {
      margin-bottom: 1rem;
      transition: opacity 0.2s ease, max-height 0.3s ease;
    }

    sl-details.aggregate-details::part(base) {
      border: none;
      border-left: 3px solid var(--aggregate-border-color, var(--sl-color-neutral-300));
      border-radius: 0;
      background: transparent;
    }

    sl-details.aggregate-details::part(header) {
      padding: 0.375rem 0.75rem;
      font-size: var(--sl-font-size-medium);
    }

    sl-details.aggregate-details::part(content) {
      padding: 0.5rem 0.75rem 0.75rem;
    }

    .aggregate-summary {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .aggregate-name {
      font-weight: var(--sl-font-weight-bold);
      font-family: var(--sl-font-mono);
    }

    /* --- Events grid --- */
    .events-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 0.75rem;
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--sl-color-neutral-500);
    }
  `;

  @property({ attribute: false }) files: LoadedFile[] = [];
  @property({ attribute: false }) confidenceFilter = new Set<Confidence>(['CONFIRMED', 'LIKELY', 'POSSIBLE']);
  @property({ attribute: false }) directionFilter = new Set<Direction>(['inbound', 'outbound', 'internal']);
  @property({ type: String }) selectedAggregate: string | null = null;

  private _eventFilterCtrl = new EventFilterController(this);

  private renderStatsBar() {
    const { total, byConfidence: conf, byDirection: dir } = this._eventFilterCtrl.stats;

    return html`
      <div class="stats-bar">
        <span class="stat-label">${total} events</span>

        <div class="stat-group">
          <span class="stat-item">
            <span class="stat-dot stat-dot--confirmed"></span>
            ${conf.CONFIRMED} confirmed
          </span>
          <span class="stat-item">
            <span class="stat-dot stat-dot--likely"></span>
            ${conf.LIKELY} likely
          </span>
          <span class="stat-item">
            <span class="stat-dot stat-dot--possible"></span>
            ${conf.POSSIBLE} possible
          </span>
        </div>

        <div class="stat-group">
          <span class="stat-item">
            <span class="stat-dot stat-dot--inbound"></span>
            ${dir.inbound} inbound
          </span>
          <span class="stat-item">
            <span class="stat-dot stat-dot--outbound"></span>
            ${dir.outbound} outbound
          </span>
          <span class="stat-item">
            <span class="stat-dot stat-dot--internal"></span>
            ${dir.internal} internal
          </span>
        </div>
      </div>
    `;
  }

  render() {
    if (this.files.length === 0) {
      return html`<div class="empty">Load a storm-prep YAML file to view events</div>`;
    }

    this._eventFilterCtrl.setFiles(this.files);
    this._eventFilterCtrl.setFilters(this.confidenceFilter, this.directionFilter);

    const allAggregates = getAllAggregates(this.files);

    return html`
      ${this.renderStatsBar()}

      ${this.files.map((file) => {
        const groups = this._eventFilterCtrl.groupsForFile(file);

        return html`
          <div class="role-section">
            <div class="role-header">
              <span class="role-name">${file.role}</span>
              <sl-tag size="small">${file.data.metadata.scope}</sl-tag>
            </div>
            ${[...groups.entries()]
              .filter(([agg]) => this.selectedAggregate === null || agg === this.selectedAggregate)
              .map(([agg, events]) => {
                const color = getAggregateColor(agg, allAggregates);
                return html`
                  <div class="aggregate-group">
                    <sl-details
                      class="aggregate-details"
                      open
                      style="--aggregate-border-color: ${color}"
                    >
                      <div class="aggregate-summary" slot="summary">
                        <span class="aggregate-name">${agg}</span>
                        <sl-badge variant="neutral" pill>${events.length}</sl-badge>
                      </div>
                      <div class="events-grid">
                        ${events.map(
                          (e) => html`<event-card
                            .event=${e}
                            .aggregateColor=${color}
                          ></event-card>`
                        )}
                      </div>
                    </sl-details>
                  </div>
                `;
              })}
            <assumption-list .assumptions=${file.data.boundary_assumptions}></assumption-list>
          </div>
        `;
      })}
    `;
  }
}
