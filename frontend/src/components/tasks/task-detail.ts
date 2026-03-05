import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { fetchTask, fetchTasks, updateTask, deleteTask, addComment, addDependency, removeDependency, fetchActivity, type ActivityEvent } from '../../state/task-api.js';
import {
  type TaskDetailView, type TaskStatus, type TaskType, type TaskPriority, type TaskComplexity,
  TASK_TYPE_LABELS, TASK_TYPE_ICONS, TASK_TYPE_COLORS,
  STATUS_LABELS, STATUS_VARIANTS,
  PRIORITY_LABELS, PRIORITY_ICONS, PRIORITY_COLORS,
  COMPLEXITY_LABELS,
} from '../../state/task-types.js';
import { store, type SessionParticipant } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';

@customElement('task-detail')
export class TaskDetail extends LitElement {
  static styles = css`
    :host { display: block; }

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

    .back-btn { flex-shrink: 0; }

    .header-title-area {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .type-icon { font-size: 1.25rem; flex-shrink: 0; }

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

    .parent-breadcrumb sl-icon { font-size: 0.75rem; }

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

    /* ── Sidebar ── */
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .sidebar-heading {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0 0.5rem;
      margin-bottom: 0.25rem;
    }

    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      font-size: 0.8rem;
      transition: background 0.15s;
      cursor: default;
    }

    .meta-row:hover {
      background: var(--surface-card-hover);
    }

    .meta-row.editable {
      cursor: pointer;
    }

    .meta-row.editable:hover .edit-pencil {
      opacity: 1;
    }

    .meta-label {
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .meta-value {
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .edit-pencil {
      opacity: 0;
      font-size: 0.7rem;
      color: var(--text-tertiary);
      transition: opacity 0.15s;
    }

    .commit-sha {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-card);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }

    .link-action {
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      cursor: pointer;
    }

    .link-action:hover {
      text-decoration: underline;
    }

    /* ── Description ── */
    .description-section {
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

    .description-content {
      color: var(--text-secondary);
      line-height: 1.6;
      font-size: 0.9rem;
      padding: 0.75rem 0.75rem 0.75rem 1rem;
      background: var(--surface-card);
      border-radius: 6px;
      border-left: 3px solid var(--sl-color-primary-500);
      cursor: default;
      position: relative;
    }

    .description-content:hover {
      border-left-color: var(--sl-color-primary-400);
    }

    .description-content:hover .edit-hint {
      display: inline;
    }

    .description-content code {
      background: var(--surface-bg);
      padding: 0.15em 0.35em;
      border-radius: 3px;
      font-size: 0.85em;
      font-family: monospace;
    }

    .description-content pre {
      background: var(--surface-bg);
      padding: 0.75rem;
      border-radius: 4px;
      overflow-x: auto;
      margin: 0.5rem 0;
    }

    .description-content pre code {
      background: none;
      padding: 0;
    }

    .description-content a {
      color: var(--sl-color-primary-400);
    }

    .description-content .mention {
      color: var(--sl-color-primary-400);
      font-weight: 600;
    }

    .description-content p {
      margin: 0 0 0.5rem 0;
    }

    .description-content p:last-child {
      margin-bottom: 0;
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

    .no-description:hover {
      background: var(--surface-card);
      border-color: var(--border-medium);
    }

    /* ── Children ── */
    .children-section {
      margin-bottom: 1.25rem;
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
      transition: background 0.15s, border-color 0.15s;
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

    /* ── Dependencies ── */
    .dep-section {
      margin-bottom: 1.25rem;
    }

    .dep-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .dep-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .dep-item:hover {
      background: var(--surface-card-hover);
    }

    .dep-item .dep-title {
      flex: 1;
      color: var(--text-primary);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dep-item .remove-dep {
      opacity: 0;
      transition: opacity 0.15s;
    }

    .dep-item:hover .remove-dep {
      opacity: 1;
    }

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

    .dep-add-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.5rem;
    }

    /* ── Comments ── */
    .comments-section {
      margin-bottom: 1rem;
    }

    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .comment {
      padding: 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
    }

    .comment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.35rem;
    }

    .comment-author {
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .comment-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .comment-content {
      color: var(--text-primary);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .comment-content code {
      background: var(--surface-bg);
      padding: 0.1em 0.3em;
      border-radius: 3px;
      font-size: 0.85em;
      font-family: monospace;
    }

    .comment-content pre {
      background: var(--surface-bg);
      padding: 0.5rem;
      border-radius: 4px;
      overflow-x: auto;
      margin: 0.35rem 0;
    }

    .comment-content pre code {
      background: none;
      padding: 0;
    }

    .mention {
      color: var(--sl-color-primary-400);
      font-weight: 600;
      cursor: default;
    }

    .comment-content p {
      margin: 0 0 0.35rem 0;
    }

    .comment-content p:last-child {
      margin-bottom: 0;
    }

    /* ── Collapsed comment input ── */
    .comment-input-collapsed {
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      cursor: text;
      transition: border-color 0.15s;
    }

    .comment-input-collapsed:hover {
      border-color: var(--border-medium);
      color: var(--text-secondary);
    }

    .add-comment {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .add-comment sl-textarea {
      flex: 1;
    }

    /* ── Activity events ── */
    .activity-event {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .activity-event sl-icon {
      font-size: 0.75rem;
      margin-top: 0.15rem;
      flex-shrink: 0;
    }

    .activity-summary {
      flex: 1;
      line-height: 1.4;
    }

    .activity-actor {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .activity-time {
      font-size: 0.7rem;
      white-space: nowrap;
      flex-shrink: 0;
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
      color: var(--text-tertiary);
    }
  `;

