import { LitElement, html, css, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { store, type SessionState } from "../../state/app-state.js";
import {
  connectSession,
  disconnectSession,
} from "../../state/session-connection.js";
import { authStore } from "../../state/auth-state.js";
import { createSession, joinSessionByCode } from "../../state/session-api.js";
import { navigateTo } from "../../router.js";
import type { RouterLocation } from "@vaadin/router";
import { t } from "../../lib/i18n.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/tab-group/tab-group.js";
import "@shoelace-style/shoelace/dist/components/tab/tab.js";
import "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";

import "../tasks/task-board.js";
import "./activity-view.js";
import "../invocations/invoke-dialog.js";

type LobbyState = "landing" | "creating" | "joining" | "in-session";

@customElement("session-lobby")
export class SessionLobby extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1;
    }

    .landing {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 2rem;
      background:
        repeating-radial-gradient(
          circle at 20% 50%,
          transparent 0,
          transparent 40px,
          var(--color-primary-glow) 41px,
          transparent 42px
        ),
        repeating-radial-gradient(
          circle at 80% 20%,
          transparent 0,
          transparent 60px,
          var(--color-primary-glow) 61px,
          transparent 62px
        ),
        var(--surface-1, #111320);
    }

    .landing h1 {
      margin: 0 0 0.5rem;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.025em;
      text-align: center;
    }

    .landing .subtitle {
      margin: 0 0 2.5rem;
      font-size: 1.125rem;
      color: var(--text-secondary);
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
      .landing-options {
        grid-template-columns: 1fr;
      }
    }

    .option-card {
      cursor: pointer;
      text-align: center;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.75rem 1.25rem;
      background: var(--surface-card);
      box-shadow: var(--shadow-md);
      transition:
        border-color 0.2s,
        box-shadow 0.2s,
        transform 0.15s;
    }

    .option-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-lg);
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
      color: var(--text-primary);
      margin: 0 0 0.4rem;
    }

    .option-card .option-desc {
      font-size: var(--sl-font-size-small);
      color: var(--text-tertiary);
      line-height: 1.5;
      margin: 0;
    }

    .option-card--create sl-icon {
      color: var(--sl-color-primary-500);
    }
    .option-card--join sl-icon {
      color: var(--sl-color-success-500);
    }

    .flow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
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
      color: var(--text-primary);
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
      color: var(--text-tertiary);
      cursor: pointer;
      margin-bottom: 1.5rem;
    }

    .flow-card .back-link:hover {
      color: var(--sl-color-primary-400);
    }

    .join-code-box {
      text-align: center;
      margin: 1.5rem 0;
      padding: 1.5rem;
      background: var(--color-primary-muted);
      border: 2px solid var(--color-primary-border);
      border-radius: var(--sl-border-radius-large);
    }

    .join-code-label {
      font-size: var(--sl-font-size-small);
      color: var(--text-tertiary);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .join-code-value {
      font-size: 3rem;
      font-weight: 900;
      letter-spacing: 0.2em;
      color: var(--sl-color-primary-400);
      font-family: var(--sl-font-mono);
      margin: 0.25rem 0 1rem;
    }

    .agent-code-box {
      text-align: center;
      margin: 1rem 0;
      padding: 1.25rem;
      background: var(--surface-2);
      border: 2px dashed var(--border-medium);
      border-radius: var(--sl-border-radius-large);
    }

    .agent-code-value {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
      margin: 0.25rem 0 0.75rem;
    }

    .agent-code-hint {
      font-size: var(--sl-font-size-small);
      color: var(--text-tertiary);
      margin: 0.5rem 0 0;
      line-height: 1.5;
    }

    .session-workspace {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 100%;
    }

    .session-workspace task-board {
      flex: 1;
    }

    .session-dispatch-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0.4rem 1.5rem;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-1);
      gap: 0.5rem;
    }

    .error-msg {
      margin-bottom: 0.75rem;
    }
  `;

  // Set by @vaadin/router — reactive so view switches trigger re-render
  @state() location!: RouterLocation;

  @state() private _lobbyState: LobbyState = "landing";
  @state() private _joinCode = "";
  @state() private _loading = false;
  @state() private _error = "";
  @state() private _sessionState: SessionState | null =
    store.get().sessionState;
  @state() private _codeCopied = false;

  // For creating sessions, we need a project ID.
  // TODO: add project selection UI. For now, use a fixed default.
  @state() private _projectId = "";
  @state() private _sessionName = "";

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;

  private _unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsubscribe = store.subscribe((event) => {
      if (
        event.type === "session-connected" ||
        event.type === "session-updated" ||
        event.type === "session-disconnected"
      ) {
        this._sessionState = store.get().sessionState;
        if (event.type === "session-connected") {
          this._lobbyState = "in-session";
          const code = store.get().sessionState?.code;
          // Only navigate if not already on a session URL (preserves deep-link suffixes like /tasks/:ticketId)
          if (
            code &&
            !window.location.pathname.startsWith(`/sessions/${code}`)
          ) {
            navigateTo(`/sessions/${code}`);
          }
        } else if (event.type === "session-disconnected") {
          this._lobbyState = "landing";
          navigateTo("/projects");
        }
      }
    });
    if (this._sessionState) {
      this._lobbyState = "in-session";
    } else {
      this._tryJoinFromRoute();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  private async _tryJoinFromRoute() {
    const params = this.location?.params as Record<string, string> | undefined;
    if (!params?.code) return;
    const code = params.code.toUpperCase();

    // Wait for auth to be ready
    const waitForAuth = () =>
      new Promise<void>((resolve) => {
        if (authStore.get().isAuthenticated) {
          resolve();
          return;
        }
        const unsub = authStore.subscribe((event) => {
          if (event.type === "auth-success") {
            unsub();
            resolve();
          }
          if (event.type === "auth-logout" || event.type === "auth-error") {
            unsub();
            resolve();
          }
        });
      });
    await waitForAuth();
    if (!authStore.get().isAuthenticated) return;

    this._loading = true;
    this._lobbyState = "joining";
    this._joinCode = code;
    try {
      const user = authStore.user;
      const data = await joinSessionByCode(code, user?.name ?? "Participant");
      store.setSession(
        code,
        data.participant_id,
        data.session,
        data.agent_code,
      );
      connectSession(code);
      this._requestNotificationPermission();
    } catch (err) {
      // Show error in-page rather than navigating away — the code in the URL
      // is invalid or the session doesn't exist, so display a friendly message.
      this._error = err instanceof Error ? err.message : t("lobby.errorRejoin");
      this._lobbyState = "landing";
    } finally {
      this._loading = false;
    }
  }

  private async _copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this._codeCopied = true;
      setTimeout(() => {
        this._codeCopied = false;
      }, 1000);
    } catch {
      /* clipboard may be blocked */
    }
  }

  private async _createSession() {
    this._loading = true;
    this._error = "";
    try {
      const data = await createSession({
        project_id: this._projectId || undefined,
        name: this._sessionName.trim() || undefined,
      });
      store.setSession(
        data.session.code,
        data.session.participants[0]?.id,
        data.session,
        data.agent_code,
      );
      connectSession(data.session.code);
      this._requestNotificationPermission();
    } catch (err) {
      this._error = err instanceof Error ? err.message : t("lobby.errorCreate");
    } finally {
      this._loading = false;
    }
  }

  private async _joinSession() {
    if (!this._joinCode.trim()) {
      this._error = t("lobby.errorJoinCode");
      return;
    }
    this._loading = true;
    this._error = "";
    try {
      const code = this._joinCode.trim().toUpperCase();
      const user = authStore.user;
      const data = await joinSessionByCode(code, user?.name ?? "Participant");
      store.setSession(
        code,
        data.participant_id,
        data.session,
        data.agent_code,
      );
      connectSession(code);
      this._requestNotificationPermission();
    } catch (err) {
      this._error = err instanceof Error ? err.message : t("lobby.errorJoin");
    } finally {
      this._loading = false;
    }
  }

  private _requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  private _leaveSession() {
    disconnectSession();
    store.clearSession();
  }

  private _handleSessionDispatch(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    switch (action) {
      case "summarize":
        this._invokeDialog.showWithPerspective(
          "researcher",
          "Summarize this session's activity. List completed tasks, in-progress work, blockers, and key decisions made.",
        );
        break;
      case "triage":
        this._invokeDialog.showWithPerspective(
          "planner",
          "Triage the open tasks in this session. Assign priorities, suggest groupings, and identify which tasks are ready to work on.",
        );
        break;
      case "create-tasks":
        this._invokeDialog.showWithPerspective(
          "planner",
          "Review the session activity and create tasks for any action items, follow-ups, or work discovered during discussion.",
        );
        break;
      case "custom":
      default:
        this._invokeDialog.show();
        break;
    }
  }

  render() {
    switch (this._lobbyState) {
      case "landing":
        return this._renderLanding();
      case "creating":
        return this._renderCreating();
      case "joining":
        return this._renderJoining();
      case "in-session":
        return this._renderInSession();
    }
  }

  private _renderLanding() {
    return html`
      <div class="landing">
        <h1>${t("lobby.title")}</h1>
        <p class="subtitle">${t("lobby.subtitle")}</p>
        ${this._error
          ? html`<sl-alert variant="danger" open class="error-msg"
              >${this._error}</sl-alert
            >`
          : nothing}
        <div class="landing-options">
          <div
            class="option-card option-card--create"
            role="button"
            tabindex="0"
            @click=${() => {
              this._lobbyState = "creating";
              this._error = "";
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this._lobbyState = "creating";
              }
            }}
          >
            <sl-icon name="plus-circle-fill"></sl-icon>
            <p class="option-title">${t("lobby.newSession")}</p>
            <p class="option-desc">${t("lobby.newSessionDesc")}</p>
          </div>
          <div
            class="option-card option-card--join"
            role="button"
            tabindex="0"
            @click=${() => {
              this._lobbyState = "joining";
              this._error = "";
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this._lobbyState = "joining";
              }
            }}
          >
            <sl-icon name="box-arrow-in-right"></sl-icon>
            <p class="option-title">${t("lobby.joinSession")}</p>
            <p class="option-desc">${t("lobby.joinSessionDesc")}</p>
          </div>
        </div>
      </div>
    `;
  }

  private _renderCreating() {
    return html`
      <div class="flow-container">
        <div class="flow-card">
          <span
            class="back-link"
            role="button"
            tabindex="0"
            @click=${() => {
              this._lobbyState = "landing";
              this._error = "";
            }}
          >
            <sl-icon name="arrow-left"></sl-icon> ${t("lobby.back")}
          </span>
          <h2>${t("lobby.createTitle")}</h2>
          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg"
                >${this._error}</sl-alert
              >`
            : nothing}
          <sl-input
            label="${t("lobby.sessionNameLabel")}"
            placeholder="${t("lobby.sessionNamePlaceholder")}"
            value=${this._sessionName}
            @sl-input=${(e: CustomEvent) => {
              this._sessionName = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._createSession();
            }}
          ></sl-input>
          <sl-button
            variant="primary"
            ?loading=${this._loading}
            @click=${() => void this._createSession()}
          >
            <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
            ${t("lobby.createButton")}
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
            @click=${() => {
              this._lobbyState = "landing";
              this._error = "";
            }}
          >
            <sl-icon name="arrow-left"></sl-icon> ${t("lobby.back")}
          </span>
          <h2>${t("lobby.joinTitle")}</h2>
          ${this._error
            ? html`<sl-alert variant="danger" open class="error-msg"
                >${this._error}</sl-alert
              >`
            : nothing}
          <sl-input
            label="${t("lobby.joinCodeLabel")}"
            placeholder="${t("lobby.joinCodePlaceholder")}"
            value=${this._joinCode}
            @sl-input=${(e: CustomEvent) => {
              this._joinCode = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._joinSession();
            }}
            autocomplete="off"
          ></sl-input>
          <sl-button
            variant="primary"
            ?loading=${this._loading}
            @click=${() => void this._joinSession()}
          >
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            ${t("lobby.joinButton")}
          </sl-button>
        </div>
      </div>
    `;
  }

  private get _isActivityRoute(): boolean {
    return window.location.pathname.endsWith("/activity");
  }

  private _renderInSession() {
    if (!this._sessionState) return nothing;
    const { session } = this._sessionState;

    if (this._isActivityRoute) {
      return html`
        <div class="session-workspace">
          <activity-view
            session-code=${session.code}
            .participants=${session.participants}
          ></activity-view>
        </div>
      `;
    }

    return html`
      <div class="session-workspace">
        <div class="session-dispatch-bar">
          <sl-dropdown>
            <sl-button slot="trigger" caret size="small" variant="default">
              <sl-icon slot="prefix" name="robot"></sl-icon>
              ${t("session.analyzeSession")}
            </sl-button>
            <sl-menu
              @sl-select=${(e: CustomEvent) => this._handleSessionDispatch(e)}
            >
              <sl-menu-item value="summarize">
                <sl-icon slot="prefix" name="card-list"></sl-icon>
                ${t("session.dispatch.summarize")}
              </sl-menu-item>
              <sl-menu-item value="triage">
                <sl-icon slot="prefix" name="diagram-3"></sl-icon>
                ${t("session.dispatch.triage")}
              </sl-menu-item>
              <sl-menu-item value="create-tasks">
                <sl-icon slot="prefix" name="plus-circle"></sl-icon>
                ${t("session.dispatch.createTasks")}
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item value="custom">
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${t("session.dispatch.custom")}
              </sl-menu-item>
            </sl-menu>
          </sl-dropdown>
        </div>
        <task-board
          session-code=${session.code}
          session-name=${session.name ?? ""}
          project-id=${session.project_id}
          .participants=${session.participants}
        ></task-board>
        <invoke-dialog project-id=${session.project_id}></invoke-dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "session-lobby": SessionLobby;
  }
}
