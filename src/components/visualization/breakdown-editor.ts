import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../../lib/i18n.js';
import type { WorkItem, WorkItemComplexity, PriorityTier } from '../../schema/types.js';

import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

import '../shared/empty-state.js';

/** A ghost (suggested) work item shown with dashed border before acceptance. */
export interface WorkItemSuggestion {
  id: string;
  title: string;
  description: string;
  complexity: WorkItemComplexity;
  linkedEvents: string[];
}

const COMPLEXITY_VARIANT: Record<WorkItemComplexity, string> = {
  S: 'success',
  M: 'primary',
  L: 'warning',
  XL: 'danger',
};

const COMPLEXITY_OPTIONS: WorkItemComplexity[] = ['S', 'M', 'L', 'XL'];

function generateId(): string {
  return `wi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const CRITERIA_TEMPLATES = {
  o11y: [
    'Metrics, logs, and traces added for new behavior',
    'Dashboard updated for new events',
    'Alerts configured for critical paths',
  ],
  a11y: [
    'Keyboard navigable with visible focus indicators',
    'Screen reader announcements for dynamic content (aria-live)',
    'Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text',
  ],
  security: [
    'Input validated server-side',
    'No sensitive data in logs or traces',
    'Least-privilege authorization enforced',
  ],
  i18n: [
    'All user-facing strings extracted to i18n resource bundle',
    'UI handles text expansion (German-style 30% longer strings)',
    'Date/time formatted with Intl API, stored as UTC',
  ],
} as const;

/**
 * Numeric rank for each priority tier — lower number = higher priority.
 * Events with no assigned tier get rank 4 (lowest).
 */
const TIER_RANK: Record<PriorityTier, number> = {
  must_have: 0,
  should_have: 1,
  could_have: 2,
  wont_have: 3,
};

/**
 * Add a criterion text to a work item's acceptanceCriteria array.
 * Returns a new WorkItem — does not mutate the original.
 * Trims whitespace; returns the original item unchanged if text is empty.
 */
export function addCriterion(item: WorkItem, text: string): WorkItem {
  const trimmed = text.trim();
  if (!trimmed) return item;
  return { ...item, acceptanceCriteria: [...item.acceptanceCriteria, trimmed] };
}

/**
 * Remove the criterion at `idx` from a work item's acceptanceCriteria array.
 * Returns a new WorkItem — does not mutate the original.
 * If `idx` is out of range, returns the original item unchanged.
 */
export function removeCriterion(item: WorkItem, idx: number): WorkItem {
  if (idx < 0 || idx >= item.acceptanceCriteria.length) return item;
  return {
    ...item,
    acceptanceCriteria: item.acceptanceCriteria.filter((_, i) => i !== idx),
  };
}

/**
 * Stable-sort work items by their highest-priority linked event.
 *
 * Ordering: must_have > should_have > could_have > unranked
 * Items within the same effective tier preserve original order.
 *
 * @param items - Work items to sort
 * @param eventTiers - Map from event name to its priority tier
 */
export function sortWorkItemsByPriority(
  items: WorkItem[],
  eventTiers: ReadonlyMap<string, PriorityTier>,
): WorkItem[] {
  const unranked = Object.keys(TIER_RANK).length; // 4 — sentinel for "no tier"

  const rank = (item: WorkItem): number => {
    let best = unranked;
    for (const ev of item.linkedEvents) {
      const tier = eventTiers.get(ev);
      if (tier !== undefined) {
        const r = TIER_RANK[tier];
        if (r < best) best = r;
      }
    }
    return best;
  };

  // Attach original indices for stable sort, then sort, then strip indices.
  return items
    .map((item, idx) => ({ item, idx, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map(({ item }) => item);
}

/**
 * Breakdown Editor — the main Phase IV "Slice" container.
 *
 * Displays work items derived from an aggregate's domain events.
 * Supports inline editing, acceptance criteria, complexity sizing,
 * and ghost suggestions from agents.
 *
 * @fires work-item-created - A new work item was created.
 *   Detail: `{ item: WorkItem }`
 * @fires work-item-updated - An existing work item was updated.
 *   Detail: `{ item: WorkItem }`
 * @fires work-item-deleted - A work item was deleted.
 *   Detail: `{ id: string }`
 * @fires suggestion-accepted - An agent suggestion was accepted.
 *   Detail: `{ id: string; item: WorkItem }`
 * @fires suggestion-dismissed - An agent suggestion was dismissed.
 *   Detail: `{ id: string }`
 */
@customElement('breakdown-editor')
export class BreakdownEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    /* ---- Header ---- */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 0.75rem;
    }

    .header-title {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0;
    }

    /* ---- Empty state ---- */
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
      text-align: center;
      color: var(--sl-color-neutral-500, #6b7280);
      border: 2px dashed var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
    }

    .empty-title {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      margin: 0 0 0.25rem;
      color: var(--sl-color-neutral-600, #4b5563);
    }

    .empty-hint {
      font-size: var(--sl-font-size-small, 0.875rem);
      margin: 0;
    }

    /* ---- Work items list ---- */
    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    /* ---- Work item card ---- */
    .work-item-card {
      background: #fff;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }

    .work-item-card.ghost {
      border-style: dashed;
      border-color: var(--sl-color-violet-300, #c4b5fd);
      background: var(--sl-color-violet-50, #f5f3ff);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem 0;
    }

    .ghost-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sl-color-violet-600, #7c3aed);
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background: var(--sl-color-violet-100, #ede9fe);
      border: 1px solid var(--sl-color-violet-200, #ddd6fe);
    }

    .card-title-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      flex: 1;
    }

    .card-body {
      padding: 0.75rem 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .ghost-body {
      padding: 0.5rem 1rem;
    }

    .ghost-title {
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0 0 0.25rem;
    }

    .ghost-description {
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-600, #4b5563);
      margin: 0;
      line-height: 1.5;
    }

    .ghost-actions {
      display: flex;
      gap: 0.5rem;
      padding: 0 1rem 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }

    /* ---- Field label ---- */
    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--sl-color-neutral-500, #6b7280);
      margin-bottom: 0.25rem;
    }

    /* ---- Complexity badges ---- */
    .complexity-row {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }

    .complexity-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0.25rem 0.625rem;
      border-radius: var(--sl-border-radius-small, 4px);
      border: 2px solid var(--sl-color-neutral-200, #e5e7eb);
      background: #fff;
      cursor: pointer;
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: 700;
      color: var(--sl-color-neutral-600, #4b5563);
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    .complexity-btn:hover {
      border-color: var(--sl-color-primary-400, #60a5fa);
      background: var(--sl-color-primary-50, #eff6ff);
    }

    .complexity-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }

    .complexity-btn.active-S {
      background: #dcfce7;
      border-color: #16a34a;
      color: #166534;
    }

    .complexity-btn.active-M {
      background: #dbeafe;
      border-color: #2563eb;
      color: #1d4ed8;
    }

    .complexity-btn.active-L {
      background: #fef9c3;
      border-color: #ca8a04;
      color: #854d0e;
    }

    .complexity-btn.active-XL {
      background: #fee2e2;
      border-color: #dc2626;
      color: #991b1b;
    }

    /* ---- Acceptance criteria ---- */
    .criteria-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.375rem;
    }

    .criterion-row {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-700, #374151);
    }

    .criterion-bullet {
      flex-shrink: 0;
      width: 0.375rem;
      height: 0.375rem;
      border-radius: 50%;
      background: var(--sl-color-primary-500, #3b82f6);
    }

    .criterion-text {
      flex: 1;
    }

    .criterion-remove {
      flex-shrink: 0;
      min-width: 44px;
      min-height: 44px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      color: var(--sl-color-neutral-400, #9ca3af);
      font-size: 1rem;
      line-height: 1;
    }

    .criterion-remove:hover {
      color: var(--sl-color-danger-600, #dc2626);
      background: var(--sl-color-danger-50, #fef2f2);
    }

    .criterion-remove:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
    }

    .criteria-hint {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      font-style: italic;
    }

    /* ---- Linked events tags ---- */
    .linked-events {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .event-tag {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      background: var(--sl-color-neutral-100, #f3f4f6);
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--sl-color-neutral-600, #4b5563);
      font-family: var(--sl-font-mono, monospace);
    }

    .no-linked-events {
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-400, #9ca3af);
      font-style: italic;
    }

    /* ---- Card actions row ---- */
    .card-actions {
      display: flex;
      justify-content: flex-end;
      padding: 0 1rem 0.75rem;
    }

    /* ---- Keyboard shortcut hint ---- */
    .keyboard-hint {
      font-size: 0.6875rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      margin-top: 0.5rem;
      text-align: right;
    }

    /* ---- Acceptance criteria templates ---- */
    .criteria-templates {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }

    .template-label {
      font-size: 0.6875rem;
      color: var(--sl-color-neutral-500, #6b7280);
      margin-bottom: 0.25rem;
    }

    .template-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1875rem 0.5rem;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      background: var(--sl-color-neutral-50, #f9fafb);
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--sl-color-neutral-600, #4b5563);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .template-btn:hover {
      border-color: var(--sl-color-primary-400, #60a5fa);
      background: var(--sl-color-primary-50, #eff6ff);
      color: var(--sl-color-primary-700, #1d4ed8);
    }

    .template-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }
  `;

  /** Work items currently in the breakdown. */
  @property({ type: Array }) workItems: WorkItem[] = [];
  /** Domain events from the parent aggregate. */
  @property({ type: Array }) events: string[] = [];
  /** Agent-suggested work items shown as ghost cards. */
  @property({ type: Array }) suggestions: WorkItemSuggestion[] = [];
  /**
   * Map from event name to its priority tier.
   * Used to pre-sort work items so higher-priority items appear first.
   */
  @property({ attribute: false }) priorities: ReadonlyMap<string, PriorityTier> = new Map();

  @state() private _newCriterionByItem: Record<string, string> = {};

  // ---- Lifecycle ----

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', this._handleHostKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._handleHostKeydown);
  }

  // ---- Keyboard shortcut: N to add work item ----

  private _handleHostKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    // Don't trigger when user is typing in an input/textarea
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this._addWorkItem();
    }
  };

  // ---- Event emitters ----

  private _emitCreated(item: WorkItem) {
    this.dispatchEvent(new CustomEvent('work-item-created', { bubbles: true, composed: true, detail: { item } }));
  }

  private _emitUpdated(item: WorkItem) {
    this.dispatchEvent(new CustomEvent('work-item-updated', { bubbles: true, composed: true, detail: { item } }));
  }

  private _emitDeleted(id: string) {
    this.dispatchEvent(new CustomEvent('work-item-deleted', { bubbles: true, composed: true, detail: { id } }));
  }

  private _emitSuggestionAccepted(id: string, item: WorkItem) {
    this.dispatchEvent(new CustomEvent('suggestion-accepted', { bubbles: true, composed: true, detail: { id, item } }));
  }

  private _emitSuggestionDismissed(id: string) {
    this.dispatchEvent(new CustomEvent('suggestion-dismissed', { bubbles: true, composed: true, detail: { id } }));
  }

  // ---- Work item CRUD ----

  private _addWorkItem() {
    const item: WorkItem = {
      id: generateId(),
      title: '',
      description: '',
      acceptanceCriteria: [],
      complexity: 'M',
      linkedEvents: [],
      dependencies: [],
    };
    this._emitCreated(item);
  }

  private _updateField(item: WorkItem, field: keyof WorkItem, value: unknown) {
    const updated = { ...item, [field]: value };
    this._emitUpdated(updated as WorkItem);
  }

  private _addCriterion(item: WorkItem) {
    const text = this._newCriterionByItem[item.id] ?? '';
    const updated = addCriterion(item, text);
    if (updated === item) return; // nothing to add (empty text)
    this._emitUpdated(updated);
    this._newCriterionByItem = { ...this._newCriterionByItem, [item.id]: '' };
  }

  private _removeCriterion(item: WorkItem, idx: number) {
    const updated = removeCriterion(item, idx);
    if (updated === item) return; // idx out of range
    this._emitUpdated(updated);
  }

  private _addCriteriaTemplate(item: WorkItem, templateKey: 'o11y' | 'a11y' | 'security' | 'i18n') {
    let updated = item;
    for (const criterion of CRITERIA_TEMPLATES[templateKey]) {
      updated = addCriterion(updated, criterion);
    }
    if (updated !== item) {
      this._emitUpdated(updated);
    }
  }

  private _acceptSuggestion(suggestion: WorkItemSuggestion) {
    const item: WorkItem = {
      id: generateId(),
      title: suggestion.title,
      description: suggestion.description,
      acceptanceCriteria: [],
      complexity: suggestion.complexity,
      linkedEvents: suggestion.linkedEvents,
      dependencies: [],
    };
    this._emitSuggestionAccepted(suggestion.id, item);
  }

  // ---- Render helpers ----

  private _renderComplexityButtons(item: WorkItem) {
    return html`
      <div class="complexity-row" role="group" aria-label="${t('breakdownEditor.complexity')}">
        ${COMPLEXITY_OPTIONS.map((c) => {
          const isActive = item.complexity === c;
          const label = t(`breakdownEditor.complexity.${c}`);
          return html`
            <button
              class="complexity-btn ${isActive ? `active-${c}` : ''}"
              aria-label="${label}"
              aria-pressed="${isActive}"
              title="${label}"
              @click=${() => this._updateField(item, 'complexity', c)}
            >${c}</button>
          `;
        })}
      </div>
    `;
  }

  private _renderCriteria(item: WorkItem) {
    const currentInput = this._newCriterionByItem[item.id] ?? '';

    return html`
      <div>
        <div class="field-label">${t('breakdownEditor.acceptanceCriteria')}</div>
        ${item.acceptanceCriteria.length > 0
          ? html`
            <ul class="criteria-list" aria-label="${t('breakdownEditor.acceptanceCriteria')}">
              ${item.acceptanceCriteria.map(
                (crit, idx) => html`
                  <li class="criterion-row">
                    <span class="criterion-bullet" aria-hidden="true"></span>
                    <span class="criterion-text">${crit}</span>
                    <button
                      class="criterion-remove"
                      aria-label="Remove: ${crit}"
                      title="Remove criterion"
                      @click=${() => this._removeCriterion(item, idx)}
                    >&times;</button>
                  </li>
                `
              )}
            </ul>
          `
          : nothing}
        <div class="template-label">${t('breakdownEditor.template.label')}</div>
        <div class="criteria-templates">
          ${(['o11y', 'a11y', 'security', 'i18n'] as const).map((key) => html`
            <button
              class="template-btn"
              title="${t(`breakdownEditor.template.${key}.tooltip`)}"
              aria-label="${t(`breakdownEditor.template.${key}.ariaLabel`)}"
              @click=${() => this._addCriteriaTemplate(item, key)}
            >${t(`breakdownEditor.template.${key}`)}</button>
          `)}
        </div>
        <sl-input
          size="small"
          placeholder="${t('breakdownEditor.acceptanceCriteriaPlaceholder')}"
          value="${currentInput}"
          aria-label="${t('breakdownEditor.acceptanceCriteria')}"
          @sl-input=${(e: Event) => {
            this._newCriterionByItem = {
              ...this._newCriterionByItem,
              [item.id]: (e.target as HTMLInputElement).value,
            };
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              this._addCriterion(item);
            }
          }}
        ></sl-input>
        <p class="criteria-hint">${t('breakdownEditor.acceptanceCriteriaHint')}</p>
      </div>
    `;
  }

  private _renderLinkedEvents(item: WorkItem) {
    return html`
      <div>
        <div class="field-label">${t('breakdownEditor.linkedEvents')}</div>
        ${item.linkedEvents.length > 0
          ? html`
            <div class="linked-events">
              ${item.linkedEvents.map((ev) => html`<span class="event-tag">${ev}</span>`)}
            </div>
          `
          : html`<span class="no-linked-events">${t('breakdownEditor.noLinkedEvents')}</span>`}
      </div>
    `;
  }

  private _renderWorkItemCard(item: WorkItem) {
    const ariaLabel = t('breakdownEditor.workItemCard.ariaLabel', {
      title: item.title || 'Untitled',
      complexity: item.complexity,
    });

    return html`
      <article
        class="work-item-card"
        aria-label="${ariaLabel}"
      >
        <div class="card-header">
          <div class="card-title-row">
            <sl-badge variant="${COMPLEXITY_VARIANT[item.complexity]}" pill>${item.complexity}</sl-badge>
          </div>
          <sl-tooltip content="${t('breakdownEditor.deleteWorkItemAriaLabel', { title: item.title || 'work item' })}">
            <sl-icon-button
              name="trash"
              label="${t('breakdownEditor.deleteWorkItemAriaLabel', { title: item.title || 'work item' })}"
              @click=${() => this._emitDeleted(item.id)}
            ></sl-icon-button>
          </sl-tooltip>
        </div>

        <div class="card-body">
          <!-- Title -->
          <sl-input
            size="small"
            placeholder="${t('breakdownEditor.workItemTitlePlaceholder')}"
            value="${item.title}"
            aria-label="${t('breakdownEditor.workItemTitle')}"
            @sl-change=${(e: Event) => this._updateField(item, 'title', (e.target as HTMLInputElement).value)}
          ></sl-input>

          <!-- Description -->
          <sl-textarea
            size="small"
            rows="2"
            resize="auto"
            placeholder="${t('breakdownEditor.workItemDescriptionPlaceholder')}"
            value="${item.description}"
            aria-label="${t('breakdownEditor.workItemDescription')}"
            @sl-change=${(e: Event) => this._updateField(item, 'description', (e.target as HTMLTextAreaElement).value)}
          ></sl-textarea>

          <!-- Complexity -->
          <div>
            <div class="field-label">${t('breakdownEditor.complexity')}</div>
            ${this._renderComplexityButtons(item)}
          </div>

          <!-- Acceptance Criteria -->
          ${this._renderCriteria(item)}

          <!-- Linked Events -->
          ${this._renderLinkedEvents(item)}
        </div>
      </article>
    `;
  }

  private _renderGhostCard(suggestion: WorkItemSuggestion) {
    return html`
      <article
        class="work-item-card ghost"
        aria-label="${t('breakdownEditor.ghostCard.label')}: ${suggestion.title}"
      >
        <div class="card-header">
          <span class="ghost-label">${t('breakdownEditor.ghostCard.label')}</span>
          <sl-badge variant="${COMPLEXITY_VARIANT[suggestion.complexity]}" pill>${suggestion.complexity}</sl-badge>
        </div>
        <div class="ghost-body">
          <p class="ghost-title">${suggestion.title}</p>
          ${suggestion.description
            ? html`<p class="ghost-description">${suggestion.description}</p>`
            : nothing}
          ${suggestion.linkedEvents.length > 0
            ? html`
              <div class="linked-events" style="margin-top: 0.375rem;">
                ${suggestion.linkedEvents.map((ev) => html`<span class="event-tag">${ev}</span>`)}
              </div>
            `
            : nothing}
        </div>
        <div class="ghost-actions">
          <sl-button
            size="small"
            variant="primary"
            aria-label="${t('breakdownEditor.ghostCard.acceptAriaLabel', { title: suggestion.title })}"
            @click=${() => this._acceptSuggestion(suggestion)}
          >${t('breakdownEditor.ghostCard.accept')}</sl-button>
          <sl-button
            size="small"
            variant="text"
            aria-label="${t('breakdownEditor.ghostCard.dismissAriaLabel', { title: suggestion.title })}"
            @click=${() => this._emitSuggestionDismissed(suggestion.id)}
          >${t('breakdownEditor.ghostCard.dismiss')}</sl-button>
        </div>
      </article>
    `;
  }

  override render() {
    const hasItems = this.workItems.length > 0 || this.suggestions.length > 0;
    const sortedItems = sortWorkItemsByPriority(this.workItems, this.priorities);

    return html`
      <div>
        <!-- Header -->
        <div class="header">
          <h3 class="header-title">${t('breakdownEditor.title')}</h3>
          <sl-tooltip content="${t('breakdownEditor.addWorkItemAriaLabel')}">
            <sl-button
              size="small"
              variant="primary"
              aria-label="${t('breakdownEditor.addWorkItemAriaLabel')}"
              @click=${this._addWorkItem}
            >+ ${t('breakdownEditor.addWorkItem')}</sl-button>
          </sl-tooltip>
        </div>

        <!-- Content -->
        ${!hasItems
          ? html`
            <empty-state
              icon="diagram-3"
              heading="${t('emptyState.breakdown.heading')}"
              description="${t('emptyState.breakdown.description')}"
              actionLabel="${t('emptyState.breakdown.action')}"
              @empty-state-action=${this._addWorkItem}
            ></empty-state>
          `
          : html`
            <div class="items-list" role="list" aria-label="${t('breakdownEditor.title')}">
              ${repeat(
                sortedItems,
                (item) => item.id,
                (item) => this._renderWorkItemCard(item)
              )}
              ${this.suggestions.map((s) => this._renderGhostCard(s))}
            </div>
          `}

        <p class="keyboard-hint" aria-hidden="true">Press N to add a work item</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'breakdown-editor': BreakdownEditor;
  }
}
