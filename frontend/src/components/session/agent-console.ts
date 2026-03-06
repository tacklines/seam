import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import {
  fetchMessages,
  sendMessage,
  fetchProjectAgent,
  type MessageView,
  type ProjectAgentDetailView,
} from "../../state/agent-api.js";
import { store, type SessionParticipant } from "../../state/app-state.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/tab-group/tab-group.js";
import "@shoelace-style/shoelace/dist/components/tab/tab.js";
import "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";

import "../agents/agent-activity-panel.js";

const WS_STATUS_VARIANT: Record<string, string> = {
  running: "success",
  creating: "warning",
  pending: "warning",
  failed: "danger",
  stopped: "neutral",
  stopping: "neutral",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return t("time.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  return t("time.daysAgo", { count: Math.floor(hours / 24) });
}

@customElement("agent-console")
export class AgentConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 420px;
      max-width: 100vw;
      z-index: 900;
      pointer-events: none;
    }

    :host([open]) {
      pointer-events: auto;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }

    :host([open]) .backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 420px;
      max-width: 100vw;
      background: var(--surface-1, #111320);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    }

    :host([open]) .panel {
      transform: translateX(0);
    }

    /* -- Header -- */
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .header-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(
        --avatar-agent-gradient,
        linear-gradient(135deg, #6366f1, #a855f7)
      );
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      flex-shrink: 0;
      position: relative;
    }

    .header-avatar .sparkle {
      position: absolute;
      top: -2px;
      right: -2px;
      font-size: 12px;
      filter: drop-shadow(0 0 2px rgba(99, 102, 241, 0.5));
    }

    .header-info {
      flex: 1;
      min-width: 0;
    }

    .header-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.15rem;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
    }

    .status-dot.offline {
      background: var(--text-muted, #6b7280);
    }

    .close-btn {
      flex-shrink: 0;
    }

    /* -- Tab content area -- */
    .tab-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    sl-tab-group {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-group::part(base) {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-group::part(body) {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel {
      overflow: hidden;
    }

    sl-tab-panel[active] {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel::part(base) {
      padding: 0;
    }

    sl-tab-panel[active]::part(base) {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* -- Messages tab -- */
    .messages-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .messages-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .message {
      max-width: 85%;
      padding: 0.5rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      line-height: 1.45;
      word-wrap: break-word;
    }

    .message.sent {
      align-self: flex-end;
      background: var(--sl-color-primary-600);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.received {
      align-self: flex-start;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
    }

    .message-time {
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 0.2rem;
    }

    .message.received .message-time {
      color: var(--text-tertiary);
    }

    .message-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      padding: 2rem;
      text-align: center;
    }

    .message-empty sl-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
      opacity: 0.5;
    }

    /* -- Compose bar -- */
    .compose {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border-subtle);
      background: var(--surface-2, #1a1d2e);
      flex-shrink: 0;
    }

    .compose sl-textarea {
      flex: 1;
    }

    .compose sl-textarea::part(base) {
      background: var(--surface-card);
      border-color: var(--border-subtle);
    }

    .compose sl-textarea::part(textarea) {
      font-size: 0.85rem;
      min-height: 36px;
      max-height: 120px;
    }

    .compose sl-button::part(base) {
      min-height: 36px;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    /* -- Activity tab -- */
    .activity-panel-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0.75rem;
    }

    .activity-panel-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .activity-panel-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
    }

    agent-activity-panel {
      flex: 1;
    }

    /* -- Info tab -- */
    .info-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 1rem;
    }

    .info-section {
      margin-bottom: 1.25rem;
    }

    .info-section-title {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
      margin-bottom: 0.5rem;
    }

    .info-row-grid {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    .info-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row-label {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
      min-width: 5rem;
    }

    .info-row-value {
      font-size: 0.82rem;
      color: var(--text-primary);
      word-break: break-all;
    }

    .info-row-value.mono {
      font-family: var(--sl-font-mono);
    }

    .info-empty-hint {
      color: var(--text-tertiary);
      font-size: 0.82rem;
      font-style: italic;
    }

    /* -- Workspace card (reused in info tab) -- */
    .ws-card {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.75rem 1rem;
    }

    .ws-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.85rem;
      color: var(--text-primary);
      font-weight: 600;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ws-details {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.78rem;
      color: var(--text-tertiary);
    }

    .ws-detail {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .branch-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active, rgba(255, 255, 255, 0.06));
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .ws-error {
      margin-top: 0.5rem;
      padding: 0.4rem 0.6rem;
      background: rgba(239, 68, 68, 0.08);
      border-radius: 4px;
      color: var(--sl-color-danger-500);
      font-size: 0.78rem;
    }

    .ws-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      text-align: center;
    }

    .ws-empty sl-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .ws-task-card {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .ws-task-card .ticket-id {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      flex-shrink: 0;
    }

    .ws-task-card .title {
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    /* -- Timeline (recent activity in info tab) -- */
    .info-timeline {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    .timeline-item {
      display: flex;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.78rem;
    }

    .timeline-item:last-child {
      border-bottom: none;
    }

    .timeline-time {
      font-size: 0.68rem;
      color: var(--text-tertiary);
      min-width: 4rem;
      flex-shrink: 0;
      text-align: right;
    }

    .timeline-event {
      font-size: 0.68rem;
      font-family: var(--sl-font-mono);
      color: var(--sl-color-primary-400);
      min-width: 6.5rem;
      flex-shrink: 0;
    }

    .timeline-summary {
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* -- Comments in info tab -- */
    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .comment-card {
      padding: 0.6rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }

    .comment-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
      font-size: 0.75rem;
    }

    .comment-ticket {
      font-family: var(--sl-font-mono);
      font-size: 0.7rem;
      color: var(--sl-color-primary-400);
      font-weight: 600;
      flex-shrink: 0;
    }

    .comment-task-title {
      color: var(--text-secondary);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .comment-time {
      font-size: 0.68rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .comment-content {
      font-size: 0.82rem;
      color: var(--text-primary);
      line-height: 1.45;
      white-space: pre-wrap;
      max-height: 5rem;
      overflow: hidden;
    }

    @media (max-width: 480px) {
      .panel {
        width: 100vw;
      }
      :host {
        width: 100vw;
      }
    }
  `;

  @property({ type: String, attribute: "session-code" }) sessionCode = "";
  @property({ type: Object }) participant: SessionParticipant | null = null;
  @property({ type: Boolean, reflect: true }) open = false;

  @state() private _messages: MessageView[] = [];
  @state() private _agentDetail: ProjectAgentDetailView | null = null;
  @state() private _loadingMessages = false;
  @state() private _loadingInfo = false;
  @state() private _sendingMessage = false;
  @state() private _messageText = "";
  @state() private _activeTab = "messages";
  @state() private _agentState = "";

  @query(".messages-scroll") private _messagesScroll!: HTMLElement;

  private _storeUnsub: (() => void) | null = null;
  private _refreshInterval: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === "activity-changed" || event.type === "tasks-changed") {
        if (this.open && this.participant) {
          this._loadMessages();
        }
      }
    });
    document.addEventListener("keydown", this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
    this._stopRefresh();
    document.removeEventListener("keydown", this._onKeydown);
  }

  private _onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.open) {
      this._close();
    }
  };

  updated(changed: Map<string, unknown>) {
    if (changed.has("open") || changed.has("participant")) {
      if (this.open && this.participant) {
        this._loadMessages();
        this._loadAgentDetail();
        this._startRefresh();
      } else {
        this._stopRefresh();
      }
    }
  }

  private _startRefresh() {
    this._stopRefresh();
    this._refreshInterval = setInterval(() => {
      if (this.open && this.participant) {
        this._loadMessages();
        this._loadAgentDetail();
      }
    }, 10000);
  }

  private _stopRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  private async _loadMessages() {
    if (!this.sessionCode || !this.participant) return;
    try {
      this._loadingMessages = this._messages.length === 0;
      this._messages = await fetchMessages(
        this.sessionCode,
        this.participant.id,
        { limit: 100 },
      );
      await this.updateComplete;
      this._scrollToBottom();
    } catch {
      // silent
    } finally {
      this._loadingMessages = false;
    }
  }

  private async _loadAgentDetail() {
    if (!this.participant) return;
    const projectId = store.get().sessionState?.session.project_id;
    if (!projectId) return;
    try {
      this._loadingInfo = !this._agentDetail;
      this._agentDetail = await fetchProjectAgent(
        projectId,
        this.participant.id,
      );
    } catch {
      // Agent may not have a project-level record yet
    } finally {
      this._loadingInfo = false;
    }
  }

  private _scrollToBottom() {
    requestAnimationFrame(() => {
      if (this._messagesScroll) {
        this._messagesScroll.scrollTop = this._messagesScroll.scrollHeight;
      }
    });
  }

  private async _sendMessage() {
    if (!this._messageText.trim() || !this.sessionCode || !this.participant)
      return;
    this._sendingMessage = true;
    try {
      const msg = await sendMessage(
        this.sessionCode,
        this.participant.id,
        this._messageText.trim(),
      );
      this._messages = [...this._messages, msg];
      this._messageText = "";
      await this.updateComplete;
      this._scrollToBottom();
    } catch {
      // TODO: show error toast
    } finally {
      this._sendingMessage = false;
    }
  }

  private _onComposeKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  private _close() {
    this.dispatchEvent(
      new CustomEvent("close", { bubbles: true, composed: true }),
    );
  }

  private _getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2)
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  render() {
    const p = this.participant;
    if (!p) return nothing;

    const myId = store.get().sessionState?.participantId;

    return html`
      <div class="backdrop" @click=${this._close}></div>
      <div class="panel">
        ${this._renderHeader(p)}
        <div class="tab-area">
          <sl-tab-group
            @sl-tab-show=${(e: CustomEvent) => {
              this._activeTab = (e.detail as any).name;
            }}
          >
            <sl-tab slot="nav" panel="messages">
              ${t("agentConsole.tab.messages")}
              ${this._messages.length > 0
                ? html`<sl-badge
                    variant="primary"
                    pill
                    style="margin-left: 0.3rem"
                    >${this._messages.length}</sl-badge
                  >`
                : nothing}
            </sl-tab>
            <sl-tab slot="nav" panel="activity">
              ${t("agentConsole.tab.activity")}
            </sl-tab>
            <sl-tab slot="nav" panel="info"
              >${t("agentConsole.tab.info")}</sl-tab
            >

            <sl-tab-panel name="messages">
              ${this._renderMessages(myId)}
            </sl-tab-panel>
            <sl-tab-panel name="activity">
              ${this._renderActivityPanel()}
            </sl-tab-panel>
            <sl-tab-panel name="info"> ${this._renderInfo()} </sl-tab-panel>
          </sl-tab-group>
        </div>
      </div>
    `;
  }

  private _renderHeader(p: SessionParticipant) {
    const sponsor = p.sponsor_id
      ? store
          .get()
          .sessionState?.session.participants.find((s) => s.id === p.sponsor_id)
      : null;

    return html`
      <div class="header">
        <div class="header-avatar">
          ${this._getInitials(p.display_name)}
          <span class="sparkle" aria-hidden="true">&#10024;</span>
        </div>
        <div class="header-info">
          <div class="header-name">${p.display_name}</div>
          <div class="header-meta">
            <span class="status-dot ${p.is_online ? "" : "offline"}"></span>
            ${p.is_online
              ? t("agentConsole.online")
              : t("agentConsole.offline")}
            ${sponsor
              ? html`<span
                  >${t("agentConsole.agentOf", {
                    name: sponsor.display_name,
                  })}</span
                >`
              : nothing}
          </div>
        </div>
        <sl-tooltip content="${t("agentConsole.closeEsc")}">
          <sl-icon-button
            class="close-btn"
            name="x-lg"
            @click=${this._close}
          ></sl-icon-button>
        </sl-tooltip>
      </div>
    `;
  }

  private _renderMessages(myId: string | undefined) {
    if (this._loadingMessages) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      <div class="messages-container">
        ${this._messages.length === 0
          ? html`
              <div class="message-empty">
                <sl-icon name="chat-left-dots"></sl-icon>
                <div>${t("agentConsole.messages.empty")}</div>
                <div
                  style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7"
                >
                  ${t("agentConsole.messages.emptyHint")}
                </div>
              </div>
            `
          : html`
              <div class="messages-scroll">
                ${this._messages.map((m) => {
                  const isSent = m.sender_id === myId;
                  return html`
                    <div class="message ${isSent ? "sent" : "received"}">
                      <div>${m.content}</div>
                      <div class="message-time">${timeAgo(m.created_at)}</div>
                    </div>
                  `;
                })}
              </div>
            `}
        <div class="compose">
          <sl-textarea
            placeholder="${t("agentConsole.messages.placeholder", {
              name: this.participant?.display_name ?? "agent",
            })}"
            rows="1"
            resize="auto"
            .value=${this._messageText}
            @sl-input=${(e: Event) => {
              this._messageText = (e.target as HTMLTextAreaElement).value;
            }}
            @keydown=${this._onComposeKeydown}
          ></sl-textarea>
          <sl-button
            variant="primary"
            size="small"
            ?loading=${this._sendingMessage}
            ?disabled=${!this._messageText.trim()}
            @click=${this._sendMessage}
          >
            <sl-icon name="send"></sl-icon>
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderActivityPanel() {
    if (!this.participant) return nothing;
    return html`
      <div class="activity-panel-wrap">
        <div class="activity-panel-header">
          <span class="activity-panel-title"
            >${t("agentDetail.liveActivity")}</span
          >
          ${this._agentState
            ? html`
                <sl-badge
                  variant=${this._agentState === "working"
                    ? "primary"
                    : this._agentState === "idle"
                      ? "neutral"
                      : "warning"}
                >
                  ${this._agentState}
                </sl-badge>
              `
            : nothing}
        </div>
        <agent-activity-panel
          .sessionCode=${this.sessionCode}
          .participantId=${this.participant.id}
          .workspaceId=${this._agentDetail?.agent?.workspace?.id ?? ""}
          @agent-state-change=${(e: CustomEvent) => {
            this._agentState = (e.detail as any).state;
          }}
        ></agent-activity-panel>
      </div>
    `;
  }

  private _renderInfo() {
    if (this._loadingInfo) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    const detail = this._agentDetail;
    const agent = detail?.agent;

    if (!agent) {
      return html`
        <div class="ws-empty">
          <sl-icon name="hdd-stack"></sl-icon>
          <div>${t("agentConsole.info.empty")}</div>
          <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7">
            ${t("agentConsole.info.emptyHint")}
          </div>
        </div>
      `;
    }

    const ws = agent.workspace;
    const task = agent.current_task;
    const recentActivity = detail.recent_activity ?? [];
    const recentComments = detail.recent_comments ?? [];

    return html`
      <div class="info-scroll">
        <!-- Agent Info -->
        <div class="info-section">
          <div class="info-section-title">
            <sl-icon name="robot"></sl-icon> ${t(
              "agentConsole.workspace.agentInfo",
            )}
          </div>
          <div class="info-row-grid">
            ${agent.model
              ? html`
                  <div class="info-row">
                    <span class="info-row-label"
                      >${t("agentDetail.model")}</span
                    >
                    <span class="info-row-value mono">${agent.model}</span>
                  </div>
                `
              : nothing}
            ${agent.client_name
              ? html`
                  <div class="info-row">
                    <span class="info-row-label"
                      >${t("agentDetail.client")}</span
                    >
                    <span class="info-row-value mono"
                      >${agent.client_name}${agent.client_version
                        ? ` v${agent.client_version}`
                        : ""}</span
                    >
                  </div>
                `
              : nothing}
            <div class="info-row">
              <span class="info-row-label">${t("agentDetail.session")}</span>
              <span class="info-row-value"
                >${agent.session_name || agent.session_code}</span
              >
            </div>
            ${agent.sponsor_name
              ? html`
                  <div class="info-row">
                    <span class="info-row-label"
                      >${t("agentDetail.sponsoredBy")}</span
                    >
                    <span class="info-row-value">${agent.sponsor_name}</span>
                  </div>
                `
              : nothing}
            <div class="info-row">
              <span class="info-row-label">${t("agentDetail.joined")}</span>
              <span class="info-row-value">${timeAgo(agent.joined_at)}</span>
            </div>
          </div>
        </div>

        <!-- Workspace -->
        ${ws
          ? html`
              <div class="info-section">
                <div class="info-section-title">
                  <sl-icon name="terminal"></sl-icon> ${t(
                    "agentDetail.workspace",
                  )}
                </div>
                <div class="ws-card">
                  <div class="ws-header">
                    <span class="ws-name"
                      >${ws.coder_workspace_name ??
                      t("agentDetail.workspaceFallback")}</span
                    >
                    <sl-badge
                      variant=${WS_STATUS_VARIANT[ws.status] ?? "neutral"}
                      >${ws.status}</sl-badge
                    >
                  </div>
                  <div class="ws-details">
                    ${ws.branch
                      ? html`
                          <span class="ws-detail">
                            <sl-icon
                              name="git-branch"
                              style="font-size: 0.85rem;"
                            ></sl-icon>
                            <span class="branch-badge">${ws.branch}</span>
                          </span>
                        `
                      : nothing}
                    ${ws.started_at
                      ? html`
                          <span class="ws-detail">
                            <sl-icon
                              name="clock"
                              style="font-size: 0.85rem;"
                            ></sl-icon>
                            ${t("agentDetail.started", {
                              time: timeAgo(ws.started_at),
                            })}
                          </span>
                        `
                      : nothing}
                  </div>
                  ${ws.error_message
                    ? html` <div class="ws-error">${ws.error_message}</div> `
                    : nothing}
                </div>
              </div>
            `
          : nothing}

        <!-- Current Task -->
        ${task
          ? html`
              <div class="info-section">
                <div class="info-section-title">
                  <sl-icon name="kanban"></sl-icon> ${t(
                    "agentDetail.currentTask",
                  )}
                </div>
                <div class="ws-card">
                  <div class="ws-task-card">
                    <span class="ticket-id">${task.ticket_id}</span>
                    <span class="title">${task.title}</span>
                  </div>
                  <sl-badge
                    variant=${task.status === "in_progress"
                      ? "primary"
                      : task.status === "done"
                        ? "success"
                        : "neutral"}
                    style="margin-top: 0.35rem;"
                  >
                    ${task.status.replace("_", " ")}
                  </sl-badge>
                </div>
              </div>
            `
          : nothing}

        <!-- Recent Activity -->
        <div class="info-section">
          <div class="info-section-title">
            <sl-icon name="activity"></sl-icon> ${t(
              "agentDetail.recentActivity",
            )}
          </div>
          ${recentActivity.length === 0
            ? html`<div class="info-empty-hint">
                ${t("agentDetail.noActivity")}
              </div>`
            : html`
                <div class="info-timeline">
                  ${recentActivity.slice(0, 10).map(
                    (a) => html`
                      <div class="timeline-item">
                        <span class="timeline-time"
                          >${timeAgo(a.created_at)}</span
                        >
                        <span class="timeline-event">${a.event_type}</span>
                        <span class="timeline-summary">${a.summary}</span>
                      </div>
                    `,
                  )}
                </div>
              `}
        </div>

        <!-- Recent Comments -->
        <div class="info-section">
          <div class="info-section-title">
            <sl-icon name="chat-dots"></sl-icon> ${t(
              "agentDetail.recentComments",
            )}
          </div>
          ${recentComments.length === 0
            ? html`<div class="info-empty-hint">
                ${t("agentDetail.noComments")}
              </div>`
            : html`
                <div class="comment-list">
                  ${recentComments.slice(0, 5).map(
                    (c) => html`
                      <div class="comment-card">
                        <div class="comment-header">
                          <span class="comment-ticket">${c.ticket_id}</span>
                          <span class="comment-task-title"
                            >${c.task_title}</span
                          >
                          <span class="comment-time"
                            >${timeAgo(c.created_at)}</span
                          >
                        </div>
                        <div class="comment-content">${c.content}</div>
                      </div>
                    `,
                  )}
                </div>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-console": AgentConsole;
  }
}
