import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

import './vote-widget.js';
import './suggestion-banner.js';
import '../shared/empty-state.js';

/** Shape of a single ranked domain event. */
export interface RankedEvent {
  name: string;
  aggregate: string;
  confidence: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';
  direction: 'inbound' | 'outbound' | 'internal';
  crossRefs: number;
  compositeScore: number;
  tier: 'must_have' | 'should_have' | 'could_have';
}

/** Agent suggestion shown in the suggestion banner area. */
export interface PrioritySuggestion {
  id: string;
  text: string;
}

type SortKey = 'score' | 'aggregate' | 'confidence' | 'crossRefs';
type TierKey = 'must_have' | 'should_have' | 'could_have';

const TIER_LABELS: Record<TierKey, string> = {
  must_have: 'Must Have',
  should_have: 'Should Have',
  could_have: 'Could Have',
};

const CONFIDENCE_ORDER: Record<string, number> = {
  CONFIRMED: 0,
  LIKELY: 1,
  POSSIBLE: 2,
};

const CONFIDENCE_VARIANT: Record<string, string> = {
  CONFIRMED: 'success',
  LIKELY: 'primary',
  POSSIBLE: 'warning',
};

const DIRECTION_VARIANT: Record<string, string> = {
  outbound: 'danger',
  inbound: 'primary',
  internal: 'neutral',
};

/**
 * Priority View — the main Rank-phase UI.
 *
 * Supports two display modes:
 * - **Board mode** (default): Three-column kanban layout (Must Have / Should Have / Could Have).
 *   Cards are draggable between columns via the HTML Drag and Drop API.
 *   Keyboard users can Tab to a card, Space/Enter to pick it up, and Arrow keys to move it.
 * - **Table mode**: Sortable data table with all events.
 *
 * @fires priority-changed - When a card is moved to a new tier.
 *   Detail: `{ eventName: string; tier: TierKey }`
 * @fires vote-cast - Forwarded from child `<vote-widget>` elements.
 *   Detail: `{ eventName: string; direction: 'up' | 'down' }`
 * @fires suggestion-accepted - Forwarded from `<suggestion-banner>`.
 *   Detail: `{ id: string; text: string }`
 * @fires suggestion-dismissed - Forwarded from `<suggestion-banner>`.
 *   Detail: `{ id: string }`
 */
