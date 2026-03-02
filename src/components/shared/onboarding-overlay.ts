import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

const ONBOARDING_KEY = 'mhw-onboarding-seen';

function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // Silently swallow storage errors.
  }
}

/**
 * Full-screen welcome overlay shown once per browser on first visit.
 *
 * The overlay presents a brief description of the app and three quick steps.
 * It is tracked via `localStorage` key `mhw-onboarding-seen`. Once dismissed,
 * it never reappears.
 *
 * Accessibility:
 * - `aria-modal="true"` and focus trap keep keyboard users inside the dialog
 * - Escape and backdrop click both dismiss
 * - All animations respect `prefers-reduced-motion`
 *
 * @fires onboarding-dismissed - Fired when the overlay is dismissed.
 *
 * @example
 * ```html
 * <onboarding-overlay></onboarding-overlay>
 * ```
 */
@customElement('onboarding-overlay')
export class OnboardingOverlay extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .card {
      background: var(--sl-color-neutral-0, #fff);
      border-radius: 0.75rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
      padding: 2rem;
      width: 100%;
      max-width: 28rem;
      outline: none;
    }

    .title {
      font-size: 1.25rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-900, #111827);
      margin: 0 0 0.5rem;
      line-height: 1.3;
    }

    .description {
      font-size: 0.9375rem;
      color: var(--sl-color-neutral-600, #4b5563);
      line-height: 1.6;
      margin: 0 0 1.5rem;
    }

    .steps {
      list-style: none;
      margin: 0 0 1.75rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .step-icon {
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background: var(--sl-color-primary-100, #dbeafe);
      color: var(--sl-color-primary-600, #2563eb);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.125rem;
    }

    .step-label {
      font-size: 0.9375rem;
      color: var(--sl-color-neutral-800, #1f2937);
      font-weight: var(--sl-font-weight-medium, 500);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      align-items: center;
    }

    .skip-link {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--sl-color-neutral-500, #6b7280);
      text-decoration: underline;
      text-decoration-color: transparent;
      transition: color 0.15s ease, text-decoration-color 0.15s ease;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      min-height: 44px;
      display: flex;
      align-items: center;
    }

    .skip-link:hover,
    .skip-link:focus-visible {
      color: var(--sl-color-neutral-700, #374151);
      text-decoration-color: currentColor;
    }

    .skip-link:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }

    sl-button[variant="primary"]::part(base) {
      min-height: 44px;
    }

    /* Entrance animation */
    @media (prefers-reduced-motion: no-preference) {
      .backdrop {
        animation: overlay-fade-in 0.2s ease forwards;
      }

      .card {
        animation: card-slide-in 0.25s ease forwards;
      }

      @keyframes overlay-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      @keyframes card-slide-in {
        from { opacity: 0; transform: translateY(1rem) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    }
  `;

  /**
   * When true, force-shows the overlay regardless of localStorage state.
   * Useful for stories and testing.
   */
  @property({ type: Boolean, attribute: 'force-show' }) forceShow = false;

  @state() private _visible = false;

  override connectedCallback() {
    super.connectedCallback();
    if (this.forceShow || !hasSeenOnboarding()) {
      this._visible = true;
    }
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('forceShow') && this.forceShow) {
      this._visible = true;
    }
    if (this._visible) {
      // Focus the card when shown
      requestAnimationFrame(() => {
        const card = this.renderRoot.querySelector<HTMLElement>('.card');
        card?.focus();
      });
    }
  }

  private _dismiss() {
    markOnboardingSeen();
    this._visible = false;
    this.dispatchEvent(
      new CustomEvent('onboarding-dismissed', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleBackdropClick(e: MouseEvent) {
    // Only dismiss if clicking the backdrop itself, not the card
    if (e.target === e.currentTarget) {
      this._dismiss();
    }
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._dismiss();
    }
    // Focus trap: wrap Tab within the card
    if (e.key === 'Tab') {
      const focusable = this.renderRoot.querySelectorAll<HTMLElement>(
        'sl-button, button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      const focusableArr = Array.from(focusable).filter(
        (el) => !el.hasAttribute('disabled')
      );
      if (focusableArr.length === 0) return;
      const first = focusableArr[0];
      const last = focusableArr[focusableArr.length - 1];
      const active = ('activeElement' in this.renderRoot ? this.renderRoot.activeElement : null) ?? document.activeElement;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  render() {
    if (!this._visible) return nothing;

    return html`
      <div
        class="backdrop"
        @click=${this._handleBackdropClick}
        @keydown=${this._handleKeydown}
      >
        <div
          class="card"
          role="dialog"
          aria-modal="true"
          aria-label=${t('onboardingOverlay.ariaLabel')}
          tabindex="-1"
        >
          <h2 class="title">${t('onboardingOverlay.title')}</h2>
          <p class="description">${t('onboardingOverlay.description')}</p>

          <ol
            class="steps"
            aria-label=${t('onboardingOverlay.stepsAriaLabel')}
          >
            <li class="step">
              <span class="step-icon" aria-hidden="true">
                <sl-icon name="upload"></sl-icon>
              </span>
              <span class="step-label">${t('onboardingOverlay.step1.label')}</span>
            </li>
            <li class="step">
              <span class="step-icon" aria-hidden="true">
                <sl-icon name="diagram-3"></sl-icon>
              </span>
              <span class="step-label">${t('onboardingOverlay.step2.label')}</span>
            </li>
            <li class="step">
              <span class="step-icon" aria-hidden="true">
                <sl-icon name="people"></sl-icon>
              </span>
              <span class="step-label">${t('onboardingOverlay.step3.label')}</span>
            </li>
          </ol>

          <div class="actions">
            <sl-button
              variant="primary"
              size="large"
              style="width: 100%"
              @click=${this._dismiss}
            >${t('onboardingOverlay.getStarted')}</sl-button>
            <button
              class="skip-link"
              @click=${this._dismiss}
              aria-label=${t('onboardingOverlay.closeAriaLabel')}
            >${t('onboardingOverlay.skip')}</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'onboarding-overlay': OnboardingOverlay;
  }
}
