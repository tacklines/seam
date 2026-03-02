import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

type Verdict = 'go' | 'no-go' | 'caution';

/**
 * `<go-no-go-verdict>` — Large verdict display panel for the Ship phase.
 *
 * GO: Green background, animated pulse + confetti (respects prefers-reduced-motion).
 * NO-GO: Red background, X icon, issue count.
 * CAUTION: Amber background, warning icon.
 *
 * @property verdict      - 'go' | 'no-go' | 'caution'
 * @property summary      - One-line summary message
 * @property issueCount   - Number of issues (used for NO-GO and CAUTION)
 * @property contractCount - Number of contracts aligned (used in GO celebration)
 * @property aggregateCount - Number of aggregates aligned (used in GO celebration)
 */
@customElement('go-no-go-verdict')
export class GoNoGoVerdict extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    /* ---- Container ---- */
    .verdict-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 2rem;
      border-radius: var(--sl-border-radius-large, 12px);
      text-align: center;
      position: relative;
      overflow: hidden;
      min-height: 200px;
    }

    .verdict-container.go {
      background: #16a34a;
      color: #fff;
    }

    .verdict-container.no-go {
      background: #dc2626;
      color: #fff;
    }

    .verdict-container.caution {
      background: #d97706;
      color: #fff;
    }

    /* ---- Icon ---- */
    .verdict-icon {
      width: 4rem;
      height: 4rem;
      margin-bottom: 1rem;
      flex-shrink: 0;
    }

    /* ---- Text ---- */
    .verdict-label {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
    }

    .verdict-summary {
      font-size: 1.0625rem;
      font-weight: 400;
      opacity: 0.93;
      line-height: 1.5;
      max-width: 28rem;
    }

    .verdict-celebration {
      font-size: 0.875rem;
      opacity: 0.85;
      margin-top: 0.75rem;
      font-style: italic;
      max-width: 28rem;
      line-height: 1.5;
    }

    /* ---- GO pulse animation ---- */
    @keyframes go-pulse {
      0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.6); }
      70% { box-shadow: 0 0 0 18px rgba(22, 163, 74, 0); }
      100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
    }

    .verdict-container.go.animating {
      animation: go-pulse 0.6s ease-out 3;
    }

    /* ---- Confetti (CSS-only, using pseudo-elements) ---- */
    /*
     * We simulate confetti with multiple colored rectangles using ::before / ::after
     * on child wrapper elements. Since pseudo-elements can only do 2 per element,
     * we stack a few wrapper divs.
     */
    @keyframes confetti-fall-1 {
      0%   { transform: translate(-60px, -80px) rotate(0deg); opacity: 1; }
      100% { transform: translate(-30px, 200px) rotate(360deg); opacity: 0; }
    }
    @keyframes confetti-fall-2 {
      0%   { transform: translate(40px, -90px) rotate(0deg); opacity: 1; }
      100% { transform: translate(80px, 210px) rotate(-270deg); opacity: 0; }
    }
    @keyframes confetti-fall-3 {
      0%   { transform: translate(-10px, -70px) rotate(0deg); opacity: 1; }
      100% { transform: translate(20px, 190px) rotate(180deg); opacity: 0; }
    }
    @keyframes confetti-fall-4 {
      0%   { transform: translate(70px, -100px) rotate(0deg); opacity: 1; }
      100% { transform: translate(30px, 200px) rotate(-360deg); opacity: 0; }
    }

    .confetti-layer {
      position: absolute;
      top: 50%;
      left: 50%;
      pointer-events: none;
    }

    .confetti-layer::before,
    .confetti-layer::after {
      content: '';
      position: absolute;
      width: 10px;
      height: 6px;
      border-radius: 2px;
      opacity: 0;
    }

    /* Layer 1 */
    .confetti-layer.c1::before {
      background: #fbbf24;
      animation: confetti-fall-1 2s ease-out 0.0s 1 forwards;
    }
    .confetti-layer.c1::after {
      background: #f472b6;
      animation: confetti-fall-2 2s ease-out 0.1s 1 forwards;
    }

    /* Layer 2 */
    .confetti-layer.c2::before {
      background: #60a5fa;
      animation: confetti-fall-3 2s ease-out 0.2s 1 forwards;
    }
    .confetti-layer.c2::after {
      background: #34d399;
      animation: confetti-fall-4 2s ease-out 0.15s 1 forwards;
    }

    /* Layer 3 */
    .confetti-layer.c3::before {
      background: #a78bfa;
      animation: confetti-fall-2 2s ease-out 0.05s 1 forwards;
    }
    .confetti-layer.c3::after {
      background: #fb923c;
      animation: confetti-fall-1 2s ease-out 0.25s 1 forwards;
    }

    /* Layer 4 — offset position */
    .confetti-layer.c4::before {
      background: #fbbf24;
      left: 40px;
      animation: confetti-fall-4 2s ease-out 0.35s 1 forwards;
    }
    .confetti-layer.c4::after {
      background: #f472b6;
      left: -40px;
      animation: confetti-fall-3 2s ease-out 0.4s 1 forwards;
    }

    /* Respect prefers-reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      .verdict-container.go.animating {
        animation: none;
      }
      .confetti-layer::before,
      .confetti-layer::after {
        animation: none;
        opacity: 0;
      }
    }
  `;

  /** The verdict outcome */
  @property({ type: String }) verdict: Verdict = 'go';

  /** Short summary shown below the verdict label */
  @property({ type: String }) summary = '';

  /** Number of issues (for NO-GO / CAUTION display) */
  @property({ type: Number }) issueCount = 0;

  /** Number of contracts aligned (for GO celebration message) */
  @property({ type: Number }) contractCount = 0;

  /** Number of aggregates aligned (for GO celebration message) */
  @property({ type: Number }) aggregateCount = 0;

  @state() private _animating = false;
  @state() private _showConfetti = false;

  override connectedCallback() {
    super.connectedCallback();
    if (this.verdict === 'go') {
      this._triggerCelebration();
    }
  }

  private _triggerCelebration() {
    this._animating = true;
    this._showConfetti = true;
    // 3 pulses × 600ms each = 1800ms; add a small buffer
    setTimeout(() => {
      this._animating = false;
    }, 1900);
    // Confetti lasts 2 seconds (animation duration)
    setTimeout(() => {
      this._showConfetti = false;
    }, 2500);
  }

  // ---- Icons ----

  private _renderGoIcon() {
    return html`
      <svg class="verdict-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.4)" fill="rgba(255,255,255,0.15)"/>
        <polyline points="18,32 27,42 46,22"/>
      </svg>
    `;
  }

  private _renderNoGoIcon() {
    return html`
      <svg class="verdict-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.4)" fill="rgba(255,255,255,0.15)"/>
        <line x1="20" y1="20" x2="44" y2="44"/>
        <line x1="44" y1="20" x2="20" y2="44"/>
      </svg>
    `;
  }

  private _renderCautionIcon() {
    return html`
      <svg class="verdict-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 8L58 54H6L32 8z" stroke="rgba(255,255,255,0.4)" fill="rgba(255,255,255,0.15)"/>
        <line x1="32" y1="26" x2="32" y2="40"/>
        <circle cx="32" cy="47" r="1.5" fill="white"/>
      </svg>
    `;
  }

  private _renderIcon() {
    switch (this.verdict) {
      case 'go': return this._renderGoIcon();
      case 'no-go': return this._renderNoGoIcon();
      case 'caution': return this._renderCautionIcon();
    }
  }

  // ---- Label ----

  private _verdictLabel() {
    switch (this.verdict) {
      case 'go': return t('goNoGoVerdict.label.go');
      case 'no-go': return t('goNoGoVerdict.label.noGo');
      case 'caution': return t('goNoGoVerdict.label.caution');
    }
  }

  // ---- Confetti ----

  private _renderConfetti() {
    if (!this._showConfetti || this.verdict !== 'go') return nothing;
    return html`
      <div class="confetti-layer c1" aria-hidden="true"></div>
      <div class="confetti-layer c2" aria-hidden="true"></div>
      <div class="confetti-layer c3" aria-hidden="true"></div>
      <div class="confetti-layer c4" aria-hidden="true"></div>
    `;
  }

  // ---- Celebration message ----

  private _renderCelebration() {
    if (this.verdict !== 'go') return nothing;
    if (!this.contractCount && !this.aggregateCount) return nothing;
    return html`
      <p class="verdict-celebration">
        ${t('goNoGoVerdict.celebration', {
          contractCount: this.contractCount,
          aggregateCount: this.aggregateCount,
        })}
      </p>
    `;
  }

  override render() {
    const containerClass = `verdict-container ${this.verdict} ${this._animating ? 'animating' : ''}`;
    const ariaLabel = this._verdictLabel() + (this.summary ? `. ${this.summary}` : '');

    return html`
      <div
        class="${containerClass}"
        role="status"
        aria-label="${ariaLabel}"
        aria-live="polite"
      >
        ${this._renderConfetti()}
        ${this._renderIcon()}
        <div class="verdict-label">${this._verdictLabel()}</div>
        ${this.summary
          ? html`<p class="verdict-summary">${this.summary}</p>`
          : nothing}
        ${this._renderCelebration()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'go-no-go-verdict': GoNoGoVerdict;
  }
}
