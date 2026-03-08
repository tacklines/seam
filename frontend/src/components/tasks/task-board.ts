import { LitElement, html, css, nothing } from "lit";
import { customElement, state, property, query } from "lit/decorators.js";
import { store } from "../../state/app-state.js";
import {
  fetchTasks,
  fetchProjectTasks,
  updateTask,
  deleteTask,
} from "../../state/task-api.js";
import { navigateTo } from "../../router.js";
import { t } from "../../lib/i18n.js";
import { getParticipantName } from "../../lib/participant-utils.js";
import {
  type TaskView,
  type TaskType,
  type TaskStatus,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  PRIORITY_ICONS,
  PRIORITY_COLORS,
} from "../../state/task-types.js";
import type { SessionParticipant } from "../../state/app-state.js";
import {
  filterTasks,
  sortTasks,
  completedCount,
  childrenOf,
  childProgress,
  type TaskFilterState,
} from "../../lib/task-filters.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/tag/tag.js";

import "./task-detail.js";
import "./task-create-dialog.js";
import "./task-sprint-panel.js";
import "./task-board-toolbar.js";
import "./task-shortcuts-dialog.js";
import "../invocations/invoke-dialog.js";

import type { FilterChangedDetail } from "./task-board-toolbar.js";
import type { SprintCreatedDetail } from "./task-sprint-panel.js";
import type { TaskCreatedDetail } from "./task-create-dialog.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";

