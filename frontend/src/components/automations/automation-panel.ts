import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  fetchReactions, createReaction, updateReaction, deleteReaction,
  fetchScheduledJobs, createScheduledJob, updateScheduledJob, deleteScheduledJob,
  type EventReaction, type ScheduledJob, type CreateReactionRequest, type CreateScheduledJobRequest,
} from '../../state/automation-api.js';

import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

type SlInput = HTMLInputElement & { value: string };
type SlSwitch = HTMLInputElement & { checked: boolean };

@customElement('automation-panel')
export class AutomationPanel extends LitElement {
  static styles = css`
    :host { display: block; }

    .section { margin-bottom: 2rem; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-1, #e0e0e8);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .item-grid {
      display: grid;
      gap: 0.75rem;
    }

    .empty-state {
      color: var(--text-3, #6b6f80);
      text-align: center;
      padding: 2rem;
      font-size: 0.9rem;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .error-banner {
      margin-bottom: 1rem;
    }

    /* Card styles */
    sl-card::part(base) {
      background: var(--surface-2, #1a1d2e);
      border: 1px solid var(--border-1, #2a2d3e);
    }

    sl-card::part(body) {
      padding: 1rem 1.25rem;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
      flex: 1;
    }

    .card-name {
      font-weight: 500;
      color: var(--text-1, #e0e0e8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .card-meta {
      font-size: 0.8125rem;
      color: var(--text-3, #6b6f80);
      margin-top: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .meta-label {
      color: var(--text-3, #6b6f80);
      font-size: 0.75rem;
    }

    .meta-value {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--text-secondary, #a0a4b8);
      background: var(--surface-active, #252840);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .dialog-form sl-input,
    .dialog-form sl-select,
    .dialog-form sl-textarea {
      width: 100%;
    }

    .action-badge {
      text-transform: uppercase;
      font-size: 0.65rem;
      letter-spacing: 0.04em;
    }
  `;

  @property() projectId = '';

  @state() private _reactions: EventReaction[] = [];
  @state() private _jobs: ScheduledJob[] = [];
  @state() private _loading = true;
  @state() private _error = '';

  /* Reaction dialog state */
  @state() private _showReactionDialog = false;
  @state() private _editingReactionId: string | null = null;
  @state() private _reactionName = '';
  @state() private _reactionAggregateType = 'task';
  @state() private _reactionEventType = '';
  @state() private _reactionActionType = 'launch_agent';
  @state() private _reactionActionConfig = '{}';
  @state() private _reactionFilter = '';
  @state() private _reactionSaving = false;

