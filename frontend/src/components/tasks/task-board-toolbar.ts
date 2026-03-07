import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import {
  type TaskType,
  type TaskStatus,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
} from "../../state/task-types.js";
import type { SessionParticipant } from "../../state/app-state.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";

export interface FilterChangedDetail {
  searchQuery?: string;
  filterType?: TaskType | "";
  filterStatus?: TaskStatus | "";
  filterAssignee?: string;
  hideCompleted?: boolean;
  showAllProject?: boolean;
}

export interface ViewModeChangedDetail {
  viewMode: "list" | "board";
}

export interface SortChangedDetail {
  sortBy: "created" | "updated" | "title" | "type";
}

/**
 * Toolbar for task-board: view toggle, search, filters, sort.
 *
 * Properties (current values, displayed as controlled inputs):
 *   - viewMode
 *   - searchQuery
 *   - filterType
 *   - filterStatus
 *   - filterAssignee
 *   - sortBy
 *   - hideCompleted
 *   - showAllProject
 *   - completedCount: number of hidden completed tasks
 *   - participants: for assignee filter
 *   - isProjectMode: hides session-scope toggle, shows sprint button
 *   - sprintPanelOpen: sprint button active state
 *   - filteredCount: for the title badge
 *   - sessionName: for the board title
 *
 * Events:
 *   - filter-changed: FilterChangedDetail
 *   - view-mode-changed: ViewModeChangedDetail
 *   - sort-changed: SortChangedDetail
 *   - open-create: fired when "New Task" is clicked
 *   - sprint-toggle: fired when sprint planning button is clicked
 *   - refresh: fired when refresh icon is clicked
 */
