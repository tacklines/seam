import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

export interface ComplianceDetail {
  eventName: string;
  owner: string;
  issue: string;
  severity: 'error' | 'warning';
}

type ComplianceStatus = 'pass' | 'warn' | 'fail';

const STATUS_VARIANT: Record<ComplianceStatus, string> = {
  pass: 'success',
  warn: 'warning',
  fail: 'danger',
};

/**
 * `<compliance-badge>` — Persistent header indicator showing contract compliance status.
 *
 * Displays a colored badge (green/amber/red) with icon + text so color is never
 * the sole differentiator. Clicking opens a detail dialog listing drifted contracts.
 *
 * @property status    - 'pass' | 'warn' | 'fail'
 * @property details   - Array of ComplianceDetail objects describing drift items
 *
 * @fires compliance-detail-requested - Fired when the badge is clicked
 */
@customElement('compliance-badge')
export class ComplianceBadge extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    .badge-btn {
      all: unset;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      border-radius: 4px;
      padding: 0.125rem 0.25rem;
      /* Ensure minimum 44x44px touch target via min-width/height */
      min-height: 2rem;
    }

    .badge-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .badge-icon {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
    }

    /* Detail dialog */
    .detail-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .detail-item {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.625rem;
      border-radius: 4px;
      border: 1px solid transparent;
    }

    .detail-item.error {
      background: #fff1f2;
      border-color: #fecdd3;
    }

    .detail-item.warning {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .detail-icon {
      flex-shrink: 0;
      margin-top: 0.125rem;
    }

    .detail-icon svg {
      width: 1rem;
      height: 1rem;
    }

    .detail-content {
      flex: 1;
      min-width: 0;
    }

    .detail-event-name {
      font-family: var(--sl-font-mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.125rem;
    }

    .detail-owner {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }

    .detail-issue {
      font-size: 0.8125rem;
      color: #374151;
      line-height: 1.4;
    }

    .detail-empty {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .detail-empty-icon {
      display: block;
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .summary-bar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .summary-label {
      font-size: 0.875rem;
      color: #6b7280;
    }
  `;

  /** Compliance status — determines badge color and icon */
  @property({ type: String }) status: ComplianceStatus = 'pass';

  /** Array of drift/compliance issues to display in the detail panel */
  @property({ attribute: false }) details: ComplianceDetail[] = [];

  @state() private _dialogOpen = false;

  private _tooltipText(): string {
    if (this.status === 'pass') {
      return t('complianceBadge.tooltip.pass', { count: this.details.length });
    }
    const errors = this.details.filter((d) => d.severity === 'error').length;
    const warnings = this.details.filter((d) => d.severity === 'warning').length;
    if (this.status === 'fail') {
      return t('complianceBadge.tooltip.fail', { count: errors });
    }
    return t('complianceBadge.tooltip.warn', { count: warnings });
  }

  private _handleClick() {
    this._dialogOpen = true;
    this.dispatchEvent(
      new CustomEvent('compliance-detail-requested', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderIcon() {
    if (this.status === 'pass') {
      return html`
        <svg class="badge-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="7"/>
          <polyline points="5,8 7,10.5 11,5.5"/>
        </svg>
      `;
    }
    if (this.status === 'warn') {
      return html`
        <svg class="badge-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2L14.5 13H1.5L8 2z"/>
          <line x1="8" y1="7" x2="8" y2="10"/>
          <circle cx="8" cy="12" r="0.5" fill="currentColor"/>
        </svg>
      `;
    }
    // fail
    return html`
      <svg class="badge-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="7"/>
        <line x1="5" y1="5" x2="11" y2="11"/>
        <line x1="11" y1="5" x2="5" y2="11"/>
      </svg>
    `;
  }

  private _renderDetailItem(detail: ComplianceDetail) {
    const isError = detail.severity === 'error';
    const ariaLabel = isError
      ? t('complianceBadge.detail.errorAriaLabel', { event: detail.eventName, owner: detail.owner })
      : t('complianceBadge.detail.warningAriaLabel', { event: detail.eventName, owner: detail.owner });

    return html`
      <li
        class="detail-item ${isError ? 'error' : 'warning'}"
        role="listitem"
        aria-label="${ariaLabel}"
      >
        <span class="detail-icon" aria-hidden="true">
          ${isError
            ? html`<svg viewBox="0 0 16 16" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="7"/><line x1="5" y1="5" x2="11" y2="11"/><line x1="11" y1="5" x2="5" y2="11"/></svg>`
            : html`<svg viewBox="0 0 16 16" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L14.5 13H1.5L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.5" fill="#d97706"/></svg>`
          }
        </span>
        <div class="detail-content">
          <div class="detail-event-name">${detail.eventName}</div>
          <div class="detail-owner">${t('complianceBadge.detail.owner', { owner: detail.owner })}</div>
          <div class="detail-issue">${detail.issue}</div>
        </div>
        <sl-badge variant=${isError ? 'danger' : 'warning'} pill>
          ${isError ? t('complianceBadge.severity.error') : t('complianceBadge.severity.warning')}
        </sl-badge>
      </li>
    `;
  }

  private _renderDialog() {
    const errors = this.details.filter((d) => d.severity === 'error').length;
    const warnings = this.details.filter((d) => d.severity === 'warning').length;

    return html`
      <sl-dialog
        label="${t('complianceBadge.dialog.title')}"
        ?open=${this._dialogOpen}
        @sl-after-hide=${() => { this._dialogOpen = false; }}
      >
        ${this.details.length > 0 ? html`
          <div class="summary-bar">
            <span class="summary-label">${t('complianceBadge.dialog.summary', { total: this.details.length })}</span>
            ${errors > 0 ? html`<sl-badge variant="danger">${t('complianceBadge.dialog.errors', { count: errors })}</sl-badge>` : nothing}
            ${warnings > 0 ? html`<sl-badge variant="warning">${t('complianceBadge.dialog.warnings', { count: warnings })}</sl-badge>` : nothing}
          </div>
          <ul class="detail-list" role="list" aria-label="${t('complianceBadge.dialog.listAriaLabel')}">
            ${this.details.map((d) => this._renderDetailItem(d))}
          </ul>
        ` : html`
          <div class="detail-empty">
            <span class="detail-empty-icon" aria-hidden="true">&#10003;</span>
            <span>${t('complianceBadge.dialog.allPassing')}</span>
          </div>
        `}
      </sl-dialog>
    `;
  }

  render() {
    const variant = STATUS_VARIANT[this.status];
    const label = t(`complianceBadge.status.${this.status}`);
    const ariaLabel = t('complianceBadge.ariaLabel', { status: label });

    return html`
      <sl-tooltip content="${this._tooltipText()}">
        <button
          class="badge-btn"
          aria-label="${ariaLabel}"
          @click=${this._handleClick}
        >
          <sl-badge variant=${variant} pill>
            ${this._renderIcon()}
            ${label}
          </sl-badge>
        </button>
      </sl-tooltip>
      ${this._renderDialog()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'compliance-badge': ComplianceBadge;
  }
}
