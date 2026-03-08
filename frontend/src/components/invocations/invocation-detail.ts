import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import {
  fetchInvocation,
  type InvocationDetailView,
} from "../../state/invocation-api.js";
import {
  parseStreamOutput,
  type StreamEvent,
} from "../../lib/stream-parser.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "./invoke-dialog.js";

const STATUS_VARIANT: Record<string, string> = {
  running: "success",
  pending: "warning",
  completed: "primary",
  failed: "danger",
  cancelled: "neutral",
};

@customElement("invocation-detail")
export class InvocationDetail extends LitElement {
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

    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: var(--text-primary, #e2e4ed);
      flex: 1;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #a0a4b8);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .meta-label {
      color: var(--text-tertiary, #8b8fa3);
    }

    .prompt-section {
      background: var(--surface-2, #1a1d2e);
      border: 1px solid var(--border-subtle, #2a2d3e);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .prompt-section h4 {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      color: var(--text-tertiary, #8b8fa3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .prompt-text {
      white-space: pre-wrap;
      font-size: 0.9rem;
      color: var(--text-primary, #e2e4ed);
      line-height: 1.5;
    }

    .output-section {
      background: #0d0f1a;
      border: 1px solid var(--border-subtle, #2a2d3e);
      border-radius: 8px;
      overflow: hidden;
    }

    .output-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: var(--surface-2, #1a1d2e);
      border-bottom: 1px solid var(--border-subtle, #2a2d3e);
    }

    .output-header h4 {
      margin: 0;
      font-size: 0.85rem;
      color: var(--text-tertiary, #8b8fa3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .output-lines {
      padding: 0.75rem 1rem;
      max-height: 500px;
      overflow-y: auto;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.8rem;
      line-height: 1.6;
    }

    .log-line {
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--text-secondary, #a0a4b8);
    }

    .log-line.stderr {
      color: #f87171;
    }

    .evt-text {
      white-space: pre-wrap;
      color: var(--text-primary, #e2e4ed);
      padding: 0.25rem 0;
      line-height: 1.5;
    }

    .evt-tool-call {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.2rem 0;
      color: #60a5fa;
    }

    .evt-tool-call .tool-name {
      font-weight: 600;
      white-space: nowrap;
    }

    .evt-tool-call .tool-desc {
      color: #93a3b8;
      font-size: 0.75rem;
    }

    .evt-tool-detail {
      margin-left: 1rem;
      padding: 0.25rem 0.5rem;
      border-left: 2px solid #2a2d3e;
      color: #8b8fa3;
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 120px;
      overflow-y: auto;
    }

    .evt-tool-result {
      margin-left: 1rem;
      padding: 0.25rem 0.5rem;
      border-left: 2px solid #2d3a2e;
      color: #9ca3af;
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 120px;
      overflow-y: auto;
    }

    .evt-tool-result.is-error {
      border-left-color: #5a2d2d;
      color: #f87171;
    }

    .evt-result {
      white-space: pre-wrap;
      color: var(--text-primary, #e2e4ed);
      padding: 0.5rem;
      background: rgba(96, 165, 250, 0.05);
      border-radius: 4px;
      margin-top: 0.5rem;
      line-height: 1.5;
    }

    .evt-result.is-error {
      background: rgba(248, 113, 113, 0.05);
      color: #f87171;
    }

    .evt-error {
      color: #f87171;
      padding: 0.15rem 0;
    }

    .evt-raw {
      color: var(--text-secondary, #a0a4b8);
      padding: 0.15rem 0;
    }

    .result-section {
      margin-top: 1rem;
      background: var(--surface-2, #1a1d2e);
      border: 1px solid var(--border-subtle, #2a2d3e);
      border-radius: 8px;
      padding: 1rem;
    }

    .result-section h4 {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      color: var(--text-tertiary, #8b8fa3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .result-json {
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      color: var(--text-primary, #e2e4ed);
      max-height: 300px;
      overflow-y: auto;
    }

    .error-banner {
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      color: #f87171;
      font-size: 0.9rem;
    }
  `;

  @property({ attribute: "invocation-id" }) invocationId = "";
  @property({ attribute: "project-id" }) projectId = "";
  @state() private _invocation: InvocationDetailView | null = null;
  @state() private _loading = true;
  @state() private _pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _load() {
    this._loading = true;
    try {
      this._invocation = await fetchInvocation(this.invocationId);
      // Auto-poll for running invocations
      if (
        this._invocation.status === "running" ||
        this._invocation.status === "pending"
      ) {
        this._startPolling();
      }
    } catch (e) {
      console.error("Failed to load invocation:", e);
    } finally {
      this._loading = false;
    }
  }

  private _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(async () => {
      try {
        const inv = await fetchInvocation(this.invocationId);
        const hadNewOutput =
          inv.output.length !== this._invocation?.output.length;
        this._invocation = inv;
        if (hadNewOutput) {
          await this.updateComplete;
          this._scrollOutputToBottom();
        }
        if (inv.status !== "running" && inv.status !== "pending") {
          clearInterval(this._pollTimer!);
          this._pollTimer = null;
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }

  private _cachedParsed: StreamEvent[] | null = null;
  private _cachedOutputLen = -1;

  private get _parsedOutput(): StreamEvent[] {
    const len = this._invocation?.output.length ?? 0;
    if (this._cachedParsed && this._cachedOutputLen === len) {
      return this._cachedParsed;
    }
    this._cachedParsed = this._invocation
      ? parseStreamOutput(this._invocation.output)
      : [];
    this._cachedOutputLen = len;
    return this._cachedParsed;
  }

  private _scrollOutputToBottom() {
    const el = this.shadowRoot?.querySelector(".output-lines");
    if (el) el.scrollTop = el.scrollHeight;
  }

  private _formatDuration(): string {
    const inv = this._invocation;
    if (!inv?.started_at) return "-";
    const start = new Date(inv.started_at).getTime();
    const end = inv.completed_at
      ? new Date(inv.completed_at).getTime()
      : Date.now();
    const secs = Math.round((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ${secs % 60}s`;
  }

  private _onContinue() {
    const inv = this._invocation;
    if (!inv?.claude_session_id) return;
    this.dispatchEvent(
      new CustomEvent("continue-invocation", {
        detail: {
          claude_session_id: inv.claude_session_id,
          agent_perspective: inv.agent_perspective,
          workspace_id: inv.workspace_id,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onRerun(perspective: string) {
    const inv = this._invocation;
    if (!inv) return;
    const dialog = this.shadowRoot?.querySelector("invoke-dialog") as
      | (HTMLElement & { showWithPerspective: (p: string, prompt: string) => void })
      | null;
    if (dialog) {
      dialog.showWithPerspective(perspective, inv.prompt);
    }
  }

  private _renderEvent(evt: StreamEvent) {
    switch (evt.kind) {
      case "text":
        return html`<div class="evt-text">${evt.text}</div>`;
      case "tool_call": {
        const [name, ...descParts] = evt.text.split(": ");
        const desc = descParts.join(": ");
        return html`
          <div class="evt-tool-call">
            <span class="tool-name">${name}</span>
            ${desc ? html`<span class="tool-desc">${desc}</span>` : nothing}
          </div>
          ${evt.detail
            ? html`<div class="evt-tool-detail">${evt.detail}</div>`
            : nothing}
        `;
      }
      case "tool_result":
        return html`<div
          class="evt-tool-result ${evt.isError ? "is-error" : ""}"
        >
          ${evt.text}
        </div>`;
      case "result":
        return html`<div
          class="evt-result ${evt.isError ? "is-error" : ""}"
        >
          ${evt.text}
        </div>`;
      case "error":
        return html`<div class="evt-error">${evt.text}</div>`;
      case "raw":
        return html`<div class="evt-raw">${evt.text}</div>`;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    const inv = this._invocation;
    if (!inv) {
      return html`<div class="empty-state">Invocation not found.</div>`;
    }

    return html`
      <div class="header">
        <sl-icon-button
          name="arrow-left"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("back", { bubbles: true, composed: true }),
            )}
        ></sl-icon-button>
        <h3>${inv.agent_perspective} invocation</h3>
        <sl-badge variant=${STATUS_VARIANT[inv.status] ?? "neutral"} pill>
          ${inv.status}
        </sl-badge>
        ${inv.status === "completed" || inv.status === "failed"
          ? html`
              ${inv.claude_session_id
                ? html`
                    <sl-button
                      size="small"
                      variant="success"
                      @click=${this._onContinue}
                    >
                      <sl-icon slot="prefix" name="arrow-repeat"></sl-icon>
                      Continue
                    </sl-button>
                  `
                : nothing}
              ${this.projectId
                ? html`
                    <sl-dropdown>
                      <sl-button
                        slot="trigger"
                        size="small"
                        variant="neutral"
                        caret
                      >
                        <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>
                        ${t("invoke.rerun")}
                      </sl-button>
                      <sl-menu
                        @sl-select=${(e: CustomEvent) =>
                          this._onRerun(e.detail.item.value)}
                      >
                        <sl-menu-item value="coder">
                          <sl-icon slot="prefix" name="code-slash"></sl-icon>
                          ${t("invoke.rerunAs.coder")}
                        </sl-menu-item>
                        <sl-menu-item value="reviewer">
                          <sl-icon slot="prefix" name="search"></sl-icon>
                          ${t("invoke.rerunAs.reviewer")}
                        </sl-menu-item>
                        <sl-menu-item value="planner">
                          <sl-icon slot="prefix" name="diagram-3"></sl-icon>
                          ${t("invoke.rerunAs.planner")}
                        </sl-menu-item>
                        <sl-menu-item value="tester">
                          <sl-icon slot="prefix" name="check2-circle"></sl-icon>
                          ${t("invoke.rerunAs.tester")}
                        </sl-menu-item>
                        <sl-menu-item value="researcher">
                          <sl-icon slot="prefix" name="book"></sl-icon>
                          ${t("invoke.rerunAs.researcher")}
                        </sl-menu-item>
                      </sl-menu>
                    </sl-dropdown>
                  `
                : nothing}
            `
          : nothing}
      </div>

      ${inv.error_message
        ? html`<div class="error-banner">${inv.error_message}</div>`
        : nothing}

      <div class="meta">
        <div class="meta-item">
          <span class="meta-label">Duration:</span> ${this._formatDuration()}
        </div>
        <div class="meta-item">
          <span class="meta-label">Triggered:</span> ${inv.triggered_by}
        </div>
        ${inv.exit_code !== null
          ? html`
              <div class="meta-item">
                <span class="meta-label">Exit:</span> ${inv.exit_code}
              </div>
            `
          : nothing}
        <div class="meta-item">
          <span class="meta-label">Created:</span>
          ${new Date(inv.created_at).toLocaleString()}
        </div>
        ${inv.resume_session_id
          ? html`
              <div class="meta-item">
                <span class="meta-label">Resumed from:</span>
                ${inv.resume_session_id.substring(0, 8)}...
              </div>
            `
          : nothing}
        ${inv.model_used
          ? html`
              <div class="meta-item">
                <span class="meta-label">Model:</span> ${inv.model_used}
              </div>
            `
          : nothing}
        ${inv.input_tokens !== null || inv.output_tokens !== null
          ? html`
              <div class="meta-item">
                <span class="meta-label">Tokens:</span>
                ${inv.input_tokens !== null
                  ? `${inv.input_tokens.toLocaleString()} in`
                  : ""}
                ${inv.input_tokens !== null && inv.output_tokens !== null
                  ? " / "
                  : ""}
                ${inv.output_tokens !== null
                  ? `${inv.output_tokens.toLocaleString()} out`
                  : ""}
              </div>
            `
          : nothing}
        ${inv.cost_usd !== null
          ? html`
              <div class="meta-item">
                <span class="meta-label">Cost:</span>
                $${inv.cost_usd.toFixed(6)}
              </div>
            `
          : nothing}
      </div>

      <div class="prompt-section">
        <h4>Prompt</h4>
        <div class="prompt-text">${inv.prompt}</div>
      </div>

      <div class="output-section">
        <div class="output-header">
          <h4>Output</h4>
          ${inv.status === "running"
            ? html`<sl-spinner style="font-size: 0.9rem"></sl-spinner>`
            : nothing}
        </div>
        <div class="output-lines">
          ${this._parsedOutput.length === 0
            ? html`<div class="log-line" style="color: var(--text-tertiary)">
                No output yet...
              </div>`
            : this._parsedOutput.map((evt) => this._renderEvent(evt))}
        </div>
      </div>

      ${inv.result_json
        ? html`
            <div class="result-section">
              <h4>Result</h4>
              <div class="result-json">
                ${JSON.stringify(inv.result_json, null, 2)}
              </div>
            </div>
          `
        : nothing}

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "invocation-detail": InvocationDetail;
  }
}
