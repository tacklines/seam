import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchProjectAgents,
  launchAgent,
  type ProjectAgentView,
} from "../../state/agent-api.js";
import { type SessionView } from "../../state/app-state.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

const WS_STATUS_VARIANT: Record<string, string> = {
  running: "success",
  creating: "warning",
  pending: "warning",
  failed: "danger",
  stopped: "neutral",
  stopping: "neutral",
  destroyed: "neutral",
};

const TASK_STATUS_VARIANT: Record<string, string> = {
  open: "neutral",
  in_progress: "primary",
  done: "success",
  closed: "neutral",
};

@customElement("agent-list")
export class AgentList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 0.75rem;
    }

    .agent-card {
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: var(--surface-card);
      cursor: pointer;
      transition:
        border-color 0.2s,
        box-shadow 0.2s,
        transform 0.15s;
    }

    .agent-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .agent-card.online {
      border-left: 3px solid var(--sl-color-success-500);
    }

    .agent-card.offline {
      opacity: 0.7;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.online {
      background: var(--sl-color-success-500);
    }
    .status-dot.offline {
      background: var(--sl-color-neutral-400);
    }

    .agent-name {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .model-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.7rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .meta-item sl-icon {
      font-size: 0.85rem;
    }

    .task-section {
      padding: 0.6rem 0.75rem;
      background: var(--surface-1, #111320);
      border-radius: var(--sl-border-radius-medium);
      margin-bottom: 0.5rem;
    }

    .task-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
      margin-bottom: 0.35rem;
    }

    .task-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .task-ticket {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      flex-shrink: 0;
    }

    .task-title {
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .workspace-section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .workspace-section sl-icon {
      font-size: 0.85rem;
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2.5rem;
      display: block;
      margin: 0 auto 1rem;
      opacity: 0.4;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .stats-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: var(--sl-border-radius-pill);
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .stat-chip .count {
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-chip.active {
      border-color: var(--sl-color-success-600);
      background: rgba(34, 197, 94, 0.08);
    }

    .toggle-chip {
      cursor: pointer;
      user-select: none;
    }

    .toggle-chip:hover {
      border-color: var(--color-primary-border);
      color: var(--text-primary);
    }

    .toggle-chip sl-icon {
      font-size: 0.85rem;
    }

    .stats-row-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .stats-chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      z-index: 9999;
      background: var(--sl-color-success-600);
      color: white;
      padding: 0.75rem 1.25rem;
      border-radius: var(--sl-border-radius-medium);
      font-size: 0.875rem;
      box-shadow: var(--shadow-lg);
    }
  `;

  @property() projectId = "";
  @property() sessions: SessionView[] = [];

  @state() private _agents: ProjectAgentView[] = [];
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _showAll = false;

  @state() private _showLaunchDialog = false;
  @state() private _launchSession = "";
  @state() private _launchType = "coder";
  @state() private _launchBranch = "";
  @state() private _launchInstructions = "";
  @state() private _launchLoading = false;
  @state() private _launchError = "";
  @state() private _toastMessage = "";

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("projectId") && this.projectId) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = "";
    try {
      this._agents = await fetchProjectAgents(this.projectId, {
        includeDisconnected: this._showAll,
      });
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("agentList.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _toggleShowAll() {
    this._showAll = !this._showAll;
    this._load();
  }

  private _relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("time.justNow");
    if (mins < 60) return t("time.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("time.hoursAgo", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("time.daysAgo", { count: days });
  }

  private _selectAgent(agent: ProjectAgentView) {
    this.dispatchEvent(
      new CustomEvent("agent-select", {
        detail: { agentId: agent.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    if (this._error) {
      return html`<sl-alert variant="danger" open>${this._error}</sl-alert>`;
    }

    if (this._agents.length === 0) {
      return html`
        <div class="empty-state">
          <sl-icon name="robot"></sl-icon>
          ${t("agentList.empty")}
          <div
            style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-tertiary);"
          >
            ${t("agentList.emptyHint")}
          </div>
        </div>
        ${this._renderLaunchButton()} ${this._renderLaunchDialog()}
        ${this._toastMessage
          ? html`<div class="toast">${this._toastMessage}</div>`
          : nothing}
      `;
    }

    const online = this._agents.filter((a) => a.is_online);
    const offline = this._agents.filter((a) => !a.is_online);

    return html`
      <div class="stats-row-header">
        <div class="stats-chips">
          <div class="stat-chip ${online.length > 0 ? "active" : ""}">
            <span class="count">${online.length}</span> ${t("agentList.online")}
          </div>
          <div class="stat-chip">
            <span class="count">${this._agents.length}</span> ${this._showAll
              ? t("agentList.total")
              : t("agentList.active")}
          </div>
          <div
            class="stat-chip toggle-chip"
            role="button"
            tabindex="0"
            @click=${this._toggleShowAll}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this._toggleShowAll();
            }}
          >
            <sl-icon name=${this._showAll ? "eye-slash" : "eye"}></sl-icon>
            ${this._showAll
              ? t("agentList.hideDisconnected")
              : t("agentList.showAll")}
          </div>
        </div>
        ${this._renderLaunchButton()}
      </div>

      <div class="agent-grid">
        ${online.map((a) => this._renderCard(a))}
        ${offline.map((a) => this._renderCard(a))}
      </div>

      ${this._renderLaunchDialog()}
      ${this._toastMessage
        ? html`<div class="toast">${this._toastMessage}</div>`
        : nothing}
    `;
  }

  private _renderLaunchButton() {
    return html`
      <sl-button
        variant="primary"
        size="small"
        @click=${() => {
          this._showLaunchDialog = true;
          this._launchError = "";
        }}
      >
        <sl-icon slot="prefix" name="rocket-takeoff"></sl-icon>
        ${t("agentList.launchAgent")}
      </sl-button>
    `;
  }

  private _renderLaunchDialog() {
    if (!this._showLaunchDialog) return nothing;
    return html`
      <sl-dialog
        label=${t("agentList.launch.title")}
        ?open=${this._showLaunchDialog}
        @sl-request-close=${() => {
          this._showLaunchDialog = false;
        }}
      >
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-tertiary);">
            ${t("agentList.launch.subtitle")}
          </p>
          ${this._launchError
            ? html`<sl-alert variant="danger" open
                >${this._launchError}</sl-alert
              >`
            : nothing}
          ${this.sessions.length === 0
            ? html`
                <sl-alert variant="warning" open
                  >${t("agentList.launch.noSessions")}</sl-alert
                >
              `
            : html`
                <sl-select
                  label=${t("agentList.launch.sessionLabel")}
                  placeholder=${t("agentList.launch.sessionPlaceholder")}
                  help-text=${t("agentList.launch.sessionHelp")}
                  value=${this._launchSession}
                  @sl-change=${(e: Event) => {
                    this._launchSession = (e.target as HTMLSelectElement).value;
                  }}
                >
                  ${this.sessions.map(
                    (s) => html`
                      <sl-option value=${s.code}>${s.name ?? s.code}</sl-option>
                    `,
                  )}
                </sl-select>
              `}

          <sl-select
            label=${t("agentList.launch.typeLabel")}
            value=${this._launchType}
            @sl-change=${(e: Event) => {
              this._launchType = (e.target as HTMLSelectElement).value;
            }}
          >
            <sl-option value="coder">
              <sl-icon slot="prefix" name="code-slash"></sl-icon>
              ${t("agentList.launch.typeCoder")}
            </sl-option>
            <sl-option value="planner">
              <sl-icon slot="prefix" name="diagram-3"></sl-icon>
              ${t("agentList.launch.typePlanner")}
            </sl-option>
            <sl-option value="reviewer">
              <sl-icon slot="prefix" name="search"></sl-icon>
              ${t("agentList.launch.typeReviewer")}
            </sl-option>
          </sl-select>

          <sl-input
            label=${t("agentList.launch.branchLabel")}
            placeholder=${t("agentList.launch.branchPlaceholder")}
            help-text=${t("agentList.launch.branchHelp")}
            value=${this._launchBranch}
            @sl-input=${(e: Event) => {
              this._launchBranch = (e.target as HTMLInputElement).value;
            }}
          ></sl-input>

          <sl-textarea
            label=${t("agentList.launch.instructionsLabel")}
            placeholder=${t("agentList.launch.instructionsPlaceholder")}
            value=${this._launchInstructions}
            @sl-input=${(e: Event) => {
              this._launchInstructions = (
                e.target as HTMLTextAreaElement
              ).value;
            }}
            rows="3"
          ></sl-textarea>
        </div>

        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this._launchLoading}
          ?disabled=${!this._launchSession}
          @click=${() => this._handleLaunch()}
        >
          <sl-icon slot="prefix" name="rocket-takeoff"></sl-icon>
          ${t("agentList.launch.submit")}
        </sl-button>
      </sl-dialog>
    `;
  }

  private async _handleLaunch() {
    if (!this._launchSession) return;
    this._launchLoading = true;
    this._launchError = "";
    try {
      const result = await launchAgent(this._launchSession, {
        agent_type: this._launchType,
        branch: this._launchBranch || undefined,
        instructions: this._launchInstructions || undefined,
      });
      this._showLaunchDialog = false;
      this._launchSession = "";
      this._launchType = "coder";
      this._launchBranch = "";
      this._launchInstructions = "";
      this._toastMessage = t("agentList.launch.success", {
        branch: result.branch,
      });
      setTimeout(() => {
        this._toastMessage = "";
      }, 4000);
      await this._load();
    } catch (err) {
      this._launchError =
        err instanceof Error ? err.message : t("agentList.launch.error");
    } finally {
      this._launchLoading = false;
    }
  }

  private _renderCard(agent: ProjectAgentView) {
    const isOnline = agent.is_online;
    return html`
      <div
        class="agent-card ${isOnline ? "online" : "offline"}"
        role="button"
        tabindex="0"
        @click=${() => this._selectAgent(agent)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter") this._selectAgent(agent);
        }}
      >
        <div class="card-header">
          <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
          <span class="agent-name">${agent.display_name}</span>
          ${agent.model
            ? html`<span class="model-badge">${agent.model}</span>`
            : nothing}
        </div>

        <div class="card-meta">
          <span class="meta-item">
            <sl-icon name="people"></sl-icon>
            ${agent.session_name || agent.session_code}
          </span>
          ${agent.sponsor_name
            ? html`
                <span class="meta-item">
                  <sl-icon name="person"></sl-icon>
                  ${agent.sponsor_name}
                </span>
              `
            : nothing}
          ${agent.client_name
            ? html`
                <span class="meta-item">
                  <sl-icon name="cpu"></sl-icon>
                  ${agent.client_name}${agent.client_version
                    ? ` v${agent.client_version}`
                    : ""}
                </span>
              `
            : nothing}
          <span class="meta-item">
            <sl-icon name="clock"></sl-icon>
            ${this._relativeTime(agent.joined_at)}
          </span>
        </div>

        ${agent.current_task
          ? html`
              <div class="task-section">
                <div class="task-label">${t("agentList.workingOn")}</div>
                <div class="task-info">
                  <span class="task-ticket"
                    >${agent.current_task.ticket_id}</span
                  >
                  <span class="task-title">${agent.current_task.title}</span>
                  <sl-badge
                    variant=${TASK_STATUS_VARIANT[agent.current_task.status] ??
                    "neutral"}
                  >
                    ${agent.current_task.status.replace("_", " ")}
                  </sl-badge>
                </div>
              </div>
            `
          : nothing}
        ${agent.workspace
          ? html`
              <div class="workspace-section">
                <sl-icon name="terminal"></sl-icon>
                <span class="ws-name"
                  >${agent.workspace.coder_workspace_name ??
                  t("agentDetail.workspaceFallback")}</span
                >
                <sl-badge
                  variant=${WS_STATUS_VARIANT[agent.workspace.status] ??
                  "neutral"}
                >
                  ${agent.workspace.status}
                </sl-badge>
                ${agent.workspace.branch
                  ? html`
                      <span class="model-badge">${agent.workspace.branch}</span>
                    `
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-list": AgentList;
  }
}
