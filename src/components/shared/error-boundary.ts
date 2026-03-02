import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import { categorizeError } from '../../lib/error-categorization.js';

import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

interface ErrorEntry {
  id: string;
  message: string;
  timestamp: number;
  retryable: boolean;
}

const MAX_ERRORS = 5;

/**
 * Global error boundary component.
 *
 * Listens for `unhandledrejection` and `error` window events, categorizes them,
 * and renders a fixed-position toast stack in the bottom-right corner using
 * `sl-alert` components.
 *
 * Usage: add `<error-boundary></error-boundary>` once at the end of the app root
 * template. It is a fixed-position overlay and does not affect document flow.
 */
@customElement('error-boundary')
export class ErrorBoundary extends LitElement {
  static styles = css`
    /* host must not block pointer events — it's a transparent overlay */
    :host {
      display: block;
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 9999;
      pointer-events: none;
    }

    /* toast stack re-enables pointer events so users can interact with alerts */
    .toast-stack {
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 22rem;
    }

    .retry-link {
      display: inline-block;
      margin-top: 0.25rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-danger-700);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
    }

    .retry-link:hover {
      color: var(--sl-color-danger-900);
    }
  `;

  @state() private _errors: ErrorEntry[] = [];

  // Bound handler references so we can remove them in disconnectedCallback
  private _onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this._addError(event.reason);
  };

  private _onError = (event: ErrorEvent): void => {
    this._addError(event.error ?? new Error(event.message));
  };

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
    window.addEventListener('error', this._onError);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
    window.removeEventListener('error', this._onError);
  }

  private _addError(error: unknown): void {
    const category = categorizeError(error);
    const entry: ErrorEntry = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: category.message,
      timestamp: Date.now(),
      retryable: category.retryable,
    };

    // Keep max 5 errors (FIFO — drop the oldest when at capacity)
    this._errors = [...this._errors.slice(-(MAX_ERRORS - 1)), entry];
  }

  private _dismissError(id: string): void {
    this._errors = this._errors.filter(e => e.id !== id);
  }

  private _handleRetry(id: string): void {
    this._dismissError(id);
    this.dispatchEvent(
      new CustomEvent('retry-requested', {
        bubbles: true,
        composed: true,
        detail: { errorId: id },
      })
    );
  }

  render() {
    if (this._errors.length === 0) return nothing;

    return html`
      <div class="toast-stack" role="region" aria-label="Errors" aria-live="polite">
        ${this._errors.map(entry => this._renderAlert(entry))}
      </div>
    `;
  }

  private _renderAlert(entry: ErrorEntry) {
    return html`
      <sl-alert
        variant="danger"
        open
        closable
        duration="8000"
        @sl-after-hide=${() => this._dismissError(entry.id)}
      >
        <sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
        ${t(entry.message)}
        ${entry.retryable
          ? html`<br /><button
              class="retry-link"
              @click=${() => this._handleRetry(entry.id)}
            >${t('errorBoundary.retry')}</button>`
          : nothing}
      </sl-alert>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'error-boundary': ErrorBoundary;
  }
}
