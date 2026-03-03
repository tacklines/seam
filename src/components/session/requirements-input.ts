import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { Requirement } from '../../schema/types.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';

/**
 * Requirements Input — a simple list-based editor for capturing plain-language
 * requirements. The lowest-friction entry point for the Spark phase.
 *
 * @fires requirement-added — Fired when a new requirement is submitted.
 *   Detail: `{ text: string }`
 * @fires requirement-removed — Fired when a requirement is deleted.
 *   Detail: `{ id: string }`
 * @fires derive-events-requested — Fired when the user clicks "Derive Events".
 *   Detail: `{ requirements: Requirement[] }`
 */
@customElement('requirements-input')
export class RequirementsInput extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .requirements-container {
      padding: 1rem;
    }

    .heading {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      margin: 0 0 1rem;
    }

    .empty-state {
      padding: 1.5rem;
      text-align: center;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-medium);
      border: 1px dashed var(--sl-color-neutral-300);
      border-radius: var(--sl-border-radius-medium);
      margin-bottom: 1rem;
    }

    .requirements-list {
      list-style: none;
      padding: 0;
      margin: 0 0 1rem;
      counter-reset: req-counter;
    }

    .requirement-item {
      counter-increment: req-counter;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--sl-color-neutral-100);
      transition: background 0.15s ease;
    }

    .requirement-item:hover {
      background: var(--sl-color-neutral-50);
    }

    .requirement-item:last-child {
      border-bottom: none;
    }

    .requirement-number {
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--sl-color-primary-100);
      color: var(--sl-color-primary-700);
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
    }

    .requirement-text {
      flex: 1;
      font-size: var(--sl-font-size-medium);
      color: var(--sl-color-neutral-800);
    }

    .delete-btn {
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .requirement-item:hover .delete-btn,
    .delete-btn:focus-within {
      opacity: 1;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .input-row sl-input {
      flex: 1;
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 0.75rem;
      border-top: 1px solid var(--sl-color-neutral-200);
    }

    .requirement-count {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    /* ---- Mode toggle ---- */
    .mode-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .mode-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .mode-btn {
      padding: 0.25rem 0.75rem;
      border: 1px solid var(--sl-color-neutral-200);
      background: #fff;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--sl-color-neutral-600);
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }

    .mode-btn.active {
      background: var(--sl-color-primary-600);
      border-color: var(--sl-color-primary-600);
      color: #fff;
    }

    .mode-btn:hover:not(.active) {
      border-color: var(--sl-color-primary-400);
      color: var(--sl-color-primary-700);
    }

    .mode-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    /* ---- JTBD form ---- */
    .jtbd-form {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      padding: 0.75rem;
      background: var(--sl-color-primary-50, #eff6ff);
      border: 1px solid var(--sl-color-primary-200, #bfdbfe);
      border-radius: var(--sl-border-radius-medium);
      margin-bottom: 0.75rem;
    }

    .jtbd-label {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-primary-700);
      font-style: italic;
      white-space: nowrap;
    }

    .jtbd-field {
      flex: 1;
      min-width: 120px;
    }
  `;

  /** Current list of requirements. */
  @property({ type: Array }) requirements: Requirement[] = [];

  /** Active session code. */
  @property({ type: String, attribute: 'session-code' }) sessionCode = '';

  /** Current participant ID. */
  @property({ type: String, attribute: 'participant-id' }) participantId = '';

  @state() private _inputValue = '';
  @state() private _mode: 'plain' | 'jtbd' = 'plain';
  @state() private _jtbdSituation = '';
  @state() private _jtbdMotivation = '';
  @state() private _jtbdOutcome = '';

  private get _jtbdValid(): boolean {
    return this._jtbdSituation.trim().length > 0
      && this._jtbdMotivation.trim().length > 0
      && this._jtbdOutcome.trim().length > 0;
  }

  private _handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._submitRequirement();
    }
  }

  private _handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement & { value: string };
    this._inputValue = input.value;
  }

  private _submitRequirement() {
    const text = this._inputValue.trim();
    if (!text) return;

    this.dispatchEvent(
      new CustomEvent('requirement-added', {
        detail: { text },
        bubbles: true,
        composed: true,
      })
    );

    this._inputValue = '';

    // Re-focus the input after submission
    this.updateComplete.then(() => {
      const input = this.renderRoot.querySelector<HTMLElement>('sl-input');
      input?.focus();
    });
  }

  private _submitJtbd() {
    if (!this._jtbdValid) return;
    const text = `When ${this._jtbdSituation.trim()}, I want to ${this._jtbdMotivation.trim()}, so I can ${this._jtbdOutcome.trim()}.`;
    this.dispatchEvent(
      new CustomEvent('requirement-added', {
        detail: { text },
        bubbles: true,
        composed: true,
      })
    );
    this._jtbdSituation = '';
    this._jtbdMotivation = '';
    this._jtbdOutcome = '';
  }

  private _onJtbdKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._submitJtbd();
    }
  }

  private _removeRequirement(id: string) {
    this.dispatchEvent(
      new CustomEvent('requirement-removed', {
        detail: { id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _deriveEvents() {
    this.dispatchEvent(
      new CustomEvent('derive-events-requested', {
        detail: { requirements: this.requirements },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    const count = this.requirements.length;

    return html`
      <div class="requirements-container">
        <h2 class="heading">${t('requirements-input.heading')}</h2>

        <div class="mode-row">
          <span class="mode-label">${t('requirements-input.mode.label')}</span>
          <button
            class="mode-btn ${this._mode === 'plain' ? 'active' : ''}"
            @click=${() => { this._mode = 'plain'; }}
          >${t('requirements-input.mode.plain')}</button>
          <button
            class="mode-btn ${this._mode === 'jtbd' ? 'active' : ''}"
            @click=${() => { this._mode = 'jtbd'; }}
          >${t('requirements-input.mode.jtbd')}</button>
        </div>

        ${count === 0
          ? html`<p class="empty-state">${t('requirements-input.empty-state')}</p>`
          : this._renderList()}

        ${this._renderInput()}

        <div class="footer">
          <span class="requirement-count" aria-live="polite">
            ${count} requirement${count !== 1 ? 's' : ''} captured
          </span>
          <sl-button
            variant="primary"
            ?disabled=${count === 0}
            @click=${this._deriveEvents}
          >
            <sl-icon slot="prefix" name="lightning-charge" aria-hidden="true"></sl-icon>
            ${t('requirements-input.derive-events')}
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderList() {
    return html`
      <ol class="requirements-list" role="list" aria-label="Requirements">
        ${this.requirements.map((req, idx) => html`
          <li class="requirement-item" role="listitem">
            <span class="requirement-number" aria-hidden="true">${idx + 1}</span>
            <span class="requirement-text">${req.statement}</span>
            <span class="delete-btn">
              <sl-icon-button
                name="x-circle"
                label="${t('requirements-input.delete-label', { index: String(idx + 1) })}"
                @click=${() => this._removeRequirement(req.id)}
              ></sl-icon-button>
            </span>
          </li>
        `)}
      </ol>
    `;
  }

  private _renderInput() {
    if (this._mode === 'jtbd') {
      return html`
        <div class="jtbd-form">
          <span class="jtbd-label">${t('requirements-input.jtbd.when')}</span>
          <sl-input
            class="jtbd-field"
            size="small"
            placeholder="${t('requirements-input.jtbd.situationPlaceholder')}"
            .value=${this._jtbdSituation}
            aria-label="When (situation or trigger)"
            @sl-input=${(e: Event) => { this._jtbdSituation = (e.target as HTMLInputElement & { value: string }).value; }}
            @keydown=${this._onJtbdKeydown}
          ></sl-input>
          <span class="jtbd-label">${t('requirements-input.jtbd.iWantTo')}</span>
          <sl-input
            class="jtbd-field"
            size="small"
            placeholder="${t('requirements-input.jtbd.motivationPlaceholder')}"
            .value=${this._jtbdMotivation}
            aria-label="I want to (motivation)"
            @sl-input=${(e: Event) => { this._jtbdMotivation = (e.target as HTMLInputElement & { value: string }).value; }}
            @keydown=${this._onJtbdKeydown}
          ></sl-input>
          <span class="jtbd-label">${t('requirements-input.jtbd.soICan')}</span>
          <sl-input
            class="jtbd-field"
            size="small"
            placeholder="${t('requirements-input.jtbd.outcomePlaceholder')}"
            .value=${this._jtbdOutcome}
            aria-label="So I can (expected outcome)"
            @sl-input=${(e: Event) => { this._jtbdOutcome = (e.target as HTMLInputElement & { value: string }).value; }}
            @keydown=${this._onJtbdKeydown}
          ></sl-input>
          <sl-button
            size="small"
            variant="primary"
            ?disabled=${!this._jtbdValid}
            @click=${this._submitJtbd}
          >${t('requirements-input.jtbd.add')}</sl-button>
        </div>
      `;
    }

    return html`
      <div class="input-row">
        <sl-input
          placeholder="${t('requirements-input.placeholder')}"
          .value=${this._inputValue}
          @sl-input=${this._handleInputChange}
          @keydown=${this._handleInputKeydown}
          aria-label="${t('requirements-input.placeholder')}"
        ></sl-input>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'requirements-input': RequirementsInput;
  }
}
