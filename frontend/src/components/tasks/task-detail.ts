import { LitElement, html, css, nothing } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import "./task-description.js";
import "./task-comment-thread.js";
import "./task-metadata-panel.js";
import "./task-dependencies.js";
import {
  fetchTask,
  fetchProjectTask,
  fetchTasks,
  updateTask,
  deleteTask,
  addComment,
  addDependency,
  removeDependency,
  fetchActivity,
  type ActivityEvent,
} from "../../state/task-api.js";
import {
  type TaskDetailView,
  type AiTriage,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_VARIANTS,
} from "../../state/task-types.js";
import { store, type SessionParticipant } from "../../state/app-state.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/tag/tag.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";

@customElement("task-detail")
export class TaskDetail extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Header card ── */
    .header-card {
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.25rem;
    }

    .header-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .back-btn {
      flex-shrink: 0;
    }

    .header-title-area {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .type-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .title-display {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: default;
      position: relative;
    }

    .title-display:hover {
      color: var(--sl-color-primary-400);
    }

    .title-display .edit-hint {
      display: none;
      margin-left: 0.35rem;
      font-size: 0.8rem;
      width: 0.8rem;
      height: 0.8rem;
      color: var(--text-tertiary);
      vertical-align: middle;
    }

    .title-display:hover .edit-hint {
      display: inline;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    /* ── Parent breadcrumb ── */
    .parent-breadcrumb {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--sl-color-primary-400);
      cursor: pointer;
      margin-bottom: 0.75rem;
    }

    .parent-breadcrumb:hover {
      color: var(--sl-color-primary-300);
      text-decoration: underline;
    }

    .parent-breadcrumb sl-icon {
      font-size: 0.75rem;
    }

    /* ── Two-column layout ── */
    .body-layout {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 1.25rem;
    }

    @media (max-width: 720px) {
      .body-layout {
        grid-template-columns: 1fr;
      }
    }

    .main-column {
      min-width: 0;
    }

    /* ── Blocked banner ── */
    .blocked-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(var(--sl-color-warning-500-rgb, 245, 158, 11), 0.1);
      border: 1px solid var(--sl-color-warning-500);
      border-radius: 6px;
      font-size: 0.85rem;
      color: var(--sl-color-warning-500);
      margin-bottom: 1rem;
    }

    /* ── Children ── */
    .children-section {
      margin-bottom: 1.25rem;
    }

    .section-heading {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .child-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .child-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      transition:
        background 0.15s,
        border-color 0.15s;
    }

    .child-item:hover {
      background: var(--surface-card-hover);
      border-color: var(--border-medium);
    }

    .child-item .child-title {
      flex: 1;
      color: var(--text-primary);
      font-weight: 500;
    }

    /* ── Misc ── */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
    }

    .edit-hint {
      display: none;
      font-size: 0.7rem;
      width: 0.7rem;
      height: 0.7rem;
      color: var(--text-tertiary);
    }

    .no-description {
      color: var(--text-tertiary);
      font-style: italic;
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 6px;
      border: 1px dashed var(--border-subtle);
      text-align: center;
    }

    /* ── AI Suggestions ── */
    .ai-suggestions-card {
      background: var(--surface-card);
      border: 1px solid var(--sl-color-primary-700);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
    }

    .ai-suggestions-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sl-color-primary-400);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.6rem;
    }

    .ai-suggestions-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.5rem;
    }

    .ai-reasoning {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      line-height: 1.4;
      margin: 0;
    }

    /* ── Completion Summary ── */
    .completion-summary {
      background: var(--surface-card);
      border: 1px solid var(--sl-color-success-700);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
    }

    .completion-summary-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sl-color-success-400);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .completion-summary-text {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0;
    }
  `;

  @property({ type: String, attribute: "session-code" }) sessionCode = "";
  @property({ type: String, attribute: "project-id" }) projectId = "";
  @property({ type: String, attribute: "task-id" }) taskId = "";
  @property({ type: Boolean }) readonly = false;
  @property({ type: Array }) participants: SessionParticipant[] = [];

  @state() private _task: TaskDetailView | null = null;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _editingTitle = false;
  @state() private _activity: ActivityEvent[] = [];
  @state() private _allTasks: {
    id: string;
    ticket_id: string;
    title: string;
  }[] = [];

  private _storeUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadTask();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === "tasks-changed") {
        this._loadTask();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
    this._storeUnsub = null;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("taskId") && this.taskId) {
      this._loadTask();
    }
  }

  private async _loadTask() {
    if ((!this.sessionCode && !this.projectId) || !this.taskId) return;
    this._loading = true;
    this._error = "";
    try {
      const taskPromise = this.sessionCode
        ? fetchTask(this.sessionCode, this.taskId)
        : fetchProjectTask(this.projectId, this.taskId);
      const activityPromise = this.sessionCode
        ? fetchActivity(this.sessionCode, {
            target_id: this.taskId,
          }).catch(() => [] as ActivityEvent[])
        : Promise.resolve([] as ActivityEvent[]);
      const [task, activity] = await Promise.all([
        taskPromise,
        activityPromise,
      ]);
      this._task = task;
      this._activity = activity;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private async _updateField(fields: Record<string, unknown>) {
    if (!this._task) return;
    try {
      await updateTask(this.sessionCode, this._task.id, fields);
      await this._loadTask();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorUpdate");
    }
  }

  private async _handleDelete() {
    if (!this._task) return;
    try {
      await deleteTask(this.sessionCode, this._task.id);
      this.dispatchEvent(new CustomEvent("deleted"));
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorDelete");
    }
  }

  private async _handleAddComment(text: string) {
    if (!this._task || !text) return;
    try {
      await addComment(this.sessionCode, this._task.id, text);
      await this._loadTask();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorComment");
    }
  }

  private async _handleAddBlocker(blockerId: string) {
    if (!this._task) return;
    try {
      await addDependency(this.sessionCode, blockerId, this._task.id);
      await this._loadTask();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorAddDep");
    }
  }

  private async _handleRemoveBlocker(blockerId: string) {
    if (!this._task) return;
    try {
      await removeDependency(this.sessionCode, blockerId, this._task.id);
      await this._loadTask();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorRemoveDep");
    }
  }

  private async _handleRemoveBlocks(blockedId: string) {
    if (!this._task) return;
    try {
      await removeDependency(this.sessionCode, this._task.id, blockedId);
      await this._loadTask();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskDetail.errorRemoveDep");
    }
  }

  private async _loadAllTasks() {
    if (this._allTasks.length > 0) return;
    try {
      const tasks = await fetchTasks(this.sessionCode);
      this._allTasks = tasks.map((tk) => ({
        id: tk.id,
        ticket_id: tk.ticket_id,
        title: tk.title,
      }));
    } catch {
      /* ignore */
    }
  }

  private _renderAiSuggestions(task: TaskDetailView) {
    const ai = task.ai_triage;
    if (!ai) return nothing;

    return html`
      <div class="ai-suggestions-card">
        <div class="ai-suggestions-header">
          <sl-icon name="robot"></sl-icon>
          AI Suggestions
        </div>
        <div class="ai-suggestions-chips">
          ${ai.suggested_priority
            ? html`<sl-tag variant="primary" size="small"
                >Priority: ${ai.suggested_priority}</sl-tag
              >`
            : nothing}
          ${ai.suggested_complexity
            ? html`<sl-tag variant="primary" size="small"
                >Complexity: ${ai.suggested_complexity}</sl-tag
              >`
            : nothing}
          ${ai.suggested_type
            ? html`<sl-tag variant="primary" size="small"
                >Type: ${ai.suggested_type}</sl-tag
              >`
            : nothing}
        </div>
        ${ai.reasoning
          ? html`<p class="ai-reasoning">${ai.reasoning}</p>`
          : nothing}
      </div>
    `;
  }

  private _renderCompletionSummary(task: TaskDetailView) {
    if (!task.completion_summary) return nothing;
    return html`
      <div class="completion-summary">
        <div class="completion-summary-header">
          <sl-icon name="check-circle"></sl-icon>
          Completion Summary
        </div>
        <p class="completion-summary-text">${task.completion_summary}</p>
      </div>
    `;
  }

  private _renderChildren(task: TaskDetailView) {
    return html`
      <div class="children-section">
        <div
          class="section-heading"
          style="display: flex; align-items: center; justify-content: space-between;"
        >
          <span
            >${t("taskDetail.childrenCount", {
              count: task.children.length,
            })}</span
          >
          <sl-button
            size="small"
            variant="text"
            @click=${() =>
              this.dispatchEvent(
                new CustomEvent("create-child", { detail: task.id }),
              )}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${t("taskDetail.add")}
          </sl-button>
        </div>
        ${task.children.length > 0
          ? html`
              <div class="child-list">
                ${task.children.map(
                  (child) => html`
                    <div
                      class="child-item"
                      @click=${() =>
                        this.dispatchEvent(
                          new CustomEvent("navigate-task", {
                            detail: child.id,
                          }),
                        )}
                    >
                      <sl-icon
                        name=${TASK_TYPE_ICONS[child.task_type]}
                        style="color: ${TASK_TYPE_COLORS[child.task_type]}"
                      ></sl-icon>
                      <span
                        style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;"
                        >${child.ticket_id}</span
                      >
                      <span class="child-title">${child.title}</span>
                      <sl-badge
                        variant=${STATUS_VARIANTS[child.status] as string}
                        pill
                        size="small"
                      >
                        ${STATUS_LABELS[child.status]}
                      </sl-badge>
                    </div>
                  `,
                )}
              </div>
            `
          : html`
              <span
                class="no-description"
                style="cursor: default; border: none; padding: 0.25rem;"
                >${t("taskDetail.noChildren")}</span
              >
            `}
      </div>
    `;
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner style="font-size: 2rem;"></sl-spinner>
      </div>`;
    }

    if (!this._task) {
      return html`
        <sl-alert variant="danger" open>${t("taskDetail.notFound")}</sl-alert>
        <sl-button @click=${() => this.dispatchEvent(new CustomEvent("back"))}
          >${t("taskDetail.back")}</sl-button
        >
      `;
    }

    const task = this._task;
    const typeColor = TASK_TYPE_COLORS[task.task_type];

    return html`
      ${this._error
        ? html`
            <sl-alert
              variant="danger"
              open
              closable
              @sl-after-hide=${() => {
                this._error = "";
              }}
              style="margin-bottom: 1rem;"
            >
              ${this._error}
            </sl-alert>
          `
        : nothing}
      ${task.parent
        ? html`
            <div
              class="parent-breadcrumb"
              @click=${() =>
                this.dispatchEvent(
                  new CustomEvent("navigate-task", {
                    detail: task.parent!.id,
                  }),
                )}
            >
              <sl-icon
                name=${TASK_TYPE_ICONS[task.parent.task_type]}
                style="color: ${TASK_TYPE_COLORS[task.parent.task_type]}"
              ></sl-icon>
              <span style="font-family: var(--sl-font-mono); opacity: 0.7;"
                >${task.parent.ticket_id}</span
              >
              ${task.parent.title}
            </div>
          `
        : nothing}

      <!-- Header card -->
      <div class="header-card">
        <div class="header-top">
          <sl-icon-button
            class="back-btn"
            name="arrow-left"
            label=${t("taskDetail.back")}
            @click=${() => this.dispatchEvent(new CustomEvent("back"))}
          ></sl-icon-button>

          <div class="header-title-area">
            <sl-icon
              class="type-icon"
              name=${TASK_TYPE_ICONS[task.task_type]}
              style="color: ${typeColor}"
            ></sl-icon>
            <span
              style="font-family: var(--sl-font-mono); color: var(--text-secondary); font-size: 0.9rem; white-space: nowrap;"
              >${task.ticket_id}</span
            >
            ${this._editingTitle
              ? html`<sl-input
                  value=${task.title}
                  size="large"
                  style="flex: 1;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && val !== task.title)
                      void this._updateField({ title: val });
                    this._editingTitle = false;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Escape") this._editingTitle = false;
                  }}
                ></sl-input>`
              : html`<h2
                  class="title-display"
                  @click=${() => {
                    this._editingTitle = true;
                  }}
                >
                  ${task.title}<sl-icon
                    class="edit-hint"
                    name="pencil"
                  ></sl-icon>
                </h2>`}
          </div>

          <div class="header-actions">
            <sl-badge variant=${STATUS_VARIANTS[task.status] as string} pill>
              ${STATUS_LABELS[task.status]}
            </sl-badge>

            <sl-dropdown>
              <sl-icon-button
                slot="trigger"
                name="three-dots-vertical"
                label=${t("taskBoard.action.actions")}
              ></sl-icon-button>
              <sl-menu>
                ${task.status !== "in_progress"
                  ? html`
                      <sl-menu-item
                        @click=${() =>
                          void this._updateField({ status: "in_progress" })}
                      >
                        <sl-icon slot="prefix" name="play-fill"></sl-icon>
                        ${t("taskDetail.startWork")}
                      </sl-menu-item>
                    `
                  : nothing}
                ${task.status !== "done"
                  ? html`
                      <sl-menu-item
                        @click=${() =>
                          void this._updateField({ status: "done" })}
                      >
                        <sl-icon slot="prefix" name="check-lg"></sl-icon>
                        ${t("taskDetail.markDone")}
                      </sl-menu-item>
                    `
                  : nothing}
                ${task.status !== "closed"
                  ? html`
                      <sl-menu-item
                        @click=${() =>
                          void this._updateField({ status: "closed" })}
                      >
                        <sl-icon slot="prefix" name="x-circle"></sl-icon>
                        ${t("taskDetail.close")}
                      </sl-menu-item>
                    `
                  : nothing}
                ${task.status !== "open"
                  ? html`
                      <sl-menu-item
                        @click=${() =>
                          void this._updateField({ status: "open" })}
                      >
                        <sl-icon
                          slot="prefix"
                          name="arrow-counterclockwise"
                        ></sl-icon>
                        ${t("taskDetail.reopen")}
                      </sl-menu-item>
                    `
                  : nothing}
                <sl-divider></sl-divider>
                <sl-menu-item
                  @click=${() =>
                    this.dispatchEvent(
                      new CustomEvent("create-child", { detail: task.id }),
                    )}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${t("taskDetail.addChild")}
                </sl-menu-item>
                <sl-divider></sl-divider>
                <sl-menu-item
                  style="color: var(--sl-color-danger-500);"
                  @click=${() => void this._handleDelete()}
                >
                  <sl-icon slot="prefix" name="trash"></sl-icon>
                  ${t("taskDetail.delete")}
                </sl-menu-item>
              </sl-menu>
            </sl-dropdown>
          </div>
        </div>
      </div>

      <!-- Body: main + sidebar -->
      <div class="body-layout">
        <div class="main-column">
          ${task.blocked_by.length > 0
            ? html`
                <div class="blocked-banner">
                  <sl-icon name="exclamation-triangle-fill"></sl-icon>
                  ${t("taskDetail.blockedBy")}
                  ${task.blocked_by.map((b) => b.ticket_id).join(", ")}
                </div>
              `
            : nothing}
          ${this._renderAiSuggestions(task)}
          ${this._renderCompletionSummary(task)}

          <task-description
            .description=${task.description}
            @description-changed=${(e: CustomEvent) =>
              void this._updateField({
                description: e.detail.description,
              })}
          ></task-description>

          ${this._renderChildren(task)}

          <task-dependencies
            .task=${task}
            .allTasks=${this._allTasks}
            @blocker-added=${(e: CustomEvent) =>
              void this._handleAddBlocker(e.detail.blockerId)}
            @blocker-removed=${(e: CustomEvent) =>
              void this._handleRemoveBlocker(e.detail.blockerId)}
            @blocks-removed=${(e: CustomEvent) =>
              void this._handleRemoveBlocks(e.detail.blockedId)}
            @navigate-task=${(e: CustomEvent) =>
              this.dispatchEvent(
                new CustomEvent("navigate-task", {
                  detail: e.detail,
                  bubbles: true,
                  composed: true,
                }),
              )}
            @load-all-tasks=${() => void this._loadAllTasks()}
          ></task-dependencies>

          <sl-divider></sl-divider>

          <task-comment-thread
            .comments=${task.comments}
            .activity=${this._activity}
            .participants=${this.participants}
            @comment-added=${(e: CustomEvent) =>
              void this._handleAddComment(e.detail.text)}
          ></task-comment-thread>
        </div>

        <task-metadata-panel
          .task=${task}
          .participants=${this.participants}
          .projectId=${this.projectId}
          @field-changed=${(e: CustomEvent) =>
            void this._updateField(e.detail.fields)}
          @navigate-task=${(e: CustomEvent) =>
            this.dispatchEvent(
              new CustomEvent("navigate-task", {
                detail: e.detail,
                bubbles: true,
                composed: true,
              }),
            )}
        ></task-metadata-panel>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-detail": TaskDetail;
  }
}
