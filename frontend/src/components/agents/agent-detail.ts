import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchProjectAgent, type ProjectAgentDetailView } from '../../state/agent-api.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

import '../shared/markdown-content.js';
import './agent-activity-panel.js';

const WS_STATUS_VARIANT: Record<string, string> = {
  running: 'success',
  creating: 'warning',
  pending: 'warning',
  failed: 'danger',
  stopped: 'neutral',
  stopping: 'neutral',
};

@customElement('agent-detail')
export class AgentDetail extends LitElement {
  static styles = css`
    :host { display: block; }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
    }
    .back-link:hover { color: var(--sl-color-primary-400); }

    .agent-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-indicator.online { background: var(--sl-color-success-500); box-shadow: 0 0 6px var(--sl-color-success-500); }
    .status-indicator.offline { background: var(--sl-color-neutral-400); }

    .agent-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      flex: 1;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

    /* Task section */
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

    .section-title sl-icon { font-size: 0.9rem; }

    .task-card {
      padding: 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .task-ticket {
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
      color: var(--sl-color-primary-400);
      font-weight: 600;
    }

    .task-title {
      flex: 1;
      color: var(--text-primary);
      font-weight: 500;
    }

    /* Workspace section */
    .workspace-card {
      padding: 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
    }

    .ws-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.9rem;
      color: var(--text-primary);
      font-weight: 600;
    }

    .ws-details {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .ws-detail {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .ws-error {
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(239, 68, 68, 0.08);
      border-radius: var(--sl-border-radius-medium);
      color: var(--sl-color-danger-500);
      font-size: 0.8rem;
    }

    /* Activity timeline */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .timeline-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.85rem;
    }

    .timeline-item:last-child { border-bottom: none; }

    .timeline-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      min-width: 5rem;
      flex-shrink: 0;
      text-align: right;
    }

    .timeline-event {
      font-size: 0.75rem;
      font-family: var(--sl-font-mono);
      color: var(--sl-color-primary-400);
      min-width: 8rem;
      flex-shrink: 0;
    }

    .timeline-summary {
      color: var(--text-primary);
      flex: 1;
    }

    /* Comments */
    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .comment-card {
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
    }

    .comment-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.8rem;
    }

    .comment-ticket {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      font-weight: 600;
    }

    .comment-task-title {
      color: var(--text-secondary);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .comment-time {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .comment-content {
      font-size: 0.85rem;
      color: var(--text-primary);
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 8rem;
      overflow: hidden;
    }

    .empty-hint {
      color: var(--text-tertiary);
      font-size: 0.85rem;
      font-style: italic;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .branch-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }
  `;

  @property() projectId = '';
  @property() agentId = '';

