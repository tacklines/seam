import { LitElement, html, css, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { authStore, type AuthState } from "../../state/auth-state.js";
import {
  store,
  type AppState,
  type SessionState,
  type SessionParticipant,
} from "../../state/app-state.js";
import { disconnectSession } from "../../state/session-connection.js";
import { agentStream } from "../../state/agent-stream.js";
import {
  fetchUnreadMentions,
  clearUnreadMentions,
  type UnreadMentionView,
} from "../../state/task-api.js";
import {
  fetchOrgs,
  setOrgs,
  setCurrentOrg,
  getCurrentOrg,
  subscribeOrg,
  type OrgView,
} from "../../state/org-api.js";
import { initRouter, navigateTo } from "../../router.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";

import "./presence-bar.js";
import "./activity-feed.js";
import "./question-panel.js";
import "../session/agent-console.js";

@customElement("app-shell")
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

    .org-switcher {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-secondary);
      border: 1px solid transparent;
      transition:
        background 0.15s,
        border-color 0.15s;
    }

    .org-switcher:hover {
      background: var(--surface-active);
      border-color: var(--border-subtle);
      color: var(--text-primary);
    }

    .org-divider {
      color: var(--text-tertiary);
      font-size: 0.9rem;
      user-select: none;
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
      transition:
        width 0.2s ease,
        opacity 0.2s ease;
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

    .sidebar-participant.clickable {
      cursor: pointer;
      border-radius: 6px;
    }

    .sidebar-participant.clickable:hover {
      background: var(--surface-active);
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

    #outlet {
      display: flex;
      flex-direction: column;
      flex: 1;
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
  @state() private _routerReady = false;
  @state() private _agentConsoleParticipant: SessionParticipant | null = null;
  @state() private _orgs: OrgView[] = [];
  @state() private _currentOrg: OrgView | null = null;

  @query("#outlet") private _outlet!: HTMLElement;

  private _authUnsub: (() => void) | null = null;
  private _appUnsub: (() => void) | null = null;
  private _orgUnsub: (() => void) | null = null;
  private _boundOnLocationChanged: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();

    this._authUnsub = authStore.subscribe(() => {
      this._authState = authStore.get();
      // Once authenticated, init the router if not already done
      if (this._authState.isAuthenticated && !this._routerReady) {
        this._loadOrgs();
        this._initRouter();
      }
    });

    this._orgUnsub = subscribeOrg(() => {
      this._currentOrg = getCurrentOrg();
    });

    this._appUnsub = store.subscribe((event) => {
      this._appState = store.get();
      if (event.type === "mentioned" || event.type === "session-connected") {
        this._loadUnreadMentions();
      }
      if (event.type === "session-disconnected") {
        const orgSlug = this._currentOrg?.slug;
        if (
          orgSlug &&
          !window.location.pathname.startsWith(`/orgs/${orgSlug}`)
        ) {
          navigateTo(`/orgs/${orgSlug}`);
        }
      }
    });

    if (window.location.pathname === "/auth/callback") {
      authStore.handleCallback();
    } else {
      authStore.initialize();
    }

    // For Ory auth pages, initialize the router immediately (no auth needed)
    if (window.location.pathname.startsWith("/auth/")) {
      this._initRouter();
    }

    this._boundOnLocationChanged = this._onLocationChanged.bind(this);
    window.addEventListener(
      "vaadin-router-location-changed",
      this._boundOnLocationChanged,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._authUnsub?.();
    this._appUnsub?.();
    this._orgUnsub?.();
    if (this._boundOnLocationChanged) {
      window.removeEventListener(
        "vaadin-router-location-changed",
        this._boundOnLocationChanged,
      );
      this._boundOnLocationChanged = null;
    }
  }

  private _onLocationChanged() {
    const session = this._appState.sessionState;
    if (!session) return;

    const onSessionRoute = window.location.pathname.startsWith("/sessions/");
    const currentCode = session.code;
    // Detect session-to-session navigation: on a /sessions/ route but different code
    const routeCode = onSessionRoute
      ? window.location.pathname.split("/")[2]?.toUpperCase()
      : null;
    const leavingSession = !onSessionRoute || (routeCode !== currentCode);

    if (leavingSession) {
      agentStream.disconnect();
      disconnectSession();
      store.clearSession();
      this._sidebarCollapsed = false;
    }
  }

  private _initRouter() {
    // Wait for the outlet element to be rendered
    this.updateComplete.then(() => {
      const outlet = this.renderRoot.querySelector("#outlet");
      if (outlet && !this._routerReady) {
        initRouter(outlet as HTMLElement);
        this._routerReady = true;
      }
    });
  }

  private _toggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
  }

  private async _copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* blocked */
    }
  }

  private async _loadOrgs() {
    try {
      this._orgs = await fetchOrgs();
      setOrgs(this._orgs);
    } catch {
      /* silent — router will handle */
    }
  }

  private _switchOrg(org: OrgView) {
    setCurrentOrg(org);
    navigateTo(`/orgs/${org.slug}`);
  }

  private _leaveSession() {
    const orgSlug = this._currentOrg?.slug;
    const projectId = this._appState.sessionState?.session.project_id;
    agentStream.disconnect();
    disconnectSession();
    store.clearSession();
    this._sidebarCollapsed = false;
    if (orgSlug && projectId) {
      navigateTo(`/orgs/${orgSlug}/projects/${projectId}`);
    } else {
      navigateTo(orgSlug ? `/orgs/${orgSlug}` : "/");
    }
  }

  private async _loadUnreadMentions() {
    const code = this._appState.sessionState?.code;
    if (!code) return;
    try {
      this._unreadMentions = await fetchUnreadMentions(code);
    } catch {
      /* silent */
    }
  }

  private _onParticipantClicked(e: CustomEvent<{ id: string }>) {
    const participants =
      this._appState.sessionState?.session.participants ?? [];
    const p = participants.find((p) => p.id === e.detail.id);
    if (p?.participant_type === "agent") {
      this._agentConsoleParticipant = p;
    }
  }

  private _closeAgentConsole() {
    this._agentConsoleParticipant = null;
  }

  private async _clearMentions() {
    const code = this._appState.sessionState?.code;
    if (!code || this._unreadMentions.length === 0) return;
    // Navigate to the most recent mention's task
    const latest = this._unreadMentions[0];
    if (latest) {
      navigateTo(`/sessions/${code}/tasks/${latest.task_id}`);
    }
    try {
      await clearUnreadMentions(code);
      this._unreadMentions = [];
    } catch {
      /* silent */
    }
  }

  private _renderSessionSidebar(session: SessionState, currentId: string) {
    const { session: s, agentCode } = session;
    return html`
      <div class="sidebar-section">
        <div class="sidebar-section-label">${t("app.sidebar.session")}</div>
        ${s.name
          ? html`<div
              style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;"
            >
              ${s.name}
            </div>`
          : nothing}
        <sl-tooltip content="${t("app.tooltip.clickToCopy")}">
          <div
            class="session-code-display"
            @click=${() => this._copyToClipboard(s.code)}
          >
            ${s.code}
          </div>
        </sl-tooltip>
      </div>

      ${agentCode
        ? html`
            <div class="sidebar-section">
              <div class="sidebar-section-label">
                ${t("app.sidebar.agentCode")}
              </div>
              <sl-tooltip content="${t("app.tooltip.clickToCopy")}">
                <div
                  class="agent-code-display"
                  @click=${() => this._copyToClipboard(agentCode)}
                >
                  ${agentCode}
                </div>
              </sl-tooltip>
              <div class="agent-code-hint">
                ${t("app.sidebar.agentCodeHint")}
              </div>
            </div>
          `
        : nothing}

      <sl-divider></sl-divider>

      <div class="sidebar-section">
        <div class="sidebar-section-label">
          ${t("app.sidebar.participants")}
          <sl-badge
            variant="neutral"
            pill
            style="margin-left: 0.3rem; vertical-align: middle;"
            >${s.participants.length}</sl-badge
          >
        </div>
        <ul class="sidebar-participant-list">
          ${s.participants.map((p) => {
            const isMe = p.id === currentId;
            const isAgent = p.participant_type === "agent";
            return html`
              <li
                class="sidebar-participant ${isMe ? "is-me" : ""} ${isAgent
                  ? "clickable"
                  : ""}"
                @click=${isAgent
                  ? () => {
                      this._agentConsoleParticipant = p;
                    }
                  : nothing}
              >
                <sl-icon name=${isAgent ? "robot" : "person-fill"}></sl-icon>
                <span class="name">${p.display_name}</span>
                ${isMe
                  ? html`<span class="you-tag"
                      >${t("app.sidebar.youTag")}</span
                    >`
                  : nothing}
                ${isAgent
                  ? html`<sl-icon
                      name="terminal"
                      style="font-size: 0.7rem; opacity: 0.5;"
                    ></sl-icon>`
                  : nothing}
              </li>
            `;
          })}
        </ul>
      </div>

      <sl-divider></sl-divider>

      <sl-button
        class="leave-btn"
        variant="neutral"
        size="small"
        outline
        @click=${this._leaveSession}
      >
        <sl-icon slot="prefix" name="box-arrow-left"></sl-icon>
        ${t("app.sidebar.backToProject")}
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
    // The router outlet handles rendering the correct component
    return html`<div id="outlet"></div>`;
  }

  render() {
    // Allow Ory auth pages to render without authentication
    if (window.location.pathname.startsWith("/auth/")) {
      return html`<div id="outlet"></div>`;
    }

    if (this._authState.isLoading) {
      return html`
        <div class="auth-loading">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <span>${t("app.auth.loading")}</span>
        </div>
      `;
    }

    if (!this._authState.isAuthenticated) {
      return html`
        <div class="login-screen">
          <h1>${t("app.login.title")}</h1>
          <p>${t("app.login.description")}</p>
          <sl-button
            variant="primary"
            size="large"
            @click=${() => authStore.login()}
          >
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            ${t("app.login.signIn")}
          </sl-button>
          ${this._authState.error
            ? html`<p style="color: var(--sl-color-danger-500);">
                ${this._authState.error}
              </p>`
            : nothing}
        </div>
      `;
    }

    const session = this._appState.sessionState;
    const participants = session?.session.participants ?? [];
    const currentId = session?.participantId ?? "";

    return html`
      <div
        class="app-layout ${!session
          ? "no-sidebar"
          : this._sidebarCollapsed
            ? "sidebar-collapsed"
            : ""}"
      >
        <header class="header">
          <div class="header-left">
            ${session
              ? html`<sl-icon-button
                  name="list"
                  label="${t("app.sidebar.toggleLabel")}"
                  @click=${this._toggleSidebar}
                ></sl-icon-button>`
              : nothing}
            <span
              class="logo-wordmark"
              @click=${() => navigateTo("/")}
              style="cursor: pointer;"
              >${t("app.brand")}</span
            >
            ${this._currentOrg && this._orgs.length > 0
              ? html`
                  <span class="org-divider">/</span>
                  ${this._orgs.length === 1
                    ? html`
                        <span
                          class="org-switcher"
                          @click=${() =>
                            navigateTo(`/orgs/${this._currentOrg!.slug}`)}
                        >
                          ${this._currentOrg.name}
                        </span>
                      `
                    : html`
                        <sl-dropdown>
                          <span class="org-switcher" slot="trigger">
                            ${this._currentOrg.name}
                            <sl-icon
                              name="chevron-down"
                              style="font-size: 0.7rem;"
                            ></sl-icon>
                          </span>
                          <sl-menu
                            @sl-select=${(e: CustomEvent) => {
                              const org = this._orgs.find(
                                (o) => o.slug === e.detail.item.value,
                              );
                              if (org) this._switchOrg(org);
                            }}
                          >
                            ${this._orgs.map(
                              (o) => html`
                                <sl-menu-item
                                  value=${o.slug}
                                  ?checked=${o.slug === this._currentOrg?.slug}
                                >
                                  ${o.name}
                                  ${o.personal
                                    ? html`<sl-badge
                                        variant="neutral"
                                        pill
                                        slot="suffix"
                                        style="font-size: 0.6rem;"
                                        >${t(
                                          "app.header.orgPersonal",
                                        )}</sl-badge
                                      >`
                                    : nothing}
                                </sl-menu-item>
                              `,
                            )}
                          </sl-menu>
                        </sl-dropdown>
                      `}
                `
              : nothing}
          </div>

          <div class="header-center">
            <presence-bar
              .participants=${participants}
              current-id="${currentId}"
              @participant-clicked=${this._onParticipantClicked}
            ></presence-bar>
          </div>

          <div class="header-right">
            ${session && this._unreadMentions.length > 0
              ? html`
                  <sl-tooltip
                    content="${t("app.header.unreadMentions", {
                      count: this._unreadMentions.length,
                    })}"
                  >
                    <sl-button
                      size="small"
                      variant="text"
                      @click=${this._clearMentions}
                      style="position: relative;"
                    >
                      <sl-icon
                        name="bell-fill"
                        style="color: var(--sl-color-warning-500);"
                      ></sl-icon>
                      <sl-badge
                        variant="danger"
                        pill
                        style="position: absolute; top: -2px; right: -2px; font-size: 0.6rem;"
                      >
                        ${this._unreadMentions.length}
                      </sl-badge>
                    </sl-button>
                  </sl-tooltip>
                `
              : nothing}
            <sl-dropdown>
              <sl-button slot="trigger" size="small" variant="text" caret>
                ${this._authState.user?.name}
              </sl-button>
              <sl-menu>
                <sl-menu-item @click=${() => navigateTo("/settings")}>
                  <sl-icon slot="prefix" name="gear"></sl-icon>
                  ${t("app.header.settings")}
                </sl-menu-item>
                <sl-divider></sl-divider>
                <sl-menu-item @click=${() => authStore.logout()}>
                  <sl-icon slot="prefix" name="box-arrow-right"></sl-icon>
                  ${t("app.header.signOut")}
                </sl-menu-item>
              </sl-menu>
            </sl-dropdown>
          </div>
        </header>

        <aside class="sidebar">
          <div class="sidebar-content">
            ${session
              ? this._renderSessionSidebar(session, currentId)
              : nothing}
          </div>
        </aside>

        <main class="main">${this._renderMain()}</main>
      </div>

      ${session && this._agentConsoleParticipant
        ? html`
            <agent-console
              session-code=${session.code}
              .participant=${this._agentConsoleParticipant}
              ?open=${!!this._agentConsoleParticipant}
              @close=${this._closeAgentConsole}
            ></agent-console>
          `
        : nothing}
    `;
  }
}
