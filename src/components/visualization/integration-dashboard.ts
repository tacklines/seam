import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { BoundaryNode, BoundaryConnection } from './boundary-map.js';
import type { IntegrationReport } from '../../schema/types.js';
import { downloadAsFile } from '../../lib/download.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';

import './go-no-go-verdict.js';
import './boundary-map.js';
import '../shared/empty-state.js';

export interface IntegrationCheck {
  id: string;
  label: string;
  description: string;
  status: 'pass' | 'fail' | 'warn';
  details?: string;
  owner?: string;
}

export { BoundaryNode, BoundaryConnection };

type Verdict = 'go' | 'no-go' | 'caution';

/**
 * `<integration-dashboard>` — Full-width Phase VII "Ship" dashboard.
 *
 * Three-column layout:
 *   Left: Integration check list (with expandable details, "Create work item" on failures)
 *   Center: Boundary map SVG showing cross-context connections
 *   Right: Go / No-Go / Caution verdict panel
 *
 * Columns stack to single-column on narrow viewports via CSS grid auto-fit.
 *
 * @fires create-work-item-requested - User clicked "Create work item" on a failed check.
 *   Detail: `{ checkId: string; checkLabel: string }`
 * @fires check-detail-requested - User expanded a check detail section.
 *   Detail: `{ checkId: string }`
 * @fires run-checks-requested - User clicked "Run checks" button.
 */
