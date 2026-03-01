import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { BoundaryAssumption, AssumptionType, Confidence } from '../../schema/types.js';
import type { Overlap } from '../../lib/comparison.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';

const TYPE_COLORS: Record<AssumptionType, string> = {
  ownership: '#e11d48',
  contract: '#f59e0b',
  ordering: '#4f46e5',
  existence: '#059669',
};

const TYPE_ORDER: AssumptionType[] = ['ownership', 'contract', 'ordering', 'existence'];

const CONFIDENCE_DOT: Record<Confidence, string> = {
  CONFIRMED: '#16a34a',
  LIKELY: '#2563eb',
  POSSIBLE: '#d97706',
};

@customElement('assumption-list')
export class AssumptionList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* --- Stats bar --- */
    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.75rem;
      background: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
    }
    .stat {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .stat-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .stat-count {
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
    }
    .stat-conflict {
      color: #e11d48;
    }

    /* --- Sections --- */
    sl-details {
      margin-bottom: 0.5rem;
    }
    sl-details::part(base) {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: var(--sl-font-weight-semibold);
      font-size: var(--sl-font-size-medium);
    }
    .section-count {
      font-weight: normal;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-small);
    }
    .section-border {
      width: 4px;
      height: 1.1em;
      border-radius: 2px;
    }

    /* --- Cards --- */
    .assumption {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--sl-color-neutral-0);
      border-left-width: 3px;
      border-left-style: solid;
    }
    .assumption.conflicting {
      background: #fff1f2;
    }
    .assumption-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }
    .assumption-id-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .assumption-id {
      font-family: var(--sl-font-mono);
      font-weight: var(--sl-font-weight-bold);
      font-size: var(--sl-font-size-small);
    }
    .statement {
      font-size: var(--sl-font-size-small);
      margin-bottom: 0.5rem;
      line-height: 1.5;
    }
    .affects {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      align-items: center;
      margin-bottom: 0.35rem;
      font-size: var(--sl-font-size-x-small);
    }
    .affects-label {
      color: var(--sl-color-neutral-500);
      font-weight: var(--sl-font-weight-semibold);
    }
    .event-chip {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border-radius: var(--sl-border-radius-pill);
      background: var(--sl-color-neutral-100);
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-700);
    }
    .verify {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      font-style: italic;
    }

    /* --- Empty state --- */
    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-small);
    }
  `;

  @property({ attribute: false }) assumptions: BoundaryAssumption[] = [];
  @property({ attribute: false }) conflicts: Overlap[] = [];

  private _getConflictingIds(): Set<string> {
    const ids = new Set<string>();
    for (const o of this.conflicts) {
      if (o.kind !== 'assumption-conflict') continue;
      const parts = o.label.split(' vs ');
      for (const p of parts) {
        ids.add(p.trim());
      }
    }
    return ids;
  }

  private _grouped(): Map<AssumptionType, BoundaryAssumption[]> {
    const groups = new Map<AssumptionType, BoundaryAssumption[]>();
    for (const t of TYPE_ORDER) {
      groups.set(t, []);
    }
    for (const a of this.assumptions) {
      const list = groups.get(a.type);
      if (list) {
        list.push(a);
      }
    }
    return groups;
  }

  private _confidenceCounts(): Record<Confidence, number> {
    const counts: Record<Confidence, number> = { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 };
    for (const a of this.assumptions) {
      counts[a.confidence]++;
    }
    return counts;
  }

  render() {
    if (this.assumptions.length === 0) {
      return html`<div class="empty">No boundary assumptions</div>`;
    }

    const conflictingIds = this._getConflictingIds();
    const groups = this._grouped();
    const confCounts = this._confidenceCounts();
    const conflictCount = conflictingIds.size;

    return html`
      ${this._renderStats(confCounts, conflictCount)}
      ${TYPE_ORDER.map((type) => {
        const items = groups.get(type)!;
        if (items.length === 0) return nothing;
        return this._renderSection(type, items, conflictingIds);
      })}
    `;
  }

  private _renderStats(confCounts: Record<Confidence, number>, conflictCount: number) {
    return html`
      <div class="stats-bar" role="status" aria-label="Boundary assumptions summary">
        <span class="stat">
          <span class="stat-count">${this.assumptions.length}</span> assumptions
        </span>
        ${(['CONFIRMED', 'LIKELY', 'POSSIBLE'] as Confidence[]).map(
          (c) => html`
            <span class="stat">
              <span class="stat-dot" style="background:${CONFIDENCE_DOT[c]}" aria-hidden="true"></span>
              <span class="stat-count">${confCounts[c]}</span>
              ${c.toLowerCase()}
            </span>
          `
        )}
        ${conflictCount > 0
          ? html`
              <span class="stat stat-conflict" role="alert" aria-live="polite">
                <span class="stat-count">${conflictCount}</span> conflicting
              </span>
            `
          : nothing}
      </div>
    `;
  }

  private _renderSection(
    type: AssumptionType,
    items: BoundaryAssumption[],
    conflictingIds: Set<string>
  ) {
    const color = TYPE_COLORS[type];
    return html`
      <sl-details open aria-label="${type} assumptions, ${items.length} items">
        <div slot="summary" class="section-header">
          <span class="section-border" style="background:${color}" aria-hidden="true"></span>
          ${type}
          <span class="section-count">(${items.length})</span>
        </div>
        ${items.map((a) => this._renderCard(a, color, conflictingIds.has(a.id)))}
      </sl-details>
    `;
  }

  private _renderCard(a: BoundaryAssumption, borderColor: string, isConflicting: boolean) {
    const confVariant =
      a.confidence === 'CONFIRMED' ? 'success' : a.confidence === 'LIKELY' ? 'primary' : 'warning';

    return html`
      <div
        class="assumption ${isConflicting ? 'conflicting' : ''}"
        style="border-left-color:${borderColor}"
        role="article"
        aria-label="${a.id}${isConflicting ? ', conflicting assumption' : ''}: ${a.statement}"
      >
        <div class="assumption-header">
          <div class="assumption-id-group">
            <span class="assumption-id">${a.id}</span>
            ${isConflicting
              ? html`<sl-badge variant="danger" pill>Conflicting</sl-badge>`
              : nothing}
          </div>
          <sl-badge variant=${confVariant}>${a.confidence}</sl-badge>
        </div>
        <div class="statement">${a.statement}</div>
        <div class="affects">
          <span class="affects-label">Affects:</span>
          ${a.affects_events.map((e) => html`<span class="event-chip">${e}</span>`)}
        </div>
        <div class="verify">Verify with: ${a.verify_with}</div>
      </div>
    `;
  }
}
