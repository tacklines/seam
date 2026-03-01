import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { OwnershipAssignment } from '../../schema/types.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';

/**
 * `<ownership-grid>` — Visual grid showing which role owns which aggregate.
 *
 * Aggregates are rows; roles are columns. Each cell shows whether the role
 * currently owns that aggregate. Clicking a cell assigns ownership via the
 * jam/assign API endpoint.
 *
 * Ownership is communicated with both a filled-circle icon AND a text label
 * so color is never the sole differentiator.
 *
 * @fires ownership-assigned - Detail: { assignment: OwnershipAssignment }
 */
@customElement('ownership-grid')
export class OwnershipGrid extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Empty state ── */
    .empty {
      text-align: center;
      padding: 2rem 1rem;
      color: #9ca3af;
      font-size: 0.875rem;
    }

    .empty sl-icon {
      font-size: 2rem;
      display: block;
      margin: 0 auto 0.5rem;
    }

    /* ── Grid wrapper ── */
    .grid-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    /* ── Header row ── */
    thead th {
      padding: 0.5rem 0.75rem;
      text-align: center;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
      white-space: nowrap;
      background: #f9fafb;
    }

    thead th.aggregate-col {
      text-align: left;
    }

    /* ── Body rows ── */
    tbody tr {
      transition: background 0.1s;
    }

    tbody tr:hover {
      background: #f9fafb;
    }

    tbody tr:nth-child(even) {
      background: #fafafa;
    }

    tbody tr:nth-child(even):hover {
      background: #f3f4f6;
    }

    td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: middle;
    }

    .agg-name {
      font-weight: 500;
      color: #111827;
      font-family: var(--sl-font-mono);
      white-space: nowrap;
    }

    /* ── Ownership cell ── */
    .cell-btn {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.1875rem;
      min-width: 64px;
      min-height: 44px;
      padding: 0.25rem 0.375rem;
      border-radius: 8px;
      border: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      font-size: 0.6875rem;
      color: #9ca3af;
    }

    .cell-btn:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
      color: #374151;
    }

    .cell-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .cell-btn.owned {
      background: var(--sl-color-primary-50);
      border-color: var(--sl-color-primary-300);
      color: var(--sl-color-primary-700);
    }

    .cell-btn.owned:hover {
      background: var(--sl-color-primary-100);
    }

    .cell-btn.loading {
      opacity: 0.6;
      pointer-events: none;
    }

    .cell-icon {
      font-size: 1.125rem;
      line-height: 1;
    }

    .cell-label {
      font-weight: 600;
      text-align: center;
      line-height: 1;
    }

    /* ── Status bar ── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .status-bar sl-icon {
      font-size: 0.875rem;
    }

    .error-text {
      color: var(--sl-color-danger-600);
      font-size: 0.8125rem;
      margin-top: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  `;

  /** All aggregates to display as rows */
  @property({ attribute: false }) aggregates: string[] = [];

  /** All roles to display as columns */
  @property({ attribute: false }) roles: string[] = [];

  /** Current ownership map (aggregate -> ownerRole) */
  @property({ attribute: false }) ownershipMap: OwnershipAssignment[] = [];

  /** Session code for API calls */
  @property() sessionCode = '';

  /** Name of the participant making assignments */
  @property() participantName = '';

  /** API base URL */
  @property() apiBase = 'http://localhost:3002';

  @state() private _loadingCell: string | null = null; // "aggregate::role"
  @state() private _error = '';

  render() {
    if (this.aggregates.length === 0 || this.roles.length === 0) {
      return html`
        <div class="empty" role="status">
          <sl-icon name="grid-3x3" aria-hidden="true"></sl-icon>
          <div>No aggregates or roles to display.</div>
          <div>Load storm-prep files to see the ownership grid.</div>
        </div>
      `;
    }

    return html`
      <div>
        <div class="grid-scroll" role="region" aria-label="Aggregate ownership grid">
          <table>
            <thead>
              <tr>
                <th class="aggregate-col" scope="col">Aggregate</th>
                ${this.roles.map(
                  (role) => html`<th scope="col">${role}</th>`
                )}
              </tr>
            </thead>
            <tbody>
              ${this.aggregates.map((agg) => this._renderRow(agg))}
            </tbody>
          </table>
        </div>

        ${this._error
          ? html`
              <div class="error-text" role="alert">
                <sl-icon name="exclamation-triangle" aria-hidden="true"></sl-icon>
                ${this._error}
              </div>
            `
          : nothing}

        <div class="status-bar">
          <sl-icon name="info-circle" aria-hidden="true"></sl-icon>
          <span>
            ${this._assignedCount()} of ${this.aggregates.length} aggregate${this.aggregates.length !== 1 ? 's' : ''} assigned.
            Click a role cell to assign ownership.
          </span>
        </div>
      </div>
    `;
  }

  private _renderRow(agg: string) {
    const assignment = this.ownershipMap.find((a) => a.aggregate === agg);
    return html`
      <tr>
        <td>
          <span class="agg-name">${agg}</span>
          ${assignment
            ? html`
                <sl-badge variant="success" pill style="margin-left:0.5rem;font-size:0.625rem;">
                  ${assignment.ownerRole}
                </sl-badge>
              `
            : nothing}
        </td>
        ${this.roles.map((role) => this._renderCell(agg, role, assignment))}
      </tr>
    `;
  }

  private _renderCell(agg: string, role: string, assignment: OwnershipAssignment | undefined) {
    const isOwner = assignment?.ownerRole === role;
    const cellKey = `${agg}::${role}`;
    const isLoading = this._loadingCell === cellKey;

    return html`
      <td style="text-align:center;">
        <button
          class="cell-btn ${isOwner ? 'owned' : ''} ${isLoading ? 'loading' : ''}"
          aria-label="${role} ${isOwner ? 'owns' : 'does not own'} ${agg}. ${isOwner ? 'Click to reassign.' : 'Click to assign.'}"
          aria-pressed=${isOwner ? 'true' : 'false'}
          @click=${() => void this._assign(agg, role)}
          ?disabled=${isLoading}
        >
          ${isLoading
            ? html`<sl-spinner style="font-size:1rem;"></sl-spinner>`
            : html`
                <sl-icon
                  class="cell-icon"
                  name=${isOwner ? 'record-circle-fill' : 'circle'}
                  aria-hidden="true"
                ></sl-icon>
                <span class="cell-label">${isOwner ? 'Owner' : 'Assign'}</span>
              `}
        </button>
      </td>
    `;
  }

  private _assignedCount(): number {
    return this.aggregates.filter((agg) =>
      this.ownershipMap.some((a) => a.aggregate === agg)
    ).length;
  }

  private async _assign(aggregate: string, ownerRole: string) {
    const cellKey = `${aggregate}::${ownerRole}`;
    this._loadingCell = cellKey;
    this._error = '';

    const assignedBy = this.participantName || 'Facilitator';
    const payload = { aggregate, ownerRole, assignedBy };

    try {
      let assignment: OwnershipAssignment;

      if (this.sessionCode) {
        const res = await fetch(
          `${this.apiBase}/api/sessions/${this.sessionCode}/jam/assign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { assignment: OwnershipAssignment };
        assignment = data.assignment;
      } else {
        // Offline / local mode
        assignment = { ...payload, assignedAt: new Date().toISOString() };
      }

      this.dispatchEvent(
        new CustomEvent('ownership-assigned', {
          detail: { assignment },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loadingCell = null;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ownership-grid': OwnershipGrid;
  }
}
