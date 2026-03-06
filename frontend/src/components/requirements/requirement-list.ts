import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchRequirements, createRequirement, type RequirementListView, type RequirementStatusType, type RequirementPriority } from '../../state/requirement-api.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

const STATUS_VARIANTS: Record<RequirementStatusType, string> = {
  draft: 'neutral',
  active: 'primary',
  satisfied: 'success',
  archived: 'neutral',
};

const STATUS_LABEL_KEYS: Record<RequirementStatusType, string> = {
  draft: 'requirementList.status.draft',
  active: 'requirementList.status.active',
  satisfied: 'requirementList.status.satisfied',
  archived: 'requirementList.status.archived',
};

const PRIORITY_VARIANTS: Record<RequirementPriority, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
};

const PRIORITY_LABEL_KEYS: Record<RequirementPriority, string> = {
  critical: 'requirementList.priority.critical',
  high: 'requirementList.priority.high',
  medium: 'requirementList.priority.medium',
  low: 'requirementList.priority.low',
};

@customElement('requirement-list')
export class RequirementList extends LitElement {
  static styles = css`
    :host { display: block; }

    .req-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .req-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      background: var(--surface-card);
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.15s;
    }

    .req-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .req-row:hover {
      background: var(--surface-active, rgba(255,255,255,0.04));
    }

    .req-row.child {
      padding-left: 2.5rem;
    }

    .req-title {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    .req-title.archived {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .req-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .expand-btn {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      font-size: 0.8rem;
      width: 1.2rem;
      justify-content: center;
    }

    .expand-placeholder {
      width: 1.2rem;
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

  @state() private _requirements: RequirementListView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showNew = false;
  @state() private _newTitle = '';
  @state() private _newPriority: RequirementPriority = 'medium';
  @state() private _creating = false;
  @state() private _expanded: Set<string> = new Set();

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
      this._requirements = await fetchRequirements(this.projectId);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requirementList.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private async _create() {
    if (!this._newTitle.trim()) return;
    this._creating = true;
    try {
      const req = await createRequirement(this.projectId, {
        title: this._newTitle.trim(),
        priority: this._newPriority,
      });
      this._newTitle = '';
      this._newPriority = 'medium';
      this._showNew = false;
      this._requirements = [req, ...this._requirements];
      this.dispatchEvent(new CustomEvent('requirement-select', { detail: { requirementId: req.id }, bubbles: true, composed: true }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requirementList.errorCreate');
    } finally {
      this._creating = false;
    }
  }

  private _relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.minutesAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hoursAgo', { count: hrs });
    const days = Math.floor(hrs / 24);
    return t('time.daysAgo', { count: days });
  }

  private _topLevel(): RequirementListView[] {
    return this._requirements.filter(r => !r.parent_id);
  }

  private _childrenOf(parentId: string): RequirementListView[] {
    return this._requirements.filter(r => r.parent_id === parentId);
  }

  private _toggleExpand(id: string) {
    const next = new Set(this._expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._expanded = next;
  }

  private _selectReq(id: string) {
    this.dispatchEvent(new CustomEvent('requirement-select', { detail: { requirementId: id }, bubbles: true, composed: true }));
  }

  private _renderRow(r: RequirementListView, isChild = false): TemplateResult {
    const hasChildren = r.child_count > 0;
    const isExpanded = this._expanded.has(r.id);
    const children = isExpanded ? this._childrenOf(r.id) : [];

    return html`
      <div class="req-row ${isChild ? 'child' : ''}" role="button" tabindex="0"
           @click=${() => this._selectReq(r.id)}
           @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._selectReq(r.id); }}>
        ${hasChildren && !isChild ? html`
          <button class="expand-btn" @click=${(e: Event) => { e.stopPropagation(); this._toggleExpand(r.id); }}>
            <sl-icon name=${isExpanded ? 'chevron-down' : 'chevron-right'}></sl-icon>
          </button>
        ` : html`<span class="expand-placeholder"></span>`}
        <sl-icon name="bullseye" style="color: var(--text-tertiary); font-size: 0.9rem;"></sl-icon>
        <span class="req-title ${r.status === 'archived' ? 'archived' : ''}">${r.title}</span>
        <sl-badge variant=${STATUS_VARIANTS[r.status]}>${t(STATUS_LABEL_KEYS[r.status])}</sl-badge>
        <sl-badge variant=${PRIORITY_VARIANTS[r.priority]}>${t(PRIORITY_LABEL_KEYS[r.priority])}</sl-badge>
        ${r.task_count > 0 ? html`
          <span class="req-meta">${t('requirementList.tasks', { count: r.task_count, suffix: r.task_count !== 1 ? 's' : '' })}</span>
        ` : nothing}
        ${r.child_count > 0 ? html`
          <span class="req-meta">${t('requirementList.children', { count: r.child_count })}</span>
        ` : nothing}
        <sl-tooltip content=${t('requirementList.updated', { time: this._relativeTime(r.updated_at) })}>
          <span class="req-meta">${this._relativeTime(r.updated_at)}</span>
        </sl-tooltip>
      </div>
      ${children.map(c => this._renderRow(c, true))}
    `;
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    const topLevel = this._topLevel();

    return html`
      ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 0.75rem;">${this._error}</sl-alert>` : nothing}

      ${topLevel.length === 0 ? html`
        <div class="empty-state">
          <sl-icon name="bullseye"></sl-icon>
          ${t('requirementList.empty')}
          <div style="margin-top: 0.5rem;">
            <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t('requirementList.newRequirement')}
            </sl-button>
          </div>
        </div>
      ` : html`
        <div style="margin-bottom: 0.75rem; text-align: right;">
          <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${t('requirementList.newRequirement')}
          </sl-button>
        </div>
        <div class="req-list">
          ${topLevel.map(r => this._renderRow(r))}
        </div>
      `}

      <sl-dialog label=${t('requirementList.dialogLabel')} ?open=${this._showNew}
                 @sl-after-hide=${(e: Event) => { if (e.target === e.currentTarget) this._showNew = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('requirementList.titleLabel')} placeholder=${t('requirementList.titlePlaceholder')}
                    value=${this._newTitle}
                    @sl-input=${(e: CustomEvent) => { this._newTitle = (e.target as HTMLInputElement).value; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._create(); }}
          ></sl-input>
          <sl-select label=${t('requirementList.priorityLabel')} value=${this._newPriority}
                     @sl-change=${(e: CustomEvent) => { this._newPriority = (e.target as HTMLSelectElement).value as RequirementPriority; }}>
            <sl-option value="critical">${t('requirementList.priority.critical')}</sl-option>
            <sl-option value="high">${t('requirementList.priority.high')}</sl-option>
            <sl-option value="medium">${t('requirementList.priority.medium')}</sl-option>
            <sl-option value="low">${t('requirementList.priority.low')}</sl-option>
          </sl-select>
        </div>
        <sl-button slot="footer" variant="primary" ?loading=${this._creating}
                   @click=${() => void this._create()}>
          ${t('requirementList.create')}
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'requirement-list': RequirementList;
  }
}
