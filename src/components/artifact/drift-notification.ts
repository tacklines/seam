import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';

export interface DriftEvent {
  participantName: string;
  eventName: string;
  description: string;
  id: string;
}

const MAX_VISIBLE = 3;

/**
 * `<drift-notification>` — Toast notification stack for drift events.
 *
 * Displays up to 3 simultaneous drift notifications using sl-alert.
 * Additional notifications queue until a slot opens. Each notification
 * auto-dismisses after 6 seconds or can be manually closed.
 *
 * Screen readers receive the notification via role="alert" + aria-live="assertive".
 *
 * @property drifts - Array of pending DriftEvent objects
 *
 * @fires drift-detail-requested - Detail: { eventName, participantName }
 */
@customElement('drift-notification')
export class DriftNotification extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9000;
      display: flex;
      flex-direction: column-reverse;
      gap: 0.75rem;
      max-width: 28rem;
      pointer-events: none;
    }

    .notification-stack {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .notification-wrapper {
      pointer-events: all;
      /* Slide-in animation */
      animation: drift-slide-in 0.3s ease-out;
    }

    @keyframes drift-slide-in {
      from {
        opacity: 0;
        transform: translateX(1.5rem);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .notification-wrapper {
        animation: none;
      }
    }

    .notification-content {
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
      text-align: left;
      width: 100%;
      font-family: inherit;
      font-size: inherit;
      color: inherit;
    }

    .notification-content:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
      border-radius: 4px;
    }

    .notification-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .notification-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #92400e;
    }

    .notification-message {
      font-size: 0.8125rem;
      color: #78350f;
      line-height: 1.5;
    }

    .event-name {
      font-family: var(--sl-font-mono);
      font-weight: 600;
    }

    .queue-indicator {
      pointer-events: all;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      color: #92400e;
      text-align: center;
    }

    .close-btn {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 2.75rem;
      min-height: 2.75rem;
      border-radius: 4px;
      flex-shrink: 0;
      color: #92400e;
    }

    .close-btn:hover {
      background: rgba(146, 64, 14, 0.1);
    }

    .close-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .close-icon {
      width: 0.875rem;
      height: 0.875rem;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      fill: none;
    }
  `;

  /** All pending drift events (visible + queued) */
  @property({ attribute: false }) drifts: DriftEvent[] = [];

  @state() private _dismissed: Set<string> = new Set();
  @state() private _timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('drifts')) {
      this._scheduleAutoClose();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._timers.clear();
  }

  private get _visibleDrifts(): DriftEvent[] {
    return this.drifts
      .filter((d) => !this._dismissed.has(d.id))
      .slice(0, MAX_VISIBLE);
  }

  private get _queuedCount(): number {
    const total = this.drifts.filter((d) => !this._dismissed.has(d.id)).length;
    return Math.max(0, total - MAX_VISIBLE);
  }

  private _scheduleAutoClose() {
    const visible = this._visibleDrifts;
    for (const drift of visible) {
      if (!this._timers.has(drift.id)) {
        const timer = setTimeout(() => {
          this._dismiss(drift.id);
        }, 6000);
        this._timers.set(drift.id, timer);
      }
    }
  }

  private _dismiss(id: string) {
    const timer = this._timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._timers.delete(id);
    }
    this._dismissed = new Set([...this._dismissed, id]);
    // Trigger auto-close scheduling for newly visible items
    this.requestUpdate();
    this.updateComplete.then(() => this._scheduleAutoClose());
  }

  private _handleClick(drift: DriftEvent) {
    this.dispatchEvent(
      new CustomEvent('drift-detail-requested', {
        detail: { eventName: drift.eventName, participantName: drift.participantName },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderNotification(drift: DriftEvent) {
    const message = t('driftNotification.message', {
      participant: drift.participantName,
      event: drift.eventName,
    });

    return html`
      <div
        class="notification-wrapper"
        role="alert"
        aria-live="assertive"
        aria-label="${t('driftNotification.ariaLabel', { event: drift.eventName, participant: drift.participantName })}"
      >
        <sl-alert variant="warning" open>
          <button
            class="notification-content"
            type="button"
            aria-label="${t('driftNotification.ariaLabel', { event: drift.eventName, participant: drift.participantName })}"
            @click=${() => this._handleClick(drift)}
          >
            <div class="notification-header">
              <span class="notification-title">${t('driftNotification.title')}</span>
              <button
                class="close-btn"
                type="button"
                aria-label="${t('driftNotification.closeAriaLabel', { event: drift.eventName })}"
                @click=${(e: Event) => { e.stopPropagation(); this._dismiss(drift.id); }}
              >
                <svg class="close-icon" viewBox="0 0 14 14" aria-hidden="true">
                  <line x1="2" y1="2" x2="12" y2="12"/>
                  <line x1="12" y1="2" x2="2" y2="12"/>
                </svg>
              </button>
            </div>
            <div class="notification-message">
              ${drift.participantName}'s latest submission changes the
              <span class="event-name">${drift.eventName}</span> payload.
              ${drift.description}
            </div>
          </button>
        </sl-alert>
      </div>
    `;
  }

  render() {
    const visible = this._visibleDrifts;
    const queued = this._queuedCount;

    if (visible.length === 0) {
      return nothing;
    }

    return html`
      <div class="notification-stack">
        ${visible.map((d) => this._renderNotification(d))}
        ${queued > 0 ? html`
          <div class="queue-indicator" aria-live="polite" aria-label="${t('driftNotification.queue', { count: queued })}">
            ${t('driftNotification.queue', { count: queued })}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'drift-notification': DriftNotification;
  }
}
