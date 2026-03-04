import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { fetchTask, updateTask, deleteTask, addComment } from '../../state/task-api.js';
import {
  type TaskDetailView, type TaskStatus,
  TASK_TYPE_LABELS, TASK_TYPE_ICONS, TASK_TYPE_COLORS,
  STATUS_LABELS, STATUS_VARIANTS,
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

@customElement('task-detail')
export class TaskDetail extends LitElement {
  static styles = css`
    :host { display: block; }

    .detail-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .back-btn {
      flex-shrink: 0;
    }

    .detail-title-row {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }

    .type-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .detail-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: text;
    }

    .detail-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }

    .meta-label {
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .meta-value {
      color: var(--text-secondary);
    }

    .description-section {
      margin-bottom: 1.5rem;
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
      white-space: pre-wrap;
      font-size: 0.9rem;
      padding: 0.75rem;
      background: var(--surface-card);
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      cursor: text;
    }

    .no-description {
      color: var(--text-tertiary);
      font-style: italic;
      font-size: 0.875rem;
    }

    /* ── Children ── */
    .children-section {
      margin-bottom: 1.5rem;
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
    }

    .child-item .child-title {
      flex: 1;
      color: var(--text-primary);
      font-weight: 500;
    }

    /* ── Comments ── */
    .comments-section {
      margin-bottom: 1.5rem;
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
      white-space: pre-wrap;
    }

    .add-comment {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .add-comment sl-textarea {
      flex: 1;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
    }

    .commit-sha {
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
      background: var(--surface-card);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
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
  @state() private _editingTitle = false;
  @state() private _editingDescription = false;

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
      this._task = await fetchTask(this.sessionCode, this.taskId);
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

  private async _updateField(fields: Record<string, unknown>) {
    if (!this._task) return;
    try {
      await updateTask(this.sessionCode, this._task.id, fields);
      await this._loadTask();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to update';
    }
  }

  private async _changeStatus(status: TaskStatus) {
    return this._updateField({ status });
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

  private async _handleAddComment() {
    if (!this._task || !this._commentText.trim()) return;
    this._commentLoading = true;
    try {
      await addComment(this.sessionCode, this._task.id, this._commentText.trim());
      this._commentText = '';
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

      <div class="detail-header">
        <sl-icon-button class="back-btn" name="arrow-left" label="Back"
          @click=${() => this.dispatchEvent(new CustomEvent('back'))}
        ></sl-icon-button>

        <div class="detail-title-row">
          <sl-icon class="type-icon" name=${TASK_TYPE_ICONS[task.task_type]} style="color: ${typeColor}"></sl-icon>
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
            : html`<h2 class="detail-title" @dblclick=${() => { this._editingTitle = true; }}>${task.title}</h2>`
          }
        </div>

        <div class="detail-actions">
          <sl-badge variant=${STATUS_VARIANTS[task.status] as any} pill>
            ${STATUS_LABELS[task.status]}
          </sl-badge>
        </div>
      </div>

      <div class="meta-grid">
        <span class="meta-label">Type</span>
        <span class="meta-value">${TASK_TYPE_LABELS[task.task_type]}</span>

        <span class="meta-label">Status</span>
        <span class="meta-value">
          <sl-select size="small" value=${task.status}
            @sl-change=${(e: Event) => this._changeStatus((e.target as HTMLSelectElement).value as TaskStatus)}
            style="max-width: 160px;"
          >
            ${(['open', 'in_progress', 'done', 'closed'] as TaskStatus[]).map(s => html`
              <sl-option value=${s}>${STATUS_LABELS[s]}</sl-option>
            `)}
          </sl-select>
        </span>

        <span class="meta-label">Assigned</span>
        <span class="meta-value">
          <sl-select size="small" value=${task.assigned_to ?? ''}
            placeholder="Unassigned"
            clearable
            @sl-change=${(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              this._updateField({ assigned_to: val || null });
            }}
            style="max-width: 200px;"
          >
            ${this.participants.map(p => html`
              <sl-option value=${p.id}>
                <sl-icon slot="prefix" name=${p.participant_type === 'agent' ? 'robot' : 'person-fill'}></sl-icon>
                ${p.display_name}
              </sl-option>
            `)}
          </sl-select>
        </span>

        <span class="meta-label">Created</span>
        <span class="meta-value">${this._formatDate(task.created_at)}</span>

        ${task.commit_sha ? html`
          <span class="meta-label">Commit</span>
          <span class="meta-value"><code class="commit-sha">${task.commit_sha}</code></span>
        ` : nothing}

        ${task.closed_at ? html`
          <span class="meta-label">Closed</span>
          <span class="meta-value">${this._formatDate(task.closed_at)}</span>
        ` : nothing}
      </div>

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
            ? html`<div class="description-content" @dblclick=${() => { this._editingDescription = true; }}>${task.description}</div>`
            : html`<span class="no-description" @click=${() => { this._editingDescription = true; }}>No description — click to add</span>`
        }
      </div>

      ${task.children.length > 0 ? html`
        <div class="children-section">
          <div class="section-heading">Children (${task.children.length})</div>
          <div class="child-list">
            ${task.children.map(child => html`
              <div class="child-item">
                <sl-icon name=${TASK_TYPE_ICONS[child.task_type]} style="color: ${TASK_TYPE_COLORS[child.task_type]}"></sl-icon>
                <span class="child-title">${child.title}</span>
                <sl-badge variant=${STATUS_VARIANTS[child.status] as any} pill size="small">
                  ${STATUS_LABELS[child.status]}
                </sl-badge>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}

      <sl-divider></sl-divider>

      <div class="comments-section">
        <div class="section-heading">Comments (${task.comments.length})</div>

        ${task.comments.length > 0 ? html`
          <div class="comment-list">
            ${task.comments.map(c => html`
              <div class="comment">
                <div class="comment-header">
                  <span class="comment-author">${this._getParticipantName(c.author_id)}</span>
                  <span class="comment-time">${this._formatDate(c.created_at)}</span>
                </div>
                <div class="comment-content">${c.content}</div>
              </div>
            `)}
          </div>
        ` : nothing}

        <div class="add-comment">
          <sl-textarea
            placeholder="Add a comment..."
            value=${this._commentText}
            @sl-input=${(e: Event) => { this._commentText = (e.target as HTMLTextAreaElement).value; }}
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
        </div>
      </div>

      <sl-divider></sl-divider>

      <sl-button variant="danger" size="small" outline @click=${() => this._handleDelete()}>
        <sl-icon slot="prefix" name="trash"></sl-icon>
        Delete Task
      </sl-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'task-detail': TaskDetail;
  }
}
