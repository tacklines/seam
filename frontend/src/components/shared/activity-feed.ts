import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchActivity, type ActivityEvent } from '../../state/task-api.js';
import { store } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';

const EVENT_ICONS: Record<string, string> = {
  task_created: 'plus-circle-fill',
  task_updated: 'pencil-fill',
  task_closed: 'check-circle-fill',
  task_deleted: 'trash-fill',
  comment_added: 'chat-left-text-fill',
  participant_joined: 'person-plus-fill',
  session_created: 'play-circle-fill',
};

const EVENT_COLORS: Record<string, string> = {
  task_created: 'var(--sl-color-success-500)',
  task_updated: 'var(--sl-color-primary-500)',
  task_closed: 'var(--sl-color-success-600)',
  task_deleted: 'var(--sl-color-danger-500)',
  comment_added: 'var(--sl-color-neutral-400)',
  participant_joined: 'var(--sl-color-teal-500)',
  session_created: 'var(--sl-color-purple-500)',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

@customElement('activity-feed')
export class ActivityFeed extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .feed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .feed-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .feed-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .event {
      display: flex;
      gap: 0.5rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      align-items: flex-start;
    }

    .event:last-child {
      border-bottom: none;
    }

    .event-icon {
      flex-shrink: 0;
      font-size: 0.75rem;
      margin-top: 0.15rem;
    }

    .event-body {
      flex: 1;
      min-width: 0;
    }

    .event-summary {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.35;
    }

    .event-summary .actor {
      font-weight: 600;
      color: var(--text-primary);
    }

    .event-time {
      font-size: 0.65rem;
      color: var(--text-tertiary);
      margin-top: 0.1rem;
    }

    .empty-state {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      text-align: center;
      padding: 1rem 0;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 1rem;
    }
  `;

  @property({ attribute: 'session-code' }) sessionCode = '';
  @state() private _events: ActivityEvent[] = [];
  @state() private _loading = false;

  private _refreshInterval: ReturnType<typeof setInterval> | null = null;
  private _storeUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadActivity();
    this._refreshInterval = setInterval(() => this._loadActivity(), 15000);
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === 'activity-changed' || event.type === 'tasks-changed') {
        this._loadActivity();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    this._storeUnsub?.();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('sessionCode') && this.sessionCode) {
      this._loadActivity();
    }
  }

  private async _loadActivity() {
    if (!this.sessionCode) return;
    try {
      this._loading = this._events.length === 0;
      this._events = await fetchActivity(this.sessionCode, { limit: 30 });
    } catch {
      // silent
    } finally {
      this._loading = false;
    }
  }

  /** Called externally when a WebSocket event indicates new activity */
  refresh() {
    this._loadActivity();
  }

  render() {
    return html`
      <div class="feed-header">
        <span class="feed-label">
          Activity
          ${this._events.length > 0 ? html`<sl-badge variant="neutral" pill style="margin-left: 0.3rem; vertical-align: middle;">${this._events.length}</sl-badge>` : nothing}
        </span>
      </div>

      ${this._loading
        ? html`<div class="loading"><sl-spinner></sl-spinner></div>`
        : this._events.length === 0
          ? html`<div class="empty-state">No activity yet</div>`
          : html`
            <div class="feed-list">
              ${this._events.map(e => this._renderEvent(e))}
            </div>
          `}
    `;
  }

  private _renderEvent(event: ActivityEvent) {
    const icon = EVENT_ICONS[event.event_type] || 'circle';
    const color = EVENT_COLORS[event.event_type] || 'var(--text-tertiary)';

    return html`
      <div class="event">
        <sl-icon class="event-icon" name=${icon} style="color: ${color}"></sl-icon>
        <div class="event-body">
          <div class="event-summary">
            <span class="actor">${event.actor_name}</span> ${event.summary}
          </div>
          <div class="event-time">${timeAgo(event.created_at)}</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'activity-feed': ActivityFeed;
  }
}
