import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchProject,
  fetchProjectSessions,
  updateProject,
  type ProjectView,
} from "../../state/project-api.js";
import { fetchPlans, type PlanListView } from "../../state/plan-api.js";
import {
  fetchWorkspaces,
  fetchCoderStatus,
  stopWorkspace,
  destroyWorkspace,
  type WorkspaceView,
  type CoderStatus,
} from "../../state/workspace-api.js";
import { store, type SessionView } from "../../state/app-state.js";
import { connectSession } from "../../state/session-connection.js";
import { authStore } from "../../state/auth-state.js";
import { createSession, joinSessionByCode } from "../../state/session-api.js";
import { navigateTo } from "../../router.js";
import type { RouterLocation } from "@vaadin/router";
import { t } from "../../lib/i18n.js";
import { formatDate, relativeTime } from "../../lib/date-utils.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";

import "../plans/plan-list.js";
import "../plans/plan-detail.js";
import "../requirements/requirement-list.js";
import "../requirements/requirement-detail.js";
import "../requests/request-list.js";
import "../requests/request-detail.js";
import "../agents/agent-list.js";
import "../agents/agent-detail.js";
import "../workspaces/workspace-list.js";
import "../workspaces/workspace-detail.js";
import "../invocations/invocation-list.js";
import "../invocations/invocation-detail.js";
import "../invocations/invoke-dialog.js";
import "../tasks/task-board.js";
import "../automations/automation-panel.js";
// Lazy-loaded when graph tab is shown (Three.js is ~800KB)
const ensureGraphLoaded = () => import("../graph/dependency-graph.js");