@customElement('priority-view')
export class PriorityView extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    /* ---- Header ---- */
    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .header-title {
      flex: 1;
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0;
    }

    .mode-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-600, #4b5563);
    }

    /* ---- Announcement region ---- */
    .announce {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
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

    /* ---- Board mode ---- */
    .board {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    @media (max-width: 700px) {
      .board {
        grid-template-columns: 1fr;
      }
    }

    .column {
      border-radius: var(--sl-border-radius-medium, 8px);
      overflow: hidden;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      display: flex;
      flex-direction: column;
      min-height: 12rem;
    }

    .column-header {
      padding: 0.625rem 0.875rem;
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .column.must-have .column-header {
      background: #dcfce7;
      color: #166534;
      border-bottom: 1px solid #bbf7d0;
    }

    .column.should-have .column-header {
      background: #fef9c3;
      color: #854d0e;
      border-bottom: 1px solid #fef08a;
    }

    .column.could-have .column-header {
      background: #f3f4f6;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
    }

    .column-count {
      font-size: 0.75rem;
      font-weight: 400;
      opacity: 0.75;
    }

    .column-cards {
      flex: 1;
      padding: 0.625rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: #fafafa;
      transition: background 0.15s ease, outline 0.15s ease;
    }

    .column-cards.drag-over {
      background: var(--sl-color-primary-50, #eff6ff);
      outline: 2px solid var(--sl-color-primary-400, #60a5fa);
      outline-offset: -2px;
    }

    .column-empty {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      text-align: center;
      padding: 1rem 0.5rem;
      font-style: italic;
    }

    /* ---- Event Card (board mode) ---- */
    .event-card {
      background: #fff;
      border-radius: var(--sl-border-radius-small, 4px);
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      padding: 0.5rem 0.75rem;
      cursor: grab;
      transition: box-shadow 0.15s ease, opacity 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      user-select: none;
    }

    .event-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .event-card:active {
      cursor: grabbing;
    }

    .event-card.dragging {
      opacity: 0.45;
    }

    .event-card:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
    }

    /* Keyboard "picked up" state */
    .event-card.kb-active {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
    }

    .card-name {
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      font-family: var(--sl-font-mono, monospace);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--sl-color-neutral-800, #1f2937);
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      flex-wrap: wrap;
    }

    .score-badge {
      font-size: 0.6875rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      padding: 0.0625rem 0.375rem;
      border-radius: 9999px;
      background: var(--sl-color-neutral-100, #f3f4f6);
      color: var(--sl-color-neutral-600, #4b5563);
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
    }

    .score-badge.high {
      background: #dcfce7;
      color: #166534;
      border-color: #bbf7d0;
    }

    .score-badge.medium {
      background: #fef9c3;
      color: #854d0e;
      border-color: #fef08a;
    }

    .score-badge.low {
      background: #f3f4f6;
      color: #374151;
      border-color: #d1d5db;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* ---- Table mode ---- */
    .table-toolbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .table-toolbar-label {
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-600, #4b5563);
    }

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
      border-bottom: 1px solid var(--sl-color-neutral-200, #e5e7eb);
    }

    th {
      padding: 0.625rem 0.875rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-700, #374151);
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }

    th[tabindex] {
      outline: none;
    }

    th[tabindex]:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: -2px;
    }

    th:hover {
      color: var(--sl-color-primary-700, #1d4ed8);
    }

    th .sort-indicator {
      display: inline-block;
      margin-left: 0.25rem;
      opacity: 0.4;
      font-size: 0.6875rem;
    }

    th[aria-sort="ascending"] .sort-indicator,
    th[aria-sort="descending"] .sort-indicator {
      opacity: 1;
      color: var(--sl-color-primary-600, #2563eb);
    }

    td {
      padding: 0.5rem 0.875rem;
      border-bottom: 1px solid var(--sl-color-neutral-100, #f3f4f6);
      color: var(--sl-color-neutral-700, #374151);
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: var(--sl-color-neutral-50, #f9fafb);
    }

    .td-name {
      font-family: var(--sl-font-mono, monospace);
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
    }

    .tier-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
    }

    .tier-pill.must_have {
      background: #dcfce7;
      color: #166534;
    }

    .tier-pill.should_have {
      background: #fef9c3;
      color: #854d0e;
    }

    .tier-pill.could_have {
      background: #f3f4f6;
      color: #374151;
    }
  `;

  @property({ type: Array }) events: RankedEvent[] = [];
  @property({ type: String }) mode: 'board' | 'table' = 'board';
  @property({ type: Object }) votes: Record<string, { up: string[]; down: string[] }> = {};
  @property({ type: String }) currentParticipant = '';
  @property({ type: Array }) suggestions: PrioritySuggestion[] = [];

  @state() private _sortKey: SortKey = 'score';
  @state() private _sortAsc = false;
  @state() private _draggingName: string | null = null;
  @state() private _dragOverTier: TierKey | null = null;
  @state() private _announcement = '';

  // Keyboard drag state
  @state() private _kbActiveCard: string | null = null;

  // ---- Helper: compute score badge class ----
  private _scoreBadgeClass(score: number): string {
    if (score >= 7) return 'score-badge high';
    if (score >= 4) return 'score-badge medium';
    return 'score-badge low';
  }

  // ---- Helper: events by tier ----
  private _eventsForTier(tier: TierKey): RankedEvent[] {
    return this.events.filter((e) => e.tier === tier);
  }

  // ---- Helper: sort events for table ----
  private _sortedEvents(): RankedEvent[] {
    const sorted = [...this.events].sort((a, b) => {
      let cmp = 0;
      switch (this._sortKey) {
        case 'score':
          cmp = a.compositeScore - b.compositeScore;
          break;
        case 'aggregate':
          cmp = a.aggregate.localeCompare(b.aggregate);
          break;
        case 'confidence':
          cmp = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
          break;
        case 'crossRefs':
          cmp = a.crossRefs - b.crossRefs;
          break;
      }
      return this._sortAsc ? cmp : -cmp;
    });
    return sorted;
  }

  private _onEmptyStateAction() {
    this.dispatchEvent(
      new CustomEvent('suggestion-navigate', {
        detail: { panel: 'cards' },
        bubbles: true,
        composed: true,
      })
    );
  }

  // ---- Mode toggle ----
  private _toggleMode(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this.mode = checked ? 'table' : 'board';
  }

  // ---- Sort ----
  private _setSort(key: SortKey) {
    if (this._sortKey === key) {
      this._sortAsc = !this._sortAsc;
    } else {
      this._sortKey = key;
      this._sortAsc = false;
    }
  }

  private _ariaSortAttr(key: SortKey): string {
    if (this._sortKey !== key) return 'none';
    return this._sortAsc ? 'ascending' : 'descending';
  }

  private _sortIndicator(key: SortKey): string {
    if (this._sortKey !== key) return '↕';
    return this._sortAsc ? '↑' : '↓';
  }

  // ---- Drag and Drop ----
  private _handleDragStart(e: DragEvent, name: string) {
    this._draggingName = name;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', name);
    }
    (e.target as HTMLElement).classList.add('dragging');
  }

  private _handleDragEnd(e: DragEvent) {
    (e.target as HTMLElement).classList.remove('dragging');
    this._draggingName = null;
    this._dragOverTier = null;
  }

  private _handleDragOver(e: DragEvent, tier: TierKey) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this._dragOverTier = tier;
  }

  private _handleDragLeave(_e: DragEvent, tier: TierKey) {
    if (this._dragOverTier === tier) {
      this._dragOverTier = null;
    }
  }

  private _handleDrop(e: DragEvent, tier: TierKey) {
    e.preventDefault();
    const name = this._draggingName ?? e.dataTransfer?.getData('text/plain') ?? '';
    this._dragOverTier = null;
    this._draggingName = null;
    if (!name) return;

    const event = this.events.find((ev) => ev.name === name);
    if (!event || event.tier === tier) return;

    this._emitPriorityChanged(name, tier);
    this._announce(t('priorityView.announce.moved', { name, tier: TIER_LABELS[tier] }));
  }

  // ---- Keyboard card movement ----
  private _handleCardKeydown(e: KeyboardEvent, evName: string, currentTier: TierKey) {
    const TIERS: TierKey[] = ['must_have', 'should_have', 'could_have'];

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this._kbActiveCard === evName) {
        // Drop in place
        this._kbActiveCard = null;
      } else {
        // Pick up
        this._kbActiveCard = evName;
      }
      return;
    }

    if (this._kbActiveCard !== evName) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const idx = TIERS.indexOf(currentTier);
      const nextTier = TIERS[idx + 1];
      if (nextTier) {
        this._emitPriorityChanged(evName, nextTier);
        this._announce(t('priorityView.announce.moved', { name: evName, tier: TIER_LABELS[nextTier] }));
        this._kbActiveCard = null;
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const idx = TIERS.indexOf(currentTier);
      const prevTier = TIERS[idx - 1];
      if (prevTier) {
        this._emitPriorityChanged(evName, prevTier);
        this._announce(t('priorityView.announce.moved', { name: evName, tier: TIER_LABELS[prevTier] }));
        this._kbActiveCard = null;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._kbActiveCard = null;
    }
  }

  private _emitPriorityChanged(eventName: string, tier: TierKey) {
    this.dispatchEvent(
      new CustomEvent('priority-changed', {
        bubbles: true,
        composed: true,
        detail: { eventName, tier },
      })
    );
  }

  private _announce(msg: string) {
    this._announcement = msg;
    // Clear after a moment so re-announcing the same message works
    setTimeout(() => {
      this._announcement = '';
    }, 2000);
  }

  // ---- Render helpers ----
  private _renderVoteWidget(ev: RankedEvent) {
    const voteData = this.votes[ev.name] ?? { up: [], down: [] };
    const currentVote: 'up' | 'down' | null =
      voteData.up.includes(this.currentParticipant)
        ? 'up'
        : voteData.down.includes(this.currentParticipant)
        ? 'down'
        : null;

    return html`
      <vote-widget
        .eventName=${ev.name}
        .upCount=${voteData.up.length}
        .downCount=${voteData.down.length}
        .upVoters=${voteData.up}
        .downVoters=${voteData.down}
        .currentVote=${currentVote}
      ></vote-widget>
    `;
  }

  private _renderCard(ev: RankedEvent) {
    const isKbActive = this._kbActiveCard === ev.name;
    const cardClass = `event-card ${isKbActive ? 'kb-active' : ''}`;
    const ariaLabel = t('priorityView.ariaLabel.card', {
      name: ev.name,
      tier: TIER_LABELS[ev.tier],
      score: String(ev.compositeScore),
    });

    return html`
      <div
        class="${cardClass}"
        draggable="true"
        role="option"
        tabindex="0"
        aria-label="${ariaLabel}"
        aria-grabbed="${isKbActive}"
        title="${t('priorityView.dragHint')}"
        @dragstart=${(e: DragEvent) => this._handleDragStart(e, ev.name)}
        @dragend=${this._handleDragEnd}
        @keydown=${(e: KeyboardEvent) => this._handleCardKeydown(e, ev.name, ev.tier)}
      >
        <div class="card-name">${ev.name}</div>
        <div class="card-meta">
          <sl-badge variant="neutral" pill>${ev.aggregate}</sl-badge>
          <sl-badge variant="${CONFIDENCE_VARIANT[ev.confidence]}" pill>${ev.confidence}</sl-badge>
          <sl-badge variant="${DIRECTION_VARIANT[ev.direction]}" pill>${ev.direction}</sl-badge>
          <span class="${this._scoreBadgeClass(ev.compositeScore)}" aria-label="Score: ${ev.compositeScore.toFixed(1)}">
            <span aria-hidden="true">⚡</span> ${ev.compositeScore.toFixed(1)}
          </span>
        </div>
        <div class="card-footer">
          ${this._renderVoteWidget(ev)}
        </div>
      </div>
    `;
  }

  private _renderColumn(tier: TierKey) {
    const tierEvents = this._eventsForTier(tier);
    const label = t(`priorityView.column.${tier === 'must_have' ? 'mustHave' : tier === 'should_have' ? 'shouldHave' : 'couldHave'}`);
    const colClass = tier.replace('_', '-');
    const isDragOver = this._dragOverTier === tier;
    const colAriaLabel = t('priorityView.ariaLabel.column', {
      tier: label,
      count: String(tierEvents.length),
    });

    return html`
      <div class="column ${colClass}" role="group" aria-label="${colAriaLabel}">
        <div class="column-header">
          ${label}
          <span class="column-count">(${tierEvents.length})</span>
        </div>
        <div
          class="column-cards ${isDragOver ? 'drag-over' : ''}"
          role="listbox"
          aria-label="${label}"
          aria-dropeffect="move"
          @dragover=${(e: DragEvent) => this._handleDragOver(e, tier)}
          @dragleave=${(e: DragEvent) => this._handleDragLeave(e, tier)}
          @drop=${(e: DragEvent) => this._handleDrop(e, tier)}
        >
          ${tierEvents.length === 0
            ? html`<p class="column-empty">${t('priorityView.emptyColumn')}</p>`
            : repeat(tierEvents, (ev) => ev.name, (ev) => this._renderCard(ev))}
        </div>
      </div>
    `;
  }

  private _renderBoard() {
    return html`
      <div
        class="board"
        role="region"
        aria-label="${t('priorityView.ariaLabel.board')}"
      >
        ${this._renderColumn('must_have')}
        ${this._renderColumn('should_have')}
        ${this._renderColumn('could_have')}
      </div>
    `;
  }

  private _renderTable() {
    const events = this._sortedEvents();

    return html`
      <div>
        <div class="table-toolbar">
          <span class="table-toolbar-label">${t('priorityView.sortBy')}:</span>
          <sl-select
            size="small"
            value="${this._sortKey}"
            aria-label="${t('priorityView.sortBy')}"
            @sl-change=${(e: Event) => this._setSort((e.target as HTMLSelectElement).value as SortKey)}
            style="min-width: 160px"
          >
            <sl-option value="score">${t('priorityView.sortBy.score')}</sl-option>
            <sl-option value="aggregate">${t('priorityView.sortBy.aggregate')}</sl-option>
            <sl-option value="confidence">${t('priorityView.sortBy.confidence')}</sl-option>
            <sl-option value="crossRefs">${t('priorityView.sortBy.crossRefs')}</sl-option>
          </sl-select>
        </div>

        <div class="table-wrapper">
          <table
            role="grid"
            aria-label="${t('priorityView.ariaLabel.table')}"
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  tabindex="0"
                  aria-sort="${this._ariaSortAttr('score')}"
                  @click=${() => this._setSort('score')}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._setSort('score'); } }}
                >
                  ${t('priorityView.col.name')}
                  <span class="sort-indicator" aria-hidden="true">${this._sortIndicator('score')}</span>
                </th>
                <th
                  scope="col"
                  tabindex="0"
                  aria-sort="${this._ariaSortAttr('aggregate')}"
                  @click=${() => this._setSort('aggregate')}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._setSort('aggregate'); } }}
                >
                  ${t('priorityView.col.aggregate')}
                  <span class="sort-indicator" aria-hidden="true">${this._sortIndicator('aggregate')}</span>
                </th>
                <th
                  scope="col"
                  tabindex="0"
                  aria-sort="${this._ariaSortAttr('confidence')}"
                  @click=${() => this._setSort('confidence')}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._setSort('confidence'); } }}
                >
                  ${t('priorityView.col.confidence')}
                  <span class="sort-indicator" aria-hidden="true">${this._sortIndicator('confidence')}</span>
                </th>
                <th scope="col">${t('priorityView.col.direction')}</th>
                <th
                  scope="col"
                  tabindex="0"
                  aria-sort="${this._ariaSortAttr('crossRefs')}"
                  @click=${() => this._setSort('crossRefs')}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._setSort('crossRefs'); } }}
                >
                  ${t('priorityView.col.crossRefs')}
                  <span class="sort-indicator" aria-hidden="true">${this._sortIndicator('crossRefs')}</span>
                </th>
                <th scope="col">${t('priorityView.col.score')}</th>
                <th scope="col">${t('priorityView.col.tier')}</th>
                <th scope="col">Votes</th>
              </tr>
            </thead>
            <tbody>
              ${repeat(events, (ev) => ev.name, (ev) => html`
                <tr>
                  <td class="td-name">${ev.name}</td>
                  <td><sl-badge variant="neutral" pill>${ev.aggregate}</sl-badge></td>
                  <td><sl-badge variant="${CONFIDENCE_VARIANT[ev.confidence]}" pill>${ev.confidence}</sl-badge></td>
                  <td><sl-badge variant="${DIRECTION_VARIANT[ev.direction]}" pill>${ev.direction}</sl-badge></td>
                  <td>${ev.crossRefs}</td>
                  <td>
                    <span class="${this._scoreBadgeClass(ev.compositeScore)}">
                      ${ev.compositeScore.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <span class="tier-pill ${ev.tier}">
                      ${TIER_LABELS[ev.tier]}
                    </span>
                  </td>
                  <td>${this._renderVoteWidget(ev)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  override render() {
    const isTableMode = this.mode === 'table';

    return html`
      <!-- Accessibility announcement region for keyboard D&D -->
      <div class="announce" role="status" aria-live="polite" aria-atomic="true">
        ${this._announcement}
      </div>

      <!-- Suggestion banners -->
      ${this.suggestions.length > 0
        ? this.suggestions.map(
            (s) => html`
              <suggestion-banner
                .text=${s.text}
                .suggestionId=${s.id}
                @suggestion-accepted=${(e: CustomEvent) => this.dispatchEvent(new CustomEvent('suggestion-accepted', { bubbles: true, composed: true, detail: e.detail }))}
                @suggestion-dismissed=${(e: CustomEvent) => this.dispatchEvent(new CustomEvent('suggestion-dismissed', { bubbles: true, composed: true, detail: e.detail }))}
              ></suggestion-banner>
            `
          )
        : nothing}

      <!-- Header -->
      <div class="header">
        <h2 class="header-title">
          ${isTableMode ? t('priorityView.tableMode') : t('priorityView.boardMode')} View
        </h2>
        <label class="mode-toggle">
          <span>${t('priorityView.boardMode')}</span>
          <sl-switch
            ?checked=${isTableMode}
            aria-label="${t('priorityView.modeToggleAriaLabel')}"
            @sl-change=${this._toggleMode}
          ></sl-switch>
          <span>${t('priorityView.tableMode')}</span>
        </label>
      </div>

      <!-- Content -->
      ${this.events.length === 0
        ? html`
            <empty-state
              icon="sort-up"
              heading="${t('emptyState.priority.heading')}"
              description="${t('emptyState.priority.description')}"
              actionLabel="${t('emptyState.priority.action')}"
              @empty-state-action=${this._onEmptyStateAction}
            ></empty-state>
          `
        : isTableMode
        ? this._renderTable()
        : this._renderBoard()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'priority-view': PriorityView;
  }
}
