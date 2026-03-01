import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ContractBundle } from '../../schema/types.js';
import { ContractService } from '../../contexts/contract/index.js';
import type { ContractChange } from '../../contexts/contract/index.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CHANGE_TYPE_CONFIG = {
  added: {
    label: 'Added',
    icon: '+',
    ariaLabel: 'added',
    badgeVariant: 'success',
    rowClass: 'change-added',
    iconClass: 'icon-added',
  },
  removed: {
    label: 'Removed',
    icon: '−',
    ariaLabel: 'removed',
    badgeVariant: 'danger',
    rowClass: 'change-removed',
    iconClass: 'icon-removed',
  },
  modified: {
    label: 'Modified',
    icon: '~',
    ariaLabel: 'modified',
    badgeVariant: 'warning',
    rowClass: 'change-modified',
    iconClass: 'icon-modified',
  },
} as const;

type ChangeType = keyof typeof CHANGE_TYPE_CONFIG;

// ── Helpers ────────────────────────────────────────────────────────────────

const _noopService = new ContractService(() => null);

// ── Component ──────────────────────────────────────────────────────────────

/**
 * `<contract-diff>` shows a unified diff between two contract bundle versions.
 * Changes are highlighted: additions (green + icon), removals (red − icon),
 * modifications (amber ~ icon) — never color alone.
 *
 * @property bundleBefore - The earlier contract bundle version
 * @property bundleAfter  - The later contract bundle version
 */
