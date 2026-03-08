import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  fetchRequest,
  updateRequest,
  type RequestDetailView,
  type RequestStatusType,
} from "../../state/requirement-api.js";
import { t } from "../../lib/i18n.js";
import { relativeTime } from "../../lib/date-utils.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/progress-bar/progress-bar.js";
import "../invocations/invoke-dialog.js";

import "../shared/markdown-content.js";

const STATUS_VARIANTS: Record<RequestStatusType, string> = {
  pending: "neutral",
  analyzing: "warning",
  decomposed: "success",
  archived: "neutral",
};

const STATUS_LABEL_KEYS: Record<RequestStatusType, string> = {
  pending: "requestList.status.pending",
  analyzing: "requestList.status.analyzing",
  decomposed: "requestList.status.decomposed",
  archived: "requestList.status.archived",
};

interface Transition {
  label: string;
  status: string;
  variant: string;
}

const TRANSITIONS: Record<RequestStatusType, Transition[]> = {
  pending: [
    {
      label: "requestDetail.transition.analyze",
      status: "analyzing",
      variant: "warning",
    },
    {
      label: "requestDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  analyzing: [
    {
      label: "requestDetail.transition.decompose",
      status: "decomposed",
      variant: "success",
    },
    {
      label: "requestDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  decomposed: [
    {
      label: "requestDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  archived: [
    {
      label: "requestDetail.transition.reopen",
      status: "pending",
      variant: "primary",
    },
  ],
};

@customElement("request-detail")
export class RequestDetail extends LitElement {
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
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .back-btn {
      flex-shrink: 0;
      margin-top: 0.15rem;
    }

    .header-content {
      flex: 1;
      min-width: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title-input {
      flex: 1;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .section {
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      background: var(--surface-card);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
    }

    .edit-controls {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      justify-content: flex-end;
    }

    sl-textarea::part(textarea) {
      min-height: 150px;
      font-size: 0.875rem;
    }

    .empty-body {
      color: var(--text-tertiary);
      font-style: italic;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .chip {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .progress-section {
      margin-bottom: 1.5rem;
    }

    .progress-label {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 0.4rem;
    }

    .progress-section sl-progress-bar {
      --height: 6px;
    }
  `;

  @property() projectId = "";
  @property() requestId = "";

  @state() private _request: RequestDetailView | null = null;

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _editing = false;
  @state() private _editTitle = "";
  @state() private _editBody = "";
  @state() private _saving = false;
  @state() private _transitioning = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (
      (changed.has("requestId") || changed.has("projectId")) &&
      this.requestId &&
      this.projectId
    ) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId || !this.requestId) return;
    this._loading = true;
    this._error = "";
    this._editing = false;
    try {
      this._request = await fetchRequest(this.projectId, this.requestId);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requestDetail.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _startEdit() {
    if (!this._request) return;
    this._editTitle = this._request.title;
    this._editBody = this._request.body;
    this._editing = true;
  }

  private _cancelEdit() {
    this._editing = false;
  }

  private async _saveEdit() {
    if (!this._request) return;
    this._saving = true;
    this._error = "";
    try {
      const updates: Record<string, string> = {};
      if (this._editTitle !== this._request.title)
        updates.title = this._editTitle;
      if (this._editBody !== this._request.body) updates.body = this._editBody;
      if (Object.keys(updates).length > 0) {
        this._request = await updateRequest(
          this.projectId,
          this.requestId,
          updates,
        );
      }
      this._editing = false;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requestDetail.errorSave");
    } finally {
      this._saving = false;
    }
  }

  private async _transition(status: string) {
    if (!this._request) return;
    this._transitioning = true;
    this._error = "";
    try {
      this._request = await updateRequest(this.projectId, this.requestId, {
        status,
      });
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requestDetail.errorStatus");
    } finally {
      this._transitioning = false;
    }
  }

  private _isEditable(): boolean {
    return (
      this._request?.status === "pending" ||
      this._request?.status === "analyzing"
    );
  }

  private _handleDispatchAction(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    const r = this._request;
    if (!r) return;

    const title = r.title;
    const body = r.body ? `\n\n${r.body}` : "";

    switch (action) {
      case "analyze":
        this._invokeDialog.showWithPerspective(
          "researcher",
          `Analyze this feature request and summarize the key needs, use cases, and impact: ${title}.${body}`,
        );
        break;
      case "decompose":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Decompose this feature request into implementable tasks: ${title}.${body} Break it down into concrete, actionable work items.`,
        );
        break;
      case "feasibility":
        this._invokeDialog.showWithPerspective(
          "reviewer",
          `Assess the technical feasibility and implementation effort for this feature request: ${title}.${body} Evaluate complexity, risks, and estimated effort.`,
        );
        break;
      case "custom":
      default:
        this._invokeDialog.show();
        break;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner style="font-size: 1.5rem;"></sl-spinner>
      </div>`;
    }

    if (!this._request) {
      return html`<div
        style="text-align: center; color: var(--text-tertiary); padding: 2rem;"
      >
        ${t("requestDetail.notFound")}
      </div>`;
    }

    const r = this._request;
    const transitions = TRANSITIONS[r.status] ?? [];

    return html`
      ${this._error
        ? html`<sl-alert variant="danger" open style="margin-bottom: 0.75rem;"
            >${this._error}</sl-alert
          >`
        : nothing}

      <div class="header">
        <sl-button
          class="back-btn"
          size="small"
          variant="text"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("request-back", {
                bubbles: true,
                composed: true,
              }),
            )}
        >
          <sl-icon name="arrow-left"></sl-icon>
        </sl-button>
        <div class="header-content">
          <div class="title-row">
            ${this._editing
              ? html`
                  <sl-input
                    class="title-input"
                    size="small"
                    value=${this._editTitle}
                    @sl-input=${(e: CustomEvent) => {
                      this._editTitle = (e.target as HTMLInputElement).value;
                    }}
                  ></sl-input>
                `
              : html` <h2>${r.title}</h2> `}
            <sl-badge variant=${STATUS_VARIANTS[r.status]}
              >${t(STATUS_LABEL_KEYS[r.status])}</sl-badge
            >
          </div>
          <div class="meta">
            <span
              >${t("requestDetail.updated", {
                time: relativeTime(r.updated_at),
              })}</span
            >
            <span
              >${t("requestDetail.created", {
                time: relativeTime(r.created_at),
              })}</span
            >
          </div>
        </div>
      </div>

      ${transitions.length > 0 || this._isEditable() || this.projectId
        ? html`
            <div class="actions">
              ${this._isEditable() && !this._editing
                ? html`
                    <sl-button
                      size="small"
                      variant="default"
                      @click=${() => this._startEdit()}
                    >
                      <sl-icon slot="prefix" name="pencil"></sl-icon>
                      ${t("requestDetail.edit")}
                    </sl-button>
                  `
                : nothing}
              ${transitions.map(
                (tr) => html`
                  <sl-button
                    size="small"
                    variant=${tr.variant}
                    ?loading=${this._transitioning}
                    @click=${() => void this._transition(tr.status)}
                  >
                    ${t(tr.label)}
                  </sl-button>
                `,
              )}
              ${this.projectId
                ? html`
                    <sl-dropdown>
                      <sl-button
                        slot="trigger"
                        caret
                        size="small"
                        variant="primary"
                        outline
                        aria-label=${t("dispatch.request.button")}
                        aria-haspopup="menu"
                      >
                        <sl-icon slot="prefix" name="robot"></sl-icon>
                        ${t("dispatch.request.button")}
                      </sl-button>
                      <sl-menu
                        @sl-select=${(e: CustomEvent) =>
                          this._handleDispatchAction(e)}
                      >
                        <sl-menu-item value="analyze">
                          <sl-icon slot="prefix" name="search"></sl-icon>
                          ${t("dispatch.request.action.analyze")}
                        </sl-menu-item>
                        <sl-menu-item value="decompose">
                          <sl-icon slot="prefix" name="diagram-3"></sl-icon>
                          ${t("dispatch.request.action.decompose")}
                        </sl-menu-item>
                        <sl-menu-item value="feasibility">
                          <sl-icon
                            slot="prefix"
                            name="clipboard-check"
                          ></sl-icon>
                          ${t("dispatch.request.action.feasibility")}
                        </sl-menu-item>
                        <sl-divider></sl-divider>
                        <sl-menu-item value="custom">
                          <sl-icon slot="prefix" name="gear"></sl-icon>
                          ${t("dispatch.request.action.custom")}
                        </sl-menu-item>
                      </sl-menu>
                    </sl-dropdown>
                  `
                : nothing}
            </div>
          `
        : nothing}
      ${r.requirement_total_count > 0
        ? html`
            <div class="progress-section">
              <div class="progress-label">
                ${t("requestDetail.progress", {
                  satisfied: r.requirement_satisfied_count,
                  total: r.requirement_total_count,
                })}
              </div>
              <sl-progress-bar
                value=${Math.round(
                  (r.requirement_satisfied_count / r.requirement_total_count) *
                    100,
                )}
              ></sl-progress-bar>
            </div>
          `
        : nothing}

      <div class="section">
        <div class="section-label">${t("requestDetail.body")}</div>
        ${this._editing
          ? html`
              <sl-textarea
                rows="6"
                value=${this._editBody}
                @sl-input=${(e: CustomEvent) => {
                  this._editBody = (e.target as HTMLTextAreaElement).value;
                }}
              ></sl-textarea>
              <div class="edit-controls">
                <sl-button
                  size="small"
                  variant="default"
                  @click=${() => this._cancelEdit()}
                  >${t("requestDetail.cancel")}</sl-button
                >
                <sl-button
                  size="small"
                  variant="primary"
                  ?loading=${this._saving}
                  @click=${() => void this._saveEdit()}
                >
                  ${t("requestDetail.save")}
                </sl-button>
              </div>
            `
          : html`
              ${r.body
                ? html`
                    <markdown-content .content=${r.body}></markdown-content>
                  `
                : html`
                    <div class="empty-body">
                      ${t("requestDetail.noAnalysis")}
                    </div>
                  `}
            `}
      </div>

      <sl-details summary=${t("requestDetail.analysis")} ?open=${!!r.analysis}>
        <div class="section" style="margin-top: 0.5rem;">
          ${r.analysis
            ? html`
                <markdown-content .content=${r.analysis}></markdown-content>
              `
            : html`
                <div class="empty-body">${t("requestDetail.noAnalysis")}</div>
              `}
        </div>
      </sl-details>

      <div class="section" style="margin-top: 1.5rem;">
        <div class="section-label">
          ${t("requestDetail.linkedRequirements")}
          (${r.linked_requirement_ids.length})
        </div>
        ${r.linked_requirement_ids.length > 0
          ? html`
              <div class="chips">
                ${r.linked_requirement_ids.map(
                  (id) => html`<span class="chip">${id.slice(0, 8)}</span>`,
                )}
              </div>
            `
          : html`
              <div class="empty-body">${t("requestDetail.noRequirements")}</div>
            `}
      </div>

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "request-detail": RequestDetail;
  }
}
