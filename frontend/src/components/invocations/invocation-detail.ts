import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchInvocation,
  type InvocationDetailView,
} from "../../state/invocation-api.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";

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
        ${(inv.status === "completed" || inv.status === "failed") &&
        inv.claude_session_id
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
          ${inv.output.length === 0
            ? html`<div class="log-line" style="color: var(--text-tertiary)">
                No output yet...
              </div>`
            : inv.output.map(
                (line) => html`
                  <div class="log-line ${line.fd === "stderr" ? "stderr" : ""}">
                    ${line.line}
                  </div>
                `,
              )}
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "invocation-detail": InvocationDetail;
  }
}