@customElement('contract-diff')
export class ContractDiff extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: #9ca3af;
      font-size: 0.875rem;
      font-style: italic;
    }

    .no-changes {
      text-align: center;
      padding: 1.5rem;
      color: #16a34a;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .no-changes-icon {
      font-size: 1.25rem;
    }

    .summary-bar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }

    .summary-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #374151;
    }

    .change-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .change-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      border-radius: 4px;
      margin-bottom: 0.375rem;
      border: 1px solid transparent;
    }

    /* Additions — green background + border */
    .change-added {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }

    /* Removals — red background + border */
    .change-removed {
      background: #fff1f2;
      border-color: #fecdd3;
    }

    /* Modifications — amber background + border */
    .change-modified {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .change-icon {
      flex-shrink: 0;
      width: 1.25rem;
      height: 1.25rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: 700;
      font-family: var(--sl-font-mono, monospace);
      line-height: 1;
    }

    .icon-added {
      background: #16a34a;
      color: #fff;
    }

    .icon-removed {
      background: #dc2626;
      color: #fff;
    }

    .icon-modified {
      background: #d97706;
      color: #fff;
    }

    .change-content {
      flex: 1;
      min-width: 0;
    }

    .change-name {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.8125rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.125rem;
    }

    .change-description {
      font-size: 0.75rem;
      color: #6b7280;
      line-height: 1.4;
    }

    .change-kind-badge {
      flex-shrink: 0;
    }

    .legend {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .legend-icon {
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .empty-section {
      padding: 0.75rem;
      color: #9ca3af;
      font-size: 0.8125rem;
      font-style: italic;
      text-align: center;
    }
  `;

  /** The earlier contract bundle version. */
  @property({ attribute: false }) bundleBefore: ContractBundle | null = null;

  /** The later contract bundle version. */
  @property({ attribute: false }) bundleAfter: ContractBundle | null = null;

  @state() private _activeTab: 'all' | 'events' | 'boundaries' = 'all';

  private _computeDiff() {
    if (!this.bundleBefore || !this.bundleAfter) return null;
    return _noopService.diff(this.bundleBefore, this.bundleAfter);
  }

  override render() {
    if (!this.bundleBefore || !this.bundleAfter) {
      return html`<div class="empty">${t('contractDiff.empty')}</div>`;
    }

    const diff = this._computeDiff();
    if (!diff) {
      return html`<div class="empty">${t('contractDiff.error')}</div>`;
    }

    if (diff.changes.length === 0) {
      return html`
        <div class="no-changes">
          <span class="no-changes-icon" aria-hidden="true">&#10003;</span>
          ${t('contractDiff.noChanges')}
        </div>
      `;
    }

    const allChanges = diff.changes;
    const eventChanges = diff.changes.filter((c) => c.kind === 'eventContract');
    const boundaryChanges = diff.changes.filter((c) => c.kind === 'boundaryContract');

    const addedCount = diff.changes.filter((c) => c.type === 'added').length;
    const removedCount = diff.changes.filter((c) => c.type === 'removed').length;
    const modifiedCount = diff.changes.filter((c) => c.type === 'modified').length;

    return html`
      <div class="summary-bar" role="status" aria-live="polite" aria-label="${t('contractDiff.nChanges', { count: diff.changes.length })}: ${t('contractDiff.nAdded', { count: addedCount })}, ${t('contractDiff.nRemoved', { count: removedCount })}, ${t('contractDiff.nModified', { count: modifiedCount })}">
        <span class="summary-label">${t('contractDiff.nChanges', { count: diff.changes.length })}</span>
        ${addedCount > 0
          ? html`<sl-badge variant="success">${t('contractDiff.nAdded', { count: addedCount })}</sl-badge>`
          : nothing}
        ${removedCount > 0
          ? html`<sl-badge variant="danger">${t('contractDiff.nRemoved', { count: removedCount })}</sl-badge>`
          : nothing}
        ${modifiedCount > 0
          ? html`<sl-badge variant="warning">${t('contractDiff.nModified', { count: modifiedCount })}</sl-badge>`
          : nothing}
      </div>

      <sl-tab-group
        @sl-tab-show=${(e: CustomEvent) => {
          this._activeTab = (e.detail as { name: string }).name as typeof this._activeTab;
        }}
      >
        <sl-tab slot="nav" panel="all">${t('contractDiff.tab.all', { count: allChanges.length })}</sl-tab>
        <sl-tab slot="nav" panel="events">${t('contractDiff.tab.events', { count: eventChanges.length })}</sl-tab>
        <sl-tab slot="nav" panel="boundaries">${t('contractDiff.tab.boundaries', { count: boundaryChanges.length })}</sl-tab>

        <sl-tab-panel name="all">
          ${this._renderChangeList(allChanges, t('contractDiff.ariaLabel.all'))}
        </sl-tab-panel>

        <sl-tab-panel name="events">
          ${eventChanges.length > 0
            ? this._renderChangeList(eventChanges, t('contractDiff.ariaLabel.events'))
            : html`<div class="empty-section">${t('contractDiff.empty.events')}</div>`}
        </sl-tab-panel>

        <sl-tab-panel name="boundaries">
          ${boundaryChanges.length > 0
            ? this._renderChangeList(boundaryChanges, t('contractDiff.ariaLabel.boundaries'))
            : html`<div class="empty-section">${t('contractDiff.empty.boundaries')}</div>`}
        </sl-tab-panel>
      </sl-tab-group>

      ${this._renderLegend()}
    `;
  }

  private _renderChangeList(changes: ContractChange[], ariaLabel: string) {
    return html`
      <ul class="change-list" role="list" aria-label="${ariaLabel}">
        ${changes.map((c) => this._renderChange(c))}
      </ul>
    `;
  }

  private _renderChange(change: ContractChange) {
    const config = CHANGE_TYPE_CONFIG[change.type as ChangeType];
    if (!config) return nothing;

    const kindLabel = change.kind === 'eventContract' ? t('contractDiff.kind.event') : t('contractDiff.kind.boundary');
    const typeLabel = t(`contractDiff.changeType.${change.type}`);

    return html`
      <li
        class="change-item ${config.rowClass}"
        role="listitem"
        aria-label="${typeLabel}: ${change.name} (${kindLabel})"
      >
        <span
          class="change-icon ${config.iconClass}"
          aria-hidden="true"
          title="${typeLabel}"
        >${config.icon}</span>
        <div class="change-content">
          <div class="change-name">${change.name}</div>
          <div class="change-description">${change.description}</div>
        </div>
        <sl-badge
          class="change-kind-badge"
          variant="neutral"
          pill
        >${kindLabel}</sl-badge>
      </li>
    `;
  }

  private _renderLegend() {
    const types: ChangeType[] = ['added', 'removed', 'modified'];
    return html`
      <div class="legend" role="list" aria-label="${t('contractDiff.legend')}">
        ${types.map((changeType) => {
          const config = CHANGE_TYPE_CONFIG[changeType];
          return html`
            <div class="legend-item" role="listitem">
              <span class="legend-icon ${config.iconClass}" aria-hidden="true">${config.icon}</span>
              ${t(`contractDiff.changeType.${changeType}`)}
            </div>
          `;
        })}
      </div>
    `;
  }
}