@customElement("task-board")
export class TaskBoard extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
    }

    /* ── List view ── */
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .task-card {
      display: grid;
      grid-template-columns: auto auto 1fr auto auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      cursor: pointer;
      transition:
        background 0.15s,
        border-color 0.15s;
    }

    .task-card:hover {
      background: var(--surface-card-hover);
      border-color: var(--border-medium);
    }

    .task-card.child {
      margin-left: 2rem;
    }

    .task-card.selected {
      border-color: var(--sl-color-primary-500);
      background: color-mix(
        in srgb,
        var(--sl-color-primary-500) 8%,
        var(--surface-card)
      );
    }

    .select-checkbox {
      display: flex;
      align-items: center;
    }

    .batch-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--sl-color-primary-500);
      border-radius: 8px;
      margin-bottom: 0.75rem;
    }

    .batch-bar .batch-count {
      font-weight: 600;
      color: var(--sl-color-primary-400);
      font-size: 0.875rem;
    }

    .batch-bar .batch-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }

    .task-type-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .task-type-icon sl-icon {
      font-size: 1.1rem;
    }

    .task-info {
      min-width: 0;
    }

    .task-title {
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.9rem;
    }

    .task-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      margin-top: 0.15rem;
    }

    .task-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* ── Kanban view ── */
    .kanban {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      min-height: 400px;
    }

    .kanban-column {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 0;
    }

    .kanban-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      background: var(--surface-2);
      border-bottom: 2px solid var(--border-subtle);
      position: sticky;
      top: 0;
    }

    .kanban-column-header.status-open {
      border-bottom-color: var(--sl-color-neutral-500);
    }
    .kanban-column-header.status-in_progress {
      border-bottom-color: var(--sl-color-primary-500);
    }
    .kanban-column-header.status-done {
      border-bottom-color: var(--sl-color-success-500);
    }
    .kanban-column-header.status-closed {
      border-bottom-color: var(--sl-color-neutral-600);
    }

    .kanban-cards {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
      min-height: 60px;
      border-radius: 6px;
      transition: background 0.15s;
    }

    .kanban-cards.drag-over {
      background: rgba(99, 102, 241, 0.08);
    }

    .kanban-card {
      padding: 0.65rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      cursor: grab;
      transition:
        background 0.15s,
        border-color 0.15s,
        transform 0.1s,
        opacity 0.15s;
    }

    .kanban-card.dragging {
      opacity: 0.4;
    }

    .kanban-card:hover {
      background: var(--surface-card-hover);
      border-color: var(--border-medium);
      transform: translateY(-1px);
    }

    .kanban-card-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.25rem;
    }

    .kanban-card-header sl-icon {
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .kanban-card-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .kanban-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 0.35rem;
      font-size: 0.7rem;
      color: var(--text-tertiary);
    }

    .kanban-card-assignee {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .kanban-card-counts {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .kanban-card-count {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      color: var(--text-tertiary);
    }

    .kanban-card-count sl-icon {
      font-size: 0.65rem;
    }

    .kanban-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 0.5rem;
      color: var(--text-tertiary);
      font-size: 0.78rem;
      font-style: italic;
    }

    /* ── Progress bar on kanban cards ── */
    .kanban-progress {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.3rem;
    }

    .kanban-progress-bar {
      flex: 1;
      height: 4px;
      background: var(--border-subtle);
      border-radius: 2px;
      overflow: hidden;
    }

    .kanban-progress-fill {
      height: 100%;
      background: var(--sl-color-success-500);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .kanban-progress-label {
      font-size: 0.65rem;
      color: var(--text-tertiary);
      font-weight: 600;
      white-space: nowrap;
    }

    /* ── Collapse toggle in list view ── */
    .collapse-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.1rem;
    }

    /* ── Progress chip in list meta ── */
    .progress-chip {
      display: inline-block;
      padding: 0 0.35rem;
      background: color-mix(
        in srgb,
        var(--sl-color-success-500) 15%,
        transparent
      );
      color: var(--sl-color-success-600);
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: 600;
      font-family: var(--sl-font-mono);
    }

    @media (max-width: 900px) {
      .kanban {
        grid-template-columns: 1fr;
      }
    }

    /* ── Stats bar ── */
    .stats-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .stat-value {
      font-weight: 700;
      color: var(--text-secondary);
    }

    /* ── Common ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
    }

    .empty-state sl-icon {
      font-size: 3rem;
      color: var(--text-tertiary);
      margin-bottom: 1rem;
    }

    .empty-state p {
      color: var(--text-secondary);
      margin: 0 0 1.5rem;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
    }

    /* ── Status quick-change menu ── */
    .status-menu-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Toast ── */
    .toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--sl-color-success-600);
      color: white;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      z-index: 1001;
      animation: toast-in 0.2s ease-out;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  @property({ type: String, attribute: "session-code" })
  sessionCode = "";

  @property({ type: String, attribute: "project-id" })
  projectId = "";

  @property({ type: String, attribute: "session-name" })
  sessionName = "";

  @property({ type: Array })
  participants: SessionParticipant[] = [];

  @property({ type: Array })
  sessions: Array<{ code: string; name: string | null; id: string }> = [];

  // ── Core task state ──
  @state() private _tasks: TaskView[] = [];
  @state() private _loading = true;
  @state() private _error = "";

  // ── View state ──
  @state() private _viewMode: "list" | "board" = "board";
  @state() private _collapseSubtasks = true;
  @state() private _collapsedGroups: Set<string> = new Set();
  @state() private _selectedTaskId: string | null = null;
  @state() private _selectedIds: Set<string> = new Set();
  @state() private _batchLoading = false;
  @state() private _toastMessage = "";
  @state() private _showShortcuts = false;

  // ── Filter state ──
  @state() private _filterType: TaskType | "" = "";
  @state() private _filterStatus: TaskStatus | "" = "";
  @state() private _searchQuery = "";
  @state() private _sortBy: TaskFilterState["sortBy"] = "created";
  @state() private _filterAssignee = "";
  @state() private _hideCompleted = true;
  @state() private _showAllProject = false;

  // ── Create dialog state ──
  @state() private _showCreateDialog = false;
  @state() private _createInitialType: TaskType = "task";
  @state() private _createInitialParentId = "";
  @state() private _createInitialStatus: TaskStatus | "" = "";

  // ── Sprint panel state ──
  @state() private _sprintPanelOpen = false;

  // ── Drag state (passed down to sprint panel) ──
  private _dragTaskId: string | null = null;

  @query("#batch-invoke-dialog") private _batchInvokeDialog!: InvokeDialog;

  private _storeUnsub: (() => void) | null = null;
  private _keyHandler = (e: KeyboardEvent) => {
    const isInput = e.composedPath().some((el) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "sl-input" ||
        tag === "sl-textarea" ||
        tag === "sl-select" ||
        tag === "sl-combobox" ||
        el.isContentEditable
      );
    });

    if (e.key === "Escape") {
      if (isInput) return;
      if (this._showShortcuts) {
        this._showShortcuts = false;
      } else if (this._selectedIds.size > 0) {
        this._clearSelection();
      } else if (this._selectedTaskId) {
        this._deselectTask();
      }
      return;
    }

    if (isInput) return;

    if (e.key === "n" && !this._selectedTaskId) {
      e.preventDefault();
      this._openCreateDialog();
    } else if (e.key === "/" && !this._selectedTaskId) {
      e.preventDefault();
      const input = this.shadowRoot?.querySelector(
        "task-board-toolbar",
      ) as HTMLElement | null;
      input?.shadowRoot?.querySelector(
        ".filters sl-input",
      ) as HTMLElement | null;
    } else if (e.key === "?" && !this._selectedTaskId) {
      e.preventDefault();
      this._showShortcuts = !this._showShortcuts;
    }
  };

  private _boundPopstateHandler = () => this._onNavigate();

  connectedCallback() {
    super.connectedCallback();
    this._loadTasks().then(() => this._restoreTaskFromUrl());
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === "tasks-changed") {
        void this._loadTasks();
      }
    });
    document.addEventListener("keydown", this._keyHandler);
    window.addEventListener("popstate", this._boundPopstateHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
    this._storeUnsub = null;
    document.removeEventListener("keydown", this._keyHandler);
    window.removeEventListener("popstate", this._boundPopstateHandler);
  }

  private get _isProjectMode(): boolean {
    return !this.sessionCode && !!this.projectId;
  }

  updated(changed: Map<string, unknown>) {
    if (
      (changed.has("sessionCode") && this.sessionCode) ||
      (changed.has("projectId") && this.projectId && !this.sessionCode)
    ) {
      void this._loadTasks();
    }
  }

  private async _loadTasks() {
    if (!this.sessionCode && !this.projectId) return;
    this._loading = true;
    this._error = "";
    try {
      const filters: Record<string, string> = {};
      if (this._filterType) filters.task_type = this._filterType;
      if (this._filterStatus) filters.status = this._filterStatus;
      if (this._isProjectMode) {
        this._tasks = await fetchProjectTasks(this.projectId, filters as any);
      } else {
        if (this._showAllProject) (filters as any).session_only = false;
        this._tasks = await fetchTasks(this.sessionCode, filters as any);
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _getTaskTicketMatch(): string | null {
    const m = window.location.pathname.match(/\/tasks\/([A-Z]+-\d+)$/i);
    return m ? m[1].toUpperCase() : null;
  }

  private _restoreTaskFromUrl() {
    const ticketId = this._getTaskTicketMatch();
    if (!ticketId) return;
    const task = this._tasks.find((tk) => tk.ticket_id === ticketId);
    if (task) this._selectedTaskId = task.id;
  }

  private _onNavigate() {
    const ticketId = this._getTaskTicketMatch();
    if (ticketId) {
      const task = this._tasks.find((tk) => tk.ticket_id === ticketId);
      if (task && this._selectedTaskId !== task.id) {
        this._selectedTaskId = task.id;
      }
    } else if (this._selectedTaskId) {
      this._selectedTaskId = null;
      void this._loadTasks();
    }
  }

  private _selectTask(taskId: string) {
    this._selectedTaskId = taskId;
    const task = this._tasks.find((tk) => tk.id === taskId);
    if (task) {
      let path = "";
      if (this.sessionCode) {
        path = `/sessions/${this.sessionCode}/tasks/${task.ticket_id}`;
      } else if (this.projectId) {
        path = `/projects/${this.projectId}/tasks/${task.ticket_id}`;
      }
      if (path) history.pushState(null, "", path);
    }
  }

  private _deselectTask() {
    this._selectedTaskId = null;
    let path = "";
    if (this.sessionCode) {
      path = `/sessions/${this.sessionCode}`;
    } else if (this.projectId) {
      path = `/projects/${this.projectId}/tasks`;
    }
    if (path) history.pushState(null, "", path);
    void this._loadTasks();
  }

  private get _filteredTasks(): TaskView[] {
    const filtered = filterTasks(this._tasks, {
      hideCompleted: this._hideCompleted,
      filterStatus: this._filterStatus,
      searchQuery: this._searchQuery,
      filterAssignee: this._filterAssignee,
    });
    return sortTasks(filtered, this._sortBy);
  }

  private get _completedCount(): number {
    return completedCount(this._tasks);
  }

  private _isTaskInSprint(task: TaskView): boolean {
    if (!this._sprintPanelOpen) return false;
    const sprintPanel = this.shadowRoot?.querySelector(
      "task-sprint-panel",
    ) as any;
    return sprintPanel ? sprintPanel.isTaskInSprint(task) : false;
  }

  private _showToast(message: string) {
    this._toastMessage = message;
    setTimeout(() => {
      this._toastMessage = "";
    }, 2500);
  }

  private async _handleStatusChange(task: TaskView, newStatus: TaskStatus) {
    try {
      await updateTask(this.sessionCode, task.id, { status: newStatus });
      this._showToast(
        t("taskBoard.toast.movedTo", { status: STATUS_LABELS[newStatus] }),
      );
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.errorUpdate");
    }
  }

  private _toggleSelect(taskId: string) {
    const next = new Set(this._selectedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    this._selectedIds = next;
  }

  private _clearSelection() {
    this._selectedIds = new Set();
  }

  private async _batchSetStatus(status: TaskStatus) {
    if (this._selectedIds.size === 0) return;
    this._batchLoading = true;
    try {
      await Promise.all(
        [...this._selectedIds].map((id) =>
          updateTask(this.sessionCode, id, { status }),
        ),
      );
      this._showToast(
        t("taskBoard.toast.batchMoved", {
          count: this._selectedIds.size,
          status: STATUS_LABELS[status],
        }),
      );
      this._selectedIds = new Set();
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.error.batchUpdate");
    } finally {
      this._batchLoading = false;
    }
  }

  private async _batchDelete() {
    if (this._selectedIds.size === 0) return;
    this._batchLoading = true;
    try {
      await Promise.all(
        [...this._selectedIds].map((id) => deleteTask(this.sessionCode, id)),
      );
      this._showToast(
        t("taskBoard.toast.batchDeleted", { count: this._selectedIds.size }),
      );
      this._selectedIds = new Set();
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.error.batchDelete");
    } finally {
      this._batchLoading = false;
    }
  }

  private _batchDispatchAgent() {
    if (this._selectedIds.size === 0) return;
    const selectedTasks = this._tasks.filter((tk) =>
      this._selectedIds.has(tk.id),
    );
    const taskLines = selectedTasks
      .map((tk) => `- [${tk.ticket_id}] ${tk.title}`)
      .join("\n");
    const prompt = `${t("taskBoard.batch.dispatchPrompt")}\n${taskLines}`;
    this._batchInvokeDialog.showWithPrompt(prompt);
  }

  private async _handleDelete(taskId: string) {
    try {
      await deleteTask(this.sessionCode, taskId);
      if (this._selectedTaskId === taskId) this._deselectTask();
      this._showToast(t("taskBoard.toast.taskDeleted"));
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.errorDelete");
    }
  }

  private _openCreateDialog(parentId?: string, type?: TaskType) {
    this._createInitialType = type ?? "task";
    this._createInitialParentId = parentId ?? "";
    this._createInitialStatus = "";
    this._showCreateDialog = true;
  }

  private _openCreateDialogWithStatus(status: TaskStatus) {
    this._openCreateDialog();
    this._createInitialStatus = status;
  }

  private _toggleGroup(parentId: string) {
    const next = new Set(this._collapsedGroups);
    if (next.has(parentId)) {
      next.delete(parentId);
    } else {
      next.add(parentId);
    }
    this._collapsedGroups = next;
  }

  private _handleFilterChanged(e: CustomEvent<FilterChangedDetail>) {
    const d = e.detail;
    let needsReload = false;

    if (d.searchQuery !== undefined) this._searchQuery = d.searchQuery;
    if (d.filterAssignee !== undefined) this._filterAssignee = d.filterAssignee;
    if (d.hideCompleted !== undefined) this._hideCompleted = d.hideCompleted;

    if (d.filterType !== undefined && d.filterType !== this._filterType) {
      this._filterType = d.filterType;
      needsReload = true;
    }
    if (d.filterStatus !== undefined && d.filterStatus !== this._filterStatus) {
      this._filterStatus = d.filterStatus;
      needsReload = true;
    }
    if (
      d.showAllProject !== undefined &&
      d.showAllProject !== this._showAllProject
    ) {
      this._showAllProject = d.showAllProject;
      needsReload = true;
    }

    if (needsReload) void this._loadTasks();
  }

  render() {
    if (this._selectedTaskId) {
      return html`
        <task-detail
          session-code=${this.sessionCode}
          project-id=${this.projectId}
          task-id=${this._selectedTaskId}
          .participants=${this.participants}
          ?readonly=${this._isProjectMode}
          @back=${() => {
            this._deselectTask();
          }}
          @deleted=${() => {
            this._deselectTask();
          }}
          @navigate-task=${(e: CustomEvent) => {
            this._selectTask(e.detail);
          }}
          @create-child=${(e: CustomEvent) => {
            this._deselectTask();
            this._openCreateDialog(e.detail, "subtask");
          }}
        ></task-detail>
      `;
    }

    return html`
      <task-board-toolbar
        view-mode=${this._viewMode}
        search-query=${this._searchQuery}
        filter-type=${this._filterType}
        filter-status=${this._filterStatus}
        filter-assignee=${this._filterAssignee}
        sort-by=${this._sortBy}
        ?hide-completed=${this._hideCompleted}
        ?show-all-project=${this._showAllProject}
        completed-count=${this._completedCount}
        .participants=${this.participants}
        ?is-project-mode=${this._isProjectMode}
        ?sprint-panel-open=${this._sprintPanelOpen}
        filtered-count=${this._filteredTasks.length}
        session-name=${this.sessionName}
        @filter-changed=${(e: CustomEvent<FilterChangedDetail>) =>
          this._handleFilterChanged(e)}
        @view-mode-changed=${(e: CustomEvent) => {
          this._viewMode = e.detail.viewMode;
        }}
        @sort-changed=${(e: CustomEvent) => {
          this._sortBy = e.detail.sortBy;
        }}
        @open-create=${() => this._openCreateDialog()}
        @sprint-toggle=${() => {
          this._sprintPanelOpen = !this._sprintPanelOpen;
        }}
        @refresh=${() => void this._loadTasks()}
      ></task-board-toolbar>

      ${this._isProjectMode && this._sprintPanelOpen
        ? html`
            <task-sprint-panel
              .tasks=${this._tasks}
              .sessions=${this.sessions}
              project-id=${this.projectId}
              drag-task-id=${this._dragTaskId ?? ""}
              @sprint-created=${(e: CustomEvent<SprintCreatedDetail>) => {
                this.sessions = [...this.sessions, e.detail.session];
              }}
              @task-sprint-changed=${() => void this._loadTasks()}
              @sprint-error=${(e: CustomEvent) => {
                this._error = e.detail.message;
              }}
              @sprint-toast=${(e: CustomEvent) => {
                this._showToast(e.detail.message);
              }}
              @drag-consumed=${() => {
                this._dragTaskId = null;
              }}
              @select-task=${(e: CustomEvent) => {
                this._selectTask(e.detail);
              }}
            ></task-sprint-panel>
          `
        : nothing}
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
      ${!this._loading && this._tasks.length > 0
        ? this._renderStats()
        : nothing}
      ${this._loading
        ? html`<div class="loading">
            <sl-spinner style="font-size: 2rem;"></sl-spinner>
          </div>`
        : this._tasks.length === 0
          ? this._renderEmpty()
          : this._viewMode === "board"
            ? this._renderKanban()
            : this._renderTaskList()}

      <task-create-dialog
        session-code=${this.sessionCode}
        project-id=${this.projectId}
        .participants=${this.participants}
        .tasks=${this._tasks}
        ?open=${this._showCreateDialog}
        initial-type=${this._createInitialType}
        initial-parent-id=${this._createInitialParentId}
        initial-status=${this._createInitialStatus}
        @task-created=${(e: CustomEvent<TaskCreatedDetail>) => {
          void this._loadTasks();
          this._showToast(t("taskBoard.toast.taskCreated"));
        }}
        @close=${() => {
          this._showCreateDialog = false;
        }}
        @create-error=${(e: CustomEvent) => {
          this._error = e.detail.message;
        }}
      ></task-create-dialog>

      <task-shortcuts-dialog
        ?open=${this._showShortcuts}
        @close=${() => {
          this._showShortcuts = false;
        }}
      ></task-shortcuts-dialog>

      ${this.projectId
        ? html`<invoke-dialog
            id="batch-invoke-dialog"
            project-id=${this.projectId}
          ></invoke-dialog>`
        : nothing}
      ${this._toastMessage
        ? html`<div class="toast">${this._toastMessage}</div>`
        : nothing}
    `;
  }

  private _renderStats() {
    const filtered = this._filteredTasks;
    const total = this._tasks.length;
    const open = filtered.filter((tk) => tk.status === "open").length;
    const inProgress = filtered.filter(
      (tk) => tk.status === "in_progress",
    ).length;
    const done = filtered.filter((tk) => tk.status === "done").length;
    const closed = filtered.filter((tk) => tk.status === "closed").length;
    const hidden = total - filtered.length;

    return html`
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-value">${open}</span> ${t("taskBoard.stat.open")}
        </div>
        <div class="stat">
          <span class="stat-value">${inProgress}</span> ${t(
            "taskBoard.stat.inProgress",
          )}
        </div>
        ${done > 0
          ? html`<div class="stat">
              <span class="stat-value">${done}</span> ${t(
                "taskBoard.stat.done",
              )}
            </div>`
          : nothing}
        ${closed > 0
          ? html`<div class="stat">
              <span class="stat-value">${closed}</span> ${t(
                "taskBoard.stat.closed",
              )}
            </div>`
          : nothing}
        ${hidden > 0
          ? html`<div
              class="stat"
              style="margin-left: auto; color: var(--text-tertiary);"
            >
              ${hidden} ${t("taskBoard.stat.hidden")}
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderEmpty() {
    return html`
      <div class="empty-state">
        <sl-icon name="kanban"></sl-icon>
        <p>${t("taskBoard.empty")}</p>
        <sl-button variant="primary" @click=${() => this._openCreateDialog()}>
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          ${t("taskBoard.createTask")}
        </sl-button>
      </div>
    `;
  }

  private _renderBatchBar() {
    if (this._selectedIds.size === 0) return nothing;
    return html`
      <div class="batch-bar">
        <span class="batch-count"
          >${t("taskBoard.batch.selected", {
            count: this._selectedIds.size,
          })}</span
        >
        <sl-button
          size="small"
          variant="text"
          @click=${() => this._clearSelection()}
          >${t("taskBoard.batch.clear")}</sl-button
        >
        <div class="batch-actions">
          <sl-button
            size="small"
            @click=${() => void this._batchSetStatus("in_progress")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.start")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => void this._batchSetStatus("done")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.done")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => void this._batchSetStatus("closed")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.close")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => void this._batchSetStatus("open")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.reopen")}</sl-button
          >
          ${this.projectId
            ? html`
                <sl-button
                  size="small"
                  variant="primary"
                  outline
                  @click=${() => this._batchDispatchAgent()}
                >
                  <sl-icon slot="prefix" name="robot"></sl-icon>
                  ${t("taskBoard.batch.dispatchAgent")}
                </sl-button>
              `
            : nothing}
          <sl-button
            size="small"
            variant="danger"
            @click=${() => void this._batchDelete()}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.delete")}</sl-button
          >
        </div>
      </div>
    `;
  }

  private _renderTaskList() {
    const tasks = this._filteredTasks;
    const topLevel = tasks.filter((tk) => !tk.parent_id);
    const childrenOfTask = (id: string) =>
      tasks.filter((tk) => tk.parent_id === id);

    return html`
      ${this._renderBatchBar()}
      <div class="task-list">
        ${topLevel.map((task) => {
          const children = childrenOfTask(task.id);
          const isCollapsed = this._collapsedGroups.has(task.id);
          const hasChildren = children.length > 0;
          return html`
            ${this._renderTaskCard(task, false, hasChildren, isCollapsed)}
            ${hasChildren && !isCollapsed
              ? children.map((child) =>
                  this._renderTaskCard(child, true, false, false),
                )
              : nothing}
          `;
        })}
      </div>
    `;
  }

  private _renderTaskCard(
    task: TaskView,
    isChild: boolean,
    hasChildren = false,
    isCollapsed = false,
  ) {
    const typeColor = TASK_TYPE_COLORS[task.task_type];
    const assignee = task.assigned_to
      ? getParticipantName(task.assigned_to, this.participants)
      : "";
    const isSelected = this._selectedIds.has(task.id);
    const [done, total] = hasChildren
      ? childProgress(this._tasks, task.id)
      : [0, 0];

    return html`
      <div
        class="task-card ${isChild ? "child" : ""} ${isSelected
          ? "selected"
          : ""}"
        @click=${() => {
          this._selectTask(task.id);
        }}
      >
        <div
          class="select-checkbox"
          @click=${(e: Event) => {
            e.stopPropagation();
            this._toggleSelect(task.id);
          }}
        >
          <sl-icon
            name=${isSelected ? "check-square-fill" : "square"}
            style="font-size: 1rem; color: ${isSelected
              ? "var(--sl-color-primary-500)"
              : "var(--text-tertiary)"}; cursor: pointer;"
          ></sl-icon>
        </div>
        ${hasChildren
          ? html`
              <div
                class="collapse-toggle"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._toggleGroup(task.id);
                }}
              >
                <sl-icon
                  name=${isCollapsed ? "chevron-right" : "chevron-down"}
                  style="font-size: 0.85rem; color: var(--text-tertiary); cursor: pointer;"
                ></sl-icon>
              </div>
            `
          : html`
              <div class="task-type-icon">
                <sl-icon
                  name=${TASK_TYPE_ICONS[task.task_type]}
                  style="color: ${typeColor}"
                ></sl-icon>
              </div>
            `}

        <div class="task-info">
          <div class="task-title">
            ${hasChildren
              ? html`<sl-icon
                  name=${TASK_TYPE_ICONS[task.task_type]}
                  style="color: ${typeColor}; font-size: 0.85rem; vertical-align: middle; margin-right: 0.25rem;"
                ></sl-icon>`
              : nothing}
            ${task.title}
          </div>
          <div class="task-meta">
            <span
              style="font-family: var(--sl-font-mono); color: var(--text-tertiary);"
              >${task.ticket_id}</span
            >
            ${task.priority !== "medium"
              ? html`&middot;
                  <sl-icon
                    name=${PRIORITY_ICONS[task.priority]}
                    style="color: ${PRIORITY_COLORS[
                      task.priority
                    ]}; font-size: 0.75rem; vertical-align: middle;"
                  ></sl-icon>`
              : nothing}
            &middot; ${TASK_TYPE_LABELS[task.task_type]}
            ${assignee ? html` &middot; ${assignee}` : nothing}
            ${hasChildren
              ? html` &middot;
                  <span class="progress-chip">${done}/${total}</span>`
              : nothing}
            ${!hasChildren && task.child_count > 0
              ? html` &middot;
                  <sl-icon
                    name="diagram-3"
                    style="font-size: 0.7rem; vertical-align: middle;"
                  ></sl-icon>
                  ${task.child_count}`
              : nothing}
            ${task.comment_count > 0
              ? html` &middot;
                  <sl-icon
                    name="chat-dots"
                    style="font-size: 0.7rem; vertical-align: middle;"
                  ></sl-icon>
                  ${task.comment_count}`
              : nothing}
          </div>
        </div>

        <sl-badge variant=${STATUS_VARIANTS[task.status] as any} pill>
          ${STATUS_LABELS[task.status]}
        </sl-badge>

        <div class="task-actions" @click=${(e: Event) => e.stopPropagation()}>
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
                        void this._handleStatusChange(task, "in_progress")}
                    >
                      ${t("taskBoard.action.startWork")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "done"
                ? html`
                    <sl-menu-item
                      @click=${() =>
                        void this._handleStatusChange(task, "done")}
                    >
                      ${t("taskBoard.action.markDone")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "closed"
                ? html`
                    <sl-menu-item
                      @click=${() =>
                        void this._handleStatusChange(task, "closed")}
                    >
                      ${t("taskBoard.action.close")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "open"
                ? html`
                    <sl-menu-item
                      @click=${() =>
                        void this._handleStatusChange(task, "open")}
                    >
                      ${t("taskBoard.action.reopen")}
                    </sl-menu-item>
                  `
                : nothing}
              <sl-divider></sl-divider>
              ${!isChild
                ? html`
                    <sl-menu-item
                      @click=${() => this._openCreateDialog(task.id, "subtask")}
                    >
                      ${t("taskBoard.action.addChild")}
                    </sl-menu-item>
                  `
                : nothing}
              <sl-divider></sl-divider>
              <sl-menu-item
                type="checkbox"
                @click=${() => void this._handleDelete(task.id)}
              >
                ${t("taskBoard.action.delete")}
              </sl-menu-item>
            </sl-menu>
          </sl-dropdown>
        </div>
      </div>
    `;
  }

  private _renderKanban() {
    const statuses: TaskStatus[] = this._hideCompleted
      ? ["open", "in_progress"]
      : ["open", "in_progress", "done", "closed"];
    const tasks = this._filteredTasks;
    const kanbanTasks = this._collapseSubtasks
      ? tasks.filter((tk) => !tk.parent_id)
      : tasks;
    const tasksByStatus = (status: TaskStatus) =>
      kanbanTasks.filter((tk) => tk.status === status);

    return html`
      <div
        class="kanban"
        style="grid-template-columns: repeat(${statuses.length}, 1fr);"
      >
        ${statuses.map(
          (status) => html`
            <div class="kanban-column">
              <div class="kanban-column-header status-${status}">
                <span>${STATUS_LABELS[status]}</span>
                <span style="display: flex; align-items: center; gap: 0.35rem;">
                  <sl-badge variant="neutral" pill
                    >${tasksByStatus(status).length}</sl-badge
                  >
                  <sl-tooltip content=${t("taskBoard.kanban.addTask")}>
                    <sl-icon-button
                      name="plus"
                      style="font-size: 0.75rem;"
                      @click=${() => this._openCreateDialogWithStatus(status)}
                    ></sl-icon-button>
                  </sl-tooltip>
                </span>
              </div>
              <div
                class="kanban-cards"
                @dragover=${(e: DragEvent) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.add("drag-over");
                }}
                @dragleave=${(e: DragEvent) => {
                  (e.currentTarget as HTMLElement).classList.remove(
                    "drag-over",
                  );
                }}
                @drop=${(e: DragEvent) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.remove(
                    "drag-over",
                  );
                  this._handleDrop(status);
                }}
              >
                ${tasksByStatus(status).length === 0
                  ? html`<div class="kanban-empty">
                      ${t("taskBoard.kanban.noTasks")}
                    </div>`
                  : tasksByStatus(status).map((task) =>
                      this._renderKanbanCard(task),
                    )}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }

  private _handleDrop(newStatus: TaskStatus) {
    if (!this._dragTaskId) return;
    const task = this._tasks.find((tk) => tk.id === this._dragTaskId);
    if (task && task.status !== newStatus) {
      void this._handleStatusChange(task, newStatus);
    }
    this._dragTaskId = null;
  }

  private _renderKanbanCard(task: TaskView) {
    const typeColor = TASK_TYPE_COLORS[task.task_type];
    const assignee = task.assigned_to
      ? getParticipantName(task.assigned_to, this.participants)
      : "";
    const [done, total] =
      task.child_count > 0 ? childProgress(this._tasks, task.id) : [0, 0];
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

    return html`
      <div
        class="kanban-card ${this._dragTaskId === task.id ? "dragging" : ""}"
        draggable="true"
        @dragstart=${(e: DragEvent) => {
          this._dragTaskId = task.id;
          e.dataTransfer!.effectAllowed = "move";
        }}
        @dragend=${() => {
          this._dragTaskId = null;
          this.requestUpdate();
        }}
        @click=${() => {
          this._selectTask(task.id);
        }}
      >
        <div class="kanban-card-header">
          <sl-icon
            name=${TASK_TYPE_ICONS[task.task_type]}
            style="color: ${typeColor}"
          ></sl-icon>
          <span class="kanban-card-title">${task.title}</span>
          ${task.priority !== "medium"
            ? html`<sl-icon
                name=${PRIORITY_ICONS[task.priority]}
                style="color: ${PRIORITY_COLORS[
                  task.priority
                ]}; font-size: 0.75rem; flex-shrink: 0;"
              ></sl-icon>`
            : nothing}
          ${this._isTaskInSprint(task)
            ? html`<sl-icon
                name="calendar-week"
                style="color: var(--sl-color-primary-500); font-size: 0.7rem; flex-shrink: 0;"
                title=${t("taskBoard.sprint.title")}
              ></sl-icon>`
            : nothing}
        </div>
        ${total > 0
          ? html`
              <div class="kanban-progress">
                <div class="kanban-progress-bar">
                  <div
                    class="kanban-progress-fill"
                    style="width: ${progressPct}%"
                  ></div>
                </div>
                <span class="kanban-progress-label">${done}/${total}</span>
              </div>
            `
          : nothing}
        <div class="kanban-card-footer">
          <span class="kanban-card-counts">
            <span style="font-family: var(--sl-font-mono);"
              >${task.ticket_id}</span
            >
            ${task.comment_count > 0
              ? html`
                  <span class="kanban-card-count">
                    <sl-icon name="chat-dots"></sl-icon> ${task.comment_count}
                  </span>
                `
              : nothing}
          </span>
          ${assignee
            ? html`
                <span class="kanban-card-assignee">
                  <sl-icon
                    name="person-fill"
                    style="font-size: 0.7rem;"
                  ></sl-icon>
                  ${assignee}
                </span>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-board": TaskBoard;
  }
}
