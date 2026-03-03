import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

/**
 * `<empty-state>` — Reusable empty state display for phase views.
 *
 * Answers "What am I looking at?" (heading) and "What can I do here?"
 * (description + optional CTA button) when a view has no data.
 *
 * @fires empty-state-action - Fired when the CTA button is clicked.
 *
 * @example
 * <empty-state
 *   icon="inbox"
 *   heading="No events yet"
 *   description="Load perspective files to see events here"
 *   actionLabel="Load a file"
 * ></empty-state>
 */
@customElement('empty-state')
export class EmptyState extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
      text-align: center;
    }

    .icon-wrap {
      margin-bottom: 1rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      font-size: 3rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .heading {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-700, #374151);
      margin: 0 0 0.5rem;
    }

    .description {
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-500, #6b7280);
      margin: 0 0 1.25rem;
      max-width: 32ch;
      line-height: 1.5;
    }

    .action-wrap {
      display: flex;
      justify-content: center;
    }
  `;

  /** Shoelace icon name to display (large, muted). */
  @property() icon = 'inbox';

  /** Primary "What am I looking at?" heading text. */
  @property() heading = '';

  /** Secondary "What can I do here?" description text. */
  @property() description = '';

  /** Optional call-to-action button label. When empty no button is shown. */
  @property() actionLabel = '';

  /** sl-button variant for the CTA button. */
  @property() actionVariant = 'primary';

  private _handleAction() {
    this.dispatchEvent(
      new CustomEvent('empty-state-action', {
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    const resolvedHeading = this.heading || t('emptyState.defaultTitle');
    const resolvedDescription = this.description || t('emptyState.defaultDescription');

    return html`
      <div
        class="icon-wrap"
        aria-hidden="true"
      >
        <sl-icon name="${this.icon}"></sl-icon>
      </div>

      <h3 class="heading">${resolvedHeading}</h3>
      <p class="description">${resolvedDescription}</p>

      ${this.actionLabel
        ? html`
          <div class="action-wrap">
            <sl-button
              variant="${this.actionVariant}"
              size="small"
              @click=${this._handleAction}
            >${this.actionLabel}</sl-button>
          </div>
        `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'empty-state': EmptyState;
  }
}
