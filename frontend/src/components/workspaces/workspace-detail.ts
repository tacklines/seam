import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchWorkspace,
  fetchWorkspaceEvents,
  stopWorkspace,
  destroyWorkspace,
  type WorkspaceView,
  type WorkspaceEvent,
} from "../../state/workspace-api.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";

import "../agents/agent-activity-panel.js";

const WS_STATUS_VARIANT: Record<string, string> = {
  running: "success",
  creating: "warning",
  pending: "warning",
  failed: "danger",
  stopped: "neutral",
  stopping: "neutral",
  destroyed: "neutral",
};

@customElement("workspace-detail")
export class WorkspaceDetail extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
    }

    .back-link:hover {
      color: var(--sl-color-primary-400);
    }

    .ws-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .ws-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
      flex: 1;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .info-card {
      padding: 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
    }

    .info-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
      margin-bottom: 0.35rem;
    }

    .info-value {
      font-size: 0.9rem;
      color: var(--text-primary);
      font-weight: 500;
    }

    .info-value.mono {
      font-family: var(--sl-font-mono);
      font-size: 0.85rem;
    }

    .section {
      margin-bottom: 1.5rem;
    }

    .section-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-title sl-icon {
      font-size: 0.9rem;
    }

    /* Events timeline */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .timeline-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.85rem;
      align-items: flex-start;
    }

    .timeline-item:last-child {
      border-bottom: none;
    }

    .timeline-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      min-width: 5rem;
      flex-shrink: 0;
      text-align: right;
      padding-top: 0.1rem;
    }

    .timeline-event {
      font-size: 0.75rem;
      font-family: var(--sl-font-mono);
      color: var(--sl-color-primary-400);
      min-width: 10rem;
      flex-shrink: 0;
      padding-top: 0.1rem;
    }

    .timeline-payload {
      color: var(--text-secondary);
      font-size: 0.8rem;
      flex: 1;
      word-break: break-word;
    }

    .empty-hint {
      color: var(--text-tertiary);
      font-size: 0.85rem;
      font-style: italic;
    }
  `;

  @property() projectId = "";
  @property() workspaceId = "";

  @state() private _workspace: WorkspaceView | null = null;
  @state() private _events: WorkspaceEvent[] = [];
  @state() private _loading = true;
  @state() private _error = "";
  private _refreshTimer: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearRefreshTimer();
  }

  updated(changed: Map<string, unknown>) {
    if (
      (changed.has("projectId") || changed.has("workspaceId")) &&
      this.projectId &&
      this.workspaceId
    ) {
      void this._load();
    }
  }

  private async _load() {
    if (!this.projectId || !this.workspaceId) return;
    this._loading = true;
    this._error = "";
    try {
      const [workspace, events] = await Promise.all([
        fetchWorkspace(this.projectId, this.workspaceId),
        fetchWorkspaceEvents(this.projectId, this.workspaceId).catch(
          () => [] as WorkspaceEvent[],
        ),
      ]);
      this._workspace = workspace;
      this._events = events;
      this._scheduleRefreshIfNeeded();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : "Failed to load workspace";
    } finally {
      this._loading = false;
    }
  }

  private _scheduleRefreshIfNeeded() {
    this._clearRefreshTimer();
    const status = this._workspace?.status;
    if (status && ["pending", "creating", "stopping"].includes(status)) {
      this._refreshTimer = window.setTimeout(() => {
        void this._load();
      }, 5000);
    }
  }

  private _clearRefreshTimer() {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
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

  private _goBack() {
    this.dispatchEvent(
      new CustomEvent("workspace-back", { bubbles: true, composed: true }),
    );
  }

  private async _stopWorkspace() {
    if (!this._workspace) return;
    try {
      await stopWorkspace(this.projectId, this._workspace.id);
      this._workspace = { ...this._workspace, status: "stopping" };
    } catch (err) {
      console.error("Failed to stop workspace", err);
    }
  }

  private async _destroyWorkspace() {
    if (!this._workspace) return;
    try {
      await destroyWorkspace(this.projectId, this._workspace.id);
      this._goBack();
    } catch (err) {
      console.error("Failed to destroy workspace", err);
    }
  }

  private _payloadSummary(payload: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(payload)) {
      if (v === null || v === undefined) continue;
      const str = typeof v === "string" ? v : JSON.stringify(v);
      parts.push(`${k}: ${str}`);
      if (parts.length >= 3) break;
    }
    return parts.join(" · ");
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner style="font-size: 1.5rem;"></sl-spinner>
      </div>`;
    }

    if (this._error) {
      return html`
        <span
          class="back-link"
          role="button"
          tabindex="0"
          @click=${this._goBack}
        >
          <sl-icon name="arrow-left"></sl-icon> ${t("workspaceDetail.back")}
        </span>
        <sl-alert variant="danger" open>${this._error}</sl-alert>
      `;
    }

    if (!this._workspace) return nothing;

    const ws = this._workspace;

    return html`
      <span
        class="back-link"
        role="button"
        tabindex="0"
        @click=${this._goBack}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter") this._goBack();
        }}
      >
        <sl-icon name="arrow-left"></sl-icon> ${t("workspaceDetail.back")}
      </span>

      <div class="ws-header">
        <h2>${ws.coder_workspace_name ?? ws.id.slice(0, 8)}</h2>
        <sl-badge variant=${WS_STATUS_VARIANT[ws.status] ?? "neutral"}>
          ${ws.status}
        </sl-badge>
        <div class="header-actions">
          ${ws.status === "running"
            ? html`
                <sl-button
                  size="small"
                  variant="warning"
                  @click=${() => void this._stopWorkspace()}
                >
                  <sl-icon slot="prefix" name="stop-circle"></sl-icon>
                  ${t("workspaceDetail.stop")}
                </sl-button>
              `
            : nothing}
          ${["pending", "creating", "failed", "stopped"].includes(ws.status)
            ? html`
                <sl-button
                  size="small"
                  variant="danger"
                  @click=${() => void this._destroyWorkspace()}
                >
                  <sl-icon slot="prefix" name="trash"></sl-icon>
                  ${t("workspaceDetail.destroy")}
                </sl-button>
              `
            : nothing}
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">${t("workspaceDetail.status")}</div>
          <div class="info-value">
            <sl-badge variant=${WS_STATUS_VARIANT[ws.status] ?? "neutral"}>
              ${ws.status}
            </sl-badge>
          </div>
        </div>
        <div class="info-card">
          <div class="info-label">${t("workspaceDetail.template")}</div>
          <div class="info-value mono">${ws.template_name}</div>
        </div>
        ${ws.branch
          ? html`
              <div class="info-card">
                <div class="info-label">${t("workspaceDetail.branch")}</div>
                <div class="info-value mono">${ws.branch}</div>
              </div>
            `
          : nothing}
        ${ws.started_at
          ? html`
              <div class="info-card">
                <div class="info-label">${t("workspaceDetail.started")}</div>
                <div class="info-value">
                  ${this._relativeTime(ws.started_at)}
                </div>
              </div>
            `
          : nothing}
        ${ws.stopped_at
          ? html`
              <div class="info-card">
                <div class="info-label">${t("workspaceDetail.stopped")}</div>
                <div class="info-value">
                  ${this._relativeTime(ws.stopped_at)}
                </div>
              </div>
            `
          : nothing}
        ${ws.participant_name
          ? html`
              <div class="info-card">
                <div class="info-label">${t("workspaceDetail.agent")}</div>
                <div class="info-value">${ws.participant_name}</div>
              </div>
            `
          : nothing}
      </div>

      ${ws.error_message
        ? html`
            <div class="section">
              <sl-alert variant="danger" open>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                <strong>${t("workspaceDetail.error")}:</strong>
                ${ws.error_message}
              </sl-alert>
            </div>
          `
        : nothing}
      ${ws.participant_id || ws.status === "running" || ws.status === "creating"
        ? html`
            <div class="section">
              <div class="section-title">
                <sl-icon name="terminal"></sl-icon>
                ${t("workspaceDetail.logs")}
              </div>
              <agent-activity-panel
                .sessionCode=${ws.session_code ?? ""}
                .participantId=${ws.participant_id ?? ""}
                .workspaceId=${ws.id}
              ></agent-activity-panel>
            </div>
          `
        : nothing}

      <div class="section">
        <div class="section-title">
          <sl-icon name="clock-history"></sl-icon>
          ${t("workspaceDetail.events")}
          <sl-badge variant="neutral" pill>${this._events.length}</sl-badge>
        </div>
        ${this._events.length === 0
          ? html`<span class="empty-hint"
              >${t("workspaceDetail.noEvents")}</span
            >`
          : html`
              <div class="timeline">
                ${this._events.map(
                  (ev) => html`
                    <div class="timeline-item">
                      <span class="timeline-time">
                        ${this._relativeTime(ev.occurred_at)}
                      </span>
                      <span class="timeline-event">${ev.event_type}</span>
                      <span class="timeline-payload">
                        ${this._payloadSummary(ev.payload)}
                      </span>
                    </div>
                  `,
                )}
              </div>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-detail": WorkspaceDetail;
  }
}
