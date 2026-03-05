import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { authStore, type AuthState } from '../../state/auth-state.js';
import { store, type AppState, type SessionState } from '../../state/app-state.js';
import { disconnectSession } from '../../state/session-connection.js';
import { fetchUnreadMentions, clearUnreadMentions, type UnreadMentionView } from '../../state/task-api.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

import './presence-bar.js';
import './activity-feed.js';
import './question-panel.js';
import '../session/session-lobby.js';
import '../project/project-list.js';
import '../project/project-workspace.js';

type AppRoute =
  | { view: 'projects' }
  | { view: 'project'; projectId: string; tab?: string }
  | { view: 'session'; code: string };

function parseRoute(): AppRoute {
  const hash = window.location.hash;
  const projectMatch = hash.match(/^#project\/([a-f0-9-]+)(?:\/(\w+))?/i);
  if (projectMatch) return { view: 'project', projectId: projectMatch[1], tab: projectMatch[2] };
  const sessionMatch = hash.match(/^#session\/([A-Z0-9]+)/i);
  if (sessionMatch) return { view: 'session', code: sessionMatch[1].toUpperCase() };
  return { view: 'projects' };
}


@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      min-height: 100dvh;
    }

    /* ── Auth screens ── */
    .auth-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 1rem;
      color: var(--text-secondary);
    }

    .login-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 1.5rem;
      background: var(--surface-1);
    }

    .login-screen h1 {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.025em;
    }

    .login-screen p {
      color: var(--text-secondary);
      max-width: 24rem;
      text-align: center;
    }

    /* ── App layout ── */
    .app-layout {
      --sidebar-width: 260px;
      --header-height: 48px;

      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: var(--header-height) 1fr;
      height: 100vh;
      height: 100dvh;
      grid-template-areas:
        "header header"
        "sidebar main";
    }

    .app-layout.sidebar-collapsed,
    .app-layout.no-sidebar {
      grid-template-columns: 0 1fr;
    }

    .app-layout.no-sidebar .sidebar {
      display: none;
    }

    /* ── Header ── */
    .header {
      grid-area: header;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--surface-header);
      z-index: 10;
      height: var(--header-height);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-wordmark {
      font-size: 16px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: -0.02em;
    }

    .header-center {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 8px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .user-name {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    /* ── Sidebar ── */
    .sidebar {
      grid-area: sidebar;
      background: var(--surface-2);
      border-right: 1px solid var(--border-color);
      overflow-y: auto;
      overflow-x: hidden;
      transition: width 0.2s ease, opacity 0.2s ease;
    }

    .sidebar-collapsed .sidebar {
      width: 0;
      opacity: 0;
      overflow: hidden;
    }

    .sidebar-content {
      padding: 0.75rem;
    }

    .sidebar-section {
      margin-bottom: 1rem;
    }

    .sidebar-section-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.5rem;
    }

    .session-code-display {
      font-family: var(--sl-font-mono);
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--sl-color-primary-400);
      letter-spacing: 0.12em;
      cursor: pointer;
      padding: 0.25rem 0;
    }

    .session-code-display:hover {
      color: var(--sl-color-primary-300);
    }

    .agent-code-display {
      font-family: var(--sl-font-mono);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.08em;
      cursor: pointer;
    }

    .agent-code-display:hover {
      color: var(--text-primary);
    }

    .agent-code-hint {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    .sidebar-participant-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .sidebar-participant {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .sidebar-participant.is-me {
      background: var(--surface-active);
    }

    .sidebar-participant sl-icon {
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .sidebar-participant .name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sidebar-participant .you-tag {
      font-size: 0.65rem;
      color: var(--text-tertiary);
    }

    .leave-btn {
      margin-top: 0.5rem;
    }

    /* ── Main ── */
    .main {
      grid-area: main;
      overflow-y: auto;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    /* ── Sidebar toggle ── */
    .sidebar-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
      .app-layout {
        grid-template-columns: 1fr;
        grid-template-areas:
          "header"
          "main";
      }

      .sidebar {
        display: none;
      }
    }
  `;

  @state() private _authState: AuthState = authStore.get();
  @state() private _appState: AppState = store.get();
  @state() private _sidebarCollapsed = false;
  @state() private _unreadMentions: UnreadMentionView[] = [];
  @state() private _route: AppRoute = parseRoute();

  private _authUnsub: (() => void) | null = null;
  private _appUnsub: (() => void) | null = null;
  private _boundHashChange = () => { this._route = parseRoute(); };

  connectedCallback() {
    super.connectedCallback();

    this._authUnsub = authStore.subscribe(() => {
      this._authState = authStore.get();
    });

    this._appUnsub = store.subscribe((event) => {
      this._appState = store.get();
      if (event.type === 'mentioned' || event.type === 'session-connected') {
        this._loadUnreadMentions();
      }
      if (event.type === 'session-disconnected' && !window.location.hash.startsWith('#project/')) {
        window.location.hash = '#projects';
      }
    });

    window.addEventListener('hashchange', this._boundHashChange);

    if (window.location.pathname === '/auth/callback') {
      authStore.handleCallback();
    } else {
      authStore.initialize();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._authUnsub?.();
    this._appUnsub?.();
    window.removeEventListener('hashchange', this._boundHashChange);
  }

  private _toggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
  }

  private async _copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
  }

  private _leaveSession() {
    const projectId = this._appState.sessionState?.session?.project_id;
    disconnectSession();
    store.clearSession();
    if (projectId) {
      window.location.hash = `#project/${projectId}`;
    } else {
      window.location.hash = '#projects';
    }
  }

  private async _loadUnreadMentions() {
    const code = this._appState.sessionState?.code;
    if (!code) return;
    try {
      this._unreadMentions = await fetchUnreadMentions(code);
    } catch { /* silent */ }
  }

  private async _clearMentions() {
    const code = this._appState.sessionState?.code;
    if (!code || this._unreadMentions.length === 0) return;
    // Navigate to the most recent mention's task
    const latest = this._unreadMentions[0];
    if (latest) {
      window.location.hash = `#session/${code}/task/${latest.task_id}`;
    }
    try {
      await clearUnreadMentions(code);
      this._unreadMentions = [];
    } catch { /* silent */ }
  }

  private _renderSessionSidebar(session: SessionState, currentId: string) {
    const { session: s, agentCode } = session;
    return html`
      <div class="sidebar-section">
        <div class="sidebar-section-label">Session</div>
        ${s.name ? html`<div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${s.name}</div>` : nothing}
        <sl-tooltip content="Click to copy">
          <div class="session-code-display" @click=${() => this._copyToClipboard(s.code)}>
            ${s.code}
          </div>
        </sl-tooltip>
      </div>

      ${agentCode ? html`
        <div class="sidebar-section">
          <div class="sidebar-section-label">Agent Code</div>
          <sl-tooltip content="Click to copy">
            <div class="agent-code-display" @click=${() => this._copyToClipboard(agentCode)}>
              ${agentCode}
            </div>
          </sl-tooltip>
          <div class="agent-code-hint">Share with your AI agents</div>
        </div>
      ` : nothing}

      <sl-divider></sl-divider>

      <div class="sidebar-section">
        <div class="sidebar-section-label">
          Participants
          <sl-badge variant="neutral" pill style="margin-left: 0.3rem; vertical-align: middle;">${s.participants.length}</sl-badge>
        </div>
        <ul class="sidebar-participant-list">
          ${s.participants.map(p => {
            const isMe = p.id === currentId;
            const isAgent = p.participant_type === 'agent';
            return html`
              <li class="sidebar-participant ${isMe ? 'is-me' : ''}">
                <sl-icon name=${isAgent ? 'robot' : 'person-fill'}></sl-icon>
                <span class="name">${p.display_name}</span>
                ${isMe ? html`<span class="you-tag">you</span>` : nothing}
              </li>
            `;
          })}
        </ul>
      </div>

      <sl-divider></sl-divider>

      <sl-button class="leave-btn" variant="neutral" size="small" outline @click=${this._leaveSession}>
        <sl-icon slot="prefix" name="box-arrow-left"></sl-icon>
        Back to Project
      </sl-button>

      <sl-divider></sl-divider>

      <question-panel session-code=${s.code}></question-panel>

      <sl-divider></sl-divider>

      <notes-panel session-code=${s.code}></notes-panel>

      <sl-divider></sl-divider>

      <activity-feed session-code=${s.code}></activity-feed>
    `;
  }

  private _renderMain() {
    // If we have an active session, show the session lobby (in-session view)
    if (this._appState.sessionState) {
      return html`<session-lobby></session-lobby>`;
    }

    // Route based on hash
    switch (this._route.view) {
      case 'project':
        return html`<project-workspace project-id=${this._route.projectId} .initialTab=${this._route.tab ?? ''}></project-workspace>`;
      case 'session':
        // Session hash but no active session — session-lobby will attempt rejoin
        return html`<session-lobby></session-lobby>`;
      case 'projects':
      default:
        return html`<project-list></project-list>`;
    }
  }

  render() {
    if (this._authState.isLoading) {
      return html`
        <div class="auth-loading">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <span>Authenticating...</span>
        </div>
      `;
    }

    if (!this._authState.isAuthenticated) {
      return html`
        <div class="login-screen">
          <h1>Seam</h1>
          <p>Collaborative sessions where humans and AI agents work together.</p>
          <sl-button variant="primary" size="large" @click=${() => authStore.login()}>
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            Sign in
          </sl-button>
          ${this._authState.error
            ? html`<p style="color: var(--sl-color-danger-500);">${this._authState.error}</p>`
            : nothing}
        </div>
      `;
    }

    const session = this._appState.sessionState;
    const participants = session?.session.participants ?? [];
    const currentId = session?.participantId ?? '';

    return html`
      <div class="app-layout ${!session ? 'no-sidebar' : this._sidebarCollapsed ? 'sidebar-collapsed' : ''}">
        <header class="header">
          <div class="header-left">
            <sl-icon-button
              name="list"
              label="Toggle sidebar"
              @click=${this._toggleSidebar}
            ></sl-icon-button>
            <span class="logo-wordmark">Seam</span>
          </div>

          <div class="header-center">
            <presence-bar
              .participants=${participants}
              current-id="${currentId}"
            ></presence-bar>
          </div>

          <div class="header-right">
            ${session && this._unreadMentions.length > 0 ? html`
              <sl-tooltip content="You have ${this._unreadMentions.length} unread mention(s)">
                <sl-button size="small" variant="text" @click=${this._clearMentions} style="position: relative;">
                  <sl-icon name="bell-fill" style="color: var(--sl-color-warning-500);"></sl-icon>
                  <sl-badge variant="danger" pill style="position: absolute; top: -2px; right: -2px; font-size: 0.6rem;">
                    ${this._unreadMentions.length}
                  </sl-badge>
                </sl-button>
              </sl-tooltip>
            ` : nothing}
            <span class="user-name">${this._authState.user?.name}</span>
            <sl-button size="small" variant="text" @click=${() => authStore.logout()}>
              Sign out
            </sl-button>
          </div>
        </header>

        <aside class="sidebar">
          <div class="sidebar-content">
            ${session ? this._renderSessionSidebar(session, currentId) : nothing}
          </div>
        </aside>

        <main class="main">
          ${this._renderMain()}
        </main>
      </div>
    `;
  }
}
