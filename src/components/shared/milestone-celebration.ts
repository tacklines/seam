import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { MilestoneKey } from '../../lib/milestone-detector.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';

/** Maps each milestone key to a Shoelace icon name */
const MILESTONE_ICONS: Record<MilestoneKey, string> = {
  firstArtifact: 'file-earmark-check',
  allSubmitted: 'people-fill',
  allResolved: 'check-circle-fill',
  integrationGo: 'rocket-takeoff-fill',
};

/**
 * Milestone celebration toast.
 *
 * Slides in from the bottom-right when a session milestone is reached.
 * Auto-dismisses after 4 seconds. Respects `prefers-reduced-motion`.
 *
 * Usage:
 *   <milestone-celebration milestone="firstArtifact" message="First perspective submitted!">
 *   </milestone-celebration>
 *
 * Call .show() to animate the toast in; it auto-dismisses after 4 s.
 */
@customElement('milestone-celebration')
export class MilestoneCelebration extends LitElement {
  static styles = css`
    /* ── Host: transparent, non-blocking pass-through ── */
    :host {
      display: block;
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9999;
      /* host itself must not catch pointer events so it never blocks the page */
      pointer-events: none;
    }

    /* ── Toast wrapper: re-enable pointer events for the visible card ── */
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      background: var(--sl-color-neutral-0, #fff);
      border: 1px solid var(--sl-color-neutral-200);
      border-left: 4px solid var(--sl-color-primary-500);
      border-radius: var(--sl-border-radius-medium);
      padding: 0.875rem 1rem;
      box-shadow: var(--sl-shadow-large);
      max-width: 22rem;
      min-width: 16rem;

      /* Initial hidden state — translated off-screen */
      opacity: 0;
      transform: translateY(1.5rem);
      /* Duration set in JS to allow immediate hide in reduced-motion */
      transition: opacity 0.3s ease-out, transform 0.3s ease-out;
    }

    /* Visible state (class toggled by JS) */
    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* Exit animation */
    .toast.exiting {
      opacity: 0;
      transform: translateY(1.5rem);
    }

    /* ── Reduced motion: instant show/hide ── */
    @media (prefers-reduced-motion: reduce) {
      .toast {
        transition: none;
      }
    }

    /* ── Icon column ── */
    .toast-icon {
      flex-shrink: 0;
      font-size: 1.5rem;
      color: var(--sl-color-primary-600);
      margin-top: 0.1rem;
    }

    /* ── Content column ── */
    .toast-content {
      flex: 1;
      min-width: 0;
    }

    .toast-message {
      font-size: var(--sl-font-size-small);
      font-family: var(--sl-font-sans);
      color: var(--sl-color-neutral-800);
      line-height: 1.4;
      margin: 0;
    }

    /* ── Close button ── */
    .toast-close {
      flex-shrink: 0;
      align-self: flex-start;
      /* Negative offset to pull close button into the padding area */
      margin-top: -0.25rem;
      margin-right: -0.25rem;
    }
  `;

  /**
   * The milestone key — determines the icon and provides semantic context.
   * @attr milestone
   */
  @property({ type: String }) milestone: MilestoneKey = 'firstArtifact';

  /**
   * The human-readable celebration message.
   * @attr message
   */
  @property({ type: String }) message = '';

  @state() private _visible = false;
  @state() private _exiting = false;

  private _dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show the toast and start the auto-dismiss timer.
   * Call this after setting `milestone` and `message`.
   */
  show(): void {
    // Cancel any existing timer
    if (this._dismissTimer !== null) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }

    this._exiting = false;
    this._visible = true;

    // Auto-dismiss after 4 s
    this._dismissTimer = setTimeout(() => {
      this._startExit();
    }, 4000);
  }

  /** Dismiss the toast immediately (no exit animation). */
  hide(): void {
    if (this._dismissTimer !== null) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
    this._visible = false;
    this._exiting = false;
  }

  private _startExit(): void {
    this._dismissTimer = null;
    this._exiting = true;

    // After the CSS transition completes, fully hide
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduced ? 0 : 300;

    this._dismissTimer = setTimeout(() => {
      this._dismissTimer = null;
      this._visible = false;
      this._exiting = false;
    }, delay);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._dismissTimer !== null) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
  }

  render() {
    if (!this._visible && !this._exiting) {
      return html``;
    }

    const icon = MILESTONE_ICONS[this.milestone] ?? 'star-fill';
    const toastClass = [
      'toast',
      this._visible && !this._exiting ? 'visible' : '',
      this._exiting ? 'exiting' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return html`
      <div
        class="${toastClass}"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <!-- Icon -->
        <sl-icon class="toast-icon" name="${icon}" aria-hidden="true"></sl-icon>

        <!-- Message -->
        <div class="toast-content">
          <p class="toast-message">${this.message}</p>
        </div>

        <!-- Close button -->
        <sl-icon-button
          class="toast-close"
          name="x-lg"
          label="${t('milestone.dismiss')}"
          @click=${() => this._startExit()}
        ></sl-icon-button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'milestone-celebration': MilestoneCelebration;
  }
}
