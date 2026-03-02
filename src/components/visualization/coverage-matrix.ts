import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { WorkItem } from '../../schema/types.js';

/**
 * Coverage Matrix — a compact grid showing which work items cover which events.
 *
 * Rows are domain events from the parent aggregate.
 * Columns are work items.
 * Cells show whether a work item addresses an event.
 * Uncovered events are highlighted in amber.
 *
 * Accessible: uses a proper `<table>` with `<th>` headers and
 * descriptive `aria-label` on each cell.
 */
@customElement('coverage-matrix')
export class CoverageMatrix extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }

    .header-title {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0;
    }

    .coverage-summary {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-500, #6b7280);
    }

    .coverage-summary.all-covered {
      color: #16a34a;
      font-weight: 600;
    }

    .coverage-summary.has-uncovered {
      color: #b45309;
      font-weight: 600;
    }

    /* ---- Empty state ---- */
    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: var(--sl-color-neutral-400, #9ca3af);
      border: 1px dashed var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
      font-size: var(--sl-font-size-small, 0.875rem);
      font-style: italic;
    }

    /* ---- Table wrapper ---- */
    .table-wrapper {
      overflow-x: auto;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--sl-font-size-small, 0.875rem);
    }

    thead {
      background: var(--sl-color-neutral-50, #f9fafb);
      border-bottom: 2px solid var(--sl-color-neutral-200, #e5e7eb);
    }

    th {
      padding: 0.5rem 0.625rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-700, #374151);
      text-align: center;
      white-space: nowrap;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    th.col-event {
      text-align: left;
      min-width: 140px;
      max-width: 200px;
    }

    td {
      padding: 0.375rem 0.625rem;
      border-bottom: 1px solid var(--sl-color-neutral-100, #f3f4f6);
      vertical-align: middle;
      text-align: center;
    }

    tr:last-child td {
      border-bottom: none;
    }

    /* ---- Event name cell ---- */
    td.event-name-cell {
      text-align: left;
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sl-color-neutral-700, #374151);
      white-space: nowrap;
    }

    td.event-name-cell.uncovered {
      color: #92400e;
      background: #fffbeb;
    }

    /* ---- Coverage indicator cells ---- */
    .cell-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }

    .cell-covered {
      color: #16a34a;
    }

    .cell-uncovered {
      color: var(--sl-color-neutral-200, #e5e7eb);
    }

    /* ---- Legend ---- */
    .legend {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.625rem;
      font-size: 0.75rem;
      color: var(--sl-color-neutral-500, #6b7280);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      border: 1px solid currentColor;
      display: inline-block;
    }

    .legend-swatch.covered {
      background: #dcfce7;
      border-color: #16a34a;
      color: #16a34a;
    }

    .legend-swatch.uncovered {
      background: #fffbeb;
      border-color: #d97706;
      color: #d97706;
    }
  `;

  /** Domain event names from the parent aggregate. */
  @property({ type: Array }) events: string[] = [];
  /** Work items to show as columns. */
  @property({ type: Array }) workItems: WorkItem[] = [];

  private _isCovered(eventName: string): boolean {
    return this.workItems.some((wi) => wi.linkedEvents.includes(eventName));
  }

  private _isWorkItemCovering(workItem: WorkItem, eventName: string): boolean {
    return workItem.linkedEvents.includes(eventName);
  }

  private _uncoveredCount(): number {
    return this.events.filter((ev) => !this._isCovered(ev)).length;
  }

  override render() {
    if (this.events.length === 0 && this.workItems.length === 0) {
      return html`
        <div>
          <h3 class="header-title" style="margin: 0 0 0.75rem;">${t('coverageMatrix.title')}</h3>
          <div class="empty">${t('coverageMatrix.empty')}</div>
        </div>
      `;
    }

    const uncovered = this._uncoveredCount();
    const allCovered = uncovered === 0;

    return html`
      <div>
        <!-- Header -->
        <div class="header">
          <h3 class="header-title">${t('coverageMatrix.title')}</h3>
          <span
            class="coverage-summary ${allCovered ? 'all-covered' : 'has-uncovered'}"
            aria-live="polite"
          >
            ${allCovered
              ? t('coverageMatrix.allCovered')
              : t('coverageMatrix.uncoveredCount', { count: uncovered })}
          </span>
        </div>

        <!-- Matrix table -->
        <div class="table-wrapper">
          <table
            aria-label="${t('coverageMatrix.ariaLabel')}"
          >
            <thead>
              <tr>
                <th class="col-event" scope="col">${t('coverageMatrix.col.event')}</th>
                ${this.workItems.map(
                  (wi) => html`
                    <th scope="col" title="${wi.title}">
                      ${wi.title ? wi.title.slice(0, 12) + (wi.title.length > 12 ? '…' : '') : `WI-${wi.id.slice(-4)}`}
                    </th>
                  `
                )}
              </tr>
            </thead>
            <tbody>
              ${this.events.map((ev) => {
                const eventCovered = this._isCovered(ev);
                return html`
                  <tr>
                    <td
                      class="event-name-cell ${eventCovered ? '' : 'uncovered'}"
                      title="${eventCovered ? '' : t('coverageMatrix.uncovered', { event: ev })}"
                    >
                      ${!eventCovered
                        ? html`<span aria-hidden="true" title="${t('coverageMatrix.uncovered', { event: ev })}">&#9888; </span>`
                        : nothing}
                      ${ev}
                    </td>
                    ${this.workItems.map((wi) => {
                      const covers = this._isWorkItemCovering(wi, ev);
                      const cellLabel = covers
                        ? t('coverageMatrix.cell.covered', { workItem: wi.title || wi.id, event: ev })
                        : t('coverageMatrix.cell.notCovered', { workItem: wi.title || wi.id, event: ev });
                      return html`
                        <td aria-label="${cellLabel}">
                          <span
                            class="cell-indicator ${covers ? 'cell-covered' : 'cell-uncovered'}"
                            aria-hidden="true"
                          >
                            ${covers
                              ? html`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`
                              : html`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`}
                          </span>
                        </td>
                      `;
                    })}
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>

        <!-- Legend -->
        <div class="legend" aria-label="Legend">
          <div class="legend-item">
            <span class="legend-swatch covered" aria-hidden="true"></span>
            <span>Covered</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch uncovered" aria-hidden="true"></span>
            <span>Uncovered</span>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'coverage-matrix': CoverageMatrix;
  }
}