  @state() private _detail: ProjectAgentDetailView | null = null;
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _agentState = '';

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if ((changed.has('projectId') || changed.has('agentId')) && this.projectId && this.agentId) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId || !this.agentId) return;
    this._loading = true;
    this._error = '';
    try {
      this._detail = await fetchProjectAgent(this.projectId, this.agentId);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load agent';
    } finally {
      this._loading = false;
    }
  }

  private _relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  private _goBack() {
    this.dispatchEvent(new CustomEvent('agent-back', { bubbles: true, composed: true }));
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner style="font-size: 1.5rem;"></sl-spinner></div>`;
    }

    if (this._error) {
      return html`
        <span class="back-link" role="button" tabindex="0" @click=${this._goBack}>
          <sl-icon name="arrow-left"></sl-icon> Back to agents
        </span>
        <sl-alert variant="danger" open>${this._error}</sl-alert>
      `;
    }

    if (!this._detail) return nothing;

    const { agent, recent_activity, recent_comments } = this._detail;
    const isOnline = agent.is_online;

    return html`
      <span class="back-link" role="button" tabindex="0"
            @click=${this._goBack}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._goBack(); }}>
        <sl-icon name="arrow-left"></sl-icon> Back to agents
      </span>

      <div class="agent-header">
        <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
        <h2>${agent.display_name}</h2>
        <sl-badge variant=${isOnline ? 'success' : 'neutral'}>${isOnline ? 'Online' : 'Offline'}</sl-badge>
      </div>

      <div class="info-grid">
        ${agent.model ? html`
          <div class="info-card">
            <div class="info-label">Model</div>
            <div class="info-value mono">${agent.model}</div>
          </div>
        ` : nothing}
        ${agent.client_name ? html`
          <div class="info-card">
            <div class="info-label">Client</div>
            <div class="info-value mono">${agent.client_name}${agent.client_version ? ` v${agent.client_version}` : ''}</div>
          </div>
        ` : nothing}
        <div class="info-card">
          <div class="info-label">Session</div>
          <div class="info-value">${agent.session_name || agent.session_code}</div>
        </div>
        ${agent.sponsor_name ? html`
          <div class="info-card">
            <div class="info-label">Sponsored by</div>
            <div class="info-value">${agent.sponsor_name}</div>
          </div>
        ` : nothing}
        <div class="info-card">
          <div class="info-label">Joined</div>
          <div class="info-value">${this._relativeTime(agent.joined_at)}</div>
        </div>
        ${agent.disconnected_at ? html`
          <div class="info-card">
            <div class="info-label">Disconnected</div>
            <div class="info-value">${this._relativeTime(agent.disconnected_at)}</div>
          </div>
        ` : nothing}
      </div>

      ${this._renderTask(agent)}
      ${this._renderWorkspace(agent)}

      ${isOnline ? html`
        <div class="section">
          <div class="section-title">
            <sl-icon name="terminal"></sl-icon> Live Activity
            ${this._agentState ? html`
              <sl-badge variant=${this._agentState === 'working' ? 'primary' : this._agentState === 'idle' ? 'neutral' : 'warning'}>
                ${this._agentState}
              </sl-badge>
            ` : nothing}
          </div>
          <agent-activity-panel
            .sessionCode=${agent.session_code}
            .participantId=${agent.id}
            .workspaceId=${agent.workspace?.id ?? ''}
            @agent-state-change=${(e: CustomEvent) => { this._agentState = e.detail.state; }}
          ></agent-activity-panel>
        </div>
      ` : nothing}

      ${this._renderActivity(recent_activity)}
      ${this._renderComments(recent_comments)}
    `;
  }

  private _renderTask(agent: ProjectAgentDetailView['agent']) {
    if (!agent.current_task) return nothing;
    const t = agent.current_task;
    return html`
      <div class="section">
        <div class="section-title">
          <sl-icon name="kanban"></sl-icon> Current Task
        </div>
        <div class="task-card">
          <span class="task-ticket">${t.ticket_id}</span>
          <span class="task-title">${t.title}</span>
          <sl-badge variant=${t.status === 'in_progress' ? 'primary' : 'neutral'}>
            ${t.status.replace('_', ' ')}
          </sl-badge>
        </div>
      </div>
    `;
  }

  private _renderWorkspace(agent: ProjectAgentDetailView['agent']) {
    if (!agent.workspace) return nothing;
    const ws = agent.workspace;
    return html`
      <div class="section">
        <div class="section-title">
          <sl-icon name="terminal"></sl-icon> Workspace
        </div>
        <div class="workspace-card">
          <div class="ws-header">
            <sl-icon name="terminal" style="color: var(--text-tertiary);"></sl-icon>
            <span class="ws-name">${ws.coder_workspace_name ?? 'Workspace'}</span>
            <sl-badge variant=${WS_STATUS_VARIANT[ws.status] ?? 'neutral'}>${ws.status}</sl-badge>
          </div>
          <div class="ws-details">
            ${ws.branch ? html`
              <span class="ws-detail">
                <sl-icon name="git-branch" style="font-size: 0.85rem;"></sl-icon>
                <span class="branch-badge">${ws.branch}</span>
              </span>
            ` : nothing}
            ${ws.started_at ? html`
              <span class="ws-detail">
                <sl-icon name="clock" style="font-size: 0.85rem;"></sl-icon>
                Started ${this._relativeTime(ws.started_at)}
              </span>
            ` : nothing}
          </div>
          ${ws.error_message ? html`
            <div class="ws-error">${ws.error_message}</div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _renderActivity(activity: ProjectAgentDetailView['recent_activity']) {
    return html`
      <div class="section">
        <div class="section-title">
          <sl-icon name="activity"></sl-icon> Recent Activity
          <sl-badge variant="neutral" pill>${activity.length}</sl-badge>
        </div>
        ${activity.length === 0 ? html`
          <span class="empty-hint">No activity recorded yet.</span>
        ` : html`
          <div class="timeline">
            ${activity.slice(0, 20).map(a => html`
              <div class="timeline-item">
                <span class="timeline-time">${this._relativeTime(a.created_at)}</span>
                <span class="timeline-event">${a.event_type}</span>
                <span class="timeline-summary">${a.summary}</span>
              </div>
            `)}
          </div>
        `}
      </div>
    `;
  }

  private _renderComments(comments: ProjectAgentDetailView['recent_comments']) {
    return html`
      <div class="section">
        <div class="section-title">
          <sl-icon name="chat-dots"></sl-icon> Recent Comments
          <sl-badge variant="neutral" pill>${comments.length}</sl-badge>
        </div>
        ${comments.length === 0 ? html`
          <span class="empty-hint">No comments yet.</span>
        ` : html`
          <div class="comment-list">
            ${comments.slice(0, 15).map(c => html`
              <div class="comment-card">
                <div class="comment-header">
                  <span class="comment-ticket">${c.ticket_id}</span>
                  <span class="comment-task-title">${c.task_title}</span>
                  <span class="comment-time">${this._relativeTime(c.created_at)}</span>
                </div>
                <div class="comment-content">${c.content}</div>
              </div>
            `)}
          </div>
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'agent-detail': AgentDetail;
  }
}
