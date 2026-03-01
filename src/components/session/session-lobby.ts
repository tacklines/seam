import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { LoadedFile } from '../../schema/types.js';
import { loadFile } from '../../lib/yaml-loader.js';
import { store } from '../../state/app-state.js';
import type { SessionState } from '../../state/app-state.js';
import { connectSession, disconnectSession } from '../../state/session-connection.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';

const API_BASE = 'http://localhost:3002';

type LobbyState = 'landing' | 'creating' | 'joining' | 'in-session';

@customElement('session-lobby')
export class SessionLobby extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Landing ── */
    .landing {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem;
      background:
        repeating-radial-gradient(circle at 20% 50%, transparent 0, transparent 40px, rgba(99,102,241,0.03) 41px, transparent 42px),
        repeating-radial-gradient(circle at 80% 20%, transparent 0, transparent 60px, rgba(99,102,241,0.03) 61px, transparent 62px),
        repeating-radial-gradient(circle at 50% 80%, transparent 0, transparent 50px, rgba(99,102,241,0.03) 51px, transparent 52px),
        var(--surface-1, #f8fafc);
    }

    .landing-icon {
      font-size: 4rem;
      color: var(--sl-color-primary-500);
      margin-bottom: 1.5rem;
    }

    .landing h1 {
      margin: 0 0 0.5rem;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--sl-color-neutral-900);
      letter-spacing: -0.025em;
      text-align: center;
    }

    .landing .subtitle {
      margin: 0 0 2.5rem;
      font-size: 1.125rem;
      color: var(--sl-color-neutral-500);
      max-width: 32rem;
      text-align: center;
      line-height: 1.6;
    }

    .landing-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
      width: 100%;
      max-width: 36rem;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 480px) {
      .landing-options {
        grid-template-columns: 1fr;
      }
    }

    .option-card {
      cursor: pointer;
      text-align: center;
      border: 2px solid transparent;
      border-radius: var(--sl-border-radius-large);
      padding: 1.75rem 1.25rem;
      background: var(--sl-color-neutral-0);
      box-shadow: var(--sl-shadow-medium);
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    }

    .option-card:hover {
      border-color: var(--sl-color-primary-400);
      box-shadow: var(--sl-shadow-large);
      transform: translateY(-2px);
    }

    .option-card:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .option-card sl-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
      display: block;
    }

    .option-card .option-title {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      margin: 0 0 0.4rem;
    }

    .option-card .option-desc {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      line-height: 1.5;
      margin: 0;
    }

    .option-card--create sl-icon { color: var(--sl-color-primary-500); }
    .option-card--join sl-icon { color: var(--sl-color-success-500); }

    .solo-option {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-400);
    }

    .solo-option a {
      color: var(--sl-color-primary-600);
      cursor: pointer;
      text-decoration: underline;
    }

    /* ── Flow states (creating / joining) ── */
    .flow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem;
      background: var(--surface-1, #f8fafc);
    }

    .flow-card {
      width: 100%;
      max-width: 26rem;
    }

    .flow-card h2 {
      margin: 0 0 1.5rem;
      font-size: var(--sl-font-size-x-large);
      font-weight: var(--sl-font-weight-bold);
      color: var(--sl-color-neutral-800);
    }

    .flow-card sl-input,
    .flow-card sl-button {
      width: 100%;
      margin-bottom: 0.75rem;
    }

    .flow-card .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      cursor: pointer;
      margin-bottom: 1.5rem;
    }

    .flow-card .back-link:hover {
      color: var(--sl-color-primary-600);
    }

    .flow-card .back-link:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
      border-radius: 2px;
    }

    /* ── Join code display ── */
    .join-code-box {
      text-align: center;
      margin: 1.5rem 0;
      padding: 1.5rem;
      background: var(--sl-color-primary-50);
      border: 2px solid var(--sl-color-primary-200);
      border-radius: var(--sl-border-radius-large);
    }

    .join-code-label {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .join-code-value {
      font-size: 3rem;
      font-weight: 900;
      letter-spacing: 0.2em;
      color: var(--sl-color-primary-700);
      font-family: var(--sl-font-mono);
      margin: 0.25rem 0 1rem;
    }

    /* ── In-session lobby ── */
    .session-layout {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem;
      background: var(--surface-1, #f8fafc);
    }

    .session-card {
      width: 100%;
      max-width: 32rem;
    }

    .session-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }

    .session-title {
      margin: 0;
      font-size: var(--sl-font-size-x-large);
      font-weight: var(--sl-font-weight-bold);
      color: var(--sl-color-neutral-800);
    }

    .session-code-chip {
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-large);
      font-weight: 700;
      color: var(--sl-color-primary-700);
      background: var(--sl-color-primary-50);
      border: 1px solid var(--sl-color-primary-200);
      border-radius: var(--sl-border-radius-pill);
      padding: 0.2rem 0.75rem;
      letter-spacing: 0.1em;
    }

    .section-label {
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.75rem;
    }

    .participant-list {
      list-style: none;
      margin: 0 0 1.5rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .participant-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.75rem;
      background: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
    }

    .participant-name {
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-700);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .participant-name .you-label {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      font-weight: normal;
    }

    .session-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    /* ── Error state ── */
    .error-msg {
      margin-bottom: 0.75rem;
    }

    /* ── Waiting indicator ── */
    .waiting {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-small);
      margin-top: 0.5rem;
    }
  `;

  @state() private _lobbyState: LobbyState = 'landing';
  @state() private _name = '';
  @state() private _joinCode = '';
  @state() private _loading = false;
  @state() private _error = '';
  @state() private _submitting = false;
  @state() private _sessionState: SessionState | null = store.get().sessionState;

  private _unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsubscribe = store.subscribe((event) => {
      if (
        event.type === 'session-connected' ||
        event.type === 'session-updated' ||
        event.type === 'session-disconnected'
      ) {
        this._sessionState = store.get().sessionState;
        if (event.type === 'session-connected') {
          this._lobbyState = 'in-session';
        } else if (event.type === 'session-disconnected') {
          this._lobbyState = 'landing';
        }
      }
    });
    // If already in a session (e.g. navigated back), restore in-session view
    if (this._sessionState) {
      this._lobbyState = 'in-session';
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  private async _createSession() {
    if (!this._name.trim()) {
      this._error = 'Please enter your name.';
      return;
    }
    this._loading = true;
    this._error = '';
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorName: this._name.trim() }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const { code, participantId, session } = (await res.json()) as {
        code: string;
        participantId: string;
        session: import('../../state/app-state.js').ActiveSession;
      };
      this._joinCode = code;
      store.setSession(code, participantId, session);
      connectSession(code);
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
    }
  }

  private async _joinSession() {
    if (!this._name.trim()) {
      this._error = 'Please enter your name.';
      return;
    }
    if (!this._joinCode.trim()) {
      this._error = 'Please enter a join code.';
      return;
    }
    this._loading = true;
    this._error = '';
    try {
      const code = this._joinCode.trim().toUpperCase();
      const res = await fetch(`${API_BASE}/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName: this._name.trim() }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const { participantId, session } = (await res.json()) as {
        participantId: string;
        session: import('../../state/app-state.js').ActiveSession;
      };
      store.setSession(code, participantId, session);
      connectSession(code);
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
    }
  }

  private async _submitFiles(files: FileList) {
    if (!this._sessionState) return;
    this._submitting = true;
    this._error = '';
    try {
      for (const file of Array.from(files)) {
        const result = await loadFile(file);
        if (!result.ok) {
          this._error = `${file.name}: ${result.errors.join(', ')}`;
          continue;
        }
        const res = await fetch(`${API_BASE}/api/sessions/${this._sessionState.code}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: this._sessionState.participantId,
            fileName: result.file.filename,
            data: result.file.data,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          this._error = body || `HTTP ${res.status}`;
        }
      }
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._submitting = false;
    }
  }

  private async _viewCombined() {
    if (!this._sessionState) return;
    this._loading = true;
    this._error = '';
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${this._sessionState.code}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      type SubmissionWithData = { participantId: string; fileName: string; submittedAt: string; data?: unknown };
      type SessionResponse = { code: string; createdAt: string; participants: import('../../state/app-state.js').SessionParticipant[]; submissions: SubmissionWithData[] };
      const { session } = (await res.json()) as { session: SessionResponse };
      // Build LoadedFile[] from submissions — data field is included in server response
      const files: LoadedFile[] = session.submissions
        .filter((s) => s.data != null)
        .map((s) => {
          const data = s.data as import('../../schema/types.js').CandidateEventsFile;
          return {
            filename: s.fileName,
            role: data.metadata?.role ?? s.fileName,
            data,
          };
        });

      if (files.length === 0) {
        this._error = 'No file data available yet. Please wait for participants to submit.';
        return;
      }

      this.dispatchEvent(
        new CustomEvent('session-files-ready', {
          detail: { files },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
    }
  }

  private _onFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      void this._submitFiles(input.files);
      input.value = '';
    }
  }

  private _triggerFileInput() {
    const input = this.renderRoot.querySelector<HTMLInputElement>('input.file-input');
    input?.click();
  }

  render() {
    switch (this._lobbyState) {
      case 'landing':
        return this._renderLanding();
      case 'creating':
        return this._renderCreating();
      case 'joining':
        return this._renderJoining();
      case 'in-session':
        return this._renderInSession();
    }
  }

  private _renderLanding() {
    return html`
      <div class="landing">
        <sl-icon name="people-fill" class="landing-icon"></sl-icon>
        <h1>Storm-Prep Visualizer</h1>
        <p class="subtitle">
          Collaborate with your team in real time. Each participant loads their own storm-prep YAML file,
          then see the combined results together.
        </p>

        <div class="landing-options" role="group" aria-label="Session options">
          <div
            class="option-card option-card--create"
            role="button"
            tabindex="0"
            aria-label="Start a Session: Create a new session and invite your team with a join code"
            @click=${() => { this._lobbyState = 'creating'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'creating'; this._error = ''; } }}
          >
            <sl-icon name="plus-circle-fill" aria-hidden="true"></sl-icon>
            <p class="option-title">Start a Session</p>
            <p class="option-desc">Create a new session and invite your team with a join code</p>
          </div>
          <div
            class="option-card option-card--join"
            role="button"
            tabindex="0"
            aria-label="Join a Session: Enter a join code from your team lead to participate"
            @click=${() => { this._lobbyState = 'joining'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'joining'; this._error = ''; } }}
          >
            <sl-icon name="box-arrow-in-right" aria-hidden="true"></sl-icon>
            <p class="option-title">Join a Session</p>
            <p class="option-desc">Enter a join code from your team lead to participate</p>
          </div>
        </div>

        <p class="solo-option">
          Just exploring?
          <a role="button" tabindex="0" @click=${this._onSoloClick} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._onSoloClick(); } }}>Load files locally</a>
          without a session.
        </p>
      </div>
    `;
  }

  private _onSoloClick() {
    this.dispatchEvent(new CustomEvent('solo-mode', { bubbles: true, composed: true }));
  }

  private _renderCreating() {
    return html`
      <div class="flow-container">
        <div class="flow-card">
          <span
            class="back-link"
            role="button"
            tabindex="0"
            aria-label="Back to landing"
            @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'landing'; this._error = ''; } }}
          >
            <sl-icon name="arrow-left" aria-hidden="true"></sl-icon> Back
          </span>
          <h2>Start a Session</h2>

          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>`
            : nothing}

          <sl-input
            label="Your name"
            placeholder="e.g. Alice"
            value=${this._name}
            @sl-input=${(e: CustomEvent) => { this._name = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createSession(); }}
            autocomplete="off"
          ></sl-input>

          <sl-button
            variant="primary"
            ?loading=${this._loading}
            @click=${() => void this._createSession()}
          >
            <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
            Create Session
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderJoining() {
    return html`
      <div class="flow-container">
        <div class="flow-card">
          <span
            class="back-link"
            role="button"
            tabindex="0"
            aria-label="Back to landing"
            @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'landing'; this._error = ''; } }}
          >
            <sl-icon name="arrow-left" aria-hidden="true"></sl-icon> Back
          </span>
          <h2>Join a Session</h2>

          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>`
            : nothing}

          <sl-input
            label="Your name"
            placeholder="e.g. Bob"
            value=${this._name}
            @sl-input=${(e: CustomEvent) => { this._name = (e.target as HTMLInputElement).value; }}
            autocomplete="off"
          ></sl-input>

          <sl-input
            label="Join code"
            placeholder="e.g. ABC123"
            value=${this._joinCode}
            @sl-input=${(e: CustomEvent) => { this._joinCode = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._joinSession(); }}
            autocomplete="off"
          ></sl-input>

          <sl-button
            variant="primary"
            ?loading=${this._loading}
            @click=${() => void this._joinSession()}
          >
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            Join Session
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderInSession() {
    if (!this._sessionState) return nothing;
    const { session, participantId } = this._sessionState;
    const mySubmission = session.submissions.find((s) => s.participantId === participantId);
    const hasAnySubmissions = session.submissions.length > 0;

    return html`
      <div class="session-layout">
        <div class="session-card">
          <!-- Header: title + code chip -->
          <div class="session-header">
            <h2 class="session-title">Session Lobby</h2>
            <span
              class="session-code-chip"
              role="button"
              tabindex="0"
              title="Copy session code to clipboard"
              aria-label="Session code ${session.code}. Click to copy."
              @click=${() => void navigator.clipboard.writeText(session.code)}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void navigator.clipboard.writeText(session.code); } }}
            >${session.code}</span>
          </div>

          <!-- Join code prominent display after creation -->
          ${this._joinCode
            ? html`
                <div class="join-code-box">
                  <div class="join-code-label">Share this code</div>
                  <div class="join-code-value">${session.code}</div>
                  <sl-button size="small" variant="neutral" @click=${() => void navigator.clipboard.writeText(session.code)}>
                    <sl-icon slot="prefix" name="clipboard"></sl-icon>
                    Copy code
                  </sl-button>
                </div>
              `
            : nothing}

          <!-- Share code hint -->
          <sl-alert variant="primary" open style="margin-bottom:1.25rem;">
            <sl-icon slot="icon" name="info-circle"></sl-icon>
            Share code <strong>${session.code}</strong> with your team so they can join.
            <sl-button
              size="small"
              variant="text"
              style="margin-left:0.5rem;"
              @click=${() => void navigator.clipboard.writeText(session.code)}
            >Copy</sl-button>
          </sl-alert>

          <!-- Participants -->
          <p class="section-label" id="participants-label">
            Participants
            <sl-badge variant="neutral" pill style="margin-left:0.4rem;">${session.participants.length}</sl-badge>
          </p>
          <ul class="participant-list" aria-labelledby="participants-label" role="list" aria-live="polite">
            ${session.participants.map((p) => {
              const submitted = session.submissions.some((s) => s.participantId === p.id);
              const isMe = p.id === participantId;
              return html`
                <li class="participant-item" aria-label="${p.name}${isMe ? ' (you)' : ''}, ${submitted ? 'submitted' : 'waiting'}">
                  <span class="participant-name">
                    <sl-icon name="person-fill" aria-hidden="true"></sl-icon>
                    ${p.name}
                    ${isMe ? html`<span class="you-label">(you)</span>` : nothing}
                  </span>
                  ${submitted
                    ? html`<sl-badge variant="success">Submitted</sl-badge>`
                    : html`<sl-badge variant="neutral">Waiting</sl-badge>`}
                </li>
              `;
            })}
          </ul>

          <sl-divider></sl-divider>

          <!-- Actions -->
          <div class="session-actions" style="margin-top:1.25rem;">
            ${this._error
              ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>`
              : nothing}

            ${mySubmission
              ? html`
                  <sl-alert variant="success" open>
                    <sl-icon slot="icon" name="check-circle"></sl-icon>
                    You have submitted <strong>${mySubmission.fileName}</strong>.
                  </sl-alert>
                `
              : html`
                  <sl-button
                    variant="primary"
                    ?loading=${this._submitting}
                    @click=${this._triggerFileInput}
                  >
                    <sl-icon slot="prefix" name="cloud-arrow-up"></sl-icon>
                    Load &amp; Submit Files
                  </sl-button>
                `}

            ${hasAnySubmissions
              ? html`
                  <sl-button
                    variant="success"
                    ?loading=${this._loading}
                    @click=${() => void this._viewCombined()}
                  >
                    <sl-icon slot="prefix" name="eye-fill"></sl-icon>
                    View Combined Results
                    <sl-badge slot="suffix" variant="neutral" pill>${session.submissions.length}</sl-badge>
                  </sl-button>
                `
              : html`
                  <div class="waiting" role="status" aria-live="polite">
                    <sl-spinner aria-hidden="true"></sl-spinner>
                    Waiting for participants to submit files...
                  </div>
                `}
          </div>

          <!-- Hidden file input -->
          <input
            type="file"
            class="file-input"
            accept=".yaml,.yml"
            multiple
            style="display:none"
            @change=${this._onFileInputChange}
          />
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'session-lobby': SessionLobby;
  }
}