  @property({ type: String, attribute: 'session-code' }) sessionCode = '';
  @property({ type: String, attribute: 'task-id' }) taskId = '';
  @property({ type: Array }) participants: SessionParticipant[] = [];

  @state() private _task: TaskDetailView | null = null;
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _commentText = '';
  @state() private _commentLoading = false;
  @state() private _commentExpanded = false;
  @state() private _editingTitle = false;
  @state() private _editingDescription = false;
  @state() private _editingField: string | null = null; // 'type' | 'status' | 'assignee' | 'commit'
  @state() private _activity: ActivityEvent[] = [];
  @state() private _addingBlocker = false;
  @state() private _allTasks: { id: string; ticket_id: string; title: string }[] = [];

  private _storeUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadTask();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === 'tasks-changed') {
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
    if (changed.has('taskId') && this.taskId) {
      this._loadTask();
    }
  }

  private async _loadTask() {
    if (!this.sessionCode || !this.taskId) return;
    this._loading = true;
    this._error = '';
    try {
      const [task, activity] = await Promise.all([
        fetchTask(this.sessionCode, this.taskId),
        fetchActivity(this.sessionCode, { target_id: this.taskId }).catch(() => [] as ActivityEvent[]),
      ]);
      this._task = task;
      this._activity = activity;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load task';
    } finally {
      this._loading = false;
    }
  }

  private _getParticipantName(id: string | null): string {
    if (!id) return 'Unassigned';
    const p = this.participants.find(p => p.id === id);
    return p?.display_name ?? id.slice(0, 8);
  }

  private _formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private _relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return this._formatDate(iso);
  }

  private _renderMarkdown(text: string) {
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre><code>${code.trimEnd()}</code></pre>`
    );
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    escaped = escaped.replace(
      /(?<!")(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    // Highlight @mentions
    escaped = escaped.replace(
      /@([\w.\-]+(?:\s[\w.\-]+)?)/g,
      '<span class="mention">@$1</span>'
    );

    escaped = escaped
      .split(/\n{2,}/)
      .filter(p => p.trim())
      .map(p => p.includes('<pre>') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');

    return unsafeHTML(escaped);
  }

  private async _updateField(fields: Record<string, unknown>) {
    if (!this._task) return;
    try {
      await updateTask(this.sessionCode, this._task.id, fields);
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to update';
    }
  }

  private async _handleDelete() {
    if (!this._task) return;
    try {
      await deleteTask(this.sessionCode, this._task.id);
      this.dispatchEvent(new CustomEvent('deleted'));
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to delete';
    }
  }

  private _getCurrentParticipantId(): string | null {
    return store.get().sessionState?.participantId ?? null;
  }

  private async _claimTask() {
    if (!this._task) return;
    const pid = this._getCurrentParticipantId();
    if (!pid) return;
    await this._updateField({ assigned_to: pid });
  }

  private async _unclaimTask() {
    if (!this._task) return;
    await this._updateField({ assigned_to: null });
  }

  private _renderClaimButton(task: TaskDetailView) {
    const currentPid = this._getCurrentParticipantId();
    if (!currentPid) return nothing;

    if (!task.assigned_to) {
      return html`
        <sl-button size="small" variant="primary" outline style="width: 100%; margin-top: 0.25rem;"
          @click=${this._claimTask}>
          <sl-icon slot="prefix" name="hand-index-thumb"></sl-icon>
          Claim
        </sl-button>`;
    }

    if (task.assigned_to === currentPid) {
      return html`
        <sl-button size="small" variant="neutral" outline style="width: 100%; margin-top: 0.25rem;"
          @click=${this._unclaimTask}>
          <sl-icon slot="prefix" name="x-circle"></sl-icon>
          Unclaim
        </sl-button>`;
    }

    return nothing;
  }

  private async _handleAddComment() {
    if (!this._task || !this._commentText.trim()) return;
    this._commentLoading = true;
    try {
      await addComment(this.sessionCode, this._task.id, this._commentText.trim());
      this._commentText = '';
      this._commentExpanded = false;
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to add comment';
    } finally {
      this._commentLoading = false;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`;
    }

    if (!this._task) {
      return html`
        <sl-alert variant="danger" open>Task not found</sl-alert>
        <sl-button @click=${() => this.dispatchEvent(new CustomEvent('back'))}>Back</sl-button>
      `;
    }

    const task = this._task;
    const typeColor = TASK_TYPE_COLORS[task.task_type];

    return html`
      ${this._error ? html`
        <sl-alert variant="danger" open closable @sl-after-hide=${() => { this._error = ''; }} style="margin-bottom: 1rem;">
          ${this._error}
        </sl-alert>
      ` : nothing}

      ${task.parent ? html`
        <div class="parent-breadcrumb"
          @click=${() => this.dispatchEvent(new CustomEvent('navigate-task', { detail: task.parent!.id }))}
        >
          <sl-icon name=${TASK_TYPE_ICONS[task.parent.task_type]} style="color: ${TASK_TYPE_COLORS[task.parent.task_type]}"></sl-icon>
          <span style="font-family: var(--sl-font-mono); opacity: 0.7;">${task.parent.ticket_id}</span>
          ${task.parent.title}
        </div>
      ` : nothing}

      <!-- Header card -->
      <div class="header-card">
        <div class="header-top">
          <sl-icon-button class="back-btn" name="arrow-left" label="Back"
            @click=${() => this.dispatchEvent(new CustomEvent('back'))}
          ></sl-icon-button>

          <div class="header-title-area">
            <sl-icon class="type-icon" name=${TASK_TYPE_ICONS[task.task_type]} style="color: ${typeColor}"></sl-icon>
            <span style="font-family: var(--sl-font-mono); color: var(--text-secondary); font-size: 0.9rem; white-space: nowrap;">${task.ticket_id}</span>
            ${this._editingTitle
              ? html`<sl-input
                  value=${task.title}
                  size="large"
                  style="flex: 1;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && val !== task.title) this._updateField({ title: val });
                    this._editingTitle = false;
                  }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._editingTitle = false; }}
                ></sl-input>`
              : html`<h2 class="title-display" @click=${() => { this._editingTitle = true; }}>
                  ${task.title}<sl-icon class="edit-hint" name="pencil"></sl-icon>
                </h2>`
            }
          </div>

          <div class="header-actions">
            <sl-badge variant=${STATUS_VARIANTS[task.status] as any} pill>
              ${STATUS_LABELS[task.status]}
            </sl-badge>

            <sl-dropdown>
              <sl-icon-button slot="trigger" name="three-dots-vertical" label="Actions"></sl-icon-button>
              <sl-menu>
                ${task.status !== 'in_progress' ? html`
                  <sl-menu-item @click=${() => this._updateField({ status: 'in_progress' })}>
                    <sl-icon slot="prefix" name="play-fill"></sl-icon>
                    Start Work
                  </sl-menu-item>
                ` : nothing}
                ${task.status !== 'done' ? html`
                  <sl-menu-item @click=${() => this._updateField({ status: 'done' })}>
                    <sl-icon slot="prefix" name="check-lg"></sl-icon>
                    Mark Done
                  </sl-menu-item>
                ` : nothing}
                ${task.status !== 'closed' ? html`
                  <sl-menu-item @click=${() => this._updateField({ status: 'closed' })}>
                    <sl-icon slot="prefix" name="x-circle"></sl-icon>
                    Close
                  </sl-menu-item>
                ` : nothing}
                ${task.status !== 'open' ? html`
                  <sl-menu-item @click=${() => this._updateField({ status: 'open' })}>
                    <sl-icon slot="prefix" name="arrow-counterclockwise"></sl-icon>
                    Reopen
                  </sl-menu-item>
                ` : nothing}
                <sl-divider></sl-divider>
                <sl-menu-item @click=${() => this.dispatchEvent(new CustomEvent('create-child', { detail: task.id }))}>
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  Add Child Task
                </sl-menu-item>
                <sl-divider></sl-divider>
                <sl-menu-item style="color: var(--sl-color-danger-500);" @click=${() => this._handleDelete()}>
                  <sl-icon slot="prefix" name="trash"></sl-icon>
                  Delete Task
                </sl-menu-item>
              </sl-menu>
            </sl-dropdown>
          </div>
        </div>
      </div>

      <!-- Body: main + sidebar -->
      <div class="body-layout">
        <div class="main-column">
          ${task.blocked_by.length > 0 ? html`
            <div class="blocked-banner">
              <sl-icon name="exclamation-triangle-fill"></sl-icon>
              Blocked by ${task.blocked_by.map(b => b.ticket_id).join(', ')}
            </div>
          ` : nothing}
          ${this._renderDescription(task)}
          ${this._renderChildren(task)}
          ${this._renderDependencies(task)}
          <sl-divider></sl-divider>
          ${this._renderComments(task)}
        </div>

        ${this._renderSidebar(task)}
      </div>
    `;
  }

  private _renderDescription(task: TaskDetailView) {
    return html`
      <div class="description-section">
        <div class="section-heading">Description</div>
        ${this._editingDescription
          ? html`<div>
              <sl-textarea
                value=${task.description ?? ''}
                rows="4"
                resize="auto"
                @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._editingDescription = false; }}
              ></sl-textarea>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <sl-button size="small" variant="primary" @click=${(e: Event) => {
                  const textarea = (e.target as HTMLElement).closest('.description-section')?.querySelector('sl-textarea');
                  const val = (textarea as any)?.value ?? '';
                  this._updateField({ description: val || null });
                  this._editingDescription = false;
                }}>Save</sl-button>
                <sl-button size="small" @click=${() => { this._editingDescription = false; }}>Cancel</sl-button>
              </div>
            </div>`
          : task.description
            ? html`<div class="description-content" @click=${() => { this._editingDescription = true; }}>
                ${this._renderMarkdown(task.description)}
                <sl-icon class="edit-hint" name="pencil" style="position: absolute; top: 0.5rem; right: 0.5rem;"></sl-icon>
              </div>`
            : html`<div class="no-description" @click=${() => { this._editingDescription = true; }}>Click to add a description...</div>`
        }
      </div>
    `;
  }

  private _renderChildren(task: TaskDetailView) {
    return html`
      <div class="children-section">
        <div class="section-heading" style="display: flex; align-items: center; justify-content: space-between;">
          <span>Children (${task.children.length})</span>
          <sl-button size="small" variant="text"
            @click=${() => this.dispatchEvent(new CustomEvent('create-child', { detail: task.id }))}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            Add
          </sl-button>
        </div>
        ${task.children.length > 0 ? html`
          <div class="child-list">
            ${task.children.map(child => html`
              <div class="child-item" @click=${() => this.dispatchEvent(new CustomEvent('navigate-task', { detail: child.id }))}>
                <sl-icon name=${TASK_TYPE_ICONS[child.task_type]} style="color: ${TASK_TYPE_COLORS[child.task_type]}"></sl-icon>
                <span style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;">${child.ticket_id}</span>
                <span class="child-title">${child.title}</span>
                <sl-badge variant=${STATUS_VARIANTS[child.status] as any} pill size="small">
                  ${STATUS_LABELS[child.status]}
                </sl-badge>
              </div>
            `)}
          </div>
        ` : html`<span class="no-description" style="cursor: default; border: none; padding: 0.25rem;">No child tasks yet</span>`}
      </div>
    `;
  }

  private async _loadAllTasks() {
    if (this._allTasks.length > 0) return;
    try {
      const tasks = await fetchTasks(this.sessionCode);
      this._allTasks = tasks.map(t => ({ id: t.id, ticket_id: t.ticket_id, title: t.title }));
    } catch { /* ignore */ }
  }

  private async _handleAddBlocker(blockerId: string) {
    if (!this._task) return;
    try {
      await addDependency(this.sessionCode, blockerId, this._task.id);
      this._addingBlocker = false;
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to add dependency';
    }
  }

  private async _handleRemoveBlocker(blockerId: string) {
    if (!this._task) return;
    try {
      await removeDependency(this.sessionCode, blockerId, this._task.id);
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to remove dependency';
    }
  }

  private async _handleRemoveBlocks(blockedId: string) {
    if (!this._task) return;
    try {
      await removeDependency(this.sessionCode, this._task.id, blockedId);
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to remove dependency';
    }
  }

  private _renderDependencies(task: TaskDetailView) {
    const hasBlockedBy = task.blocked_by.length > 0;
    const hasBlocks = task.blocks.length > 0;

    if (!hasBlockedBy && !hasBlocks && !this._addingBlocker) {
      return html`
        <div class="dep-section">
          <div class="section-heading" style="display: flex; align-items: center; justify-content: space-between;">
            <span>Dependencies</span>
            <sl-button size="small" variant="text" @click=${() => { this._addingBlocker = true; this._loadAllTasks(); }}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              Add
            </sl-button>
          </div>
        </div>
      `;
    }

    // Filter tasks that can be selected as blockers (not self, not already blocking)
    const existingBlockerIds = new Set(task.blocked_by.map(b => b.id));
    existingBlockerIds.add(task.id);
    const availableTasks = this._allTasks.filter(t => !existingBlockerIds.has(t.id));

    return html`
      <div class="dep-section">
        <div class="section-heading" style="display: flex; align-items: center; justify-content: space-between;">
          <span>Dependencies</span>
          <sl-button size="small" variant="text" @click=${() => { this._addingBlocker = true; this._loadAllTasks(); }}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            Add Blocker
          </sl-button>
        </div>

        ${hasBlockedBy ? html`
          <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.25rem; font-weight: 600;">BLOCKED BY</div>
          <div class="dep-list">
            ${task.blocked_by.map(b => html`
              <div class="dep-item" @click=${() => this.dispatchEvent(new CustomEvent('navigate-task', { detail: b.id }))}>
                <sl-icon name=${TASK_TYPE_ICONS[b.task_type]} style="color: ${TASK_TYPE_COLORS[b.task_type]}; font-size: 0.85rem;"></sl-icon>
                <span style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;">${b.ticket_id}</span>
                <span class="dep-title">${b.title}</span>
                <sl-badge variant=${STATUS_VARIANTS[b.status] as any} pill size="small">${STATUS_LABELS[b.status]}</sl-badge>
                <sl-icon-button class="remove-dep" name="x-lg" label="Remove" style="font-size: 0.7rem;"
                  @click=${(e: Event) => { e.stopPropagation(); this._handleRemoveBlocker(b.id); }}
                ></sl-icon-button>
              </div>
            `)}
          </div>
        ` : nothing}

        ${hasBlocks ? html`
          <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.25rem; margin-top: ${hasBlockedBy ? '0.75rem' : '0'}; font-weight: 600;">BLOCKS</div>
          <div class="dep-list">
            ${task.blocks.map(b => html`
              <div class="dep-item" @click=${() => this.dispatchEvent(new CustomEvent('navigate-task', { detail: b.id }))}>
                <sl-icon name=${TASK_TYPE_ICONS[b.task_type]} style="color: ${TASK_TYPE_COLORS[b.task_type]}; font-size: 0.85rem;"></sl-icon>
                <span style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;">${b.ticket_id}</span>
                <span class="dep-title">${b.title}</span>
                <sl-badge variant=${STATUS_VARIANTS[b.status] as any} pill size="small">${STATUS_LABELS[b.status]}</sl-badge>
                <sl-icon-button class="remove-dep" name="x-lg" label="Remove" style="font-size: 0.7rem;"
                  @click=${(e: Event) => { e.stopPropagation(); this._handleRemoveBlocks(b.id); }}
                ></sl-icon-button>
              </div>
            `)}
          </div>
        ` : nothing}

        ${this._addingBlocker ? html`
          <div class="dep-add-row">
            <sl-select size="small" placeholder="Select blocking task..." style="flex: 1;"
              @sl-change=${(e: Event) => {
                const val = (e.target as HTMLSelectElement).value;
                if (val) this._handleAddBlocker(val);
              }}
            >
              ${availableTasks.map(t => html`
                <sl-option value=${t.id}>${t.ticket_id} — ${t.title}</sl-option>
              `)}
            </sl-select>
            <sl-icon-button name="x-lg" label="Cancel" @click=${() => { this._addingBlocker = false; }}></sl-icon-button>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _activityIcon(eventType: string): string {
    switch (eventType) {
      case 'task_created': return 'plus-circle';
      case 'task_status_changed': return 'arrow-right-circle';
      case 'task_assigned': return 'person-check';
      case 'task_unassigned': return 'person-dash';
      case 'task_updated': return 'pencil-square';
      case 'task_closed': return 'check-circle';
      case 'task_deleted': return 'trash';
      case 'comment_added': return 'chat-dots';
      case 'dependency_added': return 'link-45deg';
      case 'dependency_removed': return 'link-45deg';
      default: return 'clock-history';
    }
  }

  private _renderComments(task: TaskDetailView) {
    // Build a unified timeline: comments + activity events, sorted chronologically
    type TimelineItem =
      | { kind: 'comment'; created_at: string; data: (typeof task.comments)[0] }
      | { kind: 'activity'; created_at: string; data: ActivityEvent };

    const items: TimelineItem[] = [
      ...task.comments.map(c => ({ kind: 'comment' as const, created_at: c.created_at, data: c })),
      // Filter out comment_added events to avoid duplication with actual comments
      ...this._activity
        .filter(a => a.event_type !== 'comment_added')
        .map(a => ({ kind: 'activity' as const, created_at: a.created_at, data: a })),
    ];
    items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return html`
      <div class="comments-section">
        <div class="section-heading">Activity (${items.length})</div>

        ${items.length > 0 ? html`
          <div class="comment-list">
            ${items.map(item => item.kind === 'comment'
              ? html`
                <div class="comment">
                  <div class="comment-header">
                    <span class="comment-author">${this._getParticipantName(item.data.author_id)}</span>
                    <sl-tooltip content=${this._formatDate(item.created_at)}>
                      <span class="comment-time">${this._relativeTime(item.created_at)}</span>
                    </sl-tooltip>
                  </div>
                  <div class="comment-content">${this._renderMarkdown(item.data.content)}</div>
                </div>`
              : html`
                <div class="activity-event">
                  <sl-icon name=${this._activityIcon(item.data.event_type)}></sl-icon>
                  <span class="activity-summary">
                    <span class="activity-actor">${item.data.actor_name}</span>
                    ${item.data.summary}
                  </span>
                  <sl-tooltip content=${this._formatDate(item.created_at)}>
                    <span class="activity-time">${this._relativeTime(item.created_at)}</span>
                  </sl-tooltip>
                </div>`
            )}
          </div>
        ` : nothing}

        ${this._commentExpanded
          ? html`
            <div class="add-comment">
              <sl-textarea
                placeholder="Add a comment... (Ctrl+Enter to send)"
                value=${this._commentText}
                @sl-input=${(e: Event) => { this._commentText = (e.target as HTMLTextAreaElement).value; }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && this._commentText.trim()) {
                    e.preventDefault();
                    this._handleAddComment();
                  }
                  if (e.key === 'Escape' && !this._commentText.trim()) {
                    this._commentExpanded = false;
                  }
                }}
                rows="2"
                resize="auto"
              ></sl-textarea>
              <sl-button
                variant="primary"
                size="small"
                ?loading=${this._commentLoading}
                ?disabled=${!this._commentText.trim()}
                @click=${() => this._handleAddComment()}
              >
                <sl-icon slot="prefix" name="send"></sl-icon>
                Send
              </sl-button>
            </div>`
          : html`
            <div class="comment-input-collapsed" @click=${() => {
              this._commentExpanded = true;
              this.updateComplete.then(() => {
                const ta = this.shadowRoot?.querySelector('.add-comment sl-textarea') as HTMLElement | null;
                ta?.focus();
              });
            }}>
              Add a comment...
            </div>`
        }
      </div>
    `;
  }

  private _renderSidebar(task: TaskDetailView) {
    return html`
      <div class="sidebar">
        <div class="sidebar-heading">Details</div>

        <!-- Ticket ID (read-only) -->
        <div class="meta-row">
          <span class="meta-label">Ticket</span>
          <span class="meta-value" style="font-family: var(--sl-font-mono);">${task.ticket_id}</span>
        </div>

        <!-- Type -->
        ${this._editingField === 'type'
          ? html`
            <div class="meta-row">
              <sl-select size="small" value=${task.task_type}
                @sl-change=${(e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (val !== task.task_type) this._updateField({ task_type: val });
                  this._editingField = null;
                }}
                style="width: 100%;"
              >
                ${(['epic', 'story', 'task', 'subtask', 'bug'] as const).map(t => html`
                  <sl-option value=${t}>
                    <sl-icon slot="prefix" name=${TASK_TYPE_ICONS[t]} style="color: ${TASK_TYPE_COLORS[t]}"></sl-icon>
                    ${TASK_TYPE_LABELS[t]}
                  </sl-option>
                `)}
              </sl-select>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'type'; }}>
              <span class="meta-label">Type</span>
              <span class="meta-value">
                <sl-icon name=${TASK_TYPE_ICONS[task.task_type]} style="color: ${TASK_TYPE_COLORS[task.task_type]}; font-size: 0.85rem;"></sl-icon>
                ${TASK_TYPE_LABELS[task.task_type]}
                <sl-icon class="edit-pencil" name="pencil"></sl-icon>
              </span>
            </div>`
        }

        <!-- Status -->
        ${this._editingField === 'status'
          ? html`
            <div class="meta-row">
              <sl-select size="small" value=${task.status}
                @sl-change=${(e: Event) => {
                  this._updateField({ status: (e.target as HTMLSelectElement).value });
                  this._editingField = null;
                }}
                style="width: 100%;"
              >
                ${(['open', 'in_progress', 'done', 'closed'] as TaskStatus[]).map(s => html`
                  <sl-option value=${s}>${STATUS_LABELS[s]}</sl-option>
                `)}
              </sl-select>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'status'; }}>
              <span class="meta-label">Status</span>
              <span class="meta-value">
                <sl-badge variant=${STATUS_VARIANTS[task.status] as any} pill size="small">${STATUS_LABELS[task.status]}</sl-badge>
                <sl-icon class="edit-pencil" name="pencil"></sl-icon>
              </span>
            </div>`
        }

        <!-- Priority -->
        ${this._editingField === 'priority'
          ? html`
            <div class="meta-row">
              <sl-select size="small" value=${task.priority}
                @sl-change=${(e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (val !== task.priority) this._updateField({ priority: val });
                  this._editingField = null;
                }}
                style="width: 100%;"
              >
                ${(['critical', 'high', 'medium', 'low'] as const).map(p => html`
                  <sl-option value=${p}>
                    <sl-icon slot="prefix" name=${PRIORITY_ICONS[p]} style="color: ${PRIORITY_COLORS[p]}"></sl-icon>
                    ${PRIORITY_LABELS[p]}
                  </sl-option>
                `)}
              </sl-select>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'priority'; }}>
              <span class="meta-label">Priority</span>
              <span class="meta-value">
                <sl-icon name=${PRIORITY_ICONS[task.priority]} style="color: ${PRIORITY_COLORS[task.priority]}; font-size: 0.85rem;"></sl-icon>
                ${PRIORITY_LABELS[task.priority]}
                <sl-icon class="edit-pencil" name="pencil"></sl-icon>
              </span>
            </div>`
        }

        <!-- Complexity -->
        ${this._editingField === 'complexity'
          ? html`
            <div class="meta-row">
              <sl-select size="small" value=${task.complexity}
                @sl-change=${(e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (val !== task.complexity) this._updateField({ complexity: val });
                  this._editingField = null;
                }}
                style="width: 100%;"
              >
                ${(['xl', 'large', 'medium', 'small', 'trivial'] as const).map(c => html`
                  <sl-option value=${c}>${COMPLEXITY_LABELS[c]}</sl-option>
                `)}
              </sl-select>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'complexity'; }}>
              <span class="meta-label">Complexity</span>
              <span class="meta-value">
                ${COMPLEXITY_LABELS[task.complexity]}
                <sl-icon class="edit-pencil" name="pencil"></sl-icon>
              </span>
            </div>`
        }

        <!-- Assignee -->
        ${this._editingField === 'assignee'
          ? html`
            <div class="meta-row">
              <sl-select size="small" value=${task.assigned_to ?? ''}
                placeholder="Unassigned" clearable
                @sl-change=${(e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  this._updateField({ assigned_to: val || null });
                  this._editingField = null;
                }}
                style="width: 100%;"
              >
                ${this.participants.map(p => html`
                  <sl-option value=${p.id}>
                    <sl-icon slot="prefix" name=${p.participant_type === 'agent' ? 'robot' : 'person-fill'}></sl-icon>
                    ${p.display_name}
                  </sl-option>
                `)}
              </sl-select>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'assignee'; }}>
              <span class="meta-label">Assignee</span>
              <span class="meta-value">
                ${task.assigned_to
                  ? html`<sl-icon name=${this.participants.find(p => p.id === task.assigned_to)?.participant_type === 'agent' ? 'robot' : 'person-fill'} style="font-size: 0.8rem;"></sl-icon> ${this._getParticipantName(task.assigned_to)}`
                  : html`<span style="color: var(--text-tertiary);">Unassigned</span>`
                }
                <sl-icon class="edit-pencil" name="pencil"></sl-icon>
              </span>
            </div>
            ${this._renderClaimButton(task)}`
        }

        <sl-divider style="--spacing: 0.25rem;"></sl-divider>

        <!-- Creator (read-only) -->
        <div class="meta-row">
          <span class="meta-label">Creator</span>
          <span class="meta-value">${this._getParticipantName(task.created_by)}</span>
        </div>

        <!-- Created -->
        <div class="meta-row">
          <span class="meta-label">Created</span>
          <span class="meta-value">
            <sl-tooltip content=${this._formatDate(task.created_at)}>
              <span>${this._relativeTime(task.created_at)}</span>
            </sl-tooltip>
          </span>
        </div>

        <!-- Updated -->
        ${task.updated_at !== task.created_at ? html`
          <div class="meta-row">
            <span class="meta-label">Updated</span>
            <span class="meta-value">
              <sl-tooltip content=${this._formatDate(task.updated_at)}>
                <span>${this._relativeTime(task.updated_at)}</span>
              </sl-tooltip>
            </span>
          </div>
        ` : nothing}

        <!-- Closed -->
        ${task.closed_at ? html`
          <div class="meta-row">
            <span class="meta-label">Closed</span>
            <span class="meta-value">
              <sl-tooltip content=${this._formatDate(task.closed_at)}>
                <span>${this._relativeTime(task.closed_at)}</span>
              </sl-tooltip>
            </span>
          </div>
        ` : nothing}

        <sl-divider style="--spacing: 0.25rem;"></sl-divider>

        <!-- Commit SHA -->
        ${this._editingField === 'commit'
          ? html`
            <div class="meta-row">
              <sl-input
                size="small"
                placeholder="Enter commit SHA"
                value=${task.commit_sha ?? ''}
                style="width: 100%; font-family: var(--sl-font-mono); font-size: 0.75rem;"
                @sl-change=${(e: Event) => {
                  const val = (e.target as HTMLInputElement).value.trim();
                  this._updateField({ commit_sha: val || null });
                  this._editingField = null;
                }}
                @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._editingField = null; }}
              ></sl-input>
            </div>`
          : html`
            <div class="meta-row editable" @click=${() => { this._editingField = 'commit'; }}>
              <span class="meta-label">Commit</span>
              <span class="meta-value">
                ${task.commit_sha
                  ? html`<span class="commit-sha">${task.commit_sha}</span>`
                  : html`<span class="link-action">Link commit</span>`
                }
              </span>
            </div>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'task-detail': TaskDetail;
  }
}
