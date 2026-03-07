import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchInvocations,
  type InvocationView,
} from "../../state/invocation-api.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";

const STATUS_VARIANT: Record<string, string> = {
  running: "success",
  pending: "warning",
  completed: "primary",
  failed: "danger",
  cancelled: "neutral",
};

const STATUS_ICON: Record<string, string> = {
  running: "play-circle",
  pending: "hourglass-split",
  completed: "check-circle",
  failed: "x-circle",
  cancelled: "slash-circle",
};

@customElement("invocation-list")
export class InvocationList extends LitElement {
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

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--text-tertiary, #8b8fa3);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: var(--text-primary, #e2e4ed);
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .invocation-card {
      background: var(--surface-2, #1a1d2e);
      border: 1px solid var(--border-subtle, #2a2d3e);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: border-color 0.15s;
    }

    .invocation-card:hover {
      border-color: var(--border-hover, #3a3d5e);
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .perspective {
      font-weight: 600;
      color: var(--text-primary, #e2e4ed);
      font-size: 0.95rem;
    }

    .prompt-preview {
      color: var(--text-secondary, #a0a4b8);
      font-size: 0.85rem;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-tertiary, #8b8fa3);
    }

    .duration {
      font-variant-numeric: tabular-nums;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";
  @state() private _invocations: InvocationView[] = [];
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  async _load() {
    this._loading = true;
    try {
      this._invocations = await fetchInvocations(this.projectId, { limit: 50 });
    } catch (e) {
      console.error("Failed to load invocations:", e);
    } finally {
      this._loading = false;
    }
  }

  private _formatDuration(inv: InvocationView): string {
    if (!inv.started_at) return "";
    const start = new Date(inv.started_at).getTime();
    const end = inv.completed_at
      ? new Date(inv.completed_at).getTime()
      : Date.now();
    const secs = Math.round((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
  }

  private _formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private _onSelect(inv: InvocationView) {
    this.dispatchEvent(
      new CustomEvent("invocation-select", {
        detail: { id: inv.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      <div class="header">
        <h3>Invocations</h3>
        <sl-button
          size="small"
          variant="primary"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("invoke-request", {
                bubbles: true,
                composed: true,
              }),
            )}
        >
          <sl-icon slot="prefix" name="play"></sl-icon>
          New Invocation
        </sl-button>
      </div>

      ${this._invocations.length === 0
        ? html`
            <div class="empty-state">
              <sl-icon name="terminal"></sl-icon>
              No invocations yet. Launch one to get started.
            </div>
          `
        : html`
            <div class="list">
              ${this._invocations.map(
                (inv) => html`
                  <div
                    class="invocation-card"
                    @click=${() => this._onSelect(inv)}
                  >
                    <div class="card-top">
                      <sl-badge
                        variant=${STATUS_VARIANT[inv.status] ?? "neutral"}
                        pill
                      >
                        <sl-icon
                          name=${STATUS_ICON[inv.status] ?? "question-circle"}
                          style="margin-right: 4px"
                        ></sl-icon>
                        ${inv.status}
                      </sl-badge>
                      <span class="perspective">${inv.agent_perspective}</span>
                    </div>
                    <div class="prompt-preview">${inv.prompt}</div>
                    <div class="card-meta">
                      <span>${this._formatTime(inv.created_at)}</span>
                      ${inv.started_at
                        ? html`<span class="duration"
                            >${this._formatDuration(inv)}</span
                          >`
                        : nothing}
                      <span>${inv.triggered_by}</span>
                      ${inv.resume_session_id
                        ? html`
                            <span title="Continued from previous session">
                              <sl-icon
                                name="arrow-repeat"
                                style="font-size: 0.85rem"
                              ></sl-icon>
                            </span>
                          `
                        : nothing}
                      ${inv.cost_usd !== null
                        ? html`
                            <span
                              title="Estimated cost: $${inv.cost_usd.toFixed(6)}"
                              style="color: var(--text-tertiary, #8b8fa3)"
                            >
                              $${inv.cost_usd < 0.01
                                ? inv.cost_usd.toFixed(6)
                                : inv.cost_usd.toFixed(4)}
                            </span>
                          `
                        : nothing}
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "invocation-list": InvocationList;
  }
}
