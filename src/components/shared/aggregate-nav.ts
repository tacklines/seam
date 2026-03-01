import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LoadedFile, DomainEvent } from '../../schema/types.js';
import { getAllAggregates } from '../../lib/grouping.js';
import { getAggregateColor, getAggregateBg } from '../../lib/aggregate-colors.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';

interface AggregateEntry {
  name: string;
  count: number;
  role: string;
}

@customElement('aggregate-nav')
export class AggregateNav extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 0.75rem;
      background: var(--surface-2, var(--sl-color-neutral-50));
      font-family: var(--sl-font-sans);
    }

    .section-header {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .nav-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.375rem 0.5rem;
      cursor: pointer;
      border-radius: 4px;
      transition: background-color 0.15s ease;
      user-select: none;
    }

    .nav-row:hover {
      background: var(--sl-color-neutral-100);
    }

    .nav-row:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: -2px;
    }

    .nav-row.selected {
      background: var(--sl-color-neutral-200);
    }

    .aggregate-row {
      border-left: 4px solid transparent;
      padding-left: 0.5rem;
    }

    .aggregate-row.selected {
      background: var(--row-bg, var(--sl-color-neutral-200));
    }

    .aggregate-name {
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .show-all-label {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
    }

    .role-label {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-400);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.5rem 0.5rem 0.125rem;
    }
  `;

  @property({ attribute: false }) files: LoadedFile[] = [];
  @property({ type: String }) selectedAggregate: string | null = null;

  private get allAggregates(): string[] {
    return getAllAggregates(this.files);
  }

  private get totalEventCount(): number {
    return this.files.reduce(
      (sum, f) => sum + f.data.domain_events.length,
      0,
    );
  }

  /**
   * Build aggregate entries grouped by role, sorted alphabetically within each role.
   * Roles are also sorted alphabetically.
   */
  private get groupedByRole(): Map<string, AggregateEntry[]> {
    const roleMap = new Map<string, Map<string, number>>();

    for (const file of this.files) {
      const role = file.role;
      if (!roleMap.has(role)) {
        roleMap.set(role, new Map());
      }
      const aggMap = roleMap.get(role)!;
      for (const event of file.data.domain_events) {
        aggMap.set(event.aggregate, (aggMap.get(event.aggregate) ?? 0) + 1);
      }
    }

    const result = new Map<string, AggregateEntry[]>();
    const sortedRoles = [...roleMap.keys()].sort();

    for (const role of sortedRoles) {
      const aggMap = roleMap.get(role)!;
      const entries: AggregateEntry[] = [...aggMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({ name, count, role }));
      result.set(role, entries);
    }

    return result;
  }

  private handleSelect(aggregate: string | null) {
    this.dispatchEvent(
      new CustomEvent('aggregate-select', {
        detail: { aggregate },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderShowAll() {
    const isSelected = this.selectedAggregate === null;
    return html`
      <div
        class="nav-row ${isSelected ? 'selected' : ''}"
        role="button"
        tabindex="0"
        aria-pressed=${isSelected ? 'true' : 'false'}
        aria-label=${t('aggregateNav.showAllAriaLabel')}
        @click=${() => this.handleSelect(null)}
        @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.handleSelect(null); } }}
      >
        <span class="show-all-label">${t('aggregateNav.showAll')}</span>
        <sl-badge variant="neutral" pill>${this.totalEventCount}</sl-badge>
      </div>
    `;
  }

  private renderAggregateRow(entry: AggregateEntry) {
    const allAggs = this.allAggregates;
    const isSelected = this.selectedAggregate === entry.name;
    const borderColor = getAggregateColor(entry.name, allAggs);
    const bgColor = isSelected ? getAggregateBg(entry.name, allAggs) : undefined;

    return html`
      <div
        class="nav-row aggregate-row ${isSelected ? 'selected' : ''}"
        style="border-left-color: ${borderColor}; ${bgColor ? `--row-bg: ${bgColor}` : ''}"
        role="button"
        tabindex="0"
        aria-pressed=${isSelected ? 'true' : 'false'}
        aria-label=${t('aggregateNav.filterAriaLabel', { name: entry.name, count: entry.count })}
        @click=${() => this.handleSelect(entry.name)}
        @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.handleSelect(entry.name); } }}
      >
        <span class="aggregate-name">${entry.name}</span>
        <sl-badge variant="neutral" pill>${entry.count}</sl-badge>
      </div>
    `;
  }

  render() {
    if (this.files.length === 0) {
      return nothing;
    }

    const grouped = this.groupedByRole;

    return html`
      <div class="section-header">${t('aggregateNav.heading')}</div>
      ${this.renderShowAll()}
      ${[...grouped.entries()].map(
        ([role, entries]) => html`
          <div class="role-label">${role}</div>
          ${entries.map((entry) => this.renderAggregateRow(entry))}
        `,
      )}
    `;
  }
}
