import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  addTasksToSession,
  removeTaskFromSession,
} from "../../state/task-api.js";
import { createSession } from "../../state/session-api.js";
import { navigateTo } from "../../router.js";
import { t } from "../../lib/i18n.js";
import {
  type TaskView,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
} from "../../state/task-types.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";

export interface SessionEntry {
  code: string;
  name: string | null;
  id: string;
}

export interface SprintCreatedDetail {
  session: SessionEntry;
}

export interface TaskSprintChangedDetail {
  taskId: string;
  action: "added" | "removed";
  sessionCode: string;
}

/**
 * Sprint planning panel. Rendered when _isProjectMode and panel is open.
 *
 * Properties:
 *   - tasks: full task list (used to find session_ids membership)
 *   - sessions: existing sessions for the project
 *   - projectId: needed to create new sprint sessions
 *   - dragTaskId: ID of the task currently being dragged (from parent)
 *
 * Events:
 *   - sprint-created: SprintCreatedDetail — new session was created
 *   - task-sprint-changed: TaskSprintChangedDetail — task added/removed from sprint
 *   - sprint-error: { message } — an API call failed
 *   - sprint-toast: { message } — success feedback for the parent to show
 *   - drag-consumed: fired after consuming the drag to clear parent state
 */
@customElement("task-sprint-panel")
export class TaskSprintPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .sprint-panel {
      margin-bottom: 1rem;
      border: 1px solid var(--sl-color-neutral-300);
      border-radius: 8px;
      background: var(--sl-color-neutral-50);
      overflow: hidden;
    }

    .sprint-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      gap: 0.75rem;
    }

    .sprint-panel-header sl-input,
    .sprint-panel-header sl-select {
      flex: 1;
      max-width: 280px;
    }

    .sprint-drop-zone {
      min-height: 80px;
      padding: 0.75rem;
      border-top: 1px dashed var(--sl-color-neutral-300);
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: flex-start;
      transition: background 0.15s;
    }

    .sprint-drop-zone.drag-over {
      background: var(--sl-color-primary-100, rgba(99, 102, 241, 0.1));
    }

    .sprint-drop-zone-empty {
      width: 100%;
      text-align: center;
      color: var(--sl-color-neutral-500);
      font-size: 0.85rem;
      padding: 1rem;
    }

    .sprint-task-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.6rem;
      background: var(--sl-color-neutral-0);
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .sprint-task-chip:hover {
      border-color: var(--sl-color-primary-400);
    }

    .sprint-task-chip .remove-btn {
      cursor: pointer;
      opacity: 0.5;
      font-size: 0.7rem;
    }

    .sprint-task-chip .remove-btn:hover {
      opacity: 1;
      color: var(--sl-color-danger-600);
    }
  `;

  @property({ type: Array }) tasks: TaskView[] = [];
  @property({ type: Array }) sessions: SessionEntry[] = [];
  @property({ type: String, attribute: "project-id" }) projectId = "";
  @property({ type: String, attribute: "drag-task-id" }) dragTaskId:
    | string
    | null = null;

  @state() private _sessionCode = "";
  @state() private _sessionName = "";
  @state() private _creating = false;

  isTaskInSprint(task: TaskView): boolean {
    if (!this._sessionCode) return false;
    const session = this.sessions.find((s) => s.code === this._sessionCode);
    return !!session && !!task.session_ids?.includes(session.id);
  }

  private _getSelectedSession(): SessionEntry | undefined {
    return this.sessions.find((s) => s.code === this._sessionCode);
  }

  private _getSprintTasks(): TaskView[] {
    const session = this._getSelectedSession();
    if (!session) return [];
    return this.tasks.filter((tk) => tk.session_ids?.includes(session.id));
  }

  private async _handleSprintDrop() {
    if (!this.dragTaskId || !this._sessionCode) return;
    const taskId = this.dragTaskId;
    this.dispatchEvent(
      new CustomEvent("drag-consumed", { bubbles: true, composed: true }),
    );
    try {
      await addTasksToSession(this._sessionCode, [taskId]);
      this.dispatchEvent(
        new CustomEvent("sprint-toast", {
          detail: { message: t("taskBoard.toast.addedToSprint") },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(
        new CustomEvent<TaskSprintChangedDetail>("task-sprint-changed", {
          detail: { taskId, action: "added", sessionCode: this._sessionCode },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("sprint-error", {
          detail: {
            message:
              err instanceof Error
                ? err.message
                : t("taskBoard.sprint.errorAdd"),
          },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private async _removeFromSprint(taskId: string) {
    if (!this._sessionCode) return;
    try {
      await removeTaskFromSession(this._sessionCode, taskId);
      this.dispatchEvent(
        new CustomEvent("sprint-toast", {
          detail: { message: t("taskBoard.toast.removedFromSprint") },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(
        new CustomEvent<TaskSprintChangedDetail>("task-sprint-changed", {
          detail: { taskId, action: "removed", sessionCode: this._sessionCode },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("sprint-error", {
          detail: {
            message:
              err instanceof Error
                ? err.message
                : t("taskBoard.sprint.errorRemove"),
          },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private async _createSprint() {
    if (!this._sessionName.trim()) return;
    this._creating = true;
    try {
      const data = await createSession({
        project_id: this.projectId,
        name: this._sessionName.trim(),
      });
      const newSession: SessionEntry = {
        code: data.session.code,
        name: data.session.name,
        id: data.session.id,
      };
      this._sessionCode = newSession.code;
      this._sessionName = "";
      this.dispatchEvent(
        new CustomEvent<SprintCreatedDetail>("sprint-created", {
          detail: { session: newSession },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(
        new CustomEvent("sprint-toast", {
          detail: { message: t("taskBoard.toast.sprintCreated") },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("sprint-error", {
          detail: {
            message:
              err instanceof Error ? err.message : t("taskBoard.errorSprint"),
          },
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      this._creating = false;
    }
  }

  render() {
    const sprintTasks = this._getSprintTasks();

    return html`
      <div class="sprint-panel">
        <div class="sprint-panel-header">
          ${this.sessions.length > 0
            ? html`
                <sl-select
                  placeholder=${t("taskBoard.sprint.selectSession")}
                  size="small"
                  clearable
                  value=${this._sessionCode}
                  @sl-change=${(e: Event) => {
                    this._sessionCode = (e.target as HTMLSelectElement).value;
                  }}
                >
                  ${this.sessions.map(
                    (s) => html`
                      <sl-option value=${s.code}>${s.name || s.code}</sl-option>
                    `,
                  )}
                </sl-select>
              `
            : nothing}

          <sl-input
            placeholder=${t("taskBoard.sprint.newName")}
            size="small"
            value=${this._sessionName}
            @sl-input=${(e: Event) => {
              this._sessionName = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._createSprint();
            }}
          ></sl-input>
          <sl-button
            size="small"
            variant="default"
            ?loading=${this._creating}
            ?disabled=${!this._sessionName.trim()}
            @click=${() => void this._createSprint()}
          >
            ${t("taskBoard.sprint.createSprint")}
          </sl-button>

          <span style="flex: 1;"></span>

          ${sprintTasks.length > 0
            ? html`
                <sl-badge variant="primary" pill
                  >${t("taskBoard.sprint.taskCount", {
                    count: sprintTasks.length,
                    suffix: sprintTasks.length !== 1 ? "s" : "",
                  })}</sl-badge
                >
              `
            : nothing}
          ${this._sessionCode
            ? html`
                <sl-button
                  size="small"
                  variant="primary"
                  @click=${() => {
                    navigateTo("/sessions/" + this._sessionCode);
                  }}
                >
                  <sl-icon slot="prefix" name="play-fill"></sl-icon>
                  ${t("taskBoard.sprint.startSprint")}
                </sl-button>
              `
            : nothing}
        </div>

        <div
          class="sprint-drop-zone"
          @dragover=${(e: DragEvent) => {
            if (!this._sessionCode) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).classList.add("drag-over");
          }}
          @dragleave=${(e: DragEvent) => {
            (e.currentTarget as HTMLElement).classList.remove("drag-over");
          }}
          @drop=${(e: DragEvent) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).classList.remove("drag-over");
            void this._handleSprintDrop();
          }}
        >
          ${!this._sessionCode
            ? html`
                <div class="sprint-drop-zone-empty">
                  ${t("taskBoard.sprint.selectFirst")}
                </div>
              `
            : sprintTasks.length === 0
              ? html`
                  <div class="sprint-drop-zone-empty">
                    ${t("taskBoard.sprint.dragHint")}
                  </div>
                `
              : sprintTasks.map(
                  (task) => html`
                    <div
                      class="sprint-task-chip"
                      @click=${() => {
                        this.dispatchEvent(
                          new CustomEvent("select-task", {
                            detail: task.id,
                            bubbles: true,
                            composed: true,
                          }),
                        );
                      }}
                    >
                      <sl-icon
                        name=${TASK_TYPE_ICONS[task.task_type]}
                        style="color: ${TASK_TYPE_COLORS[
                          task.task_type
                        ]}; font-size: 0.75rem;"
                      ></sl-icon>
                      <span>${task.ticket_id}</span>
                      <span
                        style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                        >${task.title}</span
                      >
                      <span
                        class="remove-btn"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          void this._removeFromSprint(task.id);
                        }}
                      >
                        <sl-icon name="x-lg"></sl-icon>
                      </span>
                    </div>
                  `,
                )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-sprint-panel": TaskSprintPanel;
  }
}
