import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Requirement } from '../../schema/types.js';

/**
 * Computes the count of derived events for a requirement that are present in
 * the session's accepted event names.
 */
export function coverageCount(req: Requirement, sessionEventNames: string[]): number {
  if (!req.derivedEvents || req.derivedEvents.length === 0) return 0;
  const sessionSet = new Set(sessionEventNames);
  return req.derivedEvents.filter((name) => sessionSet.has(name)).length;
}

/**
 * Returns true if the requirement has at least one derived event accepted into
 * the session.
 */
export function isCovered(req: Requirement, sessionEventNames: string[]): boolean {
  return coverageCount(req, sessionEventNames) > 0;
}

/**
 * Requirements Panel (sidebar variant) — persistent panel below the
 * Exploration Guide showing all requirements with coverage indicators.
 *
 * Coverage is determined by the intersection of `req.derivedEvents` and
 * `sessionEventNames` (accepted session events):
 * - Covered: green checkmark + "(N events)" badge
 * - Uncovered: amber dot indicator
 *
 * @fires requirement-selected — When user clicks a requirement row.
 *   Detail: `{ requirementId: string }`
 * @fires derive-more-clicked — When user clicks the "Derive more" link.
 *   Detail: `{}`
 */
@customElement('requirements-coverage-panel')
export class RequirementsCoveragePanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .panel {
      background: var(--sl-color-neutral-100);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: var(--sl-color-neutral-200);
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-700);
    }

    .panel-body {
      padding: 0.25rem 0;
    }

    .requirement-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .requirement-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      font-family: var(--sl-font-sans);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      min-height: 44px;
      box-sizing: border-box;
      transition: background 0.15s ease;
    }

    .requirement-item:hover {
      background: var(--sl-color-neutral-150, #ebebeb);
    }

    .requirement-item:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: -2px;
    }

    .requirement-item.selected {
      background: var(--sl-color-primary-50);
      border-left: 3px solid var(--sl-color-primary-600);
    }

    .indicator {
      flex-shrink: 0;
      width: 1rem;
      height: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 0.1rem;
    }

    .indicator-checkmark {
      color: #16a34a;
      font-size: 0.875rem;
      line-height: 1;
    }

    .indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #d97706;
    }

    .item-content {
      flex: 1;
      min-width: 0;
    }

    .item-statement {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.4;
    }

    .item-badge {
      display: inline-block;
      margin-top: 0.125rem;
      font-size: var(--sl-font-size-x-small);
      color: #16a34a;
      font-weight: var(--sl-font-weight-semibold);
    }

    .empty-state {
      padding: 1rem 0.75rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      text-align: center;
    }

    .derive-more-link {
      display: block;
      padding: 0.5rem 0.75rem;
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
      border: none;
      background: transparent;
      font-family: var(--sl-font-sans);
      text-align: left;
      width: 100%;
      border-top: 1px solid var(--sl-color-neutral-200);
      margin-top: 0.25rem;
      transition: color 0.15s ease;
    }

    .derive-more-link:hover {
      color: var(--sl-color-primary-600);
    }

    .derive-more-link:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;

  /** All requirements in the session */
  @property({ attribute: false }) requirements: Requirement[] = [];

  /** Event names currently accepted into the session (for coverage computation) */
  @property({ attribute: false }) sessionEventNames: string[] = [];

  /** Currently selected requirement ID */
  @property({ attribute: false }) selectedRequirementId: string | null = null;

  private _onSelect(requirementId: string) {
    this.dispatchEvent(
      new CustomEvent('requirement-selected', {
        detail: { requirementId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onDeriveMore() {
    this.dispatchEvent(
      new CustomEvent('derive-more-clicked', {
        detail: {},
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderIndicator(covered: boolean) {
    if (covered) {
      return html`
        <span class="indicator" aria-hidden="true">
          <span class="indicator-checkmark">&#x2713;</span>
        </span>
      `;
    }
    return html`
      <span class="indicator" aria-hidden="true">
        <span class="indicator-dot"></span>
      </span>
    `;
  }

  private _renderRequirement(req: Requirement) {
    const covered = isCovered(req, this.sessionEventNames);
    const count = coverageCount(req, this.sessionEventNames);
    const isSelected = req.id === this.selectedRequirementId;

    const coverageLabel = covered
      ? `covered, ${count} event${count === 1 ? '' : 's'}`
      : 'uncovered, needs derivation';

    return html`
      <li>
        <button
          class="requirement-item ${isSelected ? 'selected' : ''}"
          type="button"
          aria-current="${isSelected ? 'true' : 'false'}"
          aria-label="${req.statement}, ${coverageLabel}"
          @click=${() => this._onSelect(req.id)}
        >
          ${this._renderIndicator(covered)}
          <span class="sr-only">${covered ? 'Covered' : 'Uncovered'}:</span>
          <span class="item-content">
            <span class="item-statement">${req.statement}</span>
            ${covered
              ? html`<span class="item-badge">(${count} event${count === 1 ? '' : 's'})</span>`
              : nothing}
          </span>
        </button>
      </li>
    `;
  }

  override render() {
    const count = this.requirements.length;

    return html`
      <div class="panel" role="region" aria-label="Requirements panel">
        <div class="panel-header">
          <span>Requirements (${count})</span>
        </div>
        <div class="panel-body">
          ${count === 0
            ? html`<p class="empty-state" role="status">No requirements yet.</p>`
            : html`
                <ul class="requirement-list" role="list" aria-label="Requirements list">
                  ${this.requirements.map((r) => this._renderRequirement(r))}
                </ul>
              `}
          <button
            class="derive-more-link"
            type="button"
            @click=${this._onDeriveMore}
            aria-label="Return to Requirements mode to derive more events"
          >
            Derive more
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'requirements-coverage-panel': RequirementsCoveragePanel;
  }
}
