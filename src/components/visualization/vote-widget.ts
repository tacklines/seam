import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';

/**
 * Vote Widget — compact upvote/downvote UI for a single domain event.
 *
 * - Shows up/down chevron buttons visible on hover
 * - Net vote count displayed between buttons
 * - Hovering the count reveals a tooltip listing who voted
 * - Tracks whether the current participant has already voted
 * - Emits `vote-cast` with `{ eventName, direction: 'up' | 'down' }` on click
 *
 * @fires vote-cast - Emitted when the user clicks up or down.
 *   Detail: `{ eventName: string; direction: 'up' | 'down' }`
 */
@customElement('vote-widget')
export class VoteWidget extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    .widget {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
    }

    .vote-btn {
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
      transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
      opacity: 0;
    }

    :host(:hover) .vote-btn,
    .vote-btn:focus-visible,
    .vote-btn.active {
      opacity: 1;
    }

    .vote-btn:hover {
      color: var(--sl-color-primary-600, #2563eb);
      background: var(--sl-color-primary-50, #eff6ff);
    }

    .vote-btn.up.active {
      color: var(--sl-color-success-600, #16a34a);
      background: var(--sl-color-success-50, #f0fdf4);
      opacity: 1;
    }

    .vote-btn.down.active {
      color: var(--sl-color-danger-600, #dc2626);
      background: var(--sl-color-danger-50, #fef2f2);
      opacity: 1;
    }

    .vote-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }

    /* Minimum 44x44 touch target */
    .vote-btn {
      position: relative;
    }

    .vote-btn::after {
      content: '';
      position: absolute;
      inset: -0.625rem;
    }

    .vote-icon {
      width: 0.75rem;
      height: 0.75rem;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      display: block;
    }

    .count {
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-600, #4b5563);
      min-width: 1.5rem;
      text-align: center;
      cursor: default;
    }

    .count.positive {
      color: var(--sl-color-success-700, #15803d);
    }

    .count.negative {
      color: var(--sl-color-danger-700, #b91c1c);
    }
  `;

  /** The event name this widget is associated with. */
  @property({ type: String }) eventName = '';

  /** Number of upvotes. */
  @property({ type: Number }) upCount = 0;

  /** Number of downvotes. */
  @property({ type: Number }) downCount = 0;

  /** Names of participants who upvoted. */
  @property({ type: Array }) upVoters: string[] = [];

  /** Names of participants who downvoted. */
  @property({ type: Array }) downVoters: string[] = [];

  /** The current participant's vote, or null if they haven't voted. */
  @property({ attribute: 'current-vote' }) currentVote: 'up' | 'down' | null = null;

  @state() private _showTooltip = false;

  private get _netVotes(): number {
    return this.upCount - this.downCount;
  }

  private get _countClass(): string {
    const net = this._netVotes;
    if (net > 0) return 'count positive';
    if (net < 0) return 'count negative';
    return 'count';
  }

  private get _tooltipContent(): string {
    const parts: string[] = [];
    if (this.upVoters.length > 0) {
      parts.push(t('voteWidget.upVoters', { names: this.upVoters.join(', ') }));
    }
    if (this.downVoters.length > 0) {
      parts.push(t('voteWidget.downVoters', { names: this.downVoters.join(', ') }));
    }
    if (parts.length === 0) {
      return t('voteWidget.noVotes');
    }
    return parts.join(' | ');
  }

  private _handleVote(direction: 'up' | 'down') {
    this.dispatchEvent(
      new CustomEvent('vote-cast', {
        bubbles: true,
        composed: true,
        detail: { eventName: this.eventName, direction },
      })
    );
  }

  private _upAriaLabel(): string {
    if (this.currentVote === 'up') {
      return t('voteWidget.alreadyVotedUp');
    }
    return t('voteWidget.upvote', { name: this.eventName });
  }

  private _downAriaLabel(): string {
    if (this.currentVote === 'down') {
      return t('voteWidget.alreadyVotedDown');
    }
    return t('voteWidget.downvote', { name: this.eventName });
  }

  override render() {
    const net = this._netVotes;
    const countLabel = net === 0
      ? t('voteWidget.noVotes')
      : t('voteWidget.netVotes', { count: String(net > 0 ? `+${net}` : net) });

    return html`
      <div class="widget">
        <button
          class="vote-btn up ${this.currentVote === 'up' ? 'active' : ''}"
          type="button"
          aria-label="${this._upAriaLabel()}"
          aria-pressed="${this.currentVote === 'up'}"
          @click=${() => this._handleVote('up')}
        >
          <svg class="vote-icon" viewBox="0 0 12 12" aria-hidden="true">
            <polyline points="2,8 6,4 10,8"></polyline>
          </svg>
        </button>

        <sl-tooltip content="${this._tooltipContent}" trigger="hover focus">
          <span
            class="${this._countClass}"
            aria-label="${countLabel}"
            tabindex="0"
          >${net > 0 ? `+${net}` : net}</span>
        </sl-tooltip>

        <button
          class="vote-btn down ${this.currentVote === 'down' ? 'active' : ''}"
          type="button"
          aria-label="${this._downAriaLabel()}"
          aria-pressed="${this.currentVote === 'down'}"
          @click=${() => this._handleVote('down')}
        >
          <svg class="vote-icon" viewBox="0 0 12 12" aria-hidden="true">
            <polyline points="2,4 6,8 10,4"></polyline>
          </svg>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vote-widget': VoteWidget;
  }
}
