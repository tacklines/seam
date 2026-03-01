import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Confidence, Direction } from '../../schema/types.js';
import { store } from '../../state/app-state.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

const CONFIDENCE_OPTIONS: { value: Confidence; labelKey: string; color: string }[] = [
  { value: 'CONFIRMED', labelKey: 'filterPanel.confidence.confirmed', color: 'var(--sl-color-emerald-600, #059669)' },
  { value: 'LIKELY', labelKey: 'filterPanel.confidence.likely', color: 'var(--sl-color-blue-600, #2563eb)' },
  { value: 'POSSIBLE', labelKey: 'filterPanel.confidence.possible', color: 'var(--sl-color-amber-500, #f59e0b)' },
];

const DIRECTION_OPTIONS: { value: Direction; labelKey: string; color: string }[] = [
  { value: 'inbound', labelKey: 'filterPanel.direction.inbound', color: 'var(--sl-color-blue-600, #2563eb)' },
  { value: 'outbound', labelKey: 'filterPanel.direction.outbound', color: 'var(--sl-color-rose-600, #e11d48)' },
  { value: 'internal', labelKey: 'filterPanel.direction.internal', color: 'var(--sl-color-neutral-500, #64748b)' },
];

const TOTAL_FILTERS = CONFIDENCE_OPTIONS.length + DIRECTION_OPTIONS.length;

@customElement('filter-panel')
export class FilterPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 0.75rem;
      background: var(--surface-2, var(--sl-color-neutral-50));
      font-family: var(--sl-font-sans);
    }

    .filter-status {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      margin-bottom: 0.75rem;
    }

    .section-header {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .filter-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    sl-divider {
      --spacing: 0.75rem;
    }
  `;

  @property({ attribute: false }) confidenceFilter = new Set<Confidence>();
  @property({ attribute: false }) directionFilter = new Set<Direction>();

  private get activeCount(): number {
    return this.confidenceFilter.size + this.directionFilter.size;
  }

  private renderStatus() {
    const count = this.activeCount;
    const label = count === TOTAL_FILTERS
      ? t('filterPanel.allActive')
      : t('filterPanel.nActive', { count });
    return html`<div class="filter-status">${label}</div>`;
  }

  render() {
    return html`
      ${this.renderStatus()}

      <div class="section-header">${t('filterPanel.confidence')}</div>
      ${CONFIDENCE_OPTIONS.map(
        (opt) => html`
          <div class="filter-option">
            <sl-checkbox
              size="small"
              ?checked=${this.confidenceFilter.has(opt.value)}
              @sl-change=${() => store.toggleConfidence(opt.value)}
            >${t(opt.labelKey)}</sl-checkbox>
            <span class="dot" style="background:${opt.color}"></span>
          </div>
        `
      )}

      <sl-divider></sl-divider>

      <div class="section-header">${t('filterPanel.direction')}</div>
      ${DIRECTION_OPTIONS.map(
        (opt) => html`
          <div class="filter-option">
            <sl-checkbox
              size="small"
              ?checked=${this.directionFilter.has(opt.value)}
              @sl-change=${() => store.toggleDirection(opt.value)}
            >${t(opt.labelKey)}</sl-checkbox>
            <span class="dot" style="background:${opt.color}"></span>
          </div>
        `
      )}
    `;
  }
}
