import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';

export interface ContractEntry {
  eventName: string;
  owner: string;
  consumers: string[];
  status: 'pass' | 'warn' | 'fail';
}

type ContractStatus = 'pass' | 'warn' | 'fail';

const STATUS_ICON: Record<ContractStatus, string> = {
  pass: 'check',
  warn: 'triangle',
  fail: 'x',
};

const STATUS_VARIANT: Record<ContractStatus, string> = {
  pass: 'success',
  warn: 'warning',
  fail: 'danger',
};

const STATUS_LABEL_KEY: Record<ContractStatus, string> = {
  pass: 'contractSidebar.status.pass',
  warn: 'contractSidebar.status.warn',
  fail: 'contractSidebar.status.fail',
};

/**
 * `<contract-sidebar>` — Sidebar section listing event contracts grouped by owner.
 *
 * Displays each contract with: event name, owner, consumer count, and compliance
 * status icon + text label (never color alone). Contracts are grouped by owner
 * in collapsible sl-details sections.
 *
 * @property contracts - Array of ContractEntry objects
 *
 * @fires contract-selected - Detail: { eventName, owner }
 */
@customElement('contract-sidebar')
export class ContractSidebar extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .section-header {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.75rem 0.75rem 0.5rem;
    }

    .empty-state {
      padding: 1.5rem 0.75rem;
      text-align: center;
      color: var(--sl-color-neutral-500);
    }

    .empty-title {
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 0.375rem;
    }

    .empty-hint {
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .empty-icon {
      font-size: 1.75rem;
      display: block;
      margin-bottom: 0.5rem;
    }

    /* Owner group */
    sl-details {
      --sl-spacing-medium: 0;
    }

    sl-details::part(base) {
      border: none;
      border-radius: 0;
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    sl-details::part(header) {
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--sl-color-neutral-700);
    }

    sl-details::part(content) {
      padding: 0;
    }

    .owner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 0.5rem;
    }

    .owner-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    /* Contract row */
    .contract-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .contract-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem 0.5rem 1.25rem;
      cursor: pointer;
      border-radius: 0;
      transition: background-color 0.15s ease;
      /* Ensure 44px touch target via min-height */
      min-height: 2.75rem;
    }

    .contract-row:hover {
      background: var(--sl-color-neutral-100);
    }

    .contract-row:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: -2px;
    }

    .status-icon {
      flex-shrink: 0;
      width: 1rem;
      height: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-icon svg {
      width: 1rem;
      height: 1rem;
    }

    .contract-name {
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .contract-meta {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .consumer-count {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }
  `;

  /** Array of contract entries to display, grouped by owner */
  @property({ attribute: false }) contracts: ContractEntry[] = [];

  private get _groupedByOwner(): Map<string, ContractEntry[]> {
    const groups = new Map<string, ContractEntry[]>();
    for (const contract of this.contracts) {
      if (!groups.has(contract.owner)) {
        groups.set(contract.owner, []);
      }
      groups.get(contract.owner)!.push(contract);
    }
    // Sort owners alphabetically
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  private _handleContractClick(contract: ContractEntry) {
    this.dispatchEvent(
      new CustomEvent('contract-selected', {
        detail: { eventName: contract.eventName, owner: contract.owner },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderStatusIcon(status: ContractStatus) {
    const iconKey = STATUS_ICON[status];
    if (iconKey === 'check') {
      return html`
        <svg viewBox="0 0 16 16" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="7"/>
          <polyline points="5,8 7,10.5 11,5.5"/>
        </svg>
      `;
    }
    if (iconKey === 'triangle') {
      return html`
        <svg viewBox="0 0 16 16" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 2L14.5 13H1.5L8 2z"/>
          <line x1="8" y1="7" x2="8" y2="9.5"/>
          <circle cx="8" cy="11.5" r="0.5" fill="#d97706"/>
        </svg>
      `;
    }
    // x
    return html`
      <svg viewBox="0 0 16 16" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="7"/>
        <line x1="5" y1="5" x2="11" y2="11"/>
        <line x1="11" y1="5" x2="5" y2="11"/>
      </svg>
    `;
  }

  private _renderContractRow(contract: ContractEntry) {
    const statusLabel = t(STATUS_LABEL_KEY[contract.status]);
    const consumerText = t('contractSidebar.consumers', { count: contract.consumers.length });
    const ariaLabel = t('contractSidebar.row.ariaLabel', {
      event: contract.eventName,
      status: statusLabel,
      consumers: contract.consumers.length,
    });

    return html`
      <li role="listitem">
        <div
          class="contract-row"
          role="button"
          tabindex="0"
          aria-label="${ariaLabel}"
          @click=${() => this._handleContractClick(contract)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this._handleContractClick(contract);
            }
          }}
        >
          <span class="status-icon" title="${statusLabel}">
            ${this._renderStatusIcon(contract.status)}
          </span>
          <span class="contract-name">${contract.eventName}</span>
          <div class="contract-meta">
            ${contract.consumers.length > 0
              ? html`<span class="consumer-count">${consumerText}</span>`
              : nothing}
            <sl-badge variant=${STATUS_VARIANT[contract.status]} pill>
              ${statusLabel}
            </sl-badge>
          </div>
        </div>
      </li>
    `;
  }

  private _renderOwnerGroup(owner: string, contracts: ContractEntry[]) {
    const failCount = contracts.filter((c) => c.status === 'fail').length;
    const warnCount = contracts.filter((c) => c.status === 'warn').length;
    const summaryVariant = failCount > 0 ? 'danger' : warnCount > 0 ? 'warning' : 'success';
    const summaryCount = failCount > 0 ? failCount : warnCount > 0 ? warnCount : contracts.length;

    return html`
      <sl-details
        summary="${owner}"
        open
        aria-label="${t('contractSidebar.ownerGroupAriaLabel', { owner, count: contracts.length })}"
      >
        <div slot="summary" class="owner-header">
          <span class="owner-name">${owner}</span>
          <sl-badge variant=${summaryVariant} pill>${summaryCount}</sl-badge>
        </div>
        <ul
          class="contract-list"
          role="list"
          aria-label="${t('contractSidebar.contractListAriaLabel', { owner })}"
        >
          ${contracts.map((c) => this._renderContractRow(c))}
        </ul>
      </sl-details>
    `;
  }

  render() {
    if (this.contracts.length === 0) {
      return html`
        <div class="section-header">${t('contractSidebar.heading')}</div>
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">&#128196;</span>
          <div class="empty-title">${t('contractSidebar.empty.title')}</div>
          <div class="empty-hint">${t('contractSidebar.empty.hint')}</div>
        </div>
      `;
    }

    const grouped = this._groupedByOwner;

    return html`
      <div class="section-header">${t('contractSidebar.heading')}</div>
      ${[...grouped.entries()].map(([owner, contracts]) =>
        this._renderOwnerGroup(owner, contracts)
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'contract-sidebar': ContractSidebar;
  }
}
