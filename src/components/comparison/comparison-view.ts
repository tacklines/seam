import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LoadedFile } from '../../schema/types.js';
import { ComparisonController } from '../controllers/comparison-controller.js';
import { t } from '../../lib/i18n.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import './conflict-card.js';
import '../shared/event-card.js';
import '../shared/assumption-list.js';
import '../shared/empty-state.js';
import '../shared/domain-tooltip.js';

@customElement('comparison-view')
export class ComparisonView extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ---- Dashboard Header ---- */
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      border-radius: 8px;
      padding: 1.25rem 1rem;
      text-align: center;
      background: #fff;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    .stat-number {
      font-size: 2.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .stat-card.conflicts .stat-number { color: #e11d48; }
    .stat-card.shared-events .stat-number { color: #f59e0b; }
    .stat-card.shared-aggregates .stat-number { color: #4f46e5; }

    /* ---- Section headings ---- */
    .section {
      margin-bottom: 2rem;
    }

    .section-heading {
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0 0 0.75rem;
      padding-left: 0.75rem;
      border-left: 3px solid currentColor;
    }

    .section-heading.conflicts { color: #e11d48; }
    .section-heading.shared-events { color: #f59e0b; }
    .section-heading.shared-aggregates { color: #4f46e5; }

    .card-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .none-found {
      font-size: 0.875rem;
      color: #9ca3af;
      padding: 0.5rem 0.75rem;
    }

    /* ---- Role panels (inside collapsible) ---- */
    .panels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1rem;
    }

    .panel {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
      background: #fff;
    }

    .panel-header {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
    }

    .panel-meta {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.75rem;
    }

    .events-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    /* ---- Empty state ---- */
    .empty {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }
  `;

  @property({ attribute: false }) files: LoadedFile[] = [];

  private _comparisonCtrl = new ComparisonController(this);

  render() {
    if (this.files.length < 2) {
      return html`
        <empty-state
          icon="files"
          heading="${t('emptyState.comparison.heading')}"
          description="${t('emptyState.comparison.description')}"
        ></empty-state>
      `;
    }

    this._comparisonCtrl.setFiles(this.files);

    const conflicts = this._comparisonCtrl.conflicts;
    const sharedEvents = this._comparisonCtrl.sharedEvents;
    const sharedAggregates = this._comparisonCtrl.sharedAggregates;

    return html`
      <!-- Dashboard Header -->
      <div class="stats" role="region" aria-label="Comparison summary">
        <div class="stat-card conflicts" role="status" aria-label="${conflicts.length} ${t('comparisonView.conflicts').toLowerCase()} found">
          <div class="stat-number" aria-hidden="true">${conflicts.length}</div>
          <div class="stat-label">
            <domain-tooltip term="conflict">${t('comparisonView.conflicts')}</domain-tooltip>
          </div>
        </div>
        <div class="stat-card shared-events" role="status" aria-label="${sharedEvents.length} ${t('comparisonView.sharedEvents').toLowerCase()}">
          <div class="stat-number" aria-hidden="true">${sharedEvents.length}</div>
          <div class="stat-label">
            <domain-tooltip term="overlap">${t('comparisonView.sharedEvents')}</domain-tooltip>
          </div>
        </div>
        <div class="stat-card shared-aggregates" role="status" aria-label="${sharedAggregates.length} ${t('comparisonView.sharedAggregates').toLowerCase()}">
          <div class="stat-number" aria-hidden="true">${sharedAggregates.length}</div>
          <div class="stat-label">
            <domain-tooltip term="aggregate">${t('comparisonView.sharedAggregates')}</domain-tooltip>
          </div>
        </div>
      </div>

      <!-- Conflicts Section -->
      <div class="section" role="region" aria-label="${t('comparisonView.conflicts')}" aria-live="polite">
        <h2 class="section-heading conflicts">
          <domain-tooltip term="conflict">${t('comparisonView.conflicts')}</domain-tooltip>
        </h2>
        ${conflicts.length > 0
          ? html`<div class="card-list">
              ${conflicts.map(
                (o) => html`<conflict-card .overlap=${o} .files=${this.files}></conflict-card>`
              )}
            </div>`
          : html`<div class="none-found">${t('comparisonView.noneFound')}</div>`}
      </div>

      <!-- Shared Events Section -->
      <div class="section" role="region" aria-label="${t('comparisonView.sharedEvents')}">
        <h2 class="section-heading shared-events">
          <domain-tooltip term="overlap">${t('comparisonView.sharedEvents')}</domain-tooltip>
        </h2>
        ${sharedEvents.length > 0
          ? html`<div class="card-list">
              ${sharedEvents.map(
                (o) => html`<conflict-card .overlap=${o} .files=${this.files}></conflict-card>`
              )}
            </div>`
          : html`<div class="none-found">${t('comparisonView.noneFound')}</div>`}
      </div>

      <!-- Shared Aggregates Section -->
      <div class="section" role="region" aria-label="${t('comparisonView.sharedAggregates')}">
        <h2 class="section-heading shared-aggregates">
          <domain-tooltip term="aggregate">${t('comparisonView.sharedAggregates')}</domain-tooltip>
        </h2>
        ${sharedAggregates.length > 0
          ? html`<div class="card-list">
              ${sharedAggregates.map(
                (o) => html`<conflict-card .overlap=${o} .files=${this.files}></conflict-card>`
              )}
            </div>`
          : html`<div class="none-found">${t('comparisonView.noneFound')}</div>`}
      </div>

      <!-- Agreements (collapsible role panels) -->
      <sl-details summary="${t('comparisonView.rolePanels')}">
        <div class="panels">
          ${this.files.map(
            (file) => html`
              <div class="panel" role="region" aria-label="${file.role} role panel">
                <div class="panel-header">${file.role}</div>
                <div class="panel-meta">
                  ${file.data.metadata.scope} &middot;
                  ${t('comparisonView.nEvents', { count: file.data.domain_events.length })} &middot;
                  ${t('comparisonView.nAssumptions', { count: file.data.boundary_assumptions.length })}
                </div>
                <div class="events-list">
                  ${file.data.domain_events.map(
                    (e) => html`<event-card .event=${e}></event-card>`
                  )}
                </div>
                <assumption-list .assumptions=${file.data.boundary_assumptions}></assumption-list>
              </div>
            `
          )}
        </div>
      </sl-details>
    `;
  }
}
