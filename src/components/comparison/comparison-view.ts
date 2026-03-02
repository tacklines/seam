import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LoadedFile, ConflictResolution, EventPriority } from '../../schema/types.js';
import { ComparisonController } from '../controllers/comparison-controller.js';
import { t } from '../../lib/i18n.js';
import { matchAssumptions } from '../../lib/assumption-matching.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
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
      grid-template-columns: repeat(4, 1fr);
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
    .stat-card.assumptions .stat-number { color: #16a34a; }

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
    .section-heading.assumptions { color: #16a34a; }

    /* ---- Assumption match cards ---- */
    .assumption-match-card {
      border-radius: 8px;
      padding: 1rem;
      border: 1px solid;
    }

    .assumption-match-card.matched {
      background: #f0fdf4;
      border-color: #86efac;
    }

    .assumption-match-card.unmatched {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .assumption-match-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .assumption-match-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
    }

    .assumption-match-badge.matched {
      background: #dcfce7;
      color: #15803d;
    }

    .assumption-match-badge.unmatched {
      background: #fef3c7;
      color: #92400e;
    }

    .assumption-match-role {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .assumption-match-statement {
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .assumption-match-events {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.5rem;
    }

    .assumption-match-event {
      font-size: 0.8125rem;
      color: #166534;
      padding: 0.25rem 0.5rem;
      background: #dcfce7;
      border-radius: 4px;
    }

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

    /* ---- Progress bar ---- */
    .progress-section {
      margin-bottom: 1.5rem;
    }

    .progress-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #374151;
    }

    .progress-header.all-resolved {
      color: #16a34a;
    }

    .progress-checkmark {
      font-size: 1rem;
      color: #16a34a;
      aria-hidden: true;
    }

    .progress-track {
      background: #e5e7eb;
      border-radius: 9999px;
      height: 8px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 9999px;
      background: var(--sl-color-primary-500, #6366f1);
      transition: width 500ms ease-in-out, background-color 500ms ease-in-out;
    }

    .progress-fill.complete {
      background: #16a34a;
    }

    @media (prefers-reduced-motion: reduce) {
      .progress-fill {
        transition: none;
      }
    }

    /* ---- Formalize CTA ---- */
    .formalize-cta {
      margin-bottom: 2rem;
      border-radius: 12px;
      padding: 1.5rem;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border: 2px solid #86efac;
      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15);
      display: flex;
      align-items: center;
      gap: 1.25rem;
      animation: formalize-cta-in 400ms ease-out;
    }

    @keyframes formalize-cta-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .formalize-cta {
        animation: none;
      }
    }

    .formalize-cta-icon {
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: #16a34a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      line-height: 1;
    }

    .formalize-cta-body {
      flex: 1;
      min-width: 0;
    }

    .formalize-cta-heading {
      font-size: 1.125rem;
      font-weight: 700;
      color: #14532d;
      margin: 0 0 0.25rem;
    }

    .formalize-cta-description {
      font-size: 0.9375rem;
      color: #166534;
      margin: 0;
    }
  `;

  @property({ attribute: false }) files: LoadedFile[] = [];
  @property({ attribute: false }) resolutions: ConflictResolution[] = [];
  @property({ attribute: false }) priorities: EventPriority[] = [];

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
    const assumptionMatches = matchAssumptions(this.files);
    const matchedCount = assumptionMatches.filter((m) => m.matched).length;

    // Sort conflicts by priority tier if priorities are available
    const tierOrder: EventPriority['tier'][] = ['must_have', 'should_have', 'could_have'];
    const priorityMap = new Map(this.priorities.map((p) => [p.eventName, tierOrder.indexOf(p.tier)]));
    const sortedConflicts = this.priorities.length > 0
      ? [...conflicts].sort((a, b) => {
          const aIdx = priorityMap.get(a.label) ?? tierOrder.length;
          const bIdx = priorityMap.get(b.label) ?? tierOrder.length;
          return aIdx - bIdx;
        })
      : conflicts;

    // Progress bar computation
    const totalConflicts = conflicts.length;
    const resolvedCount = this.resolutions.length;
    const progressPct = totalConflicts > 0 ? Math.min(100, (resolvedCount / totalConflicts) * 100) : 0;
    const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts;

    return html`
      <!-- Negotiation Progress Bar -->
      ${totalConflicts > 0 ? html`
        <div class="progress-section" role="region" aria-label="Negotiation progress">
          <div class="progress-header ${allResolved ? 'all-resolved' : ''}">
            ${allResolved
              ? html`<span class="progress-checkmark" aria-hidden="true">&#10003;</span>
                     ${t('comparisonView.allResolved')}`
              : t('comparisonView.progress', { resolved: String(resolvedCount), total: String(totalConflicts) })
            }
          </div>
          <div
            class="progress-track"
            role="progressbar"
            aria-valuenow=${resolvedCount}
            aria-valuemin="0"
            aria-valuemax=${totalConflicts}
            aria-label="${t('comparisonView.progress', { resolved: String(resolvedCount), total: String(totalConflicts) })}"
          >
            <div
              class="progress-fill ${allResolved ? 'complete' : ''}"
              style="width: ${progressPct}%"
            ></div>
          </div>
        </div>
      ` : ''}

      <!-- Formalize CTA (shown when all conflicts resolved) -->
      ${allResolved ? html`
        <div
          class="formalize-cta"
          role="status"
          aria-label="${t('comparisonView.formalizeCta.heading')}: ${t('comparisonView.formalizeCta.description')}"
        >
          <div class="formalize-cta-icon" aria-hidden="true">&#10003;</div>
          <div class="formalize-cta-body">
            <div class="formalize-cta-heading">${t('comparisonView.formalizeCta.heading')}</div>
            <p class="formalize-cta-description">${t('comparisonView.formalizeCta.description')}</p>
          </div>
          <sl-button
            variant="success"
            size="large"
            aria-label="${t('comparisonView.formalizeCta.button')}"
            @click=${() => {
              this.dispatchEvent(new CustomEvent('formalize-requested', {
                bubbles: true,
                composed: true,
              }));
            }}
          >${t('comparisonView.formalizeCta.button')}</sl-button>
        </div>
      ` : ''}

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
        <div class="stat-card assumptions" role="status" aria-label="${matchedCount} ${t('comparisonView.assumptions').toLowerCase()} matched">
          <div class="stat-number" aria-hidden="true">${matchedCount}</div>
          <div class="stat-label">${t('comparisonView.assumptions')}</div>
        </div>
      </div>

      <!-- Conflicts Section -->
      <div class="section" role="region" aria-label="${t('comparisonView.conflicts')}" aria-live="polite">
        <h2 class="section-heading conflicts">
          <domain-tooltip term="conflict">${t('comparisonView.conflicts')}</domain-tooltip>
        </h2>
        ${sortedConflicts.length > 0
          ? html`<div class="card-list">
              ${sortedConflicts.map(
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

      <!-- Matched Assumptions Section -->
      <div class="section" role="region" aria-label="${t('comparisonView.matchedAssumptions')}" aria-live="polite">
        <h2 class="section-heading assumptions">${t('comparisonView.matchedAssumptions')}</h2>
        ${assumptionMatches.length > 0
          ? html`<div class="card-list">
              ${assumptionMatches.map((m) => html`
                <div
                  class="assumption-match-card ${m.matched ? 'matched' : 'unmatched'}"
                  role="article"
                  aria-label="${m.matched ? t('comparisonView.matched') : t('comparisonView.needsDiscussion')}: ${m.assumption.statement}"
                >
                  <div class="assumption-match-header">
                    <span class="assumption-match-badge ${m.matched ? 'matched' : 'unmatched'}">
                      ${m.matched
                        ? html`<span aria-hidden="true">&#10003;</span> ${t('comparisonView.matched')}`
                        : html`<span aria-hidden="true">&#9888;</span> ${t('comparisonView.needsDiscussion')}`
                      }
                    </span>
                    <span class="assumption-match-role">${t('comparisonView.assumptionFrom', { role: m.assumptionRole })}</span>
                  </div>
                  <div class="assumption-match-statement">${m.assumption.statement}</div>
                  ${m.matched && m.matchedEvents.length > 0
                    ? html`<div class="assumption-match-events" aria-label="Matched events">
                        ${m.matchedEvents.map((e) => html`
                          <div class="assumption-match-event">
                            ${t('comparisonView.matchedBy', { eventName: e.eventName, role: e.role })}
                          </div>
                        `)}
                      </div>`
                    : ''
                  }
                </div>
              `)}
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
