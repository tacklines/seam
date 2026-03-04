import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { store, type SessionState } from '../../state/app-state.js';
import { connectSession, disconnectSession } from '../../state/session-connection.js';
import { authStore } from '../../state/auth-state.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';

const API_BASE = '';  // proxied via vite

type LobbyState = 'landing' | 'creating' | 'joining' | 'in-session';

@customElement('session-lobby')
export class SessionLobby extends LitElement {
  static styles = css`
    :host { display: block; }

    .landing {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 45px);
      padding: 2rem;
      background:
        repeating-radial-gradient(circle at 20% 50%, transparent 0, transparent 40px, var(--color-primary-glow) 41px, transparent 42px),
        repeating-radial-gradient(circle at 80% 20%, transparent 0, transparent 60px, var(--color-primary-glow) 61px, transparent 62px),
        var(--surface-1, #111320);
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
    }

    @media (max-width: 480px) {
      .landing-options { grid-template-columns: 1fr; }
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

    .flow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 45px);
      padding: 2rem;
      background: var(--surface-1, #111320);
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

    .flow-card .back-link:hover { color: var(--sl-color-primary-600); }

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

    .agent-code-box {
      text-align: center;
      margin: 1rem 0;
      padding: 1.25rem;
      background: var(--sl-color-neutral-50);
      border: 2px dashed var(--sl-color-neutral-300);
      border-radius: var(--sl-border-radius-large);
    }

    .agent-code-value {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--sl-color-neutral-700);
      font-family: var(--sl-font-mono);
      margin: 0.25rem 0 0.75rem;
    }

    .agent-code-hint {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-400);
      margin: 0.5rem 0 0;
      line-height: 1.5;
    }

    .session-layout {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 45px);
      padding: 2rem;
      background: var(--surface-1, #111320);
    }

    .session-card { width: 100%; max-width: 32rem; }

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
      cursor: pointer;
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

    .you-label {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      font-weight: normal;
    }

    .sponsor-label {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      font-weight: normal;
    }

    .error-msg { margin-bottom: 0.75rem; }

    .session-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
  `;

  @state() private _lobbyState: LobbyState = 'landing';
  @state() private _joinCode = '';
  @state() private _loading = false;
  @state() private _error = '';
  @state() private _sessionState: SessionState | null = store.get().sessionState;
  @state() private _codeCopied = false;

  // For creating sessions, we need a project ID.
  // TODO: add project selection UI. For now, use a fixed default.
  @state() private _projectId = '';