@customElement('integration-dashboard')
export class IntegrationDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    /* ---- Top bar ---- */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .dashboard-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--sl-color-neutral-900, #111827);
      margin: 0;
    }

    /* ---- Three-column grid ---- */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      align-items: start;
    }

    /* ---- Column cards ---- */
    .column-card {
      background: #fff;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-large, 12px);
      padding: 1.25rem;
    }

    .column-heading {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--sl-color-neutral-700, #374151);
      margin: 0 0 1rem;
      padding-bottom: 0.625rem;
      border-bottom: 1px solid var(--sl-color-neutral-100, #f3f4f6);
    }

    /* ---- Checks list ---- */
    .checks-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .check-item {
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: 8px;
      overflow: hidden;
    }

    .check-item.pass {
      border-left: 4px solid #16a34a;
    }

    .check-item.warn {
      border-left: 4px solid #d97706;
    }

    .check-item.fail {
      border-left: 4px solid #dc2626;
    }

    .check-header {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
    }

    .check-icon {
      width: 1.125rem;
      height: 1.125rem;
      flex-shrink: 0;
    }

    .check-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--sl-color-neutral-800, #1f2937);
      flex: 1;
      min-width: 0;
    }

    .check-description {
      font-size: 0.8125rem;
      color: var(--sl-color-neutral-600, #4b5563);
      padding: 0 0.75rem 0.625rem;
      line-height: 1.4;
    }

    /* ---- sl-details inside check items ---- */
    .check-details-content {
      padding: 0.5rem 0;
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .check-details-content .detail-text {
      color: var(--sl-color-neutral-700, #374151);
      margin-bottom: 0.5rem;
    }

    .check-details-content .detail-owner {
      color: var(--sl-color-neutral-500, #6b7280);
      font-size: 0.75rem;
    }

    .check-create-btn {
      margin-top: 0.625rem;
    }

    /* ---- Empty state for checks ---- */
    .checks-empty {
      text-align: center;
      padding: 2rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      font-size: 0.875rem;
    }

    /* ---- Summary bar ---- */
    .summary-bar {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
      align-items: center;
    }

    .summary-label {
      font-size: 0.8125rem;
      color: var(--sl-color-neutral-500, #6b7280);
    }

    /* ---- Verdict column ---- */
    .verdict-column go-no-go-verdict {
      width: 100%;
    }

    /* ---- SR-only ---- */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;

  /** All integration checks to display */
  @property({ attribute: false }) checks: IntegrationCheck[] = [];

  /** Boundary connections for the center map */
  @property({ attribute: false }) connections: BoundaryConnection[] = [];

  /** Nodes (contexts/aggregates) for the boundary map */
  @property({ attribute: false }) nodes: BoundaryNode[] = [];

  /** Overall verdict */
  @property({ type: String }) verdict: Verdict = 'go';

  /** One-line verdict summary */
  @property({ type: String }) verdictSummary = '';

  /** Number of contracts aligned (used in GO celebration) */
  @property({ type: Number }) contractCount = 0;

  /** Number of aggregates aligned (used in GO celebration) */
  @property({ type: Number }) aggregateCount = 0;

  /** Integration report for export (optional) */
  @property({ attribute: false }) integrationReport: IntegrationReport | null = null;

  // ---- Events ----

  private _exportReport() {
    if (!this.integrationReport) return;
    downloadAsFile(JSON.stringify(this.integrationReport, null, 2), 'integration-report.json');
  }

  private _handleCreateWorkItem(check: IntegrationCheck) {
    this.dispatchEvent(
      new CustomEvent('create-work-item-requested', {
        bubbles: true,
        composed: true,
        detail: { checkId: check.id, checkLabel: check.label },
      })
    );
  }

  private _handleCheckDetailOpen(check: IntegrationCheck) {
    this.dispatchEvent(
      new CustomEvent('check-detail-requested', {
        bubbles: true,
        composed: true,
        detail: { checkId: check.id },
      })
    );
  }

  private _handleRunChecks() {
    this.dispatchEvent(
      new CustomEvent('run-checks-requested', {
        bubbles: true,
        composed: true,
      })
    );
  }

  // ---- Icons ----

  private _checkIcon(status: IntegrationCheck['status']) {
    if (status === 'pass') {
      return html`
        <svg class="check-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="9" r="7.5" stroke="#16a34a"/>
          <polyline points="5.5,9 7.5,11.5 12.5,6.5"/>
        </svg>
      `;
    }
    if (status === 'warn') {
      return html`
        <svg class="check-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 2.5L16 15H2L9 2.5z"/>
          <line x1="9" y1="7.5" x2="9" y2="11"/>
          <circle cx="9" cy="13" r="0.5" fill="#d97706"/>
        </svg>
      `;
    }
    // fail
    return html`
      <svg class="check-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="9" r="7.5" stroke="#dc2626"/>
        <line x1="6" y1="6" x2="12" y2="12"/>
        <line x1="12" y1="6" x2="6" y2="12"/>
      </svg>
    `;
  }

  private _statusLabel(status: IntegrationCheck['status']): string {
    if (status === 'pass') return t('integrationDashboard.check.status.pass');
    if (status === 'warn') return t('integrationDashboard.check.status.warn');
    return t('integrationDashboard.check.status.fail');
  }

  // ---- Column: Checks ----

  private _renderCheckItem(check: IntegrationCheck) {
    const hasDetails = !!(check.details || check.owner);
    const statusLabel = this._statusLabel(check.status);
    const itemAriaLabel = t('integrationDashboard.check.itemAriaLabel', {
      label: check.label,
      status: statusLabel,
    });

    return html`
      <li
        class="check-item ${check.status}"
        aria-label="${itemAriaLabel}"
      >
        <div class="check-header">
          ${this._checkIcon(check.status)}
          <span class="check-label">${check.label}</span>
          <sl-badge
            variant=${check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'}
            pill
          >${statusLabel}</sl-badge>
        </div>
        <p class="check-description">${check.description}</p>

        ${hasDetails ? html`
          <sl-details
            summary="${t('integrationDashboard.check.detailsSummary')}"
            @sl-show=${() => this._handleCheckDetailOpen(check)}
          >
            <div class="check-details-content">
              ${check.details ? html`<p class="detail-text">${check.details}</p>` : nothing}
              ${check.owner ? html`<p class="detail-owner">${t('integrationDashboard.check.owner', { owner: check.owner })}</p>` : nothing}
              ${check.status !== 'pass' ? html`
                <div class="check-create-btn">
                  <sl-button
                    size="small"
                    variant="default"
                    @click=${() => this._handleCreateWorkItem(check)}
                    aria-label="${t('integrationDashboard.check.createWorkItemAriaLabel', { label: check.label })}"
                  >
                    ${t('integrationDashboard.check.createWorkItem')}
                  </sl-button>
                </div>
              ` : nothing}
            </div>
          </sl-details>
        ` : nothing}
      </li>
    `;
  }

  private _renderChecksColumn() {
    const passCount = this.checks.filter((c) => c.status === 'pass').length;
    const failCount = this.checks.filter((c) => c.status === 'fail').length;
    const warnCount = this.checks.filter((c) => c.status === 'warn').length;

    return html`
      <div class="column-card">
        <h2 class="column-heading">${t('integrationDashboard.checks.heading')}</h2>

        ${this.checks.length > 0 ? html`
          <div class="summary-bar" aria-label="${t('integrationDashboard.checks.summaryAriaLabel')}">
            <span class="summary-label">${t('integrationDashboard.checks.total', { count: this.checks.length })}</span>
            ${passCount > 0 ? html`<sl-badge variant="success" pill>${t('integrationDashboard.checks.passing', { count: passCount })}</sl-badge>` : nothing}
            ${warnCount > 0 ? html`<sl-badge variant="warning" pill>${t('integrationDashboard.checks.warning', { count: warnCount })}</sl-badge>` : nothing}
            ${failCount > 0 ? html`<sl-badge variant="danger" pill>${t('integrationDashboard.checks.failing', { count: failCount })}</sl-badge>` : nothing}
          </div>
          <ul
            class="checks-list"
            role="list"
            aria-label="${t('integrationDashboard.checks.listAriaLabel')}"
          >
            ${this.checks.map((check) => this._renderCheckItem(check))}
          </ul>
        ` : html`
          <div class="checks-empty">${t('integrationDashboard.checks.empty')}</div>
        `}
      </div>
    `;
  }

  // ---- Column: Boundary Map ----

  private _renderBoundaryColumn() {
    return html`
      <div class="column-card">
        <h2 class="column-heading">${t('integrationDashboard.boundary.heading')}</h2>
        <boundary-map
          .nodes=${this.nodes}
          .connections=${this.connections}
        ></boundary-map>
      </div>
    `;
  }

  // ---- Column: Verdict ----

  private _verdictSummaryText(): string {
    if (this.verdictSummary) return this.verdictSummary;
    if (this.verdict === 'go') {
      return t('integrationDashboard.verdict.go.summary');
    }
    if (this.verdict === 'no-go') {
      const failCount = this.checks.filter((c) => c.status === 'fail').length;
      return t('integrationDashboard.verdict.noGo.summary', { count: failCount });
    }
    // caution
    const warnCount = this.checks.filter((c) => c.status === 'warn').length;
    return t('integrationDashboard.verdict.caution.summary', { count: warnCount });
  }

  private _renderVerdictColumn() {
    const issueCount = this.checks.filter((c) => c.status !== 'pass').length;
    return html`
      <div class="column-card verdict-column">
        <h2 class="column-heading">${t('integrationDashboard.verdict.heading')}</h2>
        <go-no-go-verdict
          verdict="${this.verdict}"
          summary="${this._verdictSummaryText()}"
          issueCount="${issueCount}"
          contractCount="${this.contractCount}"
          aggregateCount="${this.aggregateCount}"
        ></go-no-go-verdict>
      </div>
    `;
  }

  // ---- Main render ----

  override render() {
    const hasData = this.checks.length > 0 || this.nodes.length > 0 || this.connections.length > 0;

    if (!hasData) {
      return html`
        <div>
          <div class="top-bar">
            <h1 class="dashboard-title">${t('integrationDashboard.title')}</h1>
            <sl-button
              variant="primary"
              @click=${this._handleRunChecks}
              aria-label="${t('integrationDashboard.runChecks.ariaLabel')}"
            >
              ${t('integrationDashboard.runChecks.label')}
            </sl-button>
          </div>
          <empty-state
            icon="rocket-takeoff"
            heading="${t('emptyState.integration.heading')}"
            description="${t('emptyState.integration.description')}"
          ></empty-state>
        </div>
      `;
    }

    return html`
      <div>
        <div class="top-bar">
          <h1 class="dashboard-title">${t('integrationDashboard.title')}</h1>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            ${this.integrationReport ? html`
              <sl-button size="small" variant="default" outline @click=${this._exportReport}>
                ${t('integrationDashboard.export')}
              </sl-button>
            ` : nothing}
            <sl-button
              variant="primary"
              @click=${this._handleRunChecks}
              aria-label="${t('integrationDashboard.runChecks.ariaLabel')}"
            >
              ${t('integrationDashboard.runChecks.label')}
            </sl-button>
          </div>
        </div>

        <div class="dashboard-grid" role="region" aria-label="${t('integrationDashboard.gridAriaLabel')}">
          ${this._renderChecksColumn()}
          ${this._renderBoundaryColumn()}
          ${this._renderVerdictColumn()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'integration-dashboard': IntegrationDashboard;
  }
}
