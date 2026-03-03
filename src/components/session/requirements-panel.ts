import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { Requirement, RequirementStatus } from '../../schema/types.js';

import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

/** Maps requirement status to a Shoelace icon name */
export function statusIcon(status: RequirementStatus): string {
  switch (status) {
    case 'fulfilled':
      return 'check-circle';
    case 'active':
      return 'play-circle';
    case 'draft':
      return 'circle';
    case 'deferred':
      return 'dash-circle';
  }
}

/** Maps requirement status to a CSS color token suffix */
export function statusColor(status: RequirementStatus): string {
  switch (status) {
    case 'fulfilled':
      return 'success';
    case 'active':
      return 'primary';
    case 'draft':
      return 'neutral';
    case 'deferred':
      return 'neutral';
  }
}

/**
 * Requirements Panel — a persistent sidebar showing all requirements with
 * their status and derived event counts. Provides traceability into the
 * domain event canvas.
 *
 * @fires requirement-selected — Fired when the user clicks a requirement.
 *   Detail: `{ requirementId: string }`
 */
@customElement('requirements-panel')
export class RequirementsPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .requirement-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .requirement-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: none;
      border-radius: var(--sl-border-radius-medium);
      background: transparent;
      cursor: pointer;
      text-align: left;
      font-family: var(--sl-font-sans);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      width: 100%;
      transition: background 0.15s ease;
      min-height: 44px;
      box-sizing: border-box;
    }

    .requirement-item:hover {
      background: var(--sl-color-neutral-100);
    }

    .requirement-item:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .requirement-item[aria-current='true'] {
      background: var(--sl-color-primary-50);
      border-left: 3px solid var(--sl-color-primary-600);
    }

    .requirement-item.deferred {
      opacity: 0.6;
      text-decoration: line-through;
    }

    .status-icon {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .status-icon.success {
      color: var(--sl-color-success-600);
    }

    .status-icon.primary {
      color: var(--sl-color-primary-600);
    }

    .status-icon.neutral {
      color: var(--sl-color-neutral-400);
    }

    .item-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .item-statement {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    .event-count-zero {
      color: var(--sl-color-warning-600);
      font-weight: var(--sl-font-weight-semibold);
    }

    .empty-state {
      padding: 1.5rem 1rem;
      text-align: center;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
    }

    sl-details::part(header) {
      font-weight: var(--sl-font-weight-semibold);
      font-size: var(--sl-font-size-small);
    }

    sl-details::part(content) {
      padding: 0.25rem 0;
    }
  `;

  /** All requirements in the session */
  @property({ attribute: false }) requirements: Requirement[] = [];

  /** Currently selected requirement ID */
  @property({ type: String, attribute: 'selected-requirement-id' }) selectedRequirementId = '';

  private _onSelect(requirementId: string) {
    this.dispatchEvent(
      new CustomEvent('requirement-selected', {
        detail: { requirementId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderEventCount(count: number) {
    if (count === 0) {
      return html`
        <span class="event-count-zero">
          ${t('requirements.eventCount', { count: 0 })}
          <span aria-hidden="true"> — </span>
          ${t('requirements.needsDerivation')}
        </span>
      `;
    }
    const label =
      count === 1
        ? t('requirements.eventCountSingular')
        : t('requirements.eventCount', { count });
    return html`<span>${label}</span>`;
  }

  private _renderRequirement(req: Requirement) {
    const icon = statusIcon(req.status);
    const color = statusColor(req.status);
    const isSelected = req.id === this.selectedRequirementId;
    const isDeferred = req.status === 'deferred';
    const eventCount = req.derivedEvents.length;
    const statusLabel = t(`requirements.status.${req.status}`);

    return html`
      <li>
        <button
          class="requirement-item ${isDeferred ? 'deferred' : ''}"
          type="button"
          aria-current="${isSelected ? 'true' : 'false'}"
          aria-label="${req.statement}, ${statusLabel}, ${eventCount} events"
          @click=${() => this._onSelect(req.id)}
        >
          <sl-icon
            class="status-icon ${color}"
            name="${icon}"
            aria-hidden="true"
          ></sl-icon>
          <span class="sr-only">${statusLabel}</span>
          <div class="item-content">
            <span class="item-statement">${req.statement}</span>
            <div class="item-meta">
              ${this._renderEventCount(eventCount)}
            </div>
          </div>
          ${eventCount === 0
            ? html`
                <sl-badge variant="warning" pill>
                  <sl-icon name="exclamation-triangle" aria-hidden="true" style="font-size: 0.75rem;"></sl-icon>
                </sl-badge>
              `
            : nothing}
        </button>
      </li>
    `;
  }

  override render() {
    const count = this.requirements.length;

    return html`
      <sl-details open>
        <span slot="summary">${t('requirements.heading', { count })}</span>
        ${count === 0
          ? html`<p class="empty-state" role="status">${t('requirements.empty')}</p>`
          : html`
              <ul class="requirement-list" role="list" aria-label="${t('requirements.heading', { count })}">
                ${this.requirements.map((r) => this._renderRequirement(r))}
              </ul>
            `}
      </sl-details>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'requirements-panel': RequirementsPanel;
  }
}
