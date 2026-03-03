import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { LoadedFile } from '../../schema/types.js';
import { loadFile } from '../../lib/yaml-loader.js';
import { t } from '../../lib/i18n.js';
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

    /* ── How it works ── */
    .how-it-works {
      width: 100%;
      max-width: 48rem;
      margin-bottom: 2.5rem;
    }

    .how-it-works-heading {
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-400);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-align: center;
      margin: 0 0 1.25rem;
    }

    .how-it-works-steps {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 600px) {
      .how-it-works-steps {
        grid-template-columns: 1fr;
      }
    }

    .hiw-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 1.25rem 1rem;
      background: rgba(99, 102, 241, 0.04);
      border: 1px solid rgba(99, 102, 241, 0.1);
      border-radius: var(--sl-border-radius-large);
    }

    .hiw-step sl-icon {
      font-size: 1.75rem;
      color: var(--sl-color-primary-500);
      margin-bottom: 0.625rem;
    }

    .hiw-step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--sl-color-primary-100);
      color: var(--sl-color-primary-700);
      font-size: 0.7rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .hiw-step-title {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      margin: 0 0 0.375rem;
    }

    .hiw-step-desc {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      line-height: 1.55;
      margin: 0;
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
  @state() private _submissionSuccess = false;
  @state() private _sessionState: SessionState | null = store.get().sessionState;
  @state() private _codeCopied = false;

  private _unsubscribe: (() => void) | null = null;
  private _codeCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

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
    // URL-based session join: parse ?session=CODE&name=NAME
    this._checkUrlParams();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._codeCopiedTimer !== null) {
      clearTimeout(this._codeCopiedTimer);
      this._codeCopiedTimer = null;
    }
    if (this._autoAdvanceTimer !== null) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
  }

  private _checkUrlParams() {
    // Don't act on URL params if already in a session
    if (this._sessionState) return;

    const params = new URLSearchParams(window.location.search);
    const sessionCode = params.get('session');
    const name = params.get('name');

    if (!sessionCode) return;

    // Clean the URL so refreshes don't re-trigger
    history.replaceState(null, '', window.location.pathname);

    this._joinCode = sessionCode.toUpperCase();

    if (name) {
      // Both session and name provided: auto-join immediately
      this._name = name;
      void this._joinSession();
    } else {
      // Only session provided: pre-fill join code and show the join form
      this._lobbyState = 'joining';
    }
  }

  private async _copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this._codeCopied = true;
      if (this._codeCopiedTimer !== null) {
        clearTimeout(this._codeCopiedTimer);
      }
      this._codeCopiedTimer = setTimeout(() => {
        this._codeCopied = false;
        this._codeCopiedTimer = null;
      }, 1000);
    } catch {
      // Clipboard write failed silently — clipboard access may be blocked
    }
  }

  private async _createSession() {
    if (!this._name.trim()) {
      this._error = t('lobby.error.nameRequired');
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
      this._error = t('lobby.error.nameRequired');
      return;
    }
    if (!this._joinCode.trim()) {
      this._error = t('lobby.error.joinCodeRequired');
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
    this._submissionSuccess = false;
    this._error = '';
    let hadError = false;
    try {
      for (const file of Array.from(files)) {
        const result = await loadFile(file);
        if (!result.ok) {
          this._error = `${file.name}: ${result.errors.join(', ')}`;
          hadError = true;
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
          hadError = true;
        }
      }
    } catch (err) {
      this._error = (err as Error).message;
      hadError = true;
    } finally {
      this._submitting = false;
    }

    if (!hadError) {
      this._submissionSuccess = true;
      this._autoAdvanceTimer = setTimeout(() => {
        this._autoAdvanceTimer = null;
        void this._viewCombined();
      }, 1000);
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
        this._error = t('lobby.error.noFileData');
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
        <h1>${t('lobby.heroTitle')}</h1>
        <p class="subtitle">${t('lobby.heroSubtitle')}</p>

        <section class="how-it-works" aria-labelledby="hiw-heading">
          <p class="how-it-works-heading" id="hiw-heading">${t('lobby.howItWorks.heading')}</p>
          <div class="how-it-works-steps">
            <div class="hiw-step">
              <span class="hiw-step-number" aria-hidden="true">1</span>
              <sl-icon name="file-earmark-text" aria-hidden="true"></sl-icon>
              <p class="hiw-step-title">${t('lobby.howItWorks.step1.title')}</p>
              <p class="hiw-step-desc">${t('lobby.howItWorks.step1.description')}</p>
            </div>
            <div class="hiw-step">
              <span class="hiw-step-number" aria-hidden="true">2</span>
              <sl-icon name="diagram-3" aria-hidden="true"></sl-icon>
              <p class="hiw-step-title">${t('lobby.howItWorks.step2.title')}</p>
              <p class="hiw-step-desc">${t('lobby.howItWorks.step2.description')}</p>
            </div>
            <div class="hiw-step">
              <span class="hiw-step-number" aria-hidden="true">3</span>
              <sl-icon name="shield-check" aria-hidden="true"></sl-icon>
              <p class="hiw-step-title">${t('lobby.howItWorks.step3.title')}</p>
              <p class="hiw-step-desc">${t('lobby.howItWorks.step3.description')}</p>
            </div>
          </div>
        </section>

        <div class="landing-options" role="group" aria-label="${t('lobby.sessionOptions')}">
          <div
            class="option-card option-card--create"
            role="button"
            tabindex="0"
            aria-label="${t('lobby.startSession.ariaLabel')}"
            @click=${() => { this._lobbyState = 'creating'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'creating'; this._error = ''; } }}
          >
            <sl-icon name="plus-circle-fill" aria-hidden="true"></sl-icon>
            <p class="option-title">${t('lobby.startSession.title')}</p>
            <p class="option-desc">${t('lobby.startSession.description')}</p>
          </div>
          <div
            class="option-card option-card--join"
            role="button"
            tabindex="0"
            aria-label="${t('lobby.joinSession.ariaLabel')}"
            @click=${() => { this._lobbyState = 'joining'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'joining'; this._error = ''; } }}
          >
            <sl-icon name="box-arrow-in-right" aria-hidden="true"></sl-icon>
            <p class="option-title">${t('lobby.joinSession.title')}</p>
            <p class="option-desc">${t('lobby.joinSession.description')}</p>
          </div>
        </div>

        <p class="solo-option">
          ${t('lobby.solo.prompt')}
          <a role="button" tabindex="0" @click=${this._onSoloClick} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._onSoloClick(); } }}>${t('lobby.solo.link')}</a>
          ${t('lobby.solo.suffix')}
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
            aria-label="${t('lobby.backAriaLabel')}"
            @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'landing'; this._error = ''; } }}
          >
            <sl-icon name="arrow-left" aria-hidden="true"></sl-icon> ${t('lobby.back')}
          </span>
          <h2>${t('lobby.startSession.title')}</h2>

          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>`
            : nothing}

          <sl-input
            label="${t('lobby.yourName')}"
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
            ${t('lobby.createSession')}
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
            aria-label="${t('lobby.backAriaLabel')}"
            @click=${() => { this._lobbyState = 'landing'; this._error = ''; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._lobbyState = 'landing'; this._error = ''; } }}
          >
            <sl-icon name="arrow-left" aria-hidden="true"></sl-icon> ${t('lobby.back')}
          </span>
          <h2>${t('lobby.joinSession.title')}</h2>

          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg">${this._error}</sl-alert>`
            : nothing}

          <sl-input
            label="${t('lobby.yourName')}"
            placeholder="e.g. Bob"
            value=${this._name}
            @sl-input=${(e: CustomEvent) => { this._name = (e.target as HTMLInputElement).value; }}
            autocomplete="off"
          ></sl-input>

          <sl-input
            label="${t('lobby.joinCode')}"
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
            ${t('lobby.joinSession.button')}
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
            <h2 class="session-title">${t('lobby.sessionLobby')}</h2>
            <span
              class="session-code-chip"
              role="button"
              tabindex="0"
              title="${t('lobby.copyCodeTooltip')}"
              aria-label="${t('lobby.codeChipAriaLabel', { code: session.code })}"
              @click=${() => void this._copyCode(session.code)}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this._copyCode(session.code); } }}
            >${session.code}</span>
          </div>

          <!-- Copy confirmation toast -->
          ${this._codeCopied
            ? html`
                <sl-alert
                  variant="success"
                  open
                  duration="1000"
                  closable
                  style="margin-bottom:0.75rem;"
                  aria-label="${t('lobby.codeCopiedAriaLabel')}"
                >
                  <sl-icon slot="icon" name="clipboard-check"></sl-icon>
                  ${t('lobby.codeCopied')}
                </sl-alert>
              `
            : nothing}

          <!-- Join code prominent display after creation -->
          ${this._joinCode
            ? html`
                <div class="join-code-box">
                  <div class="join-code-label">${t('lobby.shareCode')}</div>
                  <div class="join-code-value">${session.code}</div>
                  <sl-button size="small" variant="neutral" @click=${() => void this._copyCode(session.code)}>
                    <sl-icon slot="prefix" name="clipboard"></sl-icon>
                    ${t('lobby.copyCode')}
                  </sl-button>
                </div>
              `
            : nothing}

          <!-- Share code hint -->
          <sl-alert variant="primary" open style="margin-bottom:1.25rem;">
            <sl-icon slot="icon" name="info-circle"></sl-icon>
            ${t('lobby.shareCodeAlert', { code: session.code })}
            <sl-button
              size="small"
              variant="text"
              style="margin-left:0.5rem;"
              @click=${() => void this._copyCode(session.code)}
            >${t('lobby.copy')}</sl-button>
          </sl-alert>

          <!-- Participants -->
          <p class="section-label" id="participants-label">
            ${t('lobby.participants')}
            <sl-badge variant="neutral" pill style="margin-left:0.4rem;">${session.participants.length}</sl-badge>
          </p>
          <ul class="participant-list" aria-labelledby="participants-label" role="list" aria-live="polite">
            ${session.participants.map((p) => {
              const submitted = session.submissions.some((s) => s.participantId === p.id);
              const isMe = p.id === participantId;
              return html`
                <li class="participant-item" aria-label="${p.name}${isMe ? ` ${t('lobby.you')}` : ''}, ${submitted ? t('lobby.status.submitted') : t('lobby.status.waiting')}">
                  <span class="participant-name">
                    <sl-icon name="person-fill" aria-hidden="true"></sl-icon>
                    ${p.name}
                    ${isMe ? html`<span class="you-label">${t('lobby.you')}</span>` : nothing}
                  </span>
                  ${submitted
                    ? html`<sl-badge variant="success">${t('lobby.status.submitted')}</sl-badge>`
                    : html`<sl-badge variant="neutral">${t('lobby.status.waiting')}</sl-badge>`}
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

            ${this._submissionSuccess
              ? html`
                  <sl-alert variant="success" open aria-live="polite">
                    <sl-icon slot="icon" name="check-circle-fill"></sl-icon>
                    ${t('lobby.submission.success')}
                  </sl-alert>
                `
              : mySubmission
              ? html`
                  <sl-alert variant="success" open>
                    <sl-icon slot="icon" name="check-circle"></sl-icon>
                    ${t('lobby.youHaveSubmitted')} <strong>${mySubmission.fileName}</strong>.
                  </sl-alert>
                `
              : html`
                  <sl-button
                    variant="primary"
                    ?loading=${this._submitting}
                    @click=${this._triggerFileInput}
                  >
                    <sl-icon slot="prefix" name="cloud-arrow-up"></sl-icon>
                    ${t('lobby.loadAndSubmit')}
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
                    ${t('lobby.viewResults')}
                    <sl-badge slot="suffix" variant="neutral" pill>${session.submissions.length}</sl-badge>
                  </sl-button>
                `
              : html`
                  <div class="waiting" role="status" aria-live="polite">
                    <sl-spinner aria-hidden="true"></sl-spinner>
                    ${t('lobby.waitingForParticipants')}
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
