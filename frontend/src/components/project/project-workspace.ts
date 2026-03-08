import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  fetchProject,
  fetchProjectSessions,
  type ProjectView,
} from "../../state/project-api.js";
import { fetchPlans } from "../../state/plan-api.js";
import {
  fetchWorkspaces,
  type WorkspaceView,
} from "../../state/workspace-api.js";
import { type SessionView } from "../../state/app-state.js";
import { navigateTo } from "../../router.js";
import type { RouterLocation } from "@vaadin/router";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";

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
import type { InvokeDialog } from "../invocations/invoke-dialog.js";
import "../tasks/task-board.js";
import "../automations/automation-panel.js";
import "./project-overview.js";
import "./project-settings.js";
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

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
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

    /* ── Section headers (used by requirements/requests/plans/agents) ── */
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
  `;

  // Set by @vaadin/router
  location!: RouterLocation;

  @property({ attribute: "project-id" }) projectId = "";
  @property() initialTab = "";

  @state() private _project: ProjectView | null = null;
  @state() private _sessions: SessionView[] = [];
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
  @state() private _activeTab = "overview";

  @query("#project-dispatch-dialog")
  private _projectDispatchDialog!: InvokeDialog;

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
      this._planCount = plans.length;
      this._workspaces = workspaces;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorLoad");
    } finally {
      this._loading = false;
    }
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
    const orgSlug =
      (this.location?.params as Record<string, string>)?.slug ?? "";

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
                      <project-overview
                        project-id=${this.projectId}
                        .project=${this._project}
                        .sessions=${this._sessions}
                        .workspaces=${this._workspaces}
                        orgSlug=${orgSlug}
                        @workspace-select=${(e: CustomEvent) => {
                          this._selectedWorkspaceId = e.detail.workspaceId;
                          this._switchTab("workspaces");
                          const base = orgSlug
                            ? `/orgs/${orgSlug}/projects/${this.projectId}/workspaces/${e.detail.workspaceId}`
                            : `/projects/${this.projectId}/workspaces/${e.detail.workspaceId}`;
                          window.history.replaceState(null, "", base);
                        }}
                        @workspaces-changed=${(e: CustomEvent) => {
                          this._workspaces = e.detail.workspaces;
                        }}
                      ></project-overview>
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
                  ? html`
                      <project-settings
                        project-id=${this.projectId}
                        @project-updated=${(e: CustomEvent) => {
                          this._project = e.detail.project;
                        }}
                      ></project-settings>
                    `
                  : nothing}
              </div>
            `}
      </div>
    `;
  }

  private _handleProjectDispatch(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    switch (action) {
      case "arch-review":
        this._projectDispatchDialog.showWithPerspective(
          "reviewer",
          "Review the architecture of this project. Analyze code organization, design patterns, dependency structure, and suggest improvements.",
        );
        break;
      case "sprint-plan":
        this._projectDispatchDialog.showWithPerspective(
          "planner",
          "Analyze the project's open tasks and create a sprint plan. Prioritize by value and dependency order, identify parallel work opportunities.",
        );
        break;
      case "code-quality":
        this._projectDispatchDialog.showWithPerspective(
          "reviewer",
          "Analyze code quality across the project. Check for security issues, test coverage gaps, dead code, and style inconsistencies.",
        );
        break;
      case "custom":
      default:
        this._projectDispatchDialog.show();
        break;
    }
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
        <sl-dropdown>
          <sl-button
            slot="trigger"
            caret
            variant="primary"
            size="small"
            outline
          >
            <sl-icon slot="prefix" name="robot"></sl-icon>
            ${t("dispatch.project.button")}
          </sl-button>
          <sl-menu
            @sl-select=${(e: CustomEvent) => this._handleProjectDispatch(e)}
          >
            <sl-menu-item value="arch-review">
              <sl-icon slot="prefix" name="diagram-3"></sl-icon>
              ${t("dispatch.project.action.archReview")}
            </sl-menu-item>
            <sl-menu-item value="sprint-plan">
              <sl-icon slot="prefix" name="kanban"></sl-icon>
              ${t("dispatch.project.action.sprintPlan")}
            </sl-menu-item>
            <sl-menu-item value="code-quality">
              <sl-icon slot="prefix" name="search"></sl-icon>
              ${t("dispatch.project.action.codeQuality")}
            </sl-menu-item>
            <sl-divider></sl-divider>
            <sl-menu-item value="custom">
              <sl-icon slot="prefix" name="gear"></sl-icon>
              ${t("dispatch.project.action.custom")}
            </sl-menu-item>
          </sl-menu>
        </sl-dropdown>
      </div>
      <invoke-dialog
        id="project-dispatch-dialog"
        project-id=${this.projectId}
        @invocation-created=${(e: CustomEvent) => {
          this._selectedInvocationId = e.detail.invocation.id;
          this._switchTab("invocations");
        }}
      ></invoke-dialog>
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
              project-id=${this.projectId}
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
    if (tab === "graph") {
      void ensureGraphLoaded();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "project-workspace": ProjectWorkspace;
  }
}
