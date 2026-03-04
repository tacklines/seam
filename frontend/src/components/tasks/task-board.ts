import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { store } from '../../state/app-state.js';
import { fetchTasks, createTask, updateTask, deleteTask } from '../../state/task-api.js';
import {
  type TaskView, type TaskType, type TaskStatus,
  TASK_TYPE_LABELS, TASK_TYPE_ICONS, TASK_TYPE_COLORS,
  STATUS_LABELS, STATUS_VARIANTS,
} from '../../state/task-types.js';
import type { SessionParticipant } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/tag/tag.js';

import './task-detail.js';

@customElement('task-board')
export class TaskBoard extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; padding: 1.5rem; overflow-y: auto; }

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
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .task-card:hover {
      background: var(--surface-card-hover);
      border-color: var(--border-medium);
    }

    .task-card.child {
      margin-left: 2rem;
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

    .kanban-column-header.status-open { border-bottom-color: var(--sl-color-neutral-500); }
    .kanban-column-header.status-in_progress { border-bottom-color: var(--sl-color-primary-500); }
    .kanban-column-header.status-done { border-bottom-color: var(--sl-color-success-500); }
    .kanban-column-header.status-closed { border-bottom-color: var(--sl-color-neutral-600); }

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
      transition: background 0.15s, border-color 0.15s, transform 0.1s, opacity 0.15s;
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
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  @property({ type: String, attribute: 'session-code' })
  sessionCode = '';

  @property({ type: String, attribute: 'session-name' })
  sessionName = '';

  @property({ type: Array })
  participants: SessionParticipant[] = [];

  @state() private _tasks: TaskView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _viewMode: 'list' | 'board' = 'board';
  @state() private _filterType: TaskType | '' = '';
  @state() private _filterStatus: TaskStatus | '' = '';
  @state() private _searchQuery = '';
  @state() private _sortBy: 'created' | 'updated' | 'title' | 'type' = 'created';
  @state() private _filterAssignee = '';
  private _dragTaskId: string | null = null;
  @state() private _showCreateDialog = false;
  @state() private _showShortcuts = false;
  @state() private _selectedTaskId: string | null = null;

  // Create form state
  @state() private _createType: TaskType = 'task';
  @state() private _createTitle = '';
  @state() private _createDescription = '';
  @state() private _createParentId = '';
  @state() private _createAssignee = '';
  @state() private _createStatus: TaskStatus | '' = '';
  @state() private _createLoading = false;
  @state() private _toastMessage = '';

  private _storeUnsub: (() => void) | null = null;
  private _keyHandler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const isInput = tag === 'sl-input' || tag === 'sl-textarea' || tag === 'input' || tag === 'textarea';

    if (e.key === 'Escape') {
      if (this._selectedTaskId) {
        this._selectedTaskId = null;
        this._loadTasks();
      }
      return;
    }

    if (isInput) return;

    if (e.key === 'n' && !this._selectedTaskId) {
      e.preventDefault();
      this._openCreateDialog();
    } else if (e.key === '/' && !this._selectedTaskId) {
      e.preventDefault();
      const input = this.shadowRoot?.querySelector('.filters sl-input') as HTMLElement | null;
      input?.focus();
    } else if (e.key === '?' && !this._selectedTaskId) {
      e.preventDefault();
      this._showShortcuts = !this._showShortcuts;
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this._loadTasks();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === 'tasks-changed') {
        this._loadTasks();
      }
    });
    document.addEventListener('keydown', this._keyHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
    this._storeUnsub = null;
    document.removeEventListener('keydown', this._keyHandler);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('sessionCode') && this.sessionCode) {
      this._loadTasks();
    }
  }

  private async _loadTasks() {
    if (!this.sessionCode) return;
    this._loading = true;
    this._error = '';
    try {
      const filters: Record<string, string> = {};
      if (this._filterType) filters.task_type = this._filterType;
      if (this._filterStatus) filters.status = this._filterStatus;
      this._tasks = await fetchTasks(this.sessionCode, filters as any);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load tasks';
    } finally {
      this._loading = false;
    }
  }

  private get _filteredTasks(): TaskView[] {
    let tasks = this._tasks;
    if (this._searchQuery.trim()) {
      const q = this._searchQuery.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q))
      );
    }
    if (this._filterAssignee) {
      tasks = tasks.filter(t => t.assigned_to === this._filterAssignee);
    }
    // Sort
    const sorted = [...tasks];
    switch (this._sortBy) {
      case 'updated':
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'type':
        sorted.sort((a, b) => a.task_type.localeCompare(b.task_type));
        break;
      case 'created':
      default:
        // Default from API is created_at ASC, show newest first
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return sorted;
  }

  private _showToast(message: string) {
    this._toastMessage = message;
    setTimeout(() => { this._toastMessage = ''; }, 2500);
  }

  private _getParticipantName(id: string | null): string {
    if (!id) return '';
    const p = this.participants.find(p => p.id === id);
    return p?.display_name ?? id.slice(0, 8);
  }

  private async _handleStatusChange(task: TaskView, newStatus: TaskStatus) {
    try {
      await updateTask(this.sessionCode, task.id, { status: newStatus });
      this._showToast(`Moved to ${STATUS_LABELS[newStatus]}`);
      await this._loadTasks();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to update';
    }
  }

  private async _handleDelete(taskId: string) {
    try {
      await deleteTask(this.sessionCode, taskId);
      if (this._selectedTaskId === taskId) this._selectedTaskId = null;
      this._showToast('Task deleted');
      await this._loadTasks();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to delete';
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
      });
      // If a non-default status was requested (e.g. from kanban column "+"), update it
      if (this._createStatus && this._createStatus !== 'open') {
        await updateTask(this.sessionCode, task.id, { status: this._createStatus });
      }
      this._showCreateDialog = false;
      this._createTitle = '';
      this._createDescription = '';
      this._createParentId = '';
      this._createAssignee = '';
      this._createStatus = '';
      this._showToast('Task created');
      await this._loadTasks();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to create task';
    } finally {
      this._createLoading = false;
    }
  }

  private _openCreateDialog(parentId?: string, type?: TaskType) {
    this._createType = type ?? 'task';
    this._createParentId = parentId ?? '';
    this._createTitle = '';
    this._createDescription = '';
    this._createAssignee = '';
    this._createStatus = '';
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
          task-id=${this._selectedTaskId}
          .participants=${this.participants}
          @back=${() => { this._selectedTaskId = null; this._loadTasks(); }}
          @deleted=${() => { this._selectedTaskId = null; this._loadTasks(); }}
          @navigate-task=${(e: CustomEvent) => { this._selectedTaskId = e.detail; }}
        ></task-detail>
      `;
    }

    return html`
      <div class="board-header">
        <h2 class="board-title">
          ${this.sessionName || 'Tasks'}
          ${this._filteredTasks.length > 0
            ? html`<sl-badge variant="neutral" pill style="margin-left: 0.5rem; vertical-align: middle;">${this._filteredTasks.length}</sl-badge>`
            : nothing}
        </h2>
        <div class="board-actions">
          <div class="view-toggle">
            <sl-tooltip content="List view">
              <sl-icon-button
                name="list-ul"
                class=${this._viewMode === 'list' ? 'active' : ''}
                @click=${() => { this._viewMode = 'list'; }}
              ></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content="Board view">
              <sl-icon-button
                name="kanban"
                class=${this._viewMode === 'board' ? 'active' : ''}
                @click=${() => { this._viewMode = 'board'; }}
              ></sl-icon-button>
            </sl-tooltip>
          </div>
          <sl-tooltip content="Refresh">
            <sl-icon-button name="arrow-clockwise" @click=${() => this._loadTasks()}></sl-icon-button>
          </sl-tooltip>
          <sl-button variant="primary" size="small" @click=${() => this._openCreateDialog()}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            New Task
          </sl-button>
        </div>
      </div>

      <div class="filters">
        <sl-input
          placeholder="Search tasks..."
          size="small"
          clearable
          value=${this._searchQuery}
          @sl-input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
          @sl-clear=${() => { this._searchQuery = ''; }}
          style="max-width: 220px;"
        >
          <sl-icon slot="prefix" name="search"></sl-icon>
        </sl-input>
        <sl-select
          placeholder="All Types"
          size="small"
          clearable
          value=${this._filterType}
          @sl-change=${(e: Event) => {
            this._filterType = (e.target as HTMLSelectElement).value as TaskType | '';
            this._loadTasks();
          }}
        >
          ${(['epic', 'story', 'task', 'subtask', 'bug'] as TaskType[]).map(t => html`
            <sl-option value=${t}>
              <sl-icon slot="prefix" name=${TASK_TYPE_ICONS[t]} style="color: ${TASK_TYPE_COLORS[t]}"></sl-icon>
              ${TASK_TYPE_LABELS[t]}
            </sl-option>
          `)}
        </sl-select>

        ${this._viewMode === 'list' ? html`
          <sl-select
            placeholder="All Statuses"
            size="small"
            clearable
            value=${this._filterStatus}
            @sl-change=${(e: Event) => {
              this._filterStatus = (e.target as HTMLSelectElement).value as TaskStatus | '';
              this._loadTasks();
            }}
          >
            ${(['open', 'in_progress', 'done', 'closed'] as TaskStatus[]).map(s => html`
              <sl-option value=${s}>${STATUS_LABELS[s]}</sl-option>
            `)}
          </sl-select>
        ` : nothing}

        ${this.participants.length > 0 ? html`
          <sl-select
            placeholder="All Assignees"
            size="small"
            clearable
            value=${this._filterAssignee}
            @sl-change=${(e: Event) => {
              this._filterAssignee = (e.target as HTMLSelectElement).value;
            }}
          >
            ${this.participants.map(p => html`
              <sl-option value=${p.id}>
                <sl-icon slot="prefix" name=${p.participant_type === 'agent' ? 'robot' : 'person-fill'}></sl-icon>
                ${p.display_name}
              </sl-option>
            `)}
          </sl-select>
        ` : nothing}

        <sl-select
          size="small"
          value=${this._sortBy}
          style="min-width: 130px;"
          @sl-change=${(e: Event) => { this._sortBy = (e.target as HTMLSelectElement).value as any; }}
        >
          <sl-icon slot="prefix" name="sort-down" style="font-size: 0.85rem;"></sl-icon>
          <sl-option value="created">Newest</sl-option>
          <sl-option value="updated">Recently Updated</sl-option>
          <sl-option value="title">Title A-Z</sl-option>
          <sl-option value="type">Type</sl-option>
        </sl-select>
      </div>

      ${this._error ? html`
        <sl-alert variant="danger" open closable @sl-after-hide=${() => { this._error = ''; }} style="margin-bottom: 1rem;">
          ${this._error}
        </sl-alert>
      ` : nothing}

      ${!this._loading && this._tasks.length > 0 ? this._renderStats() : nothing}

      ${this._loading
        ? html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`
        : this._tasks.length === 0
          ? this._renderEmpty()
          : this._viewMode === 'board'
            ? this._renderKanban()
            : this._renderTaskList()}

      ${this._renderCreateDialog()}
      ${this._renderShortcuts()}
      ${this._toastMessage ? html`<div class="toast">${this._toastMessage}</div>` : nothing}
    `;
  }

  private _renderStats() {
    const tasks = this._tasks;
    const open = tasks.filter(t => t.status === 'open').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const closed = tasks.filter(t => t.status === 'closed').length;

    return html`
      <div class="stats-bar">
        <div class="stat"><span class="stat-value">${tasks.length}</span> total</div>
        <div class="stat"><span class="stat-value">${open}</span> open</div>
        <div class="stat"><span class="stat-value">${inProgress}</span> in progress</div>
        <div class="stat"><span class="stat-value">${done}</span> done</div>
        ${closed > 0 ? html`<div class="stat"><span class="stat-value">${closed}</span> closed</div>` : nothing}
      </div>
    `;
  }

  private _renderEmpty() {
    return html`
      <div class="empty-state">
        <sl-icon name="kanban"></sl-icon>
        <p>No tasks yet. Create one to get started.</p>
        <sl-button variant="primary" @click=${() => this._openCreateDialog()}>
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          Create Task
        </sl-button>
      </div>
    `;
  }

  private _renderTaskList() {
    const tasks = this._filteredTasks;
    const topLevel = tasks.filter(t => !t.parent_id);
    const childrenOf = (id: string) => tasks.filter(t => t.parent_id === id);

    return html`
      <div class="task-list">
        ${topLevel.map(task => html`
          ${this._renderTaskCard(task, false)}
          ${childrenOf(task.id).map(child => this._renderTaskCard(child, true))}
        `)}
      </div>
    `;
  }

  private _renderTaskCard(task: TaskView, isChild: boolean) {
    const typeColor = TASK_TYPE_COLORS[task.task_type];
    const assignee = this._getParticipantName(task.assigned_to);

    return html`
      <div class="task-card ${isChild ? 'child' : ''}" @click=${() => { this._selectedTaskId = task.id; }}>
        <div class="task-type-icon">
          <sl-icon name=${TASK_TYPE_ICONS[task.task_type]} style="color: ${typeColor}"></sl-icon>
        </div>

        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            ${TASK_TYPE_LABELS[task.task_type]}
            ${assignee ? html` &middot; ${assignee}` : nothing}
            ${task.child_count > 0 ? html` &middot; <sl-icon name="diagram-3" style="font-size: 0.7rem; vertical-align: middle;"></sl-icon> ${task.child_count}` : nothing}
            ${task.comment_count > 0 ? html` &middot; <sl-icon name="chat-dots" style="font-size: 0.7rem; vertical-align: middle;"></sl-icon> ${task.comment_count}` : nothing}
          </div>
        </div>

        <sl-badge variant=${STATUS_VARIANTS[task.status] as any} pill>
          ${STATUS_LABELS[task.status]}
        </sl-badge>

        <div class="task-actions" @click=${(e: Event) => e.stopPropagation()}>
          <sl-dropdown>
            <sl-icon-button slot="trigger" name="three-dots-vertical" label="Actions"></sl-icon-button>
            <sl-menu>
              ${task.status !== 'in_progress' ? html`
                <sl-menu-item @click=${() => this._handleStatusChange(task, 'in_progress')}>
                  Start Work
                </sl-menu-item>
              ` : nothing}
              ${task.status !== 'done' ? html`
                <sl-menu-item @click=${() => this._handleStatusChange(task, 'done')}>
                  Mark Done
                </sl-menu-item>
              ` : nothing}
              ${task.status !== 'closed' ? html`
                <sl-menu-item @click=${() => this._handleStatusChange(task, 'closed')}>
                  Close
                </sl-menu-item>
              ` : nothing}
              ${task.status !== 'open' ? html`
                <sl-menu-item @click=${() => this._handleStatusChange(task, 'open')}>
                  Reopen
                </sl-menu-item>
              ` : nothing}
              <sl-divider></sl-divider>
              ${!isChild ? html`
                <sl-menu-item @click=${() => this._openCreateDialog(task.id, 'subtask')}>
                  Add Child Task
                </sl-menu-item>
              ` : nothing}
              <sl-divider></sl-divider>
              <sl-menu-item type="checkbox" @click=${() => this._handleDelete(task.id)}>
                Delete
              </sl-menu-item>
            </sl-menu>
          </sl-dropdown>
        </div>
      </div>
    `;
  }

  private _renderKanban() {
    const statuses: TaskStatus[] = ['open', 'in_progress', 'done', 'closed'];
    const tasks = this._filteredTasks;
    const tasksByStatus = (status: TaskStatus) =>
      tasks.filter(t => t.status === status);

    return html`
      <div class="kanban">
        ${statuses.map(status => html`
          <div class="kanban-column">
            <div class="kanban-column-header status-${status}">
              <span>${STATUS_LABELS[status]}</span>
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <sl-badge variant="neutral" pill>${tasksByStatus(status).length}</sl-badge>
                <sl-tooltip content="Add task">
                  <sl-icon-button
                    name="plus"
                    style="font-size: 0.75rem;"
                    @click=${() => this._openCreateDialogWithStatus(status)}
                  ></sl-icon-button>
                </sl-tooltip>
              </span>
            </div>
            <div class="kanban-cards"
              @dragover=${(e: DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add('drag-over');
              }}
              @dragleave=${(e: DragEvent) => {
                (e.currentTarget as HTMLElement).classList.remove('drag-over');
              }}
              @drop=${(e: DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.remove('drag-over');
                this._handleDrop(status);
              }}
            >
              ${tasksByStatus(status).length === 0
                ? html`<div class="kanban-empty">No tasks</div>`
                : tasksByStatus(status).map(task => this._renderKanbanCard(task))}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private _handleDrop(newStatus: TaskStatus) {
    if (!this._dragTaskId) return;
    const task = this._tasks.find(t => t.id === this._dragTaskId);
    if (task && task.status !== newStatus) {
      this._handleStatusChange(task, newStatus);
    }
    this._dragTaskId = null;
  }

  private _renderKanbanCard(task: TaskView) {
    const typeColor = TASK_TYPE_COLORS[task.task_type];
    const assignee = this._getParticipantName(task.assigned_to);

    return html`
      <div
        class="kanban-card ${this._dragTaskId === task.id ? 'dragging' : ''}"
        draggable="true"
        @dragstart=${(e: DragEvent) => {
          this._dragTaskId = task.id;
          e.dataTransfer!.effectAllowed = 'move';
        }}
        @dragend=${() => { this._dragTaskId = null; this.requestUpdate(); }}
        @click=${() => { this._selectedTaskId = task.id; }}
      >
        <div class="kanban-card-header">
          <sl-icon name=${TASK_TYPE_ICONS[task.task_type]} style="color: ${typeColor}"></sl-icon>
          <span class="kanban-card-title">${task.title}</span>
        </div>
        <div class="kanban-card-footer">
          <span class="kanban-card-counts">
            <span>${TASK_TYPE_LABELS[task.task_type]}</span>
            ${task.child_count > 0 ? html`
              <span class="kanban-card-count">
                <sl-icon name="diagram-3"></sl-icon> ${task.child_count}
              </span>
            ` : nothing}
            ${task.comment_count > 0 ? html`
              <span class="kanban-card-count">
                <sl-icon name="chat-dots"></sl-icon> ${task.comment_count}
              </span>
            ` : nothing}
          </span>
          ${assignee ? html`
            <span class="kanban-card-assignee">
              <sl-icon name="person-fill" style="font-size: 0.7rem;"></sl-icon>
              ${assignee}
            </span>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _renderCreateDialog() {
    // Compute available parent tasks (epics and stories for hierarchy)
    const parentCandidates = this._tasks.filter(t =>
      t.task_type === 'epic' || t.task_type === 'story'
    );

    return html`
      <sl-dialog
        label="New Task"
        ?open=${this._showCreateDialog}
        @sl-request-close=${() => { this._showCreateDialog = false; }}
        @sl-after-show=${() => {
          const input = this.shadowRoot?.querySelector('.create-form sl-input') as HTMLElement | null;
          input?.focus();
        }}
      >
        <div class="create-form">
          <sl-select
            label="Type"
            value=${this._createType}
            @sl-change=${(e: Event) => { this._createType = (e.target as HTMLSelectElement).value as TaskType; }}
          >
            ${(['epic', 'story', 'task', 'subtask', 'bug'] as TaskType[]).map(t => html`
              <sl-option value=${t}>
                <sl-icon slot="prefix" name=${TASK_TYPE_ICONS[t]} style="color: ${TASK_TYPE_COLORS[t]}"></sl-icon>
                ${TASK_TYPE_LABELS[t]}
              </sl-option>
            `)}
          </sl-select>

          <sl-input
            label="Title"
            placeholder="What needs to be done?"
            value=${this._createTitle}
            @sl-input=${(e: Event) => { this._createTitle = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._handleCreate(); }}
          ></sl-input>

          <sl-textarea
            label="Description"
            placeholder="Optional details (markdown supported)"
            value=${this._createDescription}
            @sl-input=${(e: Event) => { this._createDescription = (e.target as HTMLTextAreaElement).value; }}
            rows="3"
          ></sl-textarea>

          ${this.participants.length > 0 ? html`
            <sl-select
              label="Assignee"
              placeholder="Unassigned"
              clearable
              value=${this._createAssignee}
              @sl-change=${(e: Event) => { this._createAssignee = (e.target as HTMLSelectElement).value; }}
            >
              ${this.participants.map(p => html`
                <sl-option value=${p.id}>
                  <sl-icon slot="prefix" name=${p.participant_type === 'agent' ? 'robot' : 'person-fill'}></sl-icon>
                  ${p.display_name}
                </sl-option>
              `)}
            </sl-select>
          ` : nothing}

          ${parentCandidates.length > 0 ? html`
            <sl-select
              label="Parent"
              placeholder="None (top-level)"
              clearable
              value=${this._createParentId}
              @sl-change=${(e: Event) => { this._createParentId = (e.target as HTMLSelectElement).value; }}
            >
              ${parentCandidates.map(t => html`
                <sl-option value=${t.id}>
                  <sl-icon slot="prefix" name=${TASK_TYPE_ICONS[t.task_type]}></sl-icon>
                  ${t.title}
                </sl-option>
              `)}
            </sl-select>
          ` : nothing}
        </div>

        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this._createLoading}
          @click=${() => this._handleCreate()}
        >Create</sl-button>
      </sl-dialog>
    `;
  }

  private _renderShortcuts() {
    if (!this._showShortcuts) return nothing;
    return html`
      <div class="shortcuts-overlay" @click=${() => { this._showShortcuts = false; }}>
        <div class="shortcuts-card" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Keyboard Shortcuts</h3>
          <div class="shortcut-row"><span>New task</span><span class="shortcut-key">N</span></div>
          <div class="shortcut-row"><span>Search</span><span class="shortcut-key">/</span></div>
          <div class="shortcut-row"><span>Go back</span><span class="shortcut-key">Esc</span></div>
          <div class="shortcut-row"><span>This help</span><span class="shortcut-key">?</span></div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'task-board': TaskBoard;
  }
}
