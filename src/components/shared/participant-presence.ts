import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

/** One participant entry as received from session state. */
export interface PresenceParticipant {
  id: string;
  name: string;
}

/**
 * Displays a row of circular avatar initials with colored presence dots and a
 * "viewing" indicator line below.
 *
 * Data flows in via properties — no store connection.
 */
@customElement('participant-presence')
export class ParticipantPresence extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .presence-root {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    /* ── Avatar row ── */
    .avatars {
      display: flex;
      align-items: center;
    }

    .avatar-wrap {
      position: relative;
      /* Overlap subsequent avatars with a negative margin */
      margin-left: -6px;
    }

    .avatar-wrap:first-child {
      margin-left: 0;
    }

    .avatar-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--sl-color-neutral-200);
      color: var(--sl-color-neutral-700);
      font-size: 10px;
      font-weight: var(--sl-font-weight-semibold);
      display: flex;
      align-items: center;
      justify-content: center;
      /* White ring separates overlapping avatars */
      border: 2px solid var(--sl-color-neutral-0, #fff);
      user-select: none;
      line-height: 1;
      box-sizing: border-box;
    }

    /* ── Presence dot ── */
    .presence-dot {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      /* White ring so the dot sits clearly above the avatar background */
      border: 2px solid var(--sl-color-neutral-0, #fff);
      box-sizing: border-box;
    }

    .presence-dot.connected {
      background: var(--sl-color-success-500);
    }

    .presence-dot.pending {
      background: var(--sl-color-neutral-300);
    }

    /* ── Viewing indicator ── */
    .viewing-line {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }

    /* When there are no participants, hide the component gracefully */
    .presence-root:empty {
      display: none;
    }
  `;

  /** Session participants from the session state. */
  @property({ attribute: false }) participants: PresenceParticipant[] = [];

  /** IDs of participants who have submitted files. */
  @property({ attribute: false }) submittedParticipantIds: string[] = [];

  /**
   * The current user's active tab/view name
   * (e.g. 'cards', 'flow', 'comparison').
   */
  @property() currentView = '';

  /** The current user's participant ID. */
  @property() currentParticipantId = '';

  render() {
    if (this.participants.length === 0) {
      return nothing;
    }

    return html`
      <div class="presence-root">
        <div class="avatars" role="list" aria-label="Session participants">
          ${this.participants.map((p) => this._renderAvatar(p))}
        </div>
        ${this._renderViewingLine()}
      </div>
    `;
  }

  private _renderAvatar(participant: PresenceParticipant) {
    const isConnected = this.submittedParticipantIds.includes(participant.id);
    const statusText = isConnected ? 'submitted' : 'joined, no submission yet';
    const ariaLabel = `${participant.name} — ${statusText}`;

    return html`
      <div
        class="avatar-wrap"
        role="listitem"
        title="${participant.name} (${statusText})"
        aria-label="${ariaLabel}"
      >
        <div class="avatar-circle">
          ${this._initials(participant.name)}
        </div>
        <div
          class="presence-dot ${isConnected ? 'connected' : 'pending'}"
          aria-hidden="true"
        ></div>
      </div>
    `;
  }

  private _renderViewingLine() {
    if (!this.currentView || !this.currentParticipantId) {
      return nothing;
    }

    const currentParticipant = this.participants.find(
      (p) => p.id === this.currentParticipantId
    );
    if (!currentParticipant) {
      return nothing;
    }

    const viewLabel = this._viewLabel(this.currentView);
    const message = t('presence.viewing', {
      name: currentParticipant.name,
      view: viewLabel,
    });

    return html`
      <div class="viewing-line" aria-live="polite">
        ${message}
      </div>
    `;
  }

  /** Compute 1–2 letter initials from a display name. */
  private _initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === '') return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Map a view key to a human-readable label for the viewing indicator. */
  private _viewLabel(view: string): string {
    const labels: Record<string, string> = {
      cards: 'Events',
      flow: 'Flow',
      comparison: 'Conflicts',
      priority: 'Priority',
      breakdown: 'Breakdown',
      agreements: 'Agreements',
      contracts: 'Contracts',
      integration: 'Integration',
    };
    return labels[view] ?? view;
  }
}