@customElement("project-workspace")
export class ProjectWorkspace extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1;
    }

    .container {
      min-height: 100%;
      padding: 2rem;
      background: var(--surface-1, #111320);
    }

    .container.graph-mode {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 0;
      overflow: hidden;
    }

    .container.graph-mode .graph-header {
      padding: 1rem 2rem 0;
      background: var(--surface-1, #111320);
      flex-shrink: 0;
    }

    .container.graph-mode dependency-graph {
      flex: 1;
      min-height: 0;
    }

    .inner {
      max-width: 64rem;
      margin: 0 auto;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    /* ── Project header ── */
    .project-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .back-link {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 0.85rem;
      text-decoration: none;
      flex-shrink: 0;
    }
    .back-link:hover {
      color: var(--sl-color-primary-400);
    }

    .project-header h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prefix-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* ── Repo info ── */
    .repo-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      font-size: 0.85rem;
    }

    .repo-info sl-icon {
      font-size: 1rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .repo-link {
      color: var(--sl-color-primary-400);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .repo-link:hover {
      text-decoration: underline;
    }

    .branch-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* ── Section headers ── */
    .section {
      margin-bottom: 2rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Sessions grid ── */
    .sessions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.75rem;
    }

    .session-card {
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: var(--surface-card);
      box-shadow: var(--shadow-xs);
      transition:
        border-color 0.2s,
        box-shadow 0.2s,
        transform 0.15s;
    }

    .session-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .session-card .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .session-card .code {
      font-family: var(--sl-font-mono);
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--sl-color-primary-400);
      letter-spacing: 0.08em;
    }

    .session-card .date {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .session-card .name {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-card .participants {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .session-card .participants sl-icon {
      font-size: 0.85rem;
    }

    .online-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
      margin-right: 0.15rem;
    }

    .new-session-card {
      cursor: pointer;
      border: 2px dashed var(--border-medium);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-tertiary);
      transition:
        border-color 0.2s,
        color 0.2s;
      min-height: 100px;
    }

    .new-session-card:hover {
      border-color: var(--sl-color-primary-500);
      color: var(--sl-color-primary-400);
    }

    .new-session-card sl-icon {
      font-size: 1.25rem;
    }

    /* ── Workspace list ── */
    .workspace-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .workspace-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      background: var(--surface-card);
      font-size: 0.875rem;
      cursor: pointer;
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
    }

    .workspace-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .workspace-row:hover {
      background: var(--surface-hover, var(--surface-active));
      border-color: var(--color-primary-border);
    }

    .ws-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
    }

    .ws-participant-name {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
      color: var(--sl-color-primary-400);
      min-width: 8rem;
    }

    .ws-template {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .ws-branch {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .ws-error {
      font-size: 0.75rem;
      color: var(--sl-color-danger-500);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 20rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2rem;
      display: block;
      margin: 0 auto 0.75rem;
      opacity: 0.5;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* ── Tab navigation ── */
    .tab-nav {
      display: flex;
      gap: 0;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.6rem 1rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition:
        color 0.15s,
        border-color 0.15s;
    }

    .tab-btn:hover {
      color: var(--text-secondary);
    }

    .tab-btn.active {
      color: var(--sl-color-primary-400);
      border-bottom-color: var(--sl-color-primary-400);
    }

    .tab-btn sl-icon {
      font-size: 0.9rem;
    }

    /* ── Settings panel ── */
    .settings-panel {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .settings-section {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.5rem;
    }

    .settings-section h3 {
      margin: 0 0 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .settings-form sl-input {
      --sl-input-font-size-medium: 0.875rem;
    }

    .settings-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.5rem;
    }

    .coder-info {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .coder-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
    }

    .coder-label {
      color: var(--text-tertiary);
      min-width: 6rem;
      flex-shrink: 0;
    }

    .coder-value {
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
    }

    .template-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .template-chip {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }
  `;

  // Set by @vaadin/router
  location!: RouterLocation;

  @property({ attribute: "project-id" }) projectId = "";
  @property() initialTab = "";

  @state() private _project: ProjectView | null = null;
  @state() private _sessions: SessionView[] = [];
  @state() private _plans: PlanListView[] = [];
  @state() private _planCount = 0;
  @state() private _workspaces: WorkspaceView[] = [];
  @state() private _selectedPlanId: string | null = null;
  @state() private _selectedRequirementId: string | null = null;
  @state() private _selectedRequestId: string | null = null;
  @state() private _selectedAgentId: string | null = null;
  @state() private _selectedWorkspaceId = "";
  @state() private _selectedInvocationId = "";
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _showNewSession = false;
  @state() private _newSessionName = "";
  @state() private _creatingSess = false;
  @state() private _activeTab = "overview";

  /* Settings state */
  @state() private _settingsName = "";
  @state() private _settingsPrefix = "";
  @state() private _settingsRepoUrl = "";
  @state() private _settingsDefaultBranch = "";
  @state() private _settingsSaving = false;
  @state() private _settingsMsg = "";
  @state() private _settingsMsgVariant: "success" | "danger" = "success";
  @state() private _coderStatus: CoderStatus | null = null;
  @state() private _coderLoading = false;

  private _appUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Read route params from @vaadin/router location
    if (this.location?.params) {
      const params = this.location.params as Record<string, string>;
      if (params.id) this.projectId = params.id;
      if (params.tab) {
        const valid = [
          "overview",
          "graph",
          "settings",
          "tasks",
          "requirements",
          "requests",
          "plans",
          "sessions",
          "agents",
          "workspaces",
          "automations",
        ];
        if (valid.includes(params.tab)) {
          this._activeTab = params.tab;
        }
      }
      if (params.planId) {
        this._activeTab = "plans";
        this._selectedPlanId = params.planId;
      }
      if (params.requirementId) {
        this._activeTab = "requirements";
        this._selectedRequirementId = params.requirementId;
      }
      if (params.requestId) {
        this._activeTab = "requests";
        this._selectedRequestId = params.requestId;
      }
      if (params.agentId) {
        this._activeTab = "agents";
        this._selectedAgentId = params.agentId;
      }
      if (params.workspaceId) {
        this._activeTab = "workspaces";
        this._selectedWorkspaceId = params.workspaceId;
      }
    }
    this._loadProject();
    this._appUnsub = store.subscribe((event) => {
      if (event.type === "session-connected") {
        // app-shell handles the switch
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._appUnsub?.();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("projectId") && this.projectId) {
      this._loadProject();
    }
    if (changed.has("initialTab") && this.initialTab) {
      const valid = [
        "overview",
        "tasks",
        "requirements",
        "requests",
        "graph",
        "settings",
        "agents",
        "workspaces",
        "automations",
      ];
      if (valid.includes(this.initialTab)) {
        this._switchTab(this.initialTab, false);
      }
    }
  }

  private async _loadProject() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = "";
    try {
      const [project, sessions, plans, workspaces] = await Promise.all([
        fetchProject(this.projectId),
        fetchProjectSessions(this.projectId),
        fetchPlans(this.projectId),
        fetchWorkspaces(this.projectId).catch(() => [] as WorkspaceView[]),
      ]);
      this._project = project;
      this._sessions = sessions;
      this._plans = plans;
      this._planCount = plans.length;
      this._workspaces = workspaces;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private async _createSession() {
    this._creatingSess = true;
    this._error = "";
    try {
      const data = await createSession({
        project_id: this.projectId,
        name: this._newSessionName.trim() || undefined,
      });
      store.setSession(
        data.session.code,
        data.session.participants[0]?.id,
        data.session,
        data.agent_code,
      );
      connectSession(data.session.code);
      navigateTo(`/sessions/${data.session.code}`);
      this._newSessionName = "";
      this._showNewSession = false;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorCreateSession");
    } finally {
      this._creatingSess = false;
    }
  }

  private async _joinSession(code: string) {
    const user = authStore.user;
    try {
      const data = await joinSessionByCode(code, user?.name ?? "Participant");
      store.setSession(
        code,
        data.participant_id,
        data.session,
        data.agent_code,
      );
      connectSession(code);
      navigateTo(`/sessions/${code}`);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorJoinSession");
    }
  }

  private _onlineCount(session: SessionView): number {
    return session.participants.filter((p) => p.is_online).length;
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner style="font-size: 2rem;"></sl-spinner>
      </div>`;
    }

    if (!this._project) {
      return html`<div class="empty-state">${t("workspace.notFound")}</div>`;
    }

    const isGraph = this._activeTab === "graph";

    return html`
      <div class="container ${isGraph ? "graph-mode" : ""}">
        ${isGraph
          ? html`
              <div class="graph-header">
                ${this._renderHeader()} ${this._renderTabNav()}
              </div>
              <dependency-graph project-id=${this.projectId}></dependency-graph>
            `
          : html`
              <div class="inner">
                ${this._renderHeader()} ${this._renderTabNav()}
                ${this._error
                  ? html`<sl-alert
                      variant="danger"
                      open
                      style="margin-bottom: 1rem;"
                      >${this._error}</sl-alert
                    >`
                  : nothing}
                ${this._activeTab === "overview"
                  ? html`
                      ${this._renderRepo()} ${this._renderSessions()}
                      ${this._renderWorkspaces()}
                    `
                  : nothing}
                ${this._activeTab === "tasks"
                  ? html`
                      <task-board
                        project-id=${this.projectId}
                        .sessions=${this._sessions}
                      ></task-board>
                    `
                  : nothing}
                ${this._activeTab === "requirements"
                  ? this._renderRequirements()
                  : nothing}
                ${this._activeTab === "requests"
                  ? this._renderRequests()
                  : nothing}
                ${this._activeTab === "plans" ? this._renderPlans() : nothing}
                ${this._activeTab === "agents" ? this._renderAgents() : nothing}
                ${this._activeTab === "invocations"
                  ? this._renderInvocationsTab()
                  : nothing}
                ${this._activeTab === "workspaces"
                  ? this._renderWorkspacesTab()
                  : nothing}
                ${this._activeTab === "automations"
                  ? html`<automation-panel
                      .projectId=${this._project!.id}
                    ></automation-panel>`
                  : nothing}
                ${this._activeTab === "settings"
                  ? this._renderSettings()
                  : nothing}
              </div>
            `}
      </div>

      <sl-dialog
        label=${t("workspace.newSession")}
        ?open=${this._showNewSession}
        @sl-after-hide=${() => {
          this._showNewSession = false;
        }}
      >
        <div class="dialog-form">
          <sl-input
            label=${t("workspace.newSession.nameLabel")}
            placeholder=${t("workspace.newSession.namePlaceholder")}
            help-text=${t("workspace.newSession.nameHelp")}
            value=${this._newSessionName}
            @sl-input=${(e: CustomEvent) => {
              this._newSessionName = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._createSession();
            }}
          ></sl-input>
        </div>
        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this._creatingSess}
          @click=${() => void this._createSession()}
        >
          ${t("workspace.newSession.create")}
        </sl-button>
      </sl-dialog>
    `;
  }

  private _renderHeader() {
    const p = this._project!;
    return html`
      <div class="project-header">
        <span
          class="back-link"
          role="button"
          tabindex="0"
          @click=${() => {
            navigateTo("/projects");
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") navigateTo("/projects");
          }}
        >
          <sl-icon name="arrow-left"></sl-icon> ${t("workspace.backToProjects")}
        </span>
        <h1>${p.name}</h1>
        <span class="prefix-badge">${p.ticket_prefix}</span>
      </div>
    `;
  }

  private _renderRepo() {
    const p = this._project!;
    if (!p.repo_url) return nothing;
    return html`
      <div class="repo-info">
        <sl-icon name="github"></sl-icon>
        <a
          class="repo-link"
          href=${p.repo_url}
          target="_blank"
          rel="noopener noreferrer"
          >${p.repo_url}</a
        >
        ${p.default_branch
          ? html`<span class="branch-badge">${p.default_branch}</span>`
          : nothing}
      </div>
    `;
  }

  private _renderSessions() {
    const active = this._sessions.filter((s) => this._onlineCount(s) > 0);
    const inactive = this._sessions.filter((s) => this._onlineCount(s) === 0);

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="people-fill"></sl-icon>
            ${t("workspace.sessions")}
            <sl-badge variant="neutral" pill>${this._sessions.length}</sl-badge>
          </span>
        </div>

        <div class="sessions-grid">
          ${active.map((s) => this._renderSessionCard(s, true))}
          ${inactive.slice(0, 8).map((s) => this._renderSessionCard(s, false))}

          <div
            class="new-session-card"
            role="button"
            tabindex="0"
            @click=${() => {
              this._showNewSession = true;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this._showNewSession = true;
              }
            }}
          >
            <sl-icon name="plus-lg"></sl-icon>
            <span>${t("workspace.newSession")}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSessionCard(s: SessionView, hasOnline: boolean) {
    const online = this._onlineCount(s);
    return html`
      <div
        class="session-card"
        role="button"
        tabindex="0"
        @click=${() => void this._joinSession(s.code)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void this._joinSession(s.code);
          }
        }}
      >
        <div class="card-top">
          <span class="code">${s.code}</span>
          <span class="date">${formatDate(s.created_at)}</span>
        </div>
        <div class="name">${s.name || t("workspace.untitledSession")}</div>
        <div class="participants">
          ${hasOnline ? html`<span class="online-dot"></span>` : nothing}
          <sl-icon name="people"></sl-icon>
          ${hasOnline
            ? html`${t("workspace.online", { count: online })}`
            : html`${t("workspace.participants", {
                count: s.participants.length,
                suffix: s.participants.length !== 1 ? "s" : "",
              })}`}
        </div>
      </div>
    `;
  }

  private _renderRequirements() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="bullseye"></sl-icon>
            ${t("workspace.tab.requirements")}
          </span>
        </div>

        ${this._selectedRequirementId
          ? html`
              <requirement-detail
                .projectId=${this.projectId}
                .requirementId=${this._selectedRequirementId}
                @requirement-back=${() => {
                  this._selectedRequirementId = null;
                  window.history.replaceState(
                    null,
                    "",
                    `/projects/${this.projectId}/requirements`,
                  );
                }}
              ></requirement-detail>
            `
          : html`
              <requirement-list
                .projectId=${this.projectId}
                @requirement-select=${(e: CustomEvent) => {
                  this._selectedRequirementId = e.detail.requirementId;
                  window.history.replaceState(
                    null,
                    "",
                    `/projects/${this.projectId}/requirements/${e.detail.requirementId}`,
                  );
                }}
              ></requirement-list>
            `}
      </div>
    `;
  }

  private _renderRequests() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="chat-square-text"></sl-icon>
            ${t("workspace.tab.requests")}
          </span>
        </div>

        ${this._selectedRequestId
          ? html`
              <request-detail
                .projectId=${this.projectId}
                .requestId=${this._selectedRequestId}
                @request-back=${() => {
                  this._selectedRequestId = null;
                  window.history.replaceState(
                    null,
                    "",
                    `/projects/${this.projectId}/requests`,
                  );
                }}
              ></request-detail>
            `
          : html`
              <request-list
                .projectId=${this.projectId}
                @request-select=${(e: CustomEvent) => {
                  this._selectedRequestId = e.detail.requestId;
                  window.history.replaceState(
                    null,
                    "",
                    `/projects/${this.projectId}/requests/${e.detail.requestId}`,
                  );
                }}
              ></request-list>
            `}
      </div>
    `;
  }

  private _renderPlans() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="file-earmark-text"></sl-icon>
            ${t("workspace.tab.plans")}
            <sl-badge variant="neutral" pill>${this._planCount}</sl-badge>
          </span>
        </div>

        ${this._selectedPlanId
          ? html`
              <plan-detail
                .projectId=${this.projectId}
                .planId=${this._selectedPlanId}
                @plan-back=${() => {
                  this._selectedPlanId = null;
                }}
              ></plan-detail>
            `
          : html`
              <plan-list
                .projectId=${this.projectId}
                @plan-select=${(e: CustomEvent) => {
                  this._selectedPlanId = e.detail.planId;
                }}
              ></plan-list>
            `}
      </div>
    `;
  }

  private _wsStatusVariant(status: string): string {
    switch (status) {
      case "running":
        return "success";
      case "creating":
      case "pending":
        return "warning";
      case "failed":
        return "danger";
      case "stopped":
      case "stopping":
        return "neutral";
      case "destroyed":
        return "neutral";
      default:
        return "neutral";
    }
  }

  private _renderWorkspaces() {
    // Only show if there are workspaces (Coder might not be configured)
    const active = this._workspaces.filter((w) => w.status !== "destroyed");
    if (active.length === 0) return nothing;

    const orgSlug =
      (this.location?.params as Record<string, string>)?.slug ?? "";

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="terminal"></sl-icon>
            ${t("workspace.workspaces")}
            <sl-badge variant="neutral" pill>${active.length}</sl-badge>
          </span>
        </div>

        <div class="workspace-list">
          ${active.map(
            (w) => html`
              <div
                class="workspace-row"
                @click=${(e: MouseEvent) => {
                  // Don't navigate if an action button was clicked
                  if ((e.target as HTMLElement).closest(".ws-actions")) return;
                  this._selectedWorkspaceId = w.id;
                  this._switchTab("workspaces");
                  const base = orgSlug
                    ? `/orgs/${orgSlug}/projects/${this.projectId}/workspaces/${w.id}`
                    : `/projects/${this.projectId}/workspaces/${w.id}`;
                  window.history.replaceState(null, "", base);
                }}
              >
                <span class="ws-name"
                  >${w.coder_workspace_name ?? w.id.slice(0, 8)}</span
                >
                ${w.participant_name
                  ? html`<span class="ws-participant-name"
                      >${w.participant_name}</span
                    >`
                  : nothing}
                <sl-badge variant=${this._wsStatusVariant(w.status)}
                  >${w.status}</sl-badge
                >
                <span class="ws-template">${w.template_name}</span>
                ${w.branch
                  ? html`<span class="ws-branch">${w.branch}</span>`
                  : nothing}
                ${w.error_message
                  ? html`
                      <sl-tooltip content=${w.error_message}>
                        <span class="ws-error">${w.error_message}</span>
                      </sl-tooltip>
                    `
                  : nothing}
                <span style="flex: 1;"></span>
                ${w.started_at
                  ? html`
                      <span
                        style="font-size: 0.75rem; color: var(--text-tertiary);"
                      >
                        ${t("workspace.started", {
                          time: relativeTime(w.started_at),
                        })}
                      </span>
                    `
                  : nothing}
                <div class="ws-actions">
                  ${w.status === "running"
                    ? html`
                        <sl-tooltip content="Stop workspace">
                          <sl-icon-button
                            name="stop-circle"
                            label="Stop workspace"
                            style="font-size: 1rem; color: var(--sl-color-warning-500);"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              void this._stopWorkspace(w.id);
                            }}
                          ></sl-icon-button>
                        </sl-tooltip>
                      `
                    : ["pending", "creating", "failed", "stopped"].includes(
                          w.status,
                        )
                      ? html`
                          <sl-tooltip content="Destroy workspace">
                            <sl-icon-button
                              name="trash"
                              label="Destroy workspace"
                              style="font-size: 1rem; color: var(--sl-color-danger-500);"
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                void this._destroyWorkspace(w.id);
                              }}
                            ></sl-icon-button>
                          </sl-tooltip>
                        `
                      : nothing}
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private async _stopWorkspace(workspaceId: string) {
    try {
      await stopWorkspace(this.projectId, workspaceId);
      this._workspaces = this._workspaces.map((w) =>
        w.id === workspaceId ? { ...w, status: "stopping" as const } : w,
      );
    } catch (err) {
      console.error("Failed to stop workspace", err);
    }
  }

  private async _destroyWorkspace(workspaceId: string) {
    try {
      await destroyWorkspace(this.projectId, workspaceId);
      this._workspaces = this._workspaces.filter((w) => w.id !== workspaceId);
    } catch (err) {
      console.error("Failed to destroy workspace", err);
    }
  }

  private _renderTabNav() {
    const tab = (id: string, label: string, icon: string) => html`
      <button
        class="tab-btn ${this._activeTab === id ? "active" : ""}"
        @click=${() => {
          this._switchTab(id);
        }}
      >
        <sl-icon name=${icon}></sl-icon> ${label}
      </button>
    `;
    return html`
      <nav class="tab-nav">
        ${tab("overview", t("workspace.tab.overview"), "grid-1x2")}
        ${tab("tasks", t("workspace.tab.tasks"), "kanban")}
        ${tab("requirements", t("workspace.tab.requirements"), "bullseye")}
        ${tab("requests", t("workspace.tab.requests"), "chat-square-text")}
        ${tab("plans", t("workspace.tab.plans"), "file-earmark-text")}
        ${tab("agents", t("workspace.tab.agents"), "robot")}
        ${tab("invocations", t("workspace.tab.invocations"), "play-circle")}
        ${tab("workspaces", t("workspace.tab.workspaces"), "terminal")}
        ${tab("graph", t("workspace.tab.graph"), "diagram-3")}
        ${tab(
          "automations",
          t("workspace.tab.automations"),
          "lightning-charge",
        )}
        ${tab("settings", t("workspace.tab.settings"), "gear")}
      </nav>
    `;
  }

  private _switchTab(tab: string, updateUrl = true) {
    this._activeTab = tab;
    if (updateUrl) {
      const path =
        tab === "overview"
          ? `/projects/${this.projectId}`
          : `/projects/${this.projectId}/${tab}`;
      window.history.replaceState(null, "", path);
    }
    if (tab === "settings") {
      this._initSettingsForm();
      this._loadCoderStatus();
    }
    if (tab === "graph") {
      void ensureGraphLoaded();
    }
  }

  private _initSettingsForm() {
    const p = this._project;
    if (!p) return;
    this._settingsName = p.name;
    this._settingsPrefix = p.ticket_prefix;
    this._settingsRepoUrl = p.repo_url ?? "";
    this._settingsDefaultBranch = p.default_branch ?? "";
    this._settingsMsg = "";
  }

  private async _loadCoderStatus() {
    this._coderLoading = true;
    try {
      this._coderStatus = await fetchCoderStatus();
    } catch {
      this._coderStatus = null;
    } finally {
      this._coderLoading = false;
    }
  }

  private async _saveSettings() {
    this._settingsSaving = true;
    this._settingsMsg = "";
    try {
      const updated = await updateProject(this.projectId, {
        name: this._settingsName.trim(),
        ticket_prefix: this._settingsPrefix.trim(),
        repo_url: this._settingsRepoUrl.trim() || undefined,
        default_branch: this._settingsDefaultBranch.trim() || undefined,
      });
      this._project = updated;
      this._settingsMsg = t("workspace.settings.saved");
      this._settingsMsgVariant = "success";
    } catch (err) {
      this._settingsMsg =
        err instanceof Error ? err.message : t("workspace.settings.errorSave");
      this._settingsMsgVariant = "danger";
    } finally {
      this._settingsSaving = false;
    }
  }

  private _renderAgents() {
    const orgSlug =
      (this.location?.params as Record<string, string>)?.slug ?? "";
    const agentsBase = orgSlug
      ? `/orgs/${orgSlug}/projects/${this.projectId}/agents`
      : `/projects/${this.projectId}/agents`;

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="robot"></sl-icon>
            ${t("workspace.tab.agents")}
          </span>
        </div>

        ${this._selectedAgentId
          ? html`
              <agent-detail
                .projectId=${this.projectId}
                .agentId=${this._selectedAgentId}
                @agent-back=${() => {
                  this._selectedAgentId = null;
                  window.history.replaceState(null, "", agentsBase);
                }}
              ></agent-detail>
            `
          : html`
              <agent-list
                .projectId=${this.projectId}
                .sessions=${this._sessions}
                @agent-select=${(e: CustomEvent) => {
                  this._selectedAgentId = e.detail.agentId;
                  window.history.replaceState(
                    null,
                    "",
                    `${agentsBase}/${e.detail.agentId}`,
                  );
                }}
              ></agent-list>
            `}
      </div>
    `;
  }

  private _renderInvocationsTab() {
    const onContinue = (e: CustomEvent) => {
      const dialog = this.shadowRoot?.querySelector("invoke-dialog");
      if (dialog) {
        (dialog as any).showContinue({
          claude_session_id: e.detail.claude_session_id,
          agent_perspective: e.detail.agent_perspective,
        });
      }
    };

    return html`
      ${this._selectedInvocationId
        ? html`
            <invocation-detail
              invocation-id=${this._selectedInvocationId}
              @back=${() => {
                this._selectedInvocationId = "";
              }}
              @continue-invocation=${onContinue}
            ></invocation-detail>
          `
        : html`
            <invocation-list
              project-id=${this.projectId}
              @invocation-select=${(e: CustomEvent) => {
                this._selectedInvocationId = e.detail.id;
              }}
              @invoke-request=${() => {
                const dialog = this.shadowRoot?.querySelector("invoke-dialog");
                if (dialog) (dialog as any).show();
              }}
            ></invocation-list>
          `}
      <invoke-dialog
        project-id=${this.projectId}
        @invocation-created=${(e: CustomEvent) => {
          this._selectedInvocationId = e.detail.invocation.id;
        }}
      ></invoke-dialog>
    `;
  }

  private _renderWorkspacesTab() {
    const orgSlug =
      (this.location?.params as Record<string, string>)?.slug ?? "";

    if (this._selectedWorkspaceId) {
      return html`
        <workspace-detail
          .projectId=${this.projectId}
          .workspaceId=${this._selectedWorkspaceId}
          @workspace-back=${() => {
            this._selectedWorkspaceId = "";
            const base = orgSlug
              ? `/orgs/${orgSlug}/projects/${this.projectId}/workspaces`
              : `/projects/${this.projectId}/workspaces`;
            window.history.replaceState(null, "", base);
          }}
        ></workspace-detail>
      `;
    }

    return html`
      <workspace-list
        .projectId=${this.projectId}
        @workspace-select=${(e: CustomEvent) => {
          this._selectedWorkspaceId = e.detail.workspaceId;
          const base = orgSlug
            ? `/orgs/${orgSlug}/projects/${this.projectId}/workspaces/${e.detail.workspaceId}`
            : `/projects/${this.projectId}/workspaces/${e.detail.workspaceId}`;
          window.history.replaceState(null, "", base);
        }}
      ></workspace-list>
    `;
  }

  private _renderSettings() {
    return html`
      <div class="settings-panel">
        <div class="settings-section">
          <h3>${t("workspace.settings.title")}</h3>
          <div class="settings-form">
            <sl-input
              label=${t("workspace.settings.nameLabel")}
              value=${this._settingsName}
              @sl-input=${(e: CustomEvent) => {
                this._settingsName = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.prefixLabel")}
              value=${this._settingsPrefix}
              @sl-input=${(e: CustomEvent) => {
                this._settingsPrefix = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.repoLabel")}
              placeholder=${t("workspace.settings.repoPlaceholder")}
              value=${this._settingsRepoUrl}
              @sl-input=${(e: CustomEvent) => {
                this._settingsRepoUrl = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.branchLabel")}
              placeholder=${t("workspace.settings.branchPlaceholder")}
              value=${this._settingsDefaultBranch}
              @sl-input=${(e: CustomEvent) => {
                this._settingsDefaultBranch = (
                  e.target as HTMLInputElement
                ).value;
              }}
            ></sl-input>
            <div class="settings-actions">
              <sl-button
                variant="primary"
                ?loading=${this._settingsSaving}
                @click=${() => void this._saveSettings()}
              >
                ${t("workspace.settings.save")}
              </sl-button>
              ${this._settingsMsg
                ? html`
                    <sl-alert
                      variant=${this._settingsMsgVariant}
                      open
                      duration="4000"
                      @sl-after-hide=${() => {
                        this._settingsMsg = "";
                      }}
                    >
                      ${this._settingsMsg}
                    </sl-alert>
                  `
                : nothing}
            </div>
          </div>
        </div>

        <sl-divider></sl-divider>

        <div class="settings-section">
          <h3>${t("workspace.coder.title")}</h3>
          ${this._coderLoading
            ? html`
                <div
                  style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-tertiary); font-size: 0.85rem;"
                >
                  <sl-spinner style="font-size: 1rem;"></sl-spinner> ${t(
                    "workspace.coder.loading",
                  )}
                </div>
              `
            : this._coderStatus
              ? html`
                  <div class="coder-info">
                    <div class="coder-row">
                      <span class="coder-label"
                        >${t("workspace.coder.status")}</span
                      >
                      ${this._coderStatus.connected
                        ? html`<sl-badge variant="success"
                            >${t("workspace.coder.connected")}</sl-badge
                          >`
                        : this._coderStatus.enabled
                          ? html`<sl-badge variant="warning"
                              >${t(
                                "workspace.coder.enabledNotConnected",
                              )}</sl-badge
                            >`
                          : html`<sl-badge variant="neutral"
                              >${t("workspace.coder.disabled")}</sl-badge
                            >`}
                    </div>
                    ${this._coderStatus.url
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.url")}</span
                            >
                            <span class="coder-value"
                              >${this._coderStatus.url}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.user
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.user")}</span
                            >
                            <span class="coder-value"
                              >${this._coderStatus.user}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.error
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.error")}</span
                            >
                            <span
                              style="color: var(--sl-color-danger-500); font-size: 0.85rem;"
                              >${this._coderStatus.error}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.templates.length > 0
                      ? html`
                          <div
                            class="coder-row"
                            style="align-items: flex-start;"
                          >
                            <span class="coder-label"
                              >${t("workspace.coder.templates")}</span
                            >
                            <div class="template-list">
                              ${this._coderStatus.templates.map(
                                (tmpl) =>
                                  html`<span class="template-chip"
                                    >${tmpl}</span
                                  >`,
                              )}
                            </div>
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : html`
                  <div style="color: var(--text-tertiary); font-size: 0.85rem;">
                    ${t("workspace.coder.loadError")}
                  </div>
                `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "project-workspace": ProjectWorkspace;
  }
}
