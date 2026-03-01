import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LoadedFile, DomainEvent, BoundaryAssumption } from '../../schema/types.js';
import type { Overlap } from '../../lib/comparison.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';

/** Finds the first event matching `name` within a loaded file */
function findEvent(file: LoadedFile, name: string): DomainEvent | undefined {
  return file.data.domain_events.find((e) => e.name === name);
}

/** Finds the first assumption matching `id` within a loaded file */
function findAssumption(file: LoadedFile, id: string): BoundaryAssumption | undefined {
  return file.data.boundary_assumptions.find((a) => a.id === id);
}

const ASSUMPTION_TYPE_VARIANT: Record<string, string> = {
  ownership: 'primary',
  contract: 'warning',
  ordering: 'neutral',
  existence: 'success',
};

@customElement('conflict-card')
export class ConflictCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      border-radius: 8px;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid #e5e7eb;
    }

    /* same-name: amber */
    .card.same-name {
      border-left: 3px solid #f59e0b;
      background: #fffbeb;
    }

    /* same-aggregate: blue */
    .card.same-aggregate {
      border-left: 3px solid #3b82f6;
      background: #eff6ff;
    }

    /* assumption-conflict: rose */
    .card.assumption-conflict {
      border-left: 3px solid #e11d48;
      background: #fff1f2;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .label {
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--sl-font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .badges {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .badges sl-badge::part(base) {
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
    }

    /* Side-by-side comparison grid */
    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .role-column {
      min-width: 0;
    }

    .role-header {
      font-weight: 700;
      font-size: 0.8125rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .role-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .role-dot.left {
      background: #6366f1;
    }

    .role-dot.right {
      background: #14b8a6;
    }

    .field-row {
      font-size: 12px;
      line-height: 1.6;
      padding: 0.125rem 0.25rem;
      border-radius: 4px;
    }

    .field-row strong {
      color: #4b5563;
    }

    .field-row .mono {
      font-family: var(--sl-font-mono);
    }

    .diff-left {
      background: #fff1f2;
    }

    .diff-right {
      background: #ecfdf5;
    }

    .payload-list {
      margin: 0.25rem 0 0 0;
      padding-left: 1rem;
      font-size: 12px;
      font-family: var(--sl-font-mono);
      line-height: 1.6;
    }

    .payload-item {
      padding: 0.0625rem 0.25rem;
      border-radius: 3px;
    }

    .aggregate-info {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
    }

    .aggregate-info strong {
      color: #4b5563;
    }

    .assumption-statement {
      font-size: 12px;
      color: #374151;
      line-height: 1.5;
      margin: 0.375rem 0;
      padding-left: 0.5rem;
      border-left: 2px solid #e5e7eb;
    }

    .affected-events {
      font-size: 11px;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .affected-events .mono {
      font-family: var(--sl-font-mono);
    }

    .verify-with {
      font-size: 11px;
      color: #6b7280;
      font-style: italic;
      margin-top: 0.125rem;
    }
  `;

  @property({ attribute: false }) overlap!: Overlap;
  @property({ attribute: false }) files: LoadedFile[] = [];

  render() {
    const o = this.overlap;
    const kindLabel = o.kind === 'same-name' ? t('conflictCard.kind.sharedEvent') : o.kind === 'same-aggregate' ? t('conflictCard.kind.sharedAggregate') : t('conflictCard.kind.assumptionConflict');
    return html`
      <article class="card ${o.kind}" aria-label="${kindLabel}: ${o.label}">
        <div class="header">
          <span class="label">${o.label}</span>
          <div class="badges">${this._renderBadge()}</div>
        </div>
        ${this._renderBody()}
      </article>
    `;
  }

  private _renderBadge() {
    switch (this.overlap.kind) {
      case 'same-name':
        return html`<sl-badge variant="warning" pill>${t('conflictCard.kind.sharedEvent')}</sl-badge>`;
      case 'same-aggregate':
        return html`<sl-badge variant="primary" pill>${t('conflictCard.kind.sharedAggregate')}</sl-badge>`;
      case 'assumption-conflict':
        return html`<sl-badge variant="danger" pill>${t('conflictCard.kind.assumptionConflict')}</sl-badge>`;
    }
  }

  private _renderBody() {
    switch (this.overlap.kind) {
      case 'same-name':
        return this._renderSameNameBody();
      case 'same-aggregate':
        return this._renderSameAggregateBody();
      case 'assumption-conflict':
        return this._renderAssumptionConflictBody();
    }
  }

  // --------------- same-name ---------------

  private _renderSameNameBody() {
    const eventName = this.overlap.label;
    const roles = this.overlap.roles;

    // Find the file + event for each role
    const pairs: { role: string; event: DomainEvent | undefined }[] = roles.map((role) => {
      const file = this.files.find((f) => f.role === role);
      return { role, event: file ? findEvent(file, eventName) : undefined };
    });

    // Take at most two for side-by-side
    const left = pairs[0];
    const right = pairs[1];

    if (!left?.event || !right?.event) {
      return html`<div class="aggregate-info">${this.overlap.details}</div>`;
    }

    const le = left.event;
    const re = right.event;
    const aggDiffers = le.aggregate !== re.aggregate;
    const triggerDiffers = le.trigger !== re.trigger;
    const stateDiffers = (le.state_change ?? '') !== (re.state_change ?? '');
    const channelDiffers = (le.integration.channel ?? '') !== (re.integration.channel ?? '');

    const leftFields = new Set(le.payload.map((p) => `${p.field}:${p.type}`));
    const rightFields = new Set(re.payload.map((p) => `${p.field}:${p.type}`));

    return html`
      <div class="comparison" role="table" aria-label="${t('conflictCard.comparisonAriaLabel', { name: eventName })}">
        <div class="role-column" role="columnheader">
          <div class="role-header"><span class="role-dot left" aria-hidden="true"></span>${left.role}</div>
          ${this._renderEventFields(le, aggDiffers, triggerDiffers, stateDiffers, channelDiffers, 'left')}
          ${this._renderPayloadColumn(le, rightFields, 'left')}
        </div>
        <div class="role-column" role="columnheader">
          <div class="role-header"><span class="role-dot right" aria-hidden="true"></span>${right.role}</div>
          ${this._renderEventFields(re, aggDiffers, triggerDiffers, stateDiffers, channelDiffers, 'right')}
          ${this._renderPayloadColumn(re, leftFields, 'right')}
        </div>
      </div>
    `;
  }

  private _renderEventFields(
    e: DomainEvent,
    aggDiff: boolean,
    trigDiff: boolean,
    stateDiff: boolean,
    chanDiff: boolean,
    side: 'left' | 'right',
  ) {
    const diffClass = side === 'left' ? 'diff-left' : 'diff-right';
    return html`
      <div class="field-row ${aggDiff ? diffClass : ''}">
        <strong>${t('conflictCard.aggregate')}</strong> <span class="mono">${e.aggregate}</span>
      </div>
      <div class="field-row ${trigDiff ? diffClass : ''}">
        <strong>${t('conflictCard.trigger')}</strong> ${e.trigger}
      </div>
      ${e.state_change
        ? html`<div class="field-row ${stateDiff ? diffClass : ''}">
            <strong>${t('conflictCard.state')}</strong> ${e.state_change}
          </div>`
        : stateDiff
          ? html`<div class="field-row ${diffClass}"><strong>${t('conflictCard.state')}</strong> <em>${t('conflictCard.none')}</em></div>`
          : nothing}
      ${e.integration.channel
        ? html`<div class="field-row ${chanDiff ? diffClass : ''}">
            <strong>${t('conflictCard.channel')}</strong> ${e.integration.channel}
          </div>`
        : chanDiff
          ? html`<div class="field-row ${diffClass}"><strong>${t('conflictCard.channel')}</strong> <em>${t('conflictCard.none')}</em></div>`
          : nothing}
    `;
  }

  private _renderPayloadColumn(
    e: DomainEvent,
    otherFields: Set<string>,
    side: 'left' | 'right',
  ) {
    if (e.payload.length === 0) return nothing;
    const diffClass = side === 'left' ? 'diff-left' : 'diff-right';
    return html`
      <div class="field-row"><strong>${t('conflictCard.payload')}</strong></div>
      <ul class="payload-list">
        ${e.payload.map((p) => {
          const key = `${p.field}:${p.type}`;
          const unique = !otherFields.has(key);
          return html`<li class="payload-item ${unique ? diffClass : ''}">${p.field}: ${p.type}</li>`;
        })}
      </ul>
    `;
  }

  // --------------- same-aggregate ---------------

  private _renderSameAggregateBody() {
    const aggName = this.overlap.label;
    const roles = this.overlap.roles;

    const roleInfo = roles.map((role) => {
      const file = this.files.find((f) => f.role === role);
      const count = file
        ? file.data.domain_events.filter((e) => e.aggregate === aggName).length
        : 0;
      return { role, count };
    });

    return html`
      <div class="aggregate-info">
        ${roleInfo.map(
          (r) =>
            html`<div><strong>${r.role}:</strong> ${r.count} event${r.count !== 1 ? 's' : ''}</div>`
        )}
      </div>
    `;
  }

  // --------------- assumption-conflict ---------------

  private _renderAssumptionConflictBody() {
    // Label format: "BA-1 vs BA-2"
    const parts = this.overlap.label.split(' vs ');
    const leftId = parts[0]?.trim();
    const rightId = parts[1]?.trim();
    const roles = this.overlap.roles;

    const leftFile = this.files.find((f) => f.role === roles[0]);
    const rightFile = this.files.find((f) => f.role === roles[1]);

    const leftAssumption = leftFile && leftId ? findAssumption(leftFile, leftId) : undefined;
    const rightAssumption = rightFile && rightId ? findAssumption(rightFile, rightId) : undefined;

    if (!leftAssumption || !rightAssumption) {
      return html`<div class="aggregate-info">${this.overlap.details}</div>`;
    }

    return html`
      <div class="comparison" role="table" aria-label="${t('conflictCard.conflictingAssumptionsAriaLabel', { leftId, rightId })}">
        <div class="role-column" role="columnheader">
          <div class="role-header"><span class="role-dot left" aria-hidden="true"></span>${roles[0]}</div>
          ${this._renderAssumptionDetail(leftAssumption)}
        </div>
        <div class="role-column" role="columnheader">
          <div class="role-header"><span class="role-dot right" aria-hidden="true"></span>${roles[1]}</div>
          ${this._renderAssumptionDetail(rightAssumption)}
        </div>
      </div>
    `;
  }

  private _renderAssumptionDetail(a: BoundaryAssumption) {
    const variant = ASSUMPTION_TYPE_VARIANT[a.type] ?? 'neutral';
    return html`
      <div class="field-row">
        <sl-badge variant=${variant} pill>${a.type}</sl-badge>
      </div>
      <div class="assumption-statement">${a.statement}</div>
      <div class="affected-events">
        <strong>${t('conflictCard.affects')}</strong>
        ${a.affects_events.map(
          (e, i) =>
            html`<span class="mono">${e}</span>${i < a.affects_events.length - 1 ? ', ' : ''}`
        )}
      </div>
      <div class="verify-with">${t('conflictCard.verifyWith')} ${a.verify_with}</div>
    `;
  }
}
