import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { formatSuggestion, type SuggestionContext, type Suggestion } from '../../lib/format-suggestion.js';
import type { WorkflowStatus } from '../../lib/workflow-engine.js';
import { t } from '../../lib/i18n.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

/**
 * Suggestion Bar — a thin strip at the bottom of the main content area, above
 * the footer. Shows one contextual suggestion at a time, phrased as a gentle nudge.
 *
 * - Slides up from below with a 300ms ease-in-out animation when the suggestion changes
 * - Dismissable by clicking the × button
 * - Accessible: `aria-live="polite"` so screen readers announce suggestion changes
 * - Respects `prefers-reduced-motion` — no animation when reduced motion is enabled
 * - Bold formatting for session codes and counts via renderSuggestionHtml()
 * - Optional CTA button navigates to the relevant tab panel
 *
 * @fires suggestion-dismissed - Fired when the user dismisses the suggestion.
 *   No detail payload.
 * @fires suggestion-navigate - Fired when the user clicks the CTA button.
 *   Detail: `{ panel: string }` — the tab panel to navigate to.
 */
@customElement('suggestion-bar')
export class SuggestionBar extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 1rem;
      min-height: 2.5rem; /* ~40px */
      background: var(--sl-color-primary-50, #eff6ff);
      border-top: 1px solid var(--sl-color-primary-100, #dbeafe);
    }

    /* Slide-up animation for suggestion transitions */
    @keyframes slide-up {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .bar.animating {
      animation: slide-up 300ms ease-in-out both;
    }

    @media (prefers-reduced-motion: reduce) {
      .bar.animating {
        animation: none;
      }
    }

    /* Live region holds the suggestion text */
    .suggestion-text {
      flex: 1;
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-700, #374151);
      line-height: 1.4;
      /* Prevent text from overflowing on small screens */
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Bold spans for codes and counts */
    .suggestion-text strong {
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
    }

    /* CTA button: primary-colored text button */
    .cta-btn::part(base) {
      color: var(--sl-color-primary-600, #2563eb);
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      padding-inline: var(--sl-spacing-x-small, 0.5rem);
    }

    .cta-btn::part(base):hover {
      color: var(--sl-color-primary-700, #1d4ed8);
    }

    /* Dismiss button: muted until hover */
    .dismiss-btn {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: var(--sl-border-radius-small, 4px);
      color: var(--sl-color-neutral-400, #9ca3af);
      padding: 0;
      transition: color 0.15s ease, background 0.15s ease;
      /* Minimum 44x44 touch target via pseudo-element */
      position: relative;
    }

    .dismiss-btn::after {
      content: '';
      position: absolute;
      inset: -0.75rem;
    }

    .dismiss-btn:hover,
    .dismiss-btn:focus-visible {
      color: var(--sl-color-neutral-700, #374151);
      background: var(--sl-color-neutral-100, #f3f4f6);
    }

    .dismiss-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }

    /* × icon rendered as SVG */
    .close-icon {
      width: 0.75rem;
      height: 0.75rem;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      fill: none;
      display: block;
    }
  `;

  /** Current workflow status used to derive the suggestion text. */
  @property({ type: Object }) status?: WorkflowStatus;

  /** Session details for contextualizing the suggestion (e.g., session code). */
  @property({ type: Object }) context?: SuggestionContext;

  /** When true the bar is hidden (dismissed by the user). */
  @state() private _dismissed = false;

  /** Tracks the previous suggestion text to trigger re-animation on change. */
  @state() private _animating = false;

  private _lastSuggestion = '';
  private _animationTimer: ReturnType<typeof setTimeout> | null = null;

  private get _suggestion(): Suggestion | null {
    if (!this.status || !this.context) return null;
    return formatSuggestion(this.status, this.context);
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed);
    // Re-trigger the slide-up animation when the suggestion text changes.
    if (changed.has('status') || changed.has('context')) {
      const next = this._suggestion;
      if (next && next.text !== this._lastSuggestion) {
        this._lastSuggestion = next.text;
        // Reset dismissed when the suggestion changes
        this._dismissed = false;
        this._triggerAnimation();
      }
    }
  }

  private _triggerAnimation() {
    // Clear any in-flight timer
    if (this._animationTimer !== null) {
      clearTimeout(this._animationTimer);
    }
    this._animating = true;
    // Remove the class after the animation duration (300ms) so it can retrigger later.
    this._animationTimer = setTimeout(() => {
      this._animating = false;
      this._animationTimer = null;
    }, 300);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._animationTimer !== null) {
      clearTimeout(this._animationTimer);
    }
  }

  /**
   * Convert suggestion plain text to HTML, bolding session codes (all-caps
   * alphanumeric sequences) and standalone numbers.
   *
   * The convention from formatSuggestion() is that codes appear as bare words
   * (e.g., "ABC123") and counts appear as leading numbers ("3 conflicts found").
   * We bold these tokens to match the design spec.
   */
  private _renderSuggestionHtml(text: string) {
    // Split on tokens we want to bold:
    // - Session codes: all-uppercase alphanumeric, 4+ chars (e.g., ABC123, XYZ9)
    // - Standalone numbers followed by a space (e.g., "3 conflicts")
    const parts = text.split(/(\b[A-Z0-9]{4,}\b|\b\d+\b(?=\s))/g);
    return parts.map((part, i) => {
      // Odd-indexed parts are the captured groups (matched tokens)
      if (i % 2 === 1) {
        return html`<strong>${part}</strong>`;
      }
      return part;
    });
  }

  private _handleDismiss() {
    this._dismissed = true;
    this.dispatchEvent(
      new CustomEvent('suggestion-dismissed', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleCtaClick(panel: string | undefined) {
    if (!panel) return;
    this.dispatchEvent(
      new CustomEvent('suggestion-navigate', {
        bubbles: true,
        composed: true,
        detail: { panel },
      })
    );
  }

  override render() {
    const suggestion = this._suggestion;

    // Render nothing when there is no suggestion or the user dismissed it.
    if (!suggestion || this._dismissed) {
      return nothing;
    }

    const { text, action } = suggestion;

    return html`
      <div
        class="bar ${this._animating ? 'animating' : ''}"
        role="region"
        aria-label="${t('suggestion-bar.aria-label')}"
      >
        <!-- aria-live="polite" so screen readers announce changes without interrupting -->
        <span
          class="suggestion-text"
          aria-live="polite"
          aria-atomic="true"
          title="${text}"
        >${this._renderSuggestionHtml(text)}</span>

        ${action
          ? html`
            <sl-button
              class="cta-btn"
              variant="text"
              size="small"
              @click=${() => this._handleCtaClick(action.navigateTo)}
            >${action.label}</sl-button>
          `
          : nothing}

        <button
          class="dismiss-btn"
          type="button"
          aria-label="${t('suggestion-bar.dismiss')}"
          @click=${this._handleDismiss}
        >
          <svg class="close-icon" viewBox="0 0 12 12" aria-hidden="true">
            <line x1="2" y1="2" x2="10" y2="10"></line>
            <line x1="10" y1="2" x2="2" y2="10"></line>
          </svg>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'suggestion-bar': SuggestionBar;
  }
}