  private _unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsubscribe = store.subscribe((event) => {
      if (event.type === 'session-connected' || event.type === 'session-updated' || event.type === 'session-disconnected') {
        this._sessionState = store.get().sessionState;
        if (event.type === 'session-connected') this._lobbyState = 'in-session';
        else if (event.type === 'session-disconnected') this._lobbyState = 'landing';
      }
    });
    if (this._sessionState) this._lobbyState = 'in-session';
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  private async _copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this._codeCopied = true;
      setTimeout(() => { this._codeCopied = false; }, 1000);
    } catch { /* clipboard may be blocked */ }
  }

  private async _createSession() {
    this._loading = true;
    this._error = '';
    try {
      const token = authStore.getAccessToken();
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ project_id: this._projectId || undefined }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      store.setSession(data.session.code, data.session.participants[0]?.id, data.session, data.agent_code);
      connectSession(data.session.code);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to create session';
    } finally {
      this._loading = false;
    }
  }

  private async _joinSession() {
    if (!this._joinCode.trim()) {
      this._error = 'Please enter a join code';
      return;
    }
    this._loading = true;
    this._error = '';
    try {
      const code = this._joinCode.trim().toUpperCase();
      const token = authStore.getAccessToken();
      const user = authStore.user;
      const res = await fetch(`${API_BASE}/api/sessions/${code}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ display_name: user?.name ?? 'Participant' }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      store.setSession(code, data.participant_id, data.session, data.agent_code);
      connectSession(code);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to join session';
    } finally {
      this._loading = false;
    }
  }

  private _leaveSession() {
    disconnectSession();
    store.clearSession();
  }

  render() {
    switch (this._lobbyState) {
      case 'landing': return this._renderLanding();
      case 'creating': return this._renderCreating();
      case 'joining': return this._renderJoining();
      case 'in-session': return this._renderInSession();
    }
  }

  private _renderLanding() {
    return html`
      <div class="landing">
        <h1>Start Collaborating</h1>
        <p class="subtitle">Create a session and invite humans and AI agents to work together in real time.</p>
        <div class="landing-options">
          <div class="option-card option-card--create"
               role="button" tabindex="0"
               @click=${() => { this._lobbyState = 'creating'; this._error = ''; }}
               @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'creating'; } }}>
            <sl-icon name="plus-circle-fill"></sl-icon>
            <p class="option-title">New Session</p>
            <p class="option-desc">Create a session and get a join code to share.</p>
          </div>
          <div class="option-card option-card--join"
               role="button" tabindex="0"
               @click=${() => { this._lobbyState = 'joining'; this._error = ''; }}
               @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'joining'; } }}>
            <sl-icon name="box-arrow-in-right"></sl-icon>
            <p class="option-title">Join Session</p>
            <p class="option-desc">Enter a code to join an existing session.</p>
          </div>
        </div>
      </div>
    `;
  }

  private _renderCreating() {
    return html`
      <div class="flow-container">
        <div class="flow-card">
          <span class="back-link" role="button" tabindex="0"
                @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}>
            <sl-icon name="arrow-left"></sl-icon> Back
          </span>
          <h2>New Session</h2>
          ${this._error ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>` : nothing}
          <sl-button variant="primary" ?loading=${this._loading} @click=${() => void this._createSession()}>
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
          <span class="back-link" role="button" tabindex="0"
                @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}>
            <sl-icon name="arrow-left"></sl-icon> Back
          </span>
          <h2>Join Session</h2>
          ${this._error ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>` : nothing}
          <sl-input label="Join Code" placeholder="e.g. ABC123"
                    value=${this._joinCode}
                    @sl-input=${(e: CustomEvent) => { this._joinCode = (e.target as HTMLInputElement).value; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._joinSession(); }}
                    autocomplete="off"></sl-input>
          <sl-button variant="primary" ?loading=${this._loading} @click=${() => void this._joinSession()}>
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            Join
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderInSession() {
    if (!this._sessionState) return nothing;
    const { session, participantId, agentCode } = this._sessionState;

    return html`
      <div class="session-layout">
        <div class="session-card">
          <div class="session-header">
            <h2 class="session-title">Session</h2>
            <span class="session-code-chip" title="Click to copy"
                  @click=${() => void this._copyCode(session.code)}>${session.code}</span>
          </div>

          ${this._codeCopied ? html`
            <sl-alert variant="success" open duration="1000" closable style="margin-bottom: 0.75rem;">
              <sl-icon slot="icon" name="clipboard-check"></sl-icon>
              Copied!
            </sl-alert>
          ` : nothing}

          <div class="join-code-box">
            <div class="join-code-label">Share this code</div>
            <div class="join-code-value">${session.code}</div>
            <sl-button size="small" variant="neutral" @click=${() => void this._copyCode(session.code)}>
              <sl-icon slot="prefix" name="clipboard"></sl-icon>
              Copy Code
            </sl-button>
          </div>

          ${agentCode ? html`
            <div class="agent-code-box">
              <div class="join-code-label">Your Agent Code</div>
              <div class="agent-code-value">${agentCode}</div>
              <sl-button size="small" variant="neutral" @click=${() => void this._copyCode(agentCode)}>
                <sl-icon slot="prefix" name="clipboard"></sl-icon>
                Copy
              </sl-button>
              <p class="agent-code-hint">Give this code to your AI agents so they can join the session on your behalf.</p>
            </div>
          ` : nothing}

          <p class="section-label">
            Participants
            <sl-badge variant="neutral" pill style="margin-left: 0.4rem;">${session.participants.length}</sl-badge>
          </p>
          <ul class="participant-list" aria-live="polite">
            ${session.participants.map((p) => {
              const isMe = p.id === participantId;
              const isAgent = p.participant_type === 'agent';
              const sponsor = isAgent && p.sponsor_id
                ? session.participants.find((s) => s.id === p.sponsor_id)
                : null;
              return html`
                <li class="participant-item">
                  <span class="participant-name">
                    <sl-icon name=${isAgent ? 'robot' : 'person-fill'}></sl-icon>
                    ${p.display_name}
                    ${isMe ? html`<span class="you-label">(you)</span>` : nothing}
                    ${sponsor ? html`<span class="sponsor-label">agent of ${sponsor.display_name}</span>` : nothing}
                  </span>
                  <sl-badge variant=${isAgent ? 'neutral' : 'primary'} pill>${p.participant_type}</sl-badge>
                </li>
              `;
            })}
          </ul>

          <sl-divider></sl-divider>

          <div class="session-actions">
            <sl-button variant="danger" outline @click=${this._leaveSession}>
              <sl-icon slot="prefix" name="box-arrow-left"></sl-icon>
              Leave Session
            </sl-button>
          </div>
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
