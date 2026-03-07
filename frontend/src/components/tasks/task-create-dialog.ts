import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createTask, updateTask } from "../../state/task-api.js";
import { t } from "../../lib/i18n.js";
import {
  type TaskView,
  type TaskType,
  type TaskStatus,
  type TaskPriority,
  type TaskComplexity,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ICONS,
  PRIORITY_COLORS,
  COMPLEXITY_LABELS,
} from "../../state/task-types.js";
import type { SessionParticipant } from "../../state/app-state.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";

export interface TaskCreatedDetail {
  task: TaskView;
}

/**
 * Dialog for creating a new task.
 *
 * Properties:
 *   - sessionCode: session to create the task in
 *   - projectId: (unused directly, but kept for context)
 *   - participants: for the assignee picker
 *   - tasks: existing tasks, used to populate parent picker
 *   - open: whether the dialog is visible
 *   - initialType: pre-selected task type
 *   - initialParentId: pre-selected parent task ID
 *   - initialStatus: status to set after creation (e.g. from kanban column)
 *
 * Events:
 *   - task-created: TaskCreatedDetail — fires after successful creation
 *   - close: fired when the dialog should close (parent should set open=false)
 */
@customElement("task-create-dialog")
export class TaskCreateDialog extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .create-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .create-form sl-input,
    .create-form sl-textarea,
    .create-form sl-select {
      width: 100%;
    }
  `;

  @property({ type: String, attribute: "session-code" }) sessionCode = "";
  @property({ type: String, attribute: "project-id" }) projectId = "";
  @property({ type: Array }) participants: SessionParticipant[] = [];
  @property({ type: Array }) tasks: TaskView[] = [];
  @property({ type: Boolean }) open = false;
  @property({ type: String, attribute: "initial-type" })
  initialType: TaskType = "task";
  @property({ type: String, attribute: "initial-parent-id" })
  initialParentId = "";
  @property({ type: String, attribute: "initial-status" })
  initialStatus: TaskStatus | "" = "";

  @state() private _type: TaskType = "task";
  @state() private _title = "";
  @state() private _description = "";
  @state() private _parentId = "";
  @state() private _assignee = "";
  @state() private _priority: TaskPriority = "medium";
  @state() private _complexity: TaskComplexity = "medium";
  @state() private _loading = false;

  updated(changed: Map<string, unknown>) {
    // When open transitions to true, reset form to initial values
    if (changed.has("open") && this.open) {
      this._type = this.initialType;
      this._parentId = this.initialParentId;
      this._title = "";
      this._description = "";
      this._assignee = "";
      this._priority = "medium";
      this._complexity = "medium";
    }
  }

  private async _handleCreate() {
    if (!this._title.trim()) return;
    this._loading = true;
    try {
      const task = await createTask(this.sessionCode, {
        task_type: this._type,
        title: this._title.trim(),
        description: this._description.trim() || undefined,
        parent_id: this._parentId || undefined,
        assigned_to: this._assignee || undefined,
        priority: this._priority !== "medium" ? this._priority : undefined,
        complexity:
          this._complexity !== "medium" ? this._complexity : undefined,
      });
      // If a non-default status was requested (e.g. from kanban column "+"), update it
      if (this.initialStatus && this.initialStatus !== "open") {
        await updateTask(this.sessionCode, task.id, {
          status: this.initialStatus,
        });
      }
      this.dispatchEvent(
        new CustomEvent<TaskCreatedDetail>("task-created", {
          detail: { task },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(
        new CustomEvent("close", { bubbles: true, composed: true }),
      );
    } catch (err) {
      // Surface error to parent via a generic error event
      this.dispatchEvent(
        new CustomEvent("create-error", {
          detail: {
            message:
              err instanceof Error ? err.message : t("taskBoard.errorCreate"),
          },
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      this._loading = false;
    }
  }

  render() {
    const parentCandidates = this.tasks.filter(
      (tk) =>
        tk.task_type === "epic" ||
        tk.task_type === "story" ||
        tk.task_type === "task",
    );

    return html`
      <sl-dialog
        label=${t("taskBoard.create.title")}
        ?open=${this.open}
        @sl-request-close=${() => {
          this.dispatchEvent(
            new CustomEvent("close", { bubbles: true, composed: true }),
          );
        }}
        @sl-after-show=${() => {
          const input = this.shadowRoot?.querySelector(
            ".create-form sl-input",
          ) as HTMLElement | null;
          input?.focus();
        }}
      >
        <div class="create-form">
          <sl-select
            label=${t("taskBoard.create.typeLabel")}
            value=${this._type}
            @sl-change=${(e: Event) => {
              this._type = (e.target as HTMLSelectElement).value as TaskType;
            }}
          >
            ${(["epic", "story", "task", "subtask", "bug"] as TaskType[]).map(
              (tt) => html`
                <sl-option value=${tt}>
                  <sl-icon
                    slot="prefix"
                    name=${TASK_TYPE_ICONS[tt]}
                    style="color: ${TASK_TYPE_COLORS[tt]}"
                  ></sl-icon>
                  ${TASK_TYPE_LABELS[tt]}
                </sl-option>
              `,
            )}
          </sl-select>

          <sl-input
            label=${t("taskBoard.create.titleLabel")}
            placeholder=${t("taskBoard.create.titlePlaceholder")}
            value=${this._title}
            @sl-input=${(e: Event) => {
              this._title = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._handleCreate();
            }}
          ></sl-input>

          <sl-textarea
            label=${t("taskBoard.create.descLabel")}
            placeholder=${t("taskBoard.create.descPlaceholder")}
            value=${this._description}
            @sl-input=${(e: Event) => {
              this._description = (e.target as HTMLTextAreaElement).value;
            }}
            rows="3"
          ></sl-textarea>

          ${this.participants.length > 0
            ? html`
                <sl-select
                  label=${t("taskBoard.create.assigneeLabel")}
                  placeholder=${t("taskBoard.create.unassigned")}
                  clearable
                  value=${this._assignee}
                  @sl-change=${(e: Event) => {
                    this._assignee = (e.target as HTMLSelectElement).value;
                  }}
                >
                  ${this.participants.map(
                    (p) => html`
                      <sl-option value=${p.id}>
                        <sl-icon
                          slot="prefix"
                          name=${p.participant_type === "agent"
                            ? "robot"
                            : "person-fill"}
                        ></sl-icon>
                        ${p.display_name}
                      </sl-option>
                    `,
                  )}
                </sl-select>
              `
            : nothing}

          <div style="display: flex; gap: 0.75rem;">
            <sl-select
              label=${t("taskBoard.create.priorityLabel")}
              value=${this._priority}
              @sl-change=${(e: Event) => {
                this._priority = (e.target as HTMLSelectElement)
                  .value as TaskPriority;
              }}
              style="flex: 1;"
            >
              ${(["critical", "high", "medium", "low"] as const).map(
                (p) => html`
                  <sl-option value=${p}>
                    <sl-icon
                      slot="prefix"
                      name=${PRIORITY_ICONS[p]}
                      style="color: ${PRIORITY_COLORS[p]}"
                    ></sl-icon>
                    ${PRIORITY_LABELS[p]}
                  </sl-option>
                `,
              )}
            </sl-select>

            <sl-select
              label=${t("taskBoard.create.complexityLabel")}
              value=${this._complexity}
              @sl-change=${(e: Event) => {
                this._complexity = (e.target as HTMLSelectElement)
                  .value as TaskComplexity;
              }}
              style="flex: 1;"
            >
              ${(["trivial", "small", "medium", "large", "xl"] as const).map(
                (c) => html`
                  <sl-option value=${c}>${COMPLEXITY_LABELS[c]}</sl-option>
                `,
              )}
            </sl-select>
          </div>

          ${parentCandidates.length > 0
            ? html`
                <sl-select
                  label=${t("taskBoard.create.parentLabel")}
                  placeholder=${t("taskBoard.create.parentNone")}
                  clearable
                  value=${this._parentId}
                  @sl-change=${(e: Event) => {
                    this._parentId = (e.target as HTMLSelectElement).value;
                  }}
                >
                  ${parentCandidates.map(
                    (pc) => html`
                      <sl-option value=${pc.id}>
                        <sl-icon
                          slot="prefix"
                          name=${TASK_TYPE_ICONS[pc.task_type]}
                        ></sl-icon>
                        ${pc.title}
                      </sl-option>
                    `,
                  )}
                </sl-select>
              `
            : nothing}
        </div>

        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this._loading}
          @click=${() => void this._handleCreate()}
          >${t("taskBoard.create.submit")}</sl-button
        >
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-create-dialog": TaskCreateDialog;
  }
}
