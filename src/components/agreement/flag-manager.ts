import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { UnresolvedItem } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';

/**
 * `<flag-manager>` — List and manage unresolved items that need follow-up.
 *
 * Shows existing flags and provides a quick-add form for flagging new items.
 * The intent is to capture "we couldn't resolve this right now" moments without
 * interrupting the jam flow.
 *
 * @fires item-flagged - Detail: { item: UnresolvedItem }
 */
@customElement('flag-manager')
export class FlagManager extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .header-title {
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
      flex: 1;
    }

    /* ── Flag list ── */
    .flag-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .flag-item {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: #fffbeb;
      border: 1px solid #fde68a;
    }

    .flag-icon {
      flex-shrink: 0;
      font-size: 1.125rem;
      color: #d97706;
      margin-top: 0.1rem;
    }

    .flag-body {
      flex: 1;
      min-width: 0;
    }

    .flag-description {
      font-size: 0.875rem;
      color: #111827;
      line-height: 1.5;
      word-break: break-word;
    }

    .flag-meta {
      font-size: 0.6875rem;
      color: #9ca3af;
      margin-top: 0.25rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      align-items: center;
    }

    .flag-meta .meta-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 9999px;
      padding: 0.1rem 0.45rem;
    }

    /* ── Add-flag form ── */
    .add-form {
      padding: 0.875rem;
      border-radius: 8px;
      background: #f9fafb;
      border: 1px dashed #d1d5db;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .add-form-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #374151;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .add-form sl-textarea {
      --sl-input-font-size-medium: 0.875rem;
    }

    .add-form sl-input {
      --sl-input-font-size-medium: 0.875rem;
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .error-text {
      font-size: 0.8125rem;
      color: var(--sl-color-danger-600);
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* ── Empty state ── */
    .empty {
      text-align: center;
      padding: 1.5rem 1rem;
      color: #9ca3af;
      font-size: 0.875rem;
      background: #f9fafb;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .empty sl-icon {
      font-size: 1.75rem;
      display: block;
      margin: 0 auto 0.4rem;
    }

    /* ── Toggle add-form button ── */
    .toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.4rem 0.875rem;
      border-radius: 9999px;
      border: 2px dashed #d1d5db;
      background: transparent;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      min-height: 44px;
    }

    .toggle-btn:hover {
      border-color: var(--sl-color-warning-400);
      color: var(--sl-color-warning-700);
    }

    .toggle-btn:focus-visible {
      outline: 2px solid var(--sl-color-warning-500);
      outline-offset: 2px;
    }
  `;

  /** Existing unresolved items to display */
  @property({ attribute: false }) items: UnresolvedItem[] = [];

  /** Session code for API calls */
  @property() sessionCode = '';

  /** Name of the participant flagging items */
  @property() participantName = '';

  /** API base URL */
  @property() apiBase = 'http://localhost:3002';

  /** Available overlap labels for the "related overlap" hint input */
  @property({ attribute: false }) overlapLabels: string[] = [];

  @state() private _showForm = false;
  @state() private _description = '';
  @state() private _relatedOverlap = '';
  @state() private _loading = false;
  @state() private _error = '';

  render() {
    return html`
      <div>
        <!-- Header -->
        <div class="header">
          <h3 class="header-title">
            <sl-icon name="flag-fill" aria-hidden="true" style="color:#d97706;margin-right:0.25rem;"></sl-icon>
            ${t('flagManager.heading')}
          </h3>
          <sl-badge variant=${this.items.length > 0 ? 'warning' : 'neutral'} pill>
            ${this.items.length}
          </sl-badge>
        </div>

        <!-- Flag list -->
        ${this.items.length > 0
          ? html`
              <ul class="flag-list" aria-label="${t('flagManager.listAriaLabel')}" role="list">
                ${this.items.map((item) => this._renderFlag(item))}
              </ul>
            `
          : html`
              <div class="empty" role="status">
                <sl-icon name="check2-all" aria-hidden="true"></sl-icon>
                <div>${t('flagManager.empty')}</div>
              </div>
            `}

        <!-- Add form or toggle button -->
        ${this._showForm ? this._renderAddForm() : this._renderToggleBtn()}
      </div>
    `;
  }

  private _renderFlag(item: UnresolvedItem) {
    const flaggedAt = new Date(item.flaggedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return html`
      <li class="flag-item" aria-label="${t('flagManager.itemAriaLabel', { desc: item.description })}">
        <sl-icon class="flag-icon" name="flag-fill" aria-hidden="true"></sl-icon>
        <div class="flag-body">
          <div class="flag-description">${item.description}</div>
          <div class="flag-meta">
            <span class="meta-chip">
              <sl-icon name="person" aria-hidden="true"></sl-icon>
              ${item.flaggedBy}
            </span>
            <span class="meta-chip">
              <sl-icon name="clock" aria-hidden="true"></sl-icon>
              ${flaggedAt}
            </span>
            ${item.relatedOverlap
              ? html`
                  <span class="meta-chip">
                    <sl-icon name="link-45deg" aria-hidden="true"></sl-icon>
                    ${item.relatedOverlap}
                  </span>
                `
              : nothing}
          </div>
        </div>
      </li>
    `;
  }

  private _renderToggleBtn() {
    return html`
      <button
        class="toggle-btn"
        aria-label="${t('flagManager.toggleAriaLabel')}"
        aria-expanded="false"
        @click=${() => { this._showForm = true; }}
      >
        <sl-icon name="flag" aria-hidden="true"></sl-icon>
        ${t('flagManager.toggleButton')}
      </button>
    `;
  }

  private _renderAddForm() {
    const canSubmit = this._description.trim().length > 0;

    return html`
      <div class="add-form" role="group" aria-label="${t('flagManager.formLabel')}">
        <div class="add-form-label">
          <sl-icon name="flag" aria-hidden="true"></sl-icon>
          ${t('flagManager.formLabel')}
        </div>

        <sl-textarea
          label="${t('flagManager.descriptionLabel')}"
          placeholder="e.g. We couldn't agree on whether OrderPlaced or PaymentReceived should trigger inventory deduction"
          rows="2"
          resize="auto"
          required
          value=${this._description}
          @sl-input=${(e: CustomEvent) => {
            this._description = (e.target as HTMLTextAreaElement).value;
          }}
        ></sl-textarea>

        ${this.overlapLabels.length > 0
          ? html`
              <sl-input
                label="${t('flagManager.relatedOverlapLabel')}"
                placeholder="${t('flagManager.relatedOverlapPlaceholder')}"
                list="overlap-labels"
                value=${this._relatedOverlap}
                @sl-input=${(e: CustomEvent) => {
                  this._relatedOverlap = (e.target as HTMLInputElement).value;
                }}
              ></sl-input>
              <datalist id="overlap-labels">
                ${this.overlapLabels.map(
                  (label) => html`<option value=${label}></option>`
                )}
              </datalist>
            `
          : nothing}

        <div class="form-actions">
          <sl-button
            variant="warning"
            size="small"
            ?loading=${this._loading}
            ?disabled=${!canSubmit}
            @click=${() => void this._submit()}
          >
            <sl-icon slot="prefix" name="flag-fill" aria-hidden="true"></sl-icon>
            ${t('flagManager.submitButton')}
          </sl-button>

          <sl-button
            variant="text"
            size="small"
            @click=${this._cancelForm}
            aria-label="${t('flagManager.cancelAriaLabel')}"
          >
            ${t('flagManager.cancelButton')}
          </sl-button>

          ${this._error
            ? html`
                <span class="error-text" role="alert">
                  <sl-icon name="exclamation-triangle" aria-hidden="true"></sl-icon>
                  ${this._error}
                </span>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  private _cancelForm() {
    this._showForm = false;
    this._description = '';
    this._relatedOverlap = '';
    this._error = '';
  }

  private async _submit() {
    const description = this._description.trim();
    if (!description) {
      this._error = t('flagManager.error.descriptionRequired');
      return;
    }

    const flaggedBy = this.participantName || 'Facilitator';
    const payload: { description: string; flaggedBy: string; relatedOverlap?: string } = {
      description,
      flaggedBy,
    };
    if (this._relatedOverlap.trim()) {
      payload.relatedOverlap = this._relatedOverlap.trim();
    }

    this._loading = true;
    this._error = '';

    try {
      let item: UnresolvedItem;

      if (this.sessionCode) {
        const res = await fetch(
          `${this.apiBase}/api/sessions/${this.sessionCode}/jam/flag`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { item: UnresolvedItem };
        item = data.item;
      } else {
        // Offline / local mode
        item = {
          ...payload,
          id: `local-${Date.now()}`,
          flaggedAt: new Date().toISOString(),
        };
      }

      this.dispatchEvent(
        new CustomEvent('item-flagged', {
          detail: { item },
          bubbles: true,
          composed: true,
        })
      );

      // Reset the form after successful submission
      this._cancelForm();
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'flag-manager': FlagManager;
  }
}
