import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PendingApproval } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/drawer/drawer.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

/** Decision emitted when the user accepts or rejects a pending approval. */
export interface ApprovalDecidedDetail {
  id: string;
  decision: 'approved' | 'rejected';
}

/** Compute a human-friendly "expires in X hours" string from an ISO timestamp. */
function expiresInLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t('approvalQueue.expired');
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return t('approvalQueue.expiresInHours', { hours });
  const minutes = Math.floor(ms / (1000 * 60));
  return t('approvalQueue.expiresInMinutes', { minutes });
}

/**
 * Approval queue component.
 *
 * Renders a bell icon in the header area that opens an `sl-drawer` from the
 * right. The drawer lists all pending agent-proposed actions with Accept /
 * Reject controls.
 *
 * @fires approval-decided — CustomEvent<ApprovalDecidedDetail> when the user
 *   accepts or rejects an item.
 */
@customElement('approval-queue')
export class ApprovalQueue extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      font-family: var(--sl-font-sans);
    }

    .bell-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .bell-button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.375rem;
      border-radius: 6px;
      color: var(--sl-color-neutral-600);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease, color 0.15s ease;
      min-width: 44px;
      min-height: 44px;
    }

    .bell-button:hover {
      background: var(--sl-color-neutral-100);
      color: var(--sl-color-neutral-900);
    }

    .bell-button:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .bell-icon {
      font-size: 1.25rem;
    }

    .badge-wrapper {
      position: absolute;
      top: 0;
      right: 0;
      pointer-events: none;
    }

    .queue-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-900);
      margin-bottom: 0.25rem;
    }

    .queue-subtitle {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      margin-bottom: 1rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: var(--sl-color-neutral-400);
      text-align: center;
      gap: 0.75rem;
    }

    .empty-icon {
      font-size: 2.5rem;
    }

    .empty-message {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
    }

    .empty-hint {
      font-size: var(--sl-font-size-small);
    }

    .item-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .item-card {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 8px;
      overflow: hidden;
    }

    .item-body {
      padding: 0.875rem 1rem 0.5rem;
    }

    .item-agent {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.25rem;
    }

    .item-action {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-900);
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .item-expiry {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      margin-bottom: 0.5rem;
    }

    .item-reasoning {
      padding: 0.5rem 1rem;
      background: var(--sl-color-neutral-50);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
      line-height: 1.5;
    }

    .item-actions {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: var(--sl-color-neutral-50);
      border-top: 1px solid var(--sl-color-neutral-100);
      justify-content: flex-end;
    }

    sl-details {
      --sl-spacing-medium: 0;
    }

    sl-details::part(base) {
      border: none;
      border-radius: 0;
      background: transparent;
    }

    sl-details::part(header) {
      padding: 0.375rem 1rem 0.5rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-primary-600);
    }

    sl-details::part(content) {
      padding: 0;
    }
  `;

  /** Pending approval items to display in the queue. */
  @property({ attribute: false }) pendingItems: PendingApproval[] = [];

  @state() private open = false;

  private get pendingCount(): number {
    return this.pendingItems.length;
  }

  private handleOpen() {
    this.open = true;
  }

  private handleClose() {
    this.open = false;
  }

  private handleDecision(id: string, decision: 'approved' | 'rejected') {
    this.dispatchEvent(
      new CustomEvent<ApprovalDecidedDetail>('approval-decided', {
        detail: { id, decision },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderBellButton() {
    const count = this.pendingCount;
    const ariaLabel = count > 0
      ? t('approvalQueue.bellAriaLabelWithCount', { count })
      : t('approvalQueue.bellAriaLabel');

    return html`
      <div class="bell-wrapper">
        <button
          class="bell-button"
          aria-label=${ariaLabel}
          aria-haspopup="dialog"
          @click=${this.handleOpen}
        >
          <span class="bell-icon" aria-hidden="true">&#128276;</span>
        </button>
        ${count > 0
          ? html`
              <div class="badge-wrapper" aria-hidden="true">
                <sl-badge variant="danger" pill>${count}</sl-badge>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderEmptyState() {
    return html`
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">&#10003;</span>
        <p class="empty-message">${t('approvalQueue.empty')}</p>
        <p class="empty-hint">${t('approvalQueue.emptyHint')}</p>
      </div>
    `;
  }

  private renderItem(item: PendingApproval) {
    return html`
      <div class="item-card" role="article" aria-label=${t('approvalQueue.itemAriaLabel', { action: item.action })}>
        <div class="item-body">
          <div class="item-agent">${t('approvalQueue.agentLabel', { id: item.agentId })}</div>
          <div class="item-action">${item.action}</div>
          <div class="item-expiry">${expiresInLabel(item.expiresAt)}</div>
        </div>

        ${item.reasoning
          ? html`
              <sl-details summary=${t('approvalQueue.viewDetails')}>
                <div class="item-reasoning">${item.reasoning}</div>
              </sl-details>
            `
          : nothing}

        <div class="item-actions">
          <sl-button
            variant="danger"
            size="small"
            @click=${() => this.handleDecision(item.id, 'rejected')}
          >
            ${t('approvalQueue.reject')}
          </sl-button>
          <sl-button
            variant="success"
            size="small"
            @click=${() => this.handleDecision(item.id, 'approved')}
          >
            ${t('approvalQueue.accept')}
          </sl-button>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this.renderBellButton()}

      <sl-drawer
        label=${t('approvalQueue.drawerLabel')}
        placement="end"
        ?open=${this.open}
        @sl-after-hide=${this.handleClose}
        style="--size: 400px;"
      >
        <div slot="label">
          <div class="queue-header">
            <span aria-hidden="true">&#128276;</span>
            ${t('approvalQueue.drawerLabel')}
            ${this.pendingCount > 0
              ? html`<sl-badge variant="danger" pill>${this.pendingCount}</sl-badge>`
              : nothing}
          </div>
          <div class="queue-subtitle">${t('approvalQueue.drawerSubtitle')}</div>
        </div>

        <div
          role="list"
          aria-label=${t('approvalQueue.listAriaLabel')}
          aria-live="polite"
        >
          ${this.pendingItems.length === 0
            ? this.renderEmptyState()
            : html`
                <div class="item-list">
                  ${this.pendingItems.map((item) => this.renderItem(item))}
                </div>
              `}
        </div>
      </sl-drawer>
    `;
  }
}
