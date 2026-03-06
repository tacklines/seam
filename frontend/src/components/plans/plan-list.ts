import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchPlans, createPlan, type PlanListView, type PlanStatusType } from '../../state/plan-api.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

const STATUS_VARIANTS: Record<PlanStatusType, string> = {
  draft: 'neutral',
  review: 'warning',
  accepted: 'success',
  superseded: 'neutral',
  abandoned: 'neutral',
};

const STATUS_LABEL_KEYS: Record<PlanStatusType, string> = {
  draft: 'planList.status.draft',
  review: 'planList.status.review',
  accepted: 'planList.status.accepted',
  superseded: 'planList.status.superseded',
  abandoned: 'planList.status.abandoned',
};

@customElement('plan-list')
export class PlanList extends LitElement {
  static styles = css`
    :host { display: block; }

    .plan-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .plan-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      background: var(--surface-card);
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.15s;
    }

    .plan-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .plan-row:hover {
      background: var(--surface-active, rgba(255,255,255,0.04));
    }

    .plan-title {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    .plan-title.terminal {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .plan-time {
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

  @state() private _plans: PlanListView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showNew = false;
  @state() private _newTitle = '';
  @state() private _creating = false;

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
      this._plans = await fetchPlans(this.projectId);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('planList.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private async _create() {
    if (!this._newTitle.trim()) return;
    this._creating = true;
    try {
      const plan = await createPlan(this.projectId, { title: this._newTitle.trim() });
      this._newTitle = '';
      this._showNew = false;
      this._plans = [plan, ...this._plans];
      this.dispatchEvent(new CustomEvent('plan-select', { detail: { planId: plan.id }, bubbles: true, composed: true }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('planList.errorCreate');
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

  private _isTerminal(status: PlanStatusType): boolean {
    return status === 'superseded' || status === 'abandoned';
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 0.75rem;">${this._error}</sl-alert>` : nothing}

      ${this._plans.length === 0 ? html`
        <div class="empty-state">
          <sl-icon name="file-earmark-text"></sl-icon>
          ${t('planList.empty')}
          <div style="margin-top: 0.5rem;">
            <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t('planList.newPlan')}
            </sl-button>
          </div>
        </div>
      ` : html`
        <div style="margin-bottom: 0.75rem; text-align: right;">
          <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${t('planList.newPlan')}
          </sl-button>
        </div>
        <div class="plan-list">
          ${this._plans.map(p => html`
            <div class="plan-row" role="button" tabindex="0"
                 @click=${() => this.dispatchEvent(new CustomEvent('plan-select', { detail: { planId: p.id }, bubbles: true, composed: true }))}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.dispatchEvent(new CustomEvent('plan-select', { detail: { planId: p.id }, bubbles: true, composed: true })); }}>
              <sl-icon name="file-earmark-text" style="color: var(--text-tertiary); font-size: 0.9rem;"></sl-icon>
              <span class="plan-title ${this._isTerminal(p.status) ? 'terminal' : ''}">${p.title}</span>
              <sl-badge variant=${STATUS_VARIANTS[p.status]}>${t(STATUS_LABEL_KEYS[p.status])}</sl-badge>
              <sl-tooltip content=${t('planList.updated', { time: this._relativeTime(p.updated_at) })}>
                <span class="plan-time">${this._relativeTime(p.updated_at)}</span>
              </sl-tooltip>
            </div>
          `)}
        </div>
      `}

      <sl-dialog label=${t('planList.dialogLabel')} ?open=${this._showNew}
                 @sl-after-hide=${() => { this._showNew = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('planList.titleLabel')} placeholder=${t('planList.titlePlaceholder')}
                    value=${this._newTitle}
                    @sl-input=${(e: CustomEvent) => { this._newTitle = (e.target as HTMLInputElement).value; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._create(); }}
          ></sl-input>
        </div>
        <sl-button slot="footer" variant="primary" ?loading=${this._creating}
                   @click=${() => void this._create()}>
          ${t('planList.create')}
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'plan-list': PlanList;
  }
}
