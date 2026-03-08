import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  fetchRequirement,
  updateRequirement,
  type RequirementDetailView,
  type RequirementStatusType,
  type RequirementPriority,
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
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/progress-bar/progress-bar.js";
import "../invocations/invoke-dialog.js";

const STATUS_VARIANTS: Record<RequirementStatusType, string> = {
  draft: "neutral",
  active: "primary",
  satisfied: "success",
  archived: "neutral",
};

const STATUS_LABEL_KEYS: Record<RequirementStatusType, string> = {
  draft: "requirementList.status.draft",
  active: "requirementList.status.active",
  satisfied: "requirementList.status.satisfied",
  archived: "requirementList.status.archived",
};

const PRIORITY_VARIANTS: Record<RequirementPriority, string> = {
  critical: "danger",
  high: "warning",
  medium: "neutral",
  low: "neutral",
};

const PRIORITY_LABEL_KEYS: Record<RequirementPriority, string> = {
  critical: "requirementList.priority.critical",
  high: "requirementList.priority.high",
  medium: "requirementList.priority.medium",
  low: "requirementList.priority.low",
};

interface Transition {
  label: string;
  status: string;
  variant: string;
}

const TRANSITIONS: Record<RequirementStatusType, Transition[]> = {
  draft: [
    {
      label: "requirementDetail.transition.activate",
      status: "active",
      variant: "primary",
    },
    {
      label: "requirementDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  active: [
    {
      label: "requirementDetail.transition.satisfy",
      status: "satisfied",
      variant: "success",
    },
    {
      label: "requirementDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  satisfied: [
    {
      label: "requirementDetail.transition.reopen",
      status: "active",
      variant: "primary",
    },
    {
      label: "requirementDetail.transition.archive",
      status: "archived",
      variant: "neutral",
    },
  ],
  archived: [
    {
      label: "requirementDetail.transition.reopen",
      status: "draft",
      variant: "primary",
    },
  ],
};

@customElement("requirement-detail")
export class RequirementDetail extends LitElement {
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

    .body-section {
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      background: var(--surface-card);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
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

    .sub-section {
      margin-bottom: 1.5rem;
    }

    .sub-section-title {
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

    .child-list,
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .child-row,
    .task-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      background: var(--surface-card);
      font-size: 0.85rem;
    }

    .child-row:not(:last-child),
    .task-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .child-title,
    .task-id {
      color: var(--text-primary);
      font-weight: 500;
    }

    .task-id {
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
      color: var(--sl-color-primary-400);
    }

    .empty-sub {
      color: var(--text-tertiary);
      font-size: 0.85rem;
      font-style: italic;
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
  @property() requirementId = "";

  @state() private _req: RequirementDetailView | null = null;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _editing = false;
  @state() private _editTitle = "";
  @state() private _editDesc = "";
  @state() private _saving = false;
  @state() private _transitioning = false;

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (
      (changed.has("requirementId") || changed.has("projectId")) &&
      this.requirementId &&
      this.projectId
    ) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId || !this.requirementId) return;
    this._loading = true;
    this._error = "";
    this._editing = false;
    try {
      this._req = await fetchRequirement(this.projectId, this.requirementId);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requirementDetail.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _startEdit() {
    if (!this._req) return;
    this._editTitle = this._req.title;
    this._editDesc = this._req.description;
    this._editing = true;
  }

  private _cancelEdit() {
    this._editing = false;
  }

  private async _saveEdit() {
    if (!this._req) return;
    this._saving = true;
    this._error = "";
    try {
      const updates: Record<string, string> = {};
      if (this._editTitle !== this._req.title) updates.title = this._editTitle;
      if (this._editDesc !== this._req.description)
        updates.description = this._editDesc;
      if (Object.keys(updates).length > 0) {
        this._req = await updateRequirement(
          this.projectId,
          this.requirementId,
          updates,
        );
      }
      this._editing = false;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requirementDetail.errorSave");
    } finally {
      this._saving = false;
    }
  }

  private async _transition(status: string) {
    if (!this._req) return;
    this._transitioning = true;
    this._error = "";
    try {
      this._req = await updateRequirement(this.projectId, this.requirementId, {
        status,
      });
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("requirementDetail.errorStatus");
    } finally {
      this._transitioning = false;
    }
  }

  private _isEditable(): boolean {
    return this._req?.status === "draft" || this._req?.status === "active";
  }

  private _handleDispatchAction(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    const r = this._req;
    if (!r) return;

    const title = r.title;
    const desc = r.description ? `\n\n${r.description}` : "";

    switch (action) {
      case "research":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Research the implementation approach for this requirement: ${title}. Explore the codebase, identify affected files, and report findings.`,
        );
        break;
      case "plan":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Decompose this requirement into actionable tasks: ${title}.${desc} Create subtasks with clear scope.`,
        );
        break;
      case "implement":
        this._invokeDialog.showWithPerspective(
          "coder",
          `Implement this requirement: ${title}.${desc}`,
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

    if (!this._req) {
      return html`<div
        style="text-align: center; color: var(--text-tertiary); padding: 2rem;"
      >
        ${t("requirementDetail.notFound")}
      </div>`;
    }

    const r = this._req;
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
          aria-label=${t("requirementDetail.back")}
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("requirement-back", {
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
            <sl-badge variant=${PRIORITY_VARIANTS[r.priority]}
              >${t(PRIORITY_LABEL_KEYS[r.priority])}</sl-badge
            >
          </div>
          <div class="meta">
            <span
              >${t("requirementDetail.updated", {
                time: relativeTime(r.updated_at),
              })}</span
            >
            <span
              >${t("requirementDetail.created", {
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
                      ${t("requirementDetail.edit")}
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
                        aria-label="Dispatch agent actions"
                        aria-haspopup="menu"
                      >
                        <sl-icon slot="prefix" name="robot"></sl-icon>
                        Dispatch Agent
                      </sl-button>
                      <sl-menu
                        @sl-select=${(e: CustomEvent) =>
                          this._handleDispatchAction(e)}
                      >
                        <sl-menu-item value="research">
                          <sl-icon slot="prefix" name="book"></sl-icon>
                          Research
                        </sl-menu-item>
                        <sl-menu-item value="plan">
                          <sl-icon slot="prefix" name="diagram-3"></sl-icon>
                          Plan / Decompose
                        </sl-menu-item>
                        <sl-menu-item value="implement">
                          <sl-icon slot="prefix" name="code-slash"></sl-icon>
                          Implement
                        </sl-menu-item>
                        <sl-divider></sl-divider>
                        <sl-menu-item value="custom">
                          <sl-icon slot="prefix" name="gear"></sl-icon>
                          Custom...
                        </sl-menu-item>
                      </sl-menu>
                    </sl-dropdown>
                  `
                : nothing}
            </div>
          `
        : nothing}
      ${r.task_total_count > 0
        ? html`
            <div class="progress-section">
              <div class="progress-label">
                ${t("requirementDetail.progress", {
                  done: r.task_done_count,
                  total: r.task_total_count,
                })}
              </div>
              <sl-progress-bar
                value=${Math.round(
                  (r.task_done_count / r.task_total_count) * 100,
                )}
              ></sl-progress-bar>
            </div>
          `
        : nothing}

      <div class="body-section">
        ${this._editing
          ? html`
              <sl-textarea
                rows="8"
                value=${this._editDesc}
                @sl-input=${(e: CustomEvent) => {
                  this._editDesc = (e.target as HTMLTextAreaElement).value;
                }}
                placeholder=${t("requirementDetail.descPlaceholder")}
              ></sl-textarea>
              <div class="edit-controls">
                <sl-button
                  size="small"
                  variant="default"
                  @click=${() => this._cancelEdit()}
                  >${t("requirementDetail.cancel")}</sl-button
                >
                <sl-button
                  size="small"
                  variant="primary"
                  ?loading=${this._saving}
                  @click=${() => void this._saveEdit()}
                >
                  ${t("requirementDetail.save")}
                </sl-button>
              </div>
            `
          : html`
              ${r.description
                ? html`<p
                    style="margin: 0; color: var(--text-primary); font-size: 0.9rem; white-space: pre-wrap;"
                  >
                    ${r.description}
                  </p>`
                : html`
                    <div class="empty-body">
                      ${t("requirementDetail.emptyDesc")}
                    </div>
                  `}
            `}
      </div>

      <div class="sub-section">
        <div class="sub-section-title">
          <sl-icon name="diagram-3"></sl-icon>
          ${t("requirementDetail.children")}
        </div>
        ${r.children.length > 0
          ? html`
              <div class="child-list">
                ${r.children.map(
                  (c) => html`
                    <div class="child-row">
                      <sl-icon
                        name="bullseye"
                        style="color: var(--text-tertiary); font-size: 0.8rem;"
                      ></sl-icon>
                      <span class="child-title">${c.title}</span>
                      <sl-badge variant=${STATUS_VARIANTS[c.status]}
                        >${t(STATUS_LABEL_KEYS[c.status])}</sl-badge
                      >
                      <sl-badge variant=${PRIORITY_VARIANTS[c.priority]}
                        >${t(PRIORITY_LABEL_KEYS[c.priority])}</sl-badge
                      >
                    </div>
                  `,
                )}
              </div>
            `
          : html`<div class="empty-sub">
              ${t("requirementDetail.noChildren")}
            </div>`}
      </div>

      <div class="sub-section">
        <div class="sub-section-title">
          <sl-icon name="link-45deg"></sl-icon>
          ${t("requirementDetail.linkedTasks")}
        </div>
        ${r.linked_task_ids.length > 0
          ? html`
              <div class="task-list">
                ${r.linked_task_ids.map(
                  (id) => html`
                    <div class="task-row">
                      <sl-icon
                        name="check2-square"
                        style="color: var(--text-tertiary); font-size: 0.8rem;"
                      ></sl-icon>
                      <span class="task-id">${id.slice(0, 8)}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : html`<div class="empty-sub">
              ${t("requirementDetail.noTasks")}
            </div>`}
      </div>

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "requirement-detail": RequirementDetail;
  }
}
