import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { store } from '../../state/app-state.js';
import { t } from '../../lib/i18n.js';
import type { AppStateEvent, SessionParticipant, SessionState } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

/**
 * Participant registry sidebar component.
 *
 * Shows a live list of all session participants with their submission status.
 * Designed to be displayed as a persistent sidebar during an active session.
 * Collapses to a compact view on mobile.
 *
 * Status indicators use both color AND icon shape to satisfy accessibility rule:
 * "color is never the sole differentiator."
 */
@customElement('participant-registry')
export class ParticipantRegistry extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    /* ── Container ── */

    .registry {
      background: var(--surface-2, var(--sl-color-neutral-50));
      border-radius: var(--sl-border-radius-medium);
      padding: 0.75rem;
    }

    /* ── Header ── */

    .registry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .registry-title {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    /* ── Participant list ── */

    .participant-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .participant-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.5rem;
      border-radius: var(--sl-border-radius-small);
      transition: background-color 0.15s ease;
      min-height: 44px; /* touch target minimum */
    }

    .participant-item:hover {
      background: var(--sl-color-neutral-100);
    }

    /* Focus ring for keyboard navigation */
    .participant-item:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 1px;
    }

    /* ── Status indicator ── */

    .status-indicator {
      flex-shrink: 0;
      width: 1.25rem;
      height: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 0.75rem;
    }

    /* Submitted: green circle with checkmark */
    .status-indicator.submitted {
      background: var(--sl-color-success-100);
      color: var(--sl-color-success-700);
    }

    /* Waiting: amber circle with hourglass */
    .status-indicator.waiting {
      background: var(--sl-color-warning-100);
      color: var(--sl-color-warning-700);
    }

    /* ── Name area ── */

    .participant-name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .participant-display-name {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: var(--sl-font-weight-normal);
    }

    .participant-display-name.is-me {
      font-weight: var(--sl-font-weight-semibold);
    }

    .you-label {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-primary-600);
      font-style: italic;
    }

    .participant-meta {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Empty state ── */

    .empty-state {
      text-align: center;
      padding: 1rem 0.5rem;
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-small);
    }

    .empty-state sl-icon {
      font-size: 1.5rem;
      display: block;
      margin-bottom: 0.4rem;
    }

    /* ── No-session state ── */

    .no-session {
      text-align: center;
      padding: 1rem 0.5rem;
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-small);
    }

    /* ── Session info row ── */

    .session-code {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--sl-color-neutral-200);
    }

    .session-code-label {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
    }

    .session-code-value {
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-primary-600);
      letter-spacing: 0.08em;
      cursor: pointer;
      text-decoration: underline dotted;
    }

    .session-code-value:hover {
      color: var(--sl-color-primary-700);
    }

    /* ── Mobile collapsible ── */

    @media (max-width: 640px) {
      :host {
        /* On mobile, component is collapsed — toggle via aria-expanded attribute */
      }

      :host([collapsed]) .participant-list,
      :host([collapsed]) .session-code {
        display: none;
      }

      .registry-header {
        cursor: pointer;
      }
    }
  `;

  @state() private _sessionState: SessionState | null = null;

  private _unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._sessionState = store.get().sessionState;
    this._unsubscribe = store.subscribe((event: AppStateEvent) => {
      if (
        event.type === 'session-connected' ||
        event.type === 'session-updated' ||
        event.type === 'session-disconnected'
      ) {
        this._sessionState = store.get().sessionState;
      }
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  render() {
    if (!this._sessionState) {
      return html`
        <div class="registry" role="region" aria-label="${t('participantRegistry.regionAriaLabel')}">
          <div class="no-session" aria-live="polite">
            <sl-icon name="people" aria-hidden="true"></sl-icon>
            ${t('participantRegistry.noSession')}
          </div>
        </div>
      `;
    }

    const { session, participantId } = this._sessionState;
    const { participants, submissions, code } = session;

    return html`
      <div class="registry" role="region" aria-label="${t('participantRegistry.regionAriaLabel')}">
        <!-- Header -->
        <div class="registry-header">
          <h2 class="registry-title" id="participant-registry-heading">
            ${t('participantRegistry.heading')}
          </h2>
          <sl-badge variant="neutral" pill aria-label="${t('participantRegistry.nParticipantsAriaLabel', { count: participants.length })}">
            ${participants.length}
          </sl-badge>
        </div>

        <!-- Participant list -->
        ${participants.length === 0
          ? html`
              <div class="empty-state" role="status" aria-live="polite">
                <sl-icon name="person-plus" aria-hidden="true"></sl-icon>
                ${t('participantRegistry.empty')}
              </div>
            `
          : html`
              <ul
                class="participant-list"
                aria-labelledby="participant-registry-heading"
                role="list"
              >
                ${participants.map((p) => this._renderParticipant(p, participantId, submissions))}
              </ul>
            `}

        <!-- Session code footer -->
        <div class="session-code" aria-label="${t('participantRegistry.codeLabel')}">
          <span class="session-code-label">${t('participantRegistry.codeLabel')}</span>
          <sl-tooltip content="${t('participantRegistry.copyTooltip')}">
            <span
              class="session-code-value"
              role="button"
              tabindex="0"
              aria-label="${t('participantRegistry.codeAriaLabel', { code })}"
              @click=${() => void this._copyCode(code)}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') void this._copyCode(code); }}
            >${code}</span>
          </sl-tooltip>
        </div>
      </div>
    `;
  }

  private _renderParticipant(
    participant: SessionParticipant,
    myId: string,
    submissions: { participantId: string; fileName: string; submittedAt: string }[],
  ) {
    const submitted = submissions.some((s) => s.participantId === participant.id);
    const isMe = participant.id === myId;
    const submittedFile = submissions.find((s) => s.participantId === participant.id)?.fileName;

    const statusLabel = submitted ? t('participantRegistry.status.submitted') : t('participantRegistry.status.waiting');
    const statusIcon = submitted ? 'check-circle-fill' : 'hourglass-split';
    const statusClass = submitted ? 'submitted' : 'waiting';

    return html`
      <li
        class="participant-item"
        tabindex="0"
        role="listitem"
        aria-label="${participant.name}${isMe ? `, ${t('participantRegistry.you')}` : ''}, ${statusLabel}"
      >
        <!-- Status indicator: color + icon shape (accessibility rule) -->
        <sl-tooltip content="${statusLabel}">
          <div class="status-indicator ${statusClass}" aria-hidden="true">
            <sl-icon name="${statusIcon}"></sl-icon>
          </div>
        </sl-tooltip>

        <!-- Name and metadata -->
        <div class="participant-name">
          <span class="participant-display-name ${isMe ? 'is-me' : ''}">
            ${participant.name}
            ${isMe ? html`<span class="you-label"> ${t('participantRegistry.you')}</span>` : nothing}
          </span>
          ${submitted && submittedFile
            ? html`<span class="participant-meta" title="${submittedFile}">${submittedFile}</span>`
            : html`<span class="participant-meta">${t('participantRegistry.waiting')}</span>`}
        </div>
      </li>
    `;
  }

  private async _copyCode(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'participant-registry': ParticipantRegistry;
  }
}