  /* Job dialog state */
  @state() private _showJobDialog = false;
  @state() private _editingJobId: string | null = null;
  @state() private _jobName = '';
  @state() private _jobCronExpr = '';
  @state() private _jobActionType = 'launch_agent';
  @state() private _jobActionConfig = '{}';
  @state() private _jobSaving = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('projectId') && this.projectId) {
      this._load();
    }
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const [reactions, jobs] = await Promise.all([
        fetchReactions(this.projectId),
        fetchScheduledJobs(this.projectId),
      ]);
      this._reactions = reactions;
      this._jobs = jobs;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load automations';
    } finally {
      this._loading = false;
    }
  }

  /* ── Reaction CRUD ── */

  private _openNewReaction() {
    this._editingReactionId = null;
    this._reactionName = '';
    this._reactionAggregateType = 'task';
    this._reactionEventType = '';
    this._reactionActionType = 'launch_agent';
    this._reactionActionConfig = '{}';
    this._reactionFilter = '';
    this._showReactionDialog = true;
  }

  private _openEditReaction(r: EventReaction) {
    this._editingReactionId = r.id;
    this._reactionName = r.name;
    this._reactionAggregateType = r.aggregate_type;
    this._reactionEventType = r.event_type;
    this._reactionActionType = r.action_type;
    this._reactionActionConfig = JSON.stringify(r.action_config, null, 2);
    this._reactionFilter = Object.keys(r.filter).length > 0 ? JSON.stringify(r.filter, null, 2) : '';
    this._showReactionDialog = true;
  }

  private async _saveReaction() {
    this._reactionSaving = true;
    this._error = '';
    try {
      const actionConfig = JSON.parse(this._reactionActionConfig);
      const filter = this._reactionFilter.trim() ? JSON.parse(this._reactionFilter) : {};

      if (this._editingReactionId) {
        const updated = await updateReaction(this.projectId, this._editingReactionId, {
          name: this._reactionName.trim(),
          aggregate_type: this._reactionAggregateType,
          event_type: this._reactionEventType.trim(),
          action_type: this._reactionActionType,
          action_config: actionConfig,
          filter,
        });
        this._reactions = this._reactions.map(r => r.id === updated.id ? updated : r);
      } else {
        const data: CreateReactionRequest = {
          name: this._reactionName.trim(),
          aggregate_type: this._reactionAggregateType,
          event_type: this._reactionEventType.trim(),
          action_type: this._reactionActionType,
          action_config: actionConfig,
        };
        if (this._reactionFilter.trim()) {
          data.filter = filter;
        }
        const created = await createReaction(this.projectId, data);
        this._reactions = [...this._reactions, created];
      }
      this._showReactionDialog = false;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to save reaction';
    } finally {
      this._reactionSaving = false;
    }
  }

  private async _toggleReaction(r: EventReaction) {
    try {
      const updated = await updateReaction(this.projectId, r.id, { enabled: !r.enabled });
      this._reactions = this._reactions.map(x => x.id === updated.id ? updated : x);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to toggle reaction';
    }
  }

  private async _deleteReaction(r: EventReaction) {
    if (!confirm(`Delete reaction "${r.name}"?`)) return;
    try {
      await deleteReaction(this.projectId, r.id);
      this._reactions = this._reactions.filter(x => x.id !== r.id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to delete reaction';
    }
  }

  /* ── Job CRUD ── */

  private _openNewJob() {
    this._editingJobId = null;
    this._jobName = '';
    this._jobCronExpr = '';
    this._jobActionType = 'launch_agent';
    this._jobActionConfig = '{}';
    this._showJobDialog = true;
  }

  private _openEditJob(j: ScheduledJob) {
    this._editingJobId = j.id;
    this._jobName = j.name;
    this._jobCronExpr = j.cron_expr;
    this._jobActionType = j.action_type;
    this._jobActionConfig = JSON.stringify(j.action_config, null, 2);
    this._showJobDialog = true;
  }

  private async _saveJob() {
    this._jobSaving = true;
    this._error = '';
    try {
      const actionConfig = JSON.parse(this._jobActionConfig);

      if (this._editingJobId) {
        const updated = await updateScheduledJob(this.projectId, this._editingJobId, {
          name: this._jobName.trim(),
          cron_expr: this._jobCronExpr.trim(),
          action_type: this._jobActionType,
          action_config: actionConfig,
        });
        this._jobs = this._jobs.map(j => j.id === updated.id ? updated : j);
      } else {
        const data: CreateScheduledJobRequest = {
          name: this._jobName.trim(),
          cron_expr: this._jobCronExpr.trim(),
          action_type: this._jobActionType,
          action_config: actionConfig,
        };
        const created = await createScheduledJob(this.projectId, data);
        this._jobs = [...this._jobs, created];
      }
      this._showJobDialog = false;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to save scheduled job';
    } finally {
      this._jobSaving = false;
    }
  }

  private async _toggleJob(j: ScheduledJob) {
    try {
      const updated = await updateScheduledJob(this.projectId, j.id, { enabled: !j.enabled });
      this._jobs = this._jobs.map(x => x.id === updated.id ? updated : x);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to toggle job';
    }
  }

  private async _deleteJob(j: ScheduledJob) {
    if (!confirm(`Delete scheduled job "${j.name}"?`)) return;
    try {
      await deleteScheduledJob(this.projectId, j.id);
      this._jobs = this._jobs.filter(x => x.id !== j.id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to delete scheduled job';
    }
  }

  /* ── Rendering ── */

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`;
    }

    return html`
      ${this._error ? html`
        <sl-alert class="error-banner" variant="danger" open closable
          @sl-after-hide=${() => { this._error = ''; }}>
          ${this._error}
        </sl-alert>
      ` : nothing}

      ${this._renderReactions()}

      <sl-divider></sl-divider>

      ${this._renderJobs()}

      ${this._renderReactionDialog()}
      ${this._renderJobDialog()}
    `;
  }

  private _renderReactions() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            Event Reactions
            <sl-badge variant="neutral" pill>${this._reactions.length}</sl-badge>
          </span>
          <sl-button size="small" variant="primary" @click=${() => this._openNewReaction()}>
            Add Reaction
          </sl-button>
        </div>

        ${this._reactions.length === 0 ? html`
          <div class="empty-state">
            No event reactions configured. Reactions trigger actions when domain events occur.
          </div>
        ` : html`
          <div class="item-grid">
            ${this._reactions.map(r => this._renderReactionCard(r))}
          </div>
        `}
      </div>
    `;
  }

  private _renderReactionCard(r: EventReaction) {
    return html`
      <sl-card>
        <div class="card-header">
          <div class="card-left">
            <sl-switch
              ?checked=${r.enabled}
              @sl-change=${() => void this._toggleReaction(r)}
            ></sl-switch>
            <span class="card-name">${r.name}</span>
            <sl-badge class="action-badge" variant=${r.enabled ? 'success' : 'neutral'}>
              ${r.enabled ? 'Active' : 'Disabled'}
            </sl-badge>
          </div>
          <div class="card-actions">
            <sl-tooltip content="Edit">
              <sl-icon-button name="pencil" @click=${() => this._openEditReaction(r)}></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content="Delete">
              <sl-icon-button name="trash" @click=${() => void this._deleteReaction(r)}></sl-icon-button>
            </sl-tooltip>
          </div>
        </div>
        <div class="card-meta">
          <span class="meta-label">On</span>
          <span class="meta-value">${r.aggregate_type}.${r.event_type}</span>
          <span class="meta-label">Action</span>
          <sl-badge variant="primary" class="action-badge">${r.action_type}</sl-badge>
        </div>
      </sl-card>
    `;
  }

  private _renderJobs() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            Scheduled Jobs
            <sl-badge variant="neutral" pill>${this._jobs.length}</sl-badge>
          </span>
          <sl-button size="small" variant="primary" @click=${() => this._openNewJob()}>
            Add Job
          </sl-button>
        </div>

        ${this._jobs.length === 0 ? html`
          <div class="empty-state">
            No scheduled jobs configured. Jobs run actions on a cron schedule.
          </div>
        ` : html`
          <div class="item-grid">
            ${this._jobs.map(j => this._renderJobCard(j))}
          </div>
        `}
      </div>
    `;
  }

  private _renderJobCard(j: ScheduledJob) {
    return html`
      <sl-card>
        <div class="card-header">
          <div class="card-left">
            <sl-switch
              ?checked=${j.enabled}
              @sl-change=${() => void this._toggleJob(j)}
            ></sl-switch>
            <span class="card-name">${j.name}</span>
            <sl-badge class="action-badge" variant=${j.enabled ? 'success' : 'neutral'}>
              ${j.enabled ? 'Active' : 'Disabled'}
            </sl-badge>
          </div>
          <div class="card-actions">
            <sl-tooltip content="Edit">
              <sl-icon-button name="pencil" @click=${() => this._openEditJob(j)}></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content="Delete">
              <sl-icon-button name="trash" @click=${() => void this._deleteJob(j)}></sl-icon-button>
            </sl-tooltip>
          </div>
        </div>
        <div class="card-meta">
          <span class="meta-label">Schedule</span>
          <span class="meta-value">${j.cron_expr}</span>
          <span class="meta-label">Action</span>
          <sl-badge variant="primary" class="action-badge">${j.action_type}</sl-badge>
          ${j.last_run_at ? html`
            <span class="meta-label">Last run</span>
            <span style="font-size: 0.75rem; color: var(--text-3, #6b6f80);">
              ${new Date(j.last_run_at).toLocaleString()}
            </span>
          ` : nothing}
          ${j.next_run_at ? html`
            <span class="meta-label">Next run</span>
            <span style="font-size: 0.75rem; color: var(--text-3, #6b6f80);">
              ${new Date(j.next_run_at).toLocaleString()}
            </span>
          ` : nothing}
        </div>
      </sl-card>
    `;
  }

  private _renderReactionDialog() {
    const isEdit = this._editingReactionId !== null;
    return html`
      <sl-dialog label=${isEdit ? 'Edit Reaction' : 'New Event Reaction'}
                 ?open=${this._showReactionDialog}
                 @sl-after-hide=${(e: Event) => { if (e.target === e.currentTarget) this._showReactionDialog = false; }}>
        <div class="dialog-form">
          <sl-input label="Name" placeholder="e.g. Auto-triage new tasks"
            value=${this._reactionName}
            @sl-input=${(e: CustomEvent) => { this._reactionName = (e.target as SlInput).value; }}
          ></sl-input>

          <sl-select label="Aggregate Type" value=${this._reactionAggregateType}
            @sl-change=${(e: CustomEvent) => { this._reactionAggregateType = (e.target as SlInput).value; }}>
            <sl-option value="task">task</sl-option>
            <sl-option value="session">session</sl-option>
            <sl-option value="workspace">workspace</sl-option>
          </sl-select>

          <sl-input label="Event Type" placeholder="e.g. created, updated, closed"
            value=${this._reactionEventType}
            @sl-input=${(e: CustomEvent) => { this._reactionEventType = (e.target as SlInput).value; }}
          ></sl-input>

          <sl-select label="Action Type" value=${this._reactionActionType}
            @sl-change=${(e: CustomEvent) => { this._reactionActionType = (e.target as SlInput).value; }}>
            <sl-option value="launch_agent">launch_agent</sl-option>
            <sl-option value="webhook">webhook</sl-option>
            <sl-option value="mcp_tool">mcp_tool</sl-option>
          </sl-select>

          <sl-textarea label="Action Config (JSON)" rows="4"
            value=${this._reactionActionConfig}
            @sl-input=${(e: CustomEvent) => { this._reactionActionConfig = (e.target as SlInput).value; }}
          ></sl-textarea>

          <sl-textarea label="Filter (JSON, optional)" rows="3"
            placeholder='{"status": "open"}'
            value=${this._reactionFilter}
            @sl-input=${(e: CustomEvent) => { this._reactionFilter = (e.target as SlInput).value; }}
          ></sl-textarea>
        </div>

        <sl-button slot="footer" variant="primary" ?loading=${this._reactionSaving}
          @click=${() => void this._saveReaction()}>
          ${isEdit ? 'Save Changes' : 'Create Reaction'}
        </sl-button>
      </sl-dialog>
    `;
  }

  private _renderJobDialog() {
    const isEdit = this._editingJobId !== null;
    return html`
      <sl-dialog label=${isEdit ? 'Edit Scheduled Job' : 'New Scheduled Job'}
                 ?open=${this._showJobDialog}
                 @sl-after-hide=${(e: Event) => { if (e.target === e.currentTarget) this._showJobDialog = false; }}>
        <div class="dialog-form">
          <sl-input label="Name" placeholder="e.g. Nightly cleanup"
            value=${this._jobName}
            @sl-input=${(e: CustomEvent) => { this._jobName = (e.target as SlInput).value; }}
          ></sl-input>

          <sl-input label="Cron Expression" placeholder="0 3 * * *"
            help-text="Standard 5-field cron (min hour dom mon dow)"
            value=${this._jobCronExpr}
            @sl-input=${(e: CustomEvent) => { this._jobCronExpr = (e.target as SlInput).value; }}
          ></sl-input>

          <sl-select label="Action Type" value=${this._jobActionType}
            @sl-change=${(e: CustomEvent) => { this._jobActionType = (e.target as SlInput).value; }}>
            <sl-option value="launch_agent">launch_agent</sl-option>
            <sl-option value="webhook">webhook</sl-option>
            <sl-option value="mcp_tool">mcp_tool</sl-option>
          </sl-select>

          <sl-textarea label="Action Config (JSON)" rows="4"
            value=${this._jobActionConfig}
            @sl-input=${(e: CustomEvent) => { this._jobActionConfig = (e.target as SlInput).value; }}
          ></sl-textarea>
        </div>

        <sl-button slot="footer" variant="primary" ?loading=${this._jobSaving}
          @click=${() => void this._saveJob()}>
          ${isEdit ? 'Save Changes' : 'Create Job'}
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'automation-panel': AutomationPanel;
  }
}