@customElement("task-board-toolbar")
export class TaskBoardToolbar extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .board-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .board-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }

    .board-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .view-toggle {
      display: flex;
      align-items: center;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
    }

    .view-toggle sl-icon-button {
      border-radius: 0;
    }

    .view-toggle sl-icon-button.active {
      background: var(--surface-active);
      color: var(--sl-color-primary-500);
    }

    .filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .filters sl-select {
      min-width: 120px;
    }
  `;

  @property({ type: String, attribute: "view-mode" })
  viewMode: "list" | "board" = "board";

  @property({ type: String, attribute: "search-query" }) searchQuery = "";
  @property({ type: String, attribute: "filter-type" })
  filterType: TaskType | "" = "";

  @property({ type: String, attribute: "filter-status" })
  filterStatus: TaskStatus | "" = "";

  @property({ type: String, attribute: "filter-assignee" }) filterAssignee = "";

  @property({ type: String, attribute: "sort-by" })
  sortBy: "created" | "updated" | "title" | "type" = "created";

  @property({ type: Boolean, attribute: "hide-completed" }) hideCompleted =
    true;
  @property({ type: Boolean, attribute: "show-all-project" })
  showAllProject = false;

  @property({ type: Number, attribute: "completed-count" }) completedCount = 0;
  @property({ type: Array }) participants: SessionParticipant[] = [];
  @property({ type: Boolean, attribute: "is-project-mode" })
  isProjectMode = false;

  @property({ type: Boolean, attribute: "sprint-panel-open" })
  sprintPanelOpen = false;

  @property({ type: Number, attribute: "filtered-count" }) filteredCount = 0;
  @property({ type: String, attribute: "session-name" }) sessionName = "";

  private _emit(type: string, detail: object) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <div class="board-header">
        <h2 class="board-title">
          ${this.sessionName || t("taskBoard.title")}
          ${this.filteredCount > 0
            ? html`<sl-badge
                variant="neutral"
                pill
                style="margin-left: 0.5rem; vertical-align: middle;"
                >${this.filteredCount}</sl-badge
              >`
            : nothing}
        </h2>
        <div class="board-actions">
          <div class="view-toggle">
            <sl-tooltip content=${t("taskBoard.listView")}>
              <sl-icon-button
                name="list-ul"
                class=${this.viewMode === "list" ? "active" : ""}
                @click=${() => {
                  this._emit("view-mode-changed", { viewMode: "list" });
                }}
              ></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content=${t("taskBoard.boardView")}>
              <sl-icon-button
                name="kanban"
                class=${this.viewMode === "board" ? "active" : ""}
                @click=${() => {
                  this._emit("view-mode-changed", { viewMode: "board" });
                }}
              ></sl-icon-button>
            </sl-tooltip>
          </div>
          <sl-tooltip content=${t("taskBoard.refresh")}>
            <sl-icon-button
              name="arrow-clockwise"
              @click=${() => this._emit("refresh", {})}
            ></sl-icon-button>
          </sl-tooltip>
          ${this.isProjectMode
            ? html`
                <sl-button
                  variant=${this.sprintPanelOpen ? "primary" : "default"}
                  size="small"
                  @click=${() => this._emit("sprint-toggle", {})}
                >
                  <sl-icon slot="prefix" name="calendar-week"></sl-icon>
                  ${t("taskBoard.planSprint")}
                </sl-button>
              `
            : html`
                <sl-button
                  variant="primary"
                  size="small"
                  @click=${() => this._emit("open-create", {})}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${t("taskBoard.newTask")}
                </sl-button>
              `}
        </div>
      </div>

      <div class="filters">
        <sl-input
          placeholder=${t("taskBoard.searchPlaceholder")}
          size="small"
          clearable
          value=${this.searchQuery}
          @sl-input=${(e: Event) => {
            this._emit("filter-changed", {
              searchQuery: (e.target as HTMLInputElement).value,
            });
          }}
          @sl-clear=${() => {
            this._emit("filter-changed", { searchQuery: "" });
          }}
          style="max-width: 220px;"
        >
          <sl-icon slot="prefix" name="search"></sl-icon>
        </sl-input>
        <sl-select
          placeholder=${t("taskBoard.filterAllTypes")}
          size="small"
          clearable
          value=${this.filterType}
          @sl-change=${(e: Event) => {
            this._emit("filter-changed", {
              filterType: (e.target as HTMLSelectElement).value as
                | TaskType
                | "",
            });
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

        ${this.viewMode === "list"
          ? html`
              <sl-select
                placeholder=${t("taskBoard.filterAllStatuses")}
                size="small"
                clearable
                value=${this.filterStatus}
                @sl-change=${(e: Event) => {
                  this._emit("filter-changed", {
                    filterStatus: (e.target as HTMLSelectElement).value as
                      | TaskStatus
                      | "",
                  });
                }}
              >
                ${(
                  ["open", "in_progress", "done", "closed"] as TaskStatus[]
                ).map(
                  (s) => html`
                    <sl-option value=${s}>${STATUS_LABELS[s]}</sl-option>
                  `,
                )}
              </sl-select>
            `
          : nothing}
        ${this.participants.length > 0
          ? html`
              <sl-select
                placeholder=${t("taskBoard.filterAllAssignees")}
                size="small"
                clearable
                value=${this.filterAssignee}
                @sl-change=${(e: Event) => {
                  this._emit("filter-changed", {
                    filterAssignee: (e.target as HTMLSelectElement).value,
                  });
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

        <sl-select
          size="small"
          value=${this.sortBy}
          style="min-width: 130px;"
          @sl-change=${(e: Event) => {
            this._emit("sort-changed", {
              sortBy: (e.target as HTMLSelectElement).value as
                | "created"
                | "updated"
                | "title"
                | "type",
            });
          }}
        >
          <sl-icon
            slot="prefix"
            name="sort-down"
            style="font-size: 0.85rem;"
          ></sl-icon>
          <sl-option value="created">${t("taskBoard.sortNewest")}</sl-option>
          <sl-option value="updated"
            >${t("taskBoard.sortRecentlyUpdated")}</sl-option
          >
          <sl-option value="title">${t("taskBoard.sortTitleAZ")}</sl-option>
          <sl-option value="type">${t("taskBoard.sortType")}</sl-option>
        </sl-select>

        ${!this.isProjectMode
          ? html`
              <sl-tooltip
                content=${this.showAllProject
                  ? t("taskBoard.scopeAllTooltip")
                  : t("taskBoard.scopeSessionTooltip")}
              >
                <sl-button
                  size="small"
                  variant=${this.showAllProject ? "primary" : "default"}
                  @click=${() => {
                    this._emit("filter-changed", {
                      showAllProject: !this.showAllProject,
                    });
                  }}
                  style="white-space: nowrap;"
                >
                  <sl-icon
                    slot="prefix"
                    name=${this.showAllProject ? "collection" : "collection"}
                  ></sl-icon>
                  ${this.showAllProject
                    ? t("taskBoard.scopeAll")
                    : t("taskBoard.scopeSession")}
                </sl-button>
              </sl-tooltip>
            `
          : nothing}
        ${this.completedCount > 0
          ? html`
              <sl-tooltip
                content=${this.hideCompleted
                  ? t("taskBoard.showCompleted", {
                      count: this.completedCount,
                    })
                  : t("taskBoard.hideCompleted")}
              >
                <sl-button
                  size="small"
                  variant=${this.hideCompleted ? "default" : "primary"}
                  @click=${() => {
                    this._emit("filter-changed", {
                      hideCompleted: !this.hideCompleted,
                    });
                  }}
                  style="white-space: nowrap;"
                >
                  <sl-icon
                    slot="prefix"
                    name=${this.hideCompleted ? "eye" : "eye-slash"}
                  ></sl-icon>
                  ${this.hideCompleted
                    ? t("taskBoard.completedDone", {
                        count: this.completedCount,
                      })
                    : t("taskBoard.hideDone")}
                </sl-button>
              </sl-tooltip>
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-board-toolbar": TaskBoardToolbar;
  }
}
