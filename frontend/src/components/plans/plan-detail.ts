import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  fetchPlan,
  updatePlan,
  type PlanDetailView,
  type PlanStatusType,
} from "../../state/plan-api.js";
import { t } from "../../lib/i18n.js";
import { relativeTime } from "../../lib/date-utils.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";

import "../shared/markdown-content.js";
import "../invocations/invoke-dialog.js";

const STATUS_VARIANTS: Record<PlanStatusType, string> = {
  draft: "neutral",
  review: "warning",
  accepted: "success",
  superseded: "neutral",
  abandoned: "neutral",
};

const STATUS_LABEL_KEYS: Record<PlanStatusType, string> = {
  draft: "planList.status.draft",
  review: "planList.status.review",
  accepted: "planList.status.accepted",
  superseded: "planList.status.superseded",
  abandoned: "planList.status.abandoned",
};

interface Transition {
  label: string;
  status: string;
  variant: string;
}

const TRANSITIONS: Record<PlanStatusType, Transition[]> = {
  draft: [
    {
      label: "planDetail.transition.submitForReview",
      status: "review",
      variant: "warning",
    },
    {
      label: "planDetail.transition.abandon",
      status: "abandoned",
      variant: "danger",
    },
  ],
  review: [
    {
      label: "planDetail.transition.accept",
      status: "accepted",
      variant: "success",
    },
    {
      label: "planDetail.transition.returnToDraft",
      status: "draft",
      variant: "neutral",
    },
    {
      label: "planDetail.transition.abandon",
      status: "abandoned",
      variant: "danger",
    },
  ],
  accepted: [
    {
      label: "planDetail.transition.supersede",
      status: "superseded",
      variant: "neutral",
    },
    {
      label: "planDetail.transition.abandon",
      status: "abandoned",
      variant: "danger",
    },
  ],
  superseded: [],
  abandoned: [],
};

@customElement("plan-detail")
export class PlanDetail extends LitElement {
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
      min-height: 200px;
    }

    .edit-controls {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      justify-content: flex-end;
    }

    sl-textarea::part(textarea) {
      min-height: 300px;
      font-family: var(--sl-font-mono);
      font-size: 0.875rem;
    }

    .empty-body {
      color: var(--text-tertiary);
      font-style: italic;
    }
  `;

  @property() projectId = "";
  @property() planId = "";

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;

  @state() private _plan: PlanDetailView | null = null;
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
      (changed.has("planId") || changed.has("projectId")) &&
      this.planId &&
      this.projectId
    ) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId || !this.planId) return;
    this._loading = true;
    this._error = "";
    this._editing = false;
    try {
      this._plan = await fetchPlan(this.projectId, this.planId);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("planDetail.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _startEdit() {
    if (!this._plan) return;
    this._editTitle = this._plan.title;
    this._editBody = this._plan.body;
    this._editing = true;
  }

  private _cancelEdit() {
    this._editing = false;
  }

  private async _saveEdit() {
    if (!this._plan) return;
    this._saving = true;
    this._error = "";
    try {
      const updates: Record<string, string> = {};
      if (this._editTitle !== this._plan.title) updates.title = this._editTitle;
      if (this._editBody !== this._plan.body) updates.body = this._editBody;
      if (Object.keys(updates).length > 0) {
        this._plan = await updatePlan(this.projectId, this.planId, updates);
      }
      this._editing = false;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("planDetail.errorSave");
    } finally {
      this._saving = false;
    }
  }

  private async _transition(status: string) {
    if (!this._plan) return;
    this._transitioning = true;
    this._error = "";
    try {
      this._plan = await updatePlan(this.projectId, this.planId, { status });
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("planDetail.errorStatus");
    } finally {
      this._transitioning = false;
    }
  }

  private _isEditable(): boolean {
    return this._plan?.status === "draft" || this._plan?.status === "review";
  }

  private _handleDispatchAction(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    const plan = this._plan;
    if (!plan) return;

    switch (action) {
      case "review":
        this._invokeDialog.showWithPerspective(
          "reviewer",
          `Review this design plan: ${plan.title}. Evaluate for completeness, feasibility, security implications, and identify gaps.`,
        );
        break;
      case "implement":
        this._invokeDialog.showWithPerspective(
          "coder",
          `Implement this plan: ${plan.title}. Follow the design described in the plan and create the implementation.`,
        );
        break;
      case "research":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Research the technical approach for this plan: ${plan.title}. Explore the codebase and validate the assumptions in the plan.`,
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

    if (!this._plan) {
      return html`<div
        style="text-align: center; color: var(--text-tertiary); padding: 2rem;"
      >
        ${t("planDetail.notFound")}
      </div>`;
    }

    const p = this._plan;
    const transitions = TRANSITIONS[p.status] ?? [];

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
          aria-label="Back to plans"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("plan-back", { bubbles: true, composed: true }),
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
              : html` <h2>${p.title}</h2> `}
            <sl-badge variant=${STATUS_VARIANTS[p.status]}
              >${t(STATUS_LABEL_KEYS[p.status])}</sl-badge
            >
          </div>
          <div class="meta">
            <span
              >${t("planDetail.updated", {
                time: relativeTime(p.updated_at),
              })}</span
            >
            <span
              >${t("planDetail.created", {
                time: relativeTime(p.created_at),
              })}</span
            >
          </div>
        </div>
      </div>

      ${transitions.length > 0 || this._isEditable()
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
                      ${t("planDetail.edit")}
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
            </div>
          `
        : nothing}
      ${this.projectId
        ? html`
            <div class="actions">
              <sl-dropdown>
                <sl-button
                  slot="trigger"
                  caret
                  variant="default"
                  size="small"
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
                  <sl-menu-item value="review">
                    <sl-icon slot="prefix" name="search"></sl-icon>
                    Review Plan
                  </sl-menu-item>
                  <sl-menu-item value="implement">
                    <sl-icon slot="prefix" name="code-slash"></sl-icon>
                    Implement
                  </sl-menu-item>
                  <sl-menu-item value="research">
                    <sl-icon slot="prefix" name="book"></sl-icon>
                    Research
                  </sl-menu-item>
                  <sl-divider></sl-divider>
                  <sl-menu-item value="custom">
                    <sl-icon slot="prefix" name="gear"></sl-icon>
                    Custom...
                  </sl-menu-item>
                </sl-menu>
              </sl-dropdown>
            </div>
          `
        : nothing}

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>

      <div class="body-section">
        ${this._editing
          ? html`
              <sl-textarea
                rows="15"
                value=${this._editBody}
                @sl-input=${(e: CustomEvent) => {
                  this._editBody = (e.target as HTMLTextAreaElement).value;
                }}
                placeholder=${t("planDetail.placeholder")}
              ></sl-textarea>
              <div class="edit-controls">
                <sl-button
                  size="small"
                  variant="default"
                  @click=${() => this._cancelEdit()}
                  >${t("planDetail.cancel")}</sl-button
                >
                <sl-button
                  size="small"
                  variant="primary"
                  ?loading=${this._saving}
                  @click=${() => void this._saveEdit()}
                >
                  ${t("planDetail.save")}
                </sl-button>
              </div>
            `
          : html`
              ${p.body
                ? html`
                    <markdown-content .content=${p.body}></markdown-content>
                  `
                : html`
                    <div class="empty-body">
                      ${this._isEditable()
                        ? t("planDetail.emptyBodyEditable")
                        : t("planDetail.emptyBody")}
                    </div>
                  `}
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "plan-detail": PlanDetail;
  }
}
