import { LitElement, html, css, nothing } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { store } from "../../state/app-state.js";
import {
  fetchTasks,
  fetchProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  addTasksToSession,
  removeTaskFromSession,
} from "../../state/task-api.js";
import { createSession } from "../../state/session-api.js";
import { navigateTo } from "../../router.js";
import { t } from "../../lib/i18n.js";
import { getParticipantName } from "../../lib/participant-utils.js";
import {
  type TaskView,
  type TaskType,
  type TaskStatus,
  type TaskPriority,
  type TaskComplexity,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  PRIORITY_LABELS,
  PRIORITY_ICONS,
  PRIORITY_COLORS,
  COMPLEXITY_LABELS,
} from "../../state/task-types.js";
import type { SessionParticipant } from "../../state/app-state.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/tag/tag.js";

import "./task-detail.js";

@customElement("task-board")
export class TaskBoard extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
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

    /* ── Create dialog ── */
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

    /* ── Status quick-change menu ── */
    .status-menu-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Shortcuts overlay ── */
    .shortcuts-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .shortcuts-card {
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 340px;
      width: 90%;
      box-shadow: var(--shadow-lg);
    }

    .shortcuts-card h3 {
      margin: 0 0 1rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.35rem 0;
    }

    .shortcut-row span {
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    .shortcut-key {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      background: var(--surface-card);
      border: 1px solid var(--border-medium);
      border-radius: 4px;
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--text-primary);
      min-width: 1.5rem;
      text-align: center;
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

    /* ── Sprint planning panel ── */
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

  @state() private _tasks: TaskView[] = [];
  @state() private _sprintPanelOpen = false;
  @state() private _sprintSessionCode = "";
  @state() private _sprintSessionName = "";
  @state() private _sprintCreating = false;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _viewMode: "list" | "board" = "board";
  @state() private _filterType: TaskType | "" = "";
  @state() private _filterStatus: TaskStatus | "" = "";
  @state() private _showAllProject = false;
  @state() private _searchQuery = "";
  @state() private _sortBy: "created" | "updated" | "title" | "type" =
    "created";
  @state() private _filterAssignee = "";
  @state() private _hideCompleted = true;
  @state() private _collapseSubtasks = true; // kanban: hide subtasks, show progress on parents
  @state() private _collapsedGroups: Set<string> = new Set(); // list: collapsed parent IDs
  private _dragTaskId: string | null = null;
  @state() private _showCreateDialog = false;
  @state() private _showShortcuts = false;
  @state() private _selectedTaskId: string | null = null;
  @state() private _selectedIds: Set<string> = new Set();
  @state() private _batchLoading = false;

  // Create form state
  @state() private _createType: TaskType = "task";
  @state() private _createTitle = "";
  @state() private _createDescription = "";
  @state() private _createParentId = "";
  @state() private _createAssignee = "";
  @state() private _createPriority: TaskPriority = "medium";
  @state() private _createComplexity: TaskComplexity = "medium";
  @state() private _createStatus: TaskStatus | "" = "";
  @state() private _createLoading = false;
  @state() private _toastMessage = "";

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
      if (isInput) return; // let inputs handle their own Escape
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
        ".filters sl-input",
      ) as HTMLElement | null;
      input?.focus();
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
        this._loadTasks();
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

  /** True when viewing project tasks outside a session (read-only mode). */
  private get _isProjectMode(): boolean {
    return !this.sessionCode && !!this.projectId;
  }

  updated(changed: Map<string, unknown>) {
    if (
      (changed.has("sessionCode") && this.sessionCode) ||
      (changed.has("projectId") && this.projectId && !this.sessionCode)
    ) {
      this._loadTasks();
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
      // URL no longer has a task — user pressed back
      this._selectedTaskId = null;
      this._loadTasks();
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
    this._loadTasks();
  }

  private get _filteredTasks(): TaskView[] {
    let tasks = this._tasks;
    // Hide completed unless toggled or explicitly filtering for a completed status
    if (this._hideCompleted && !this._filterStatus) {
      tasks = tasks.filter(
        (tk) => tk.status !== "done" && tk.status !== "closed",
      );
    }
    if (this._searchQuery.trim()) {
      const q = this._searchQuery.toLowerCase();
      tasks = tasks.filter(
        (tk) =>
          tk.title.toLowerCase().includes(q) ||
          tk.ticket_id.toLowerCase().includes(q) ||
          tk.description?.toLowerCase().includes(q),
      );
    }
    if (this._filterAssignee) {
      tasks = tasks.filter((tk) => tk.assigned_to === this._filterAssignee);
    }
    // Sort
    const sorted = [...tasks];
    switch (this._sortBy) {
      case "updated":
        sorted.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "type":
        sorted.sort((a, b) => a.task_type.localeCompare(b.task_type));
        break;
      case "created":
      default:
        // Default from API is created_at ASC, show newest first
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }
    return sorted;
  }

  /** Count of hidden completed tasks (for the toggle label). */
  private get _completedCount(): number {
    return this._tasks.filter(
      (tk) => tk.status === "done" || tk.status === "closed",
    ).length;
  }

  /** Get child tasks for a parent (from full task list, not filtered). */
  private _childrenOf(parentId: string): TaskView[] {
    return this._tasks.filter((tk) => tk.parent_id === parentId);
  }

  /** Progress for a parent: [done+closed, total children]. */
  private _childProgress(parentId: string): [number, number] {
    const children = this._childrenOf(parentId);
    const complete = children.filter(
      (tk) => tk.status === "done" || tk.status === "closed",
    ).length;
    return [complete, children.length];
  }

  private _isTaskInSprint(task: TaskView): boolean {
    if (!this._sprintSessionCode || !this._sprintPanelOpen) return false;
    const session = this.sessions.find(
      (s) => s.code === this._sprintSessionCode,
    );
    return !!session && task.session_ids?.includes(session.id);
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

  private async _handleCreate() {
    if (!this._createTitle.trim()) return;
    this._createLoading = true;
    try {
      const task = await createTask(this.sessionCode, {
        task_type: this._createType,
        title: this._createTitle.trim(),
        description: this._createDescription.trim() || undefined,
        parent_id: this._createParentId || undefined,
        assigned_to: this._createAssignee || undefined,
        priority:
          this._createPriority !== "medium" ? this._createPriority : undefined,
        complexity:
          this._createComplexity !== "medium"
            ? this._createComplexity
            : undefined,
      });
      // If a non-default status was requested (e.g. from kanban column "+"), update it
      if (this._createStatus && this._createStatus !== "open") {
        await updateTask(this.sessionCode, task.id, {
          status: this._createStatus,
        });
      }
      this._showCreateDialog = false;
      this._createTitle = "";
      this._createDescription = "";
      this._createParentId = "";
      this._createAssignee = "";
      this._createPriority = "medium";
      this._createComplexity = "medium";
      this._createStatus = "";
      this._showToast(t("taskBoard.toast.taskCreated"));
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.errorCreate");
    } finally {
      this._createLoading = false;
    }
  }

  private _openCreateDialog(parentId?: string, type?: TaskType) {
    this._createType = type ?? "task";
    this._createParentId = parentId ?? "";
    this._createTitle = "";
    this._createDescription = "";
    this._createAssignee = "";
    this._createStatus = "";
    this._showCreateDialog = true;
  }

  private _openCreateDialogWithStatus(status: TaskStatus) {
    this._openCreateDialog();
    this._createStatus = status;
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
      <div class="board-header">
        <h2 class="board-title">
          ${this.sessionName || t("taskBoard.title")}
          ${this._filteredTasks.length > 0
            ? html`<sl-badge
                variant="neutral"
                pill
                style="margin-left: 0.5rem; vertical-align: middle;"
                >${this._filteredTasks.length}</sl-badge
              >`
            : nothing}
        </h2>
        <div class="board-actions">
          <div class="view-toggle">
            <sl-tooltip content=${t("taskBoard.listView")}>
              <sl-icon-button
                name="list-ul"
                class=${this._viewMode === "list" ? "active" : ""}
                @click=${() => {
                  this._viewMode = "list";
                }}
              ></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content=${t("taskBoard.boardView")}>
              <sl-icon-button
                name="kanban"
                class=${this._viewMode === "board" ? "active" : ""}
                @click=${() => {
                  this._viewMode = "board";
                }}
              ></sl-icon-button>
            </sl-tooltip>
          </div>
          <sl-tooltip content=${t("taskBoard.refresh")}>
            <sl-icon-button
              name="arrow-clockwise"
              @click=${() => this._loadTasks()}
            ></sl-icon-button>
          </sl-tooltip>
          ${this._isProjectMode
            ? html`
                <sl-button
                  variant=${this._sprintPanelOpen ? "primary" : "default"}
                  size="small"
                  @click=${() => {
                    this._sprintPanelOpen = !this._sprintPanelOpen;
                  }}
                >
                  <sl-icon slot="prefix" name="calendar-week"></sl-icon>
                  ${t("taskBoard.planSprint")}
                </sl-button>
              `
            : html`
                <sl-button
                  variant="primary"
                  size="small"
                  @click=${() => this._openCreateDialog()}
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
          value=${this._searchQuery}
          @sl-input=${(e: Event) => {
            this._searchQuery = (e.target as HTMLInputElement).value;
          }}
          @sl-clear=${() => {
            this._searchQuery = "";
          }}
          style="max-width: 220px;"
        >
          <sl-icon slot="prefix" name="search"></sl-icon>
        </sl-input>
        <sl-select
          placeholder=${t("taskBoard.filterAllTypes")}
          size="small"
          clearable
          value=${this._filterType}
          @sl-change=${(e: Event) => {
            this._filterType = (e.target as HTMLSelectElement).value as
              | TaskType
              | "";
            this._loadTasks();
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

        ${this._viewMode === "list"
          ? html`
              <sl-select
                placeholder=${t("taskBoard.filterAllStatuses")}
                size="small"
                clearable
                value=${this._filterStatus}
                @sl-change=${(e: Event) => {
                  this._filterStatus = (e.target as HTMLSelectElement).value as
                    | TaskStatus
                    | "";
                  this._loadTasks();
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
                value=${this._filterAssignee}
                @sl-change=${(e: Event) => {
                  this._filterAssignee = (e.target as HTMLSelectElement).value;
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
          value=${this._sortBy}
          style="min-width: 130px;"
          @sl-change=${(e: Event) => {
            this._sortBy = (e.target as HTMLSelectElement).value as any;
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

        ${!this._isProjectMode
          ? html`
              <sl-tooltip
                content=${this._showAllProject
                  ? t("taskBoard.scopeAllTooltip")
                  : t("taskBoard.scopeSessionTooltip")}
              >
                <sl-button
                  size="small"
                  variant=${this._showAllProject ? "primary" : "default"}
                  @click=${() => {
                    this._showAllProject = !this._showAllProject;
                    this._loadTasks();
                  }}
                  style="white-space: nowrap;"
                >
                  <sl-icon
                    slot="prefix"
                    name=${this._showAllProject ? "collection" : "collection"}
                  ></sl-icon>
                  ${this._showAllProject
                    ? t("taskBoard.scopeAll")
                    : t("taskBoard.scopeSession")}
                </sl-button>
              </sl-tooltip>
            `
          : nothing}
        ${this._completedCount > 0
          ? html`
              <sl-tooltip
                content=${this._hideCompleted
                  ? t("taskBoard.showCompleted", {
                      count: this._completedCount,
                    })
                  : t("taskBoard.hideCompleted")}
              >
                <sl-button
                  size="small"
                  variant=${this._hideCompleted ? "default" : "primary"}
                  @click=${() => {
                    this._hideCompleted = !this._hideCompleted;
                  }}
                  style="white-space: nowrap;"
                >
                  <sl-icon
                    slot="prefix"
                    name=${this._hideCompleted ? "eye" : "eye-slash"}
                  ></sl-icon>
                  ${this._hideCompleted
                    ? t("taskBoard.completedDone", {
                        count: this._completedCount,
                      })
                    : t("taskBoard.hideDone")}
                </sl-button>
              </sl-tooltip>
            `
          : nothing}
      </div>

      ${this._renderSprintPanel()}
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
      ${this._renderCreateDialog()} ${this._renderShortcuts()}
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
            @click=${() => this._batchSetStatus("in_progress")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.start")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => this._batchSetStatus("done")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.done")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => this._batchSetStatus("closed")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.close")}</sl-button
          >
          <sl-button
            size="small"
            @click=${() => this._batchSetStatus("open")}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.reopen")}</sl-button
          >
          <sl-button
            size="small"
            variant="danger"
            @click=${() => this._batchDelete()}
            ?loading=${this._batchLoading}
            >${t("taskBoard.batch.delete")}</sl-button
          >
        </div>
      </div>
    `;
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

  private _renderTaskList() {
    const tasks = this._filteredTasks;
    const topLevel = tasks.filter((tk) => !tk.parent_id);
    const childrenOf = (id: string) =>
      tasks.filter((tk) => tk.parent_id === id);

    return html`
      ${this._renderBatchBar()}
      <div class="task-list">
        ${topLevel.map((task) => {
          const children = childrenOf(task.id);
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
    const [done, total] = hasChildren ? this._childProgress(task.id) : [0, 0];

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
                        this._handleStatusChange(task, "in_progress")}
                    >
                      ${t("taskBoard.action.startWork")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "done"
                ? html`
                    <sl-menu-item
                      @click=${() => this._handleStatusChange(task, "done")}
                    >
                      ${t("taskBoard.action.markDone")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "closed"
                ? html`
                    <sl-menu-item
                      @click=${() => this._handleStatusChange(task, "closed")}
                    >
                      ${t("taskBoard.action.close")}
                    </sl-menu-item>
                  `
                : nothing}
              ${task.status !== "open"
                ? html`
                    <sl-menu-item
                      @click=${() => this._handleStatusChange(task, "open")}
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
                @click=${() => this._handleDelete(task.id)}
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
    // When hiding completed, only show open + in_progress columns
    const statuses: TaskStatus[] = this._hideCompleted
      ? ["open", "in_progress"]
      : ["open", "in_progress", "done", "closed"];
    const tasks = this._filteredTasks;
    // In kanban, hide subtasks that have a parent — they show as progress on the parent card
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
      this._handleStatusChange(task, newStatus);
    }
    this._dragTaskId = null;
  }

  private _renderKanbanCard(task: TaskView) {
    const typeColor = TASK_TYPE_COLORS[task.task_type];
    const assignee = task.assigned_to
      ? getParticipantName(task.assigned_to, this.participants)
      : "";
    const [done, total] =
      task.child_count > 0 ? this._childProgress(task.id) : [0, 0];
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

  private _renderSprintPanel() {
    if (!this._isProjectMode || !this._sprintPanelOpen) return nothing;

    const selectedSession = this.sessions.find(
      (s) => s.code === this._sprintSessionCode,
    );
    const sprintSessionId = selectedSession?.id ?? "";
    const sprintTasks = sprintSessionId
      ? this._tasks.filter((tk) => tk.session_ids?.includes(sprintSessionId))
      : [];

    return html`
      <div class="sprint-panel">
        <div class="sprint-panel-header">
          ${this.sessions.length > 0
            ? html`
                <sl-select
                  placeholder=${t("taskBoard.sprint.selectSession")}
                  size="small"
                  clearable
                  value=${this._sprintSessionCode}
                  @sl-change=${(e: Event) => {
                    this._sprintSessionCode = (
                      e.target as HTMLSelectElement
                    ).value;
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
            value=${this._sprintSessionName}
            @sl-input=${(e: Event) => {
              this._sprintSessionName = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._createSprint();
            }}
          ></sl-input>
          <sl-button
            size="small"
            variant="default"
            ?loading=${this._sprintCreating}
            ?disabled=${!this._sprintSessionName.trim()}
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
          ${this._sprintSessionCode
            ? html`
                <sl-button
                  size="small"
                  variant="primary"
                  @click=${() => {
                    navigateTo("/sessions/" + this._sprintSessionCode);
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
            if (!this._sprintSessionCode) return;
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
          ${!this._sprintSessionCode
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
                        this._selectTask(task.id);
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

  private async _handleSprintDrop() {
    if (!this._dragTaskId || !this._sprintSessionCode) return;
    try {
      await addTasksToSession(this._sprintSessionCode, [this._dragTaskId]);
      this._showToast(t("taskBoard.toast.addedToSprint"));
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.sprint.errorAdd");
    }
    this._dragTaskId = null;
  }

  private async _removeFromSprint(taskId: string) {
    if (!this._sprintSessionCode) return;
    try {
      await removeTaskFromSession(this._sprintSessionCode, taskId);
      this._showToast(t("taskBoard.toast.removedFromSprint"));
      await this._loadTasks();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.sprint.errorRemove");
    }
  }

  private async _createSprint() {
    this._sprintCreating = true;
    try {
      const data = await createSession({
        project_id: this.projectId,
        name: this._sprintSessionName.trim(),
      });
      this.sessions = [
        ...this.sessions,
        {
          code: data.session.code,
          name: data.session.name,
          id: data.session.id,
        },
      ];
      this._sprintSessionCode = data.session.code;
      this._sprintSessionName = "";
      this._showToast(t("taskBoard.toast.sprintCreated"));
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("taskBoard.errorSprint");
    } finally {
      this._sprintCreating = false;
    }
  }

  private _renderCreateDialog() {
    // Compute available parent tasks (epics, stories, and tasks can have children)
    const parentCandidates = this._tasks.filter(
      (tk) =>
        tk.task_type === "epic" ||
        tk.task_type === "story" ||
        tk.task_type === "task",
    );

    return html`
      <sl-dialog
        label=${t("taskBoard.create.title")}
        ?open=${this._showCreateDialog}
        @sl-request-close=${() => {
          this._showCreateDialog = false;
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
            value=${this._createType}
            @sl-change=${(e: Event) => {
              this._createType = (e.target as HTMLSelectElement)
                .value as TaskType;
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
            value=${this._createTitle}
            @sl-input=${(e: Event) => {
              this._createTitle = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this._handleCreate();
            }}
          ></sl-input>

          <sl-textarea
            label=${t("taskBoard.create.descLabel")}
            placeholder=${t("taskBoard.create.descPlaceholder")}
            value=${this._createDescription}
            @sl-input=${(e: Event) => {
              this._createDescription = (e.target as HTMLTextAreaElement).value;
            }}
            rows="3"
          ></sl-textarea>

          ${this.participants.length > 0
            ? html`
                <sl-select
                  label=${t("taskBoard.create.assigneeLabel")}
                  placeholder=${t("taskBoard.create.unassigned")}
                  clearable
                  value=${this._createAssignee}
                  @sl-change=${(e: Event) => {
                    this._createAssignee = (
                      e.target as HTMLSelectElement
                    ).value;
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
              value=${this._createPriority}
              @sl-change=${(e: Event) => {
                this._createPriority = (e.target as HTMLSelectElement)
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
              value=${this._createComplexity}
              @sl-change=${(e: Event) => {
                this._createComplexity = (e.target as HTMLSelectElement)
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
                  value=${this._createParentId}
                  @sl-change=${(e: Event) => {
                    this._createParentId = (
                      e.target as HTMLSelectElement
                    ).value;
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
          ?loading=${this._createLoading}
          @click=${() => this._handleCreate()}
          >${t("taskBoard.create.submit")}</sl-button
        >
      </sl-dialog>
    `;
  }

  private _renderShortcuts() {
    if (!this._showShortcuts) return nothing;
    return html`
      <div
        class="shortcuts-overlay"
        @click=${() => {
          this._showShortcuts = false;
        }}
      >
        <div class="shortcuts-card" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${t("taskBoard.shortcuts.title")}</h3>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.newTask")}</span
            ><span class="shortcut-key">N</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.search")}</span
            ><span class="shortcut-key">/</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.escape")}</span
            ><span class="shortcut-key">Esc</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.help")}</span
            ><span class="shortcut-key">?</span>
          </div>
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
