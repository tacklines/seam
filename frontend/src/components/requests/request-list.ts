import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { fetchRequests, createRequest, type RequestListView, type RequestStatusType } from '../../state/requirement-api.js';
import { fetchReactions, createReaction, updateReaction, type EventReaction } from '../../state/automation-api.js';
import { t } from '../../lib/i18n.js';
import { relativeTime } from '../../lib/date-utils.js';
import type { InvokeDialog } from '../invocations/invoke-dialog.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '../invocations/invoke-dialog.js';

const STATUS_VARIANTS: Record<RequestStatusType, string> = {
  pending: 'neutral',
  analyzing: 'warning',
  decomposed: 'success',
  archived: 'neutral',
};

const STATUS_LABEL_KEYS: Record<RequestStatusType, string> = {
  pending: 'requestList.status.pending',
  analyzing: 'requestList.status.analyzing',
  decomposed: 'requestList.status.decomposed',
  archived: 'requestList.status.archived',
};

@customElement('request-list')
export class RequestList extends LitElement {
  static styles = css`
    :host { display: block; }

    .request-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .request-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      background: var(--surface-card);
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.15s;
    }

    .request-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .request-row:hover {
      background: var(--surface-active, rgba(255,255,255,0.04));
    }

    .request-title {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    .request-title.archived {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .request-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2rem;
      display: block;
      margin: 0 auto 0.75rem;
      opacity: 0.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  @property() projectId = '';

  @query('invoke-dialog') private _invokeDialog!: InvokeDialog;

  @state() private _requests: RequestListView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showNew = false;
  @state() private _newTitle = '';
  @state() private _newBody = '';
  @state() private _creating = false;
  @state() private _autoAnalysis: EventReaction | null = null;
  @state() private _autoAnalysisLoading = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('projectId') && this.projectId) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = '';
    try {
      const [requests, reactions] = await Promise.all([
        fetchRequests(this.projectId),
        fetchReactions(this.projectId).catch(() => [] as EventReaction[]),
      ]);
      this._requests = requests;
      this._autoAnalysis = reactions.find(
        r => r.aggregate_type === 'request' && r.event_type === 'request_created' && r.action_type === 'invoke_agent',
      ) ?? null;
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requestList.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private async _toggleAutoAnalysis() {
    this._autoAnalysisLoading = true;
    try {
      if (this._autoAnalysis) {
        this._autoAnalysis = await updateReaction(this.projectId, this._autoAnalysis.id, {
          enabled: !this._autoAnalysis.enabled,
        });
      } else {
        this._autoAnalysis = await createReaction(this.projectId, {
          name: 'Auto-analyze requests',
          event_type: 'request_created',
          aggregate_type: 'request',
          action_type: 'invoke_agent',
          action_config: {
            skill: 'blossom',
            instructions: 'Analyze this feature request against the project\'s existing requirements and features. Decompose into requirements and tasks.\n\nRequest: {{title}}\n\n{{body}}\n\nUse list_requirements to see existing requirements. Use create_requirement to add new ones. Link them with link_requirement_task and link_request_requirement.',
          },
        });
      }
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to update auto-analysis';
    } finally {
      this._autoAnalysisLoading = false;
    }
  }

  private async _create() {
    if (!this._newTitle.trim() || !this._newBody.trim()) return;
    this._creating = true;
    try {
      const req = await createRequest(this.projectId, {
        title: this._newTitle.trim(),
        body: this._newBody.trim(),
      });
      this._newTitle = '';
      this._newBody = '';
      this._showNew = false;
      this._requests = [req, ...this._requests];
      this.dispatchEvent(new CustomEvent('request-select', { detail: { requestId: req.id }, bubbles: true, composed: true }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requestList.errorCreate');
    } finally {
      this._creating = false;
    }
  }


  private _selectRequest(id: string) {
    this.dispatchEvent(new CustomEvent('request-select', { detail: { requestId: id }, bubbles: true, composed: true }));
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 0.75rem;">${this._error}</sl-alert>` : nothing}

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
        <sl-tooltip content=${t('requestList.autoAnalysisHelp')}>
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
            <sl-switch size="small"
              ?checked=${this._autoAnalysis?.enabled ?? false}
              ?disabled=${this._autoAnalysisLoading}
              @sl-change=${() => void this._toggleAutoAnalysis()}
            ></sl-switch>
            ${t('requestList.autoAnalysis')}
          </div>
        </sl-tooltip>
        <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          ${t('requestList.newRequest')}
        </sl-button>
      </div>

      ${this._requests.length === 0 ? html`
        <div class="empty-state">
          <sl-icon name="chat-square-text"></sl-icon>
          ${t('requestList.empty')}
        </div>
      ` : html`
        <div class="request-list">
          ${this._requests.map(r => html`
            <div class="request-row" role="button" tabindex="0"
                 @click=${() => this._selectRequest(r.id)}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._selectRequest(r.id); }}>
              <sl-icon name="chat-square-text" style="color: var(--text-tertiary); font-size: 0.9rem;"></sl-icon>
              <span class="request-title ${r.status === 'archived' ? 'archived' : ''}">${r.title}</span>
              <sl-badge variant=${STATUS_VARIANTS[r.status]}>${t(STATUS_LABEL_KEYS[r.status])}</sl-badge>
              ${r.requirement_count > 0 ? html`
                <span class="request-meta">${t('requestList.requirements', { count: r.requirement_count, suffix: r.requirement_count !== 1 ? 's' : '' })}</span>
              ` : nothing}
              <sl-tooltip content=${t('requestList.updated', { time: relativeTime(r.updated_at) })}>
                <span class="request-meta">${relativeTime(r.updated_at)}</span>
              </sl-tooltip>
              <sl-tooltip content=${t('dispatch.request.action.analyze')}>
                <sl-icon-button
                  name="play-fill"
                  label=${t('dispatch.request.action.analyze')}
                  style="font-size: 0.9rem; color: var(--sl-color-primary-500);"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._invokeDialog.showWithPerspective(
                      'researcher',
                      `Analyze request: ${r.title}`,
                    );
                  }}
                ></sl-icon-button>
              </sl-tooltip>
            </div>
          `)}
        </div>
      `}

      <sl-dialog label=${t('requestList.dialogLabel')} ?open=${this._showNew}
                 @sl-after-hide=${() => { this._showNew = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('requestList.titleLabel')} placeholder=${t('requestList.titlePlaceholder')}
                    value=${this._newTitle}
                    @sl-input=${(e: CustomEvent) => { this._newTitle = (e.target as HTMLInputElement).value; }}
          ></sl-input>
          <sl-textarea label=${t('requestList.bodyLabel')} placeholder=${t('requestList.bodyPlaceholder')}
                       rows="4" value=${this._newBody}
                       @sl-input=${(e: CustomEvent) => { this._newBody = (e.target as HTMLTextAreaElement).value; }}
          ></sl-textarea>
        </div>
        <sl-button slot="footer" variant="primary" ?loading=${this._creating}
                   @click=${() => void this._create()}>
          ${t('requestList.create')}
        </sl-button>
      </sl-dialog>

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'request-list': RequestList;
  }
}
