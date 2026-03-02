import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { CandidateEventsFile, DomainEvent } from '../../schema/types.js';
import { suggestEventsHeuristic } from '../../lib/event-suggestions.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';

/** A single row in the spark canvas representing one domain event candidate. */
export interface SparkRow {
  eventName: string;
  aggregate: string;
  trigger: string;
}

/** A suggested event from the AI Assist dialog with selection state. */
type AiSuggestion = DomainEvent & { selected: boolean };

const TEMPLATES: Record<string, SparkRow[]> = {
  ecommerce: [
    { eventName: 'OrderPlaced', aggregate: 'Order', trigger: 'Customer submits cart' },
    { eventName: 'PaymentProcessed', aggregate: 'Payment', trigger: 'OrderPlaced' },
    { eventName: 'InventoryReserved', aggregate: 'Inventory', trigger: 'OrderPlaced' },
    { eventName: 'OrderShipped', aggregate: 'Shipment', trigger: 'Warehouse confirms pickup' },
    { eventName: 'OrderDelivered', aggregate: 'Shipment', trigger: 'Carrier confirms delivery' },
  ],
  auth: [
    { eventName: 'UserRegistered', aggregate: 'User', trigger: 'User submits registration form' },
    { eventName: 'EmailVerified', aggregate: 'User', trigger: 'User clicks verification link' },
    { eventName: 'UserLoggedIn', aggregate: 'Session', trigger: 'User submits credentials' },
    { eventName: 'PasswordResetRequested', aggregate: 'User', trigger: 'User requests reset' },
    { eventName: 'PasswordReset', aggregate: 'User', trigger: 'PasswordResetRequested' },
    { eventName: 'UserLoggedOut', aggregate: 'Session', trigger: 'User clicks logout' },
  ],
  payment: [
    { eventName: 'PaymentInitiated', aggregate: 'Payment', trigger: 'Checkout confirmed' },
    { eventName: 'PaymentAuthorized', aggregate: 'Payment', trigger: 'PaymentInitiated' },
    { eventName: 'PaymentCaptured', aggregate: 'Payment', trigger: 'Order fulfillment starts' },
    { eventName: 'PaymentFailed', aggregate: 'Payment', trigger: 'Authorization rejected' },
    { eventName: 'RefundRequested', aggregate: 'Refund', trigger: 'Customer requests refund' },
    { eventName: 'RefundProcessed', aggregate: 'Refund', trigger: 'RefundRequested' },
  ],
  subscription: [
    { eventName: 'SubscriptionCreated', aggregate: 'Subscription', trigger: 'User selects plan' },
    { eventName: 'TrialStarted', aggregate: 'Subscription', trigger: 'SubscriptionCreated' },
    { eventName: 'TrialEnded', aggregate: 'Subscription', trigger: 'Trial period expires' },
    { eventName: 'SubscriptionActivated', aggregate: 'Subscription', trigger: 'Payment processed' },
    { eventName: 'SubscriptionRenewed', aggregate: 'Subscription', trigger: 'Renewal date reached' },
    { eventName: 'SubscriptionCancelled', aggregate: 'Subscription', trigger: 'User cancels' },
    { eventName: 'SubscriptionExpired', aggregate: 'Subscription', trigger: 'SubscriptionCancelled' },
  ],
};

function makeEmptyRow(): SparkRow {
  return { eventName: '', aggregate: '', trigger: '' };
}

/**
 * Spark Canvas — a spreadsheet-style editor for capturing domain event candidates.
 * Shown in the main area when a session has no artifacts yet.
 *
 * When collapsed, it renders as a compact "Add more events" bar.
 *
 * @fires spark-submit — Fired when the user submits their events.
 *   Detail: `{ rows: SparkRow[], candidateEvents: CandidateEventsFile }`
 */
@customElement('spark-canvas')
export class SparkCanvas extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    /* ── Collapsed bar ── */
    .collapsed-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--sl-color-neutral-50);
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      cursor: pointer;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .collapsed-bar:hover,
    .collapsed-bar:focus-visible {
      background: var(--sl-color-primary-50);
      border-color: var(--sl-color-primary-300);
      color: var(--sl-color-primary-700);
    }

    .collapsed-bar:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .collapsed-bar sl-icon {
      font-size: 1rem;
      flex-shrink: 0;
    }

    /* ── Canvas container ── */
    .canvas {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-large);
      background: var(--sl-color-neutral-0);
      overflow: hidden;
    }

    /* ── Canvas header ── */
    .canvas-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
      flex-wrap: wrap;
    }

    .canvas-title {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      flex: 1;
      margin: 0;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .view-toggle {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      border: 1px solid var(--sl-color-neutral-300);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
      background: var(--sl-color-neutral-0);
    }

    .view-btn {
      padding: 0.3rem 0.6rem;
      border: none;
      background: transparent;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .view-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: -2px;
    }

    .view-btn.active {
      background: var(--sl-color-primary-600);
      color: var(--sl-color-neutral-0);
      font-weight: var(--sl-font-weight-semibold);
    }

    /* ── Grid ── */
    .grid-wrapper {
      overflow-x: auto;
      padding: 0;
    }

    .grid {
      width: 100%;
      border-collapse: collapse;
    }

    .grid thead th {
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
      white-space: nowrap;
    }

    .grid tbody tr {
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .grid tbody tr:last-child {
      border-bottom: none;
    }

    .grid tbody tr:hover {
      background: var(--sl-color-neutral-50);
    }

    .grid tbody td {
      padding: 0;
    }

    .cell-input {
      width: 100%;
      min-width: 140px;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      font-size: var(--sl-font-size-small);
      font-family: var(--sl-font-sans);
      color: var(--sl-color-neutral-800);
      outline: none;
      box-sizing: border-box;
      transition: background 0.1s ease;
    }

    .cell-input:focus {
      background: var(--sl-color-primary-50);
      outline: 2px solid var(--sl-color-primary-400);
      outline-offset: -2px;
    }

    /* Placeholder row */
    .cell-input.placeholder-input {
      color: var(--sl-color-neutral-400);
      font-style: italic;
    }

    .cell-input.placeholder-input::placeholder {
      color: var(--sl-color-neutral-400);
    }

    .row-num {
      padding: 0.5rem 0.5rem 0.5rem 0.75rem;
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      text-align: center;
      width: 2rem;
      user-select: none;
    }

    .row-delete-btn {
      display: none;
      align-items: center;
      justify-content: center;
      min-width: 2.75rem;
      min-height: 2.75rem;
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--sl-color-neutral-400);
      border-radius: var(--sl-border-radius-small);
      padding: 0;
      transition: color 0.15s ease, background 0.15s ease;
    }

    .grid tbody tr:hover .row-delete-btn {
      display: flex;
    }

    .row-delete-btn:hover,
    .row-delete-btn:focus-visible {
      color: var(--sl-color-danger-600);
      background: var(--sl-color-danger-50);
    }

    .row-delete-btn:focus-visible {
      outline: 2px solid var(--sl-color-danger-500);
      outline-offset: 2px;
    }

    /* ── YAML view ── */
    .yaml-wrapper {
      padding: 1rem;
    }

    .yaml-editor {
      width: 100%;
      min-height: 200px;
      padding: 0.75rem;
      border: 1px solid var(--sl-color-neutral-300);
      border-radius: var(--sl-border-radius-medium);
      font-family: var(--sl-font-mono);
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-800);
      background: var(--sl-color-neutral-50);
      resize: vertical;
      outline: none;
      box-sizing: border-box;
      line-height: 1.5;
    }

    .yaml-editor:focus {
      border-color: var(--sl-color-primary-500);
      outline: none;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
    }

    .yaml-status {
      margin-top: 0.5rem;
      font-size: var(--sl-font-size-x-small);
    }

    .yaml-status.valid {
      color: var(--sl-color-success-600);
    }

    .yaml-status.invalid {
      color: var(--sl-color-danger-600);
    }

    /* ── Canvas footer / actions ── */
    .canvas-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--sl-color-neutral-200);
      background: var(--sl-color-neutral-50);
      flex-wrap: wrap;
    }

    .canvas-footer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .row-count-badge {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    /* Shoelace select sizing */
    sl-select::part(combobox) {
      min-height: 2rem;
    }

    /* ── AI Assist dialog content ── */
    .ai-dialog-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .ai-generate-row {
      display: flex;
      align-items: flex-end;
      gap: 0.75rem;
    }

    .ai-generate-row sl-textarea {
      flex: 1;
    }

    .ai-suggestions-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ai-suggestions-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    .ai-suggestions-count {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      font-weight: var(--sl-font-weight-semibold);
    }

    .ai-suggestions-controls {
      display: flex;
      gap: 0.5rem;
    }

    .ai-suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      max-height: 320px;
      overflow-y: auto;
    }

    .ai-suggestion-row {
      display: flex;
      align-items: flex-start;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      background: var(--sl-color-neutral-0);
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .ai-suggestion-row:hover {
      background: var(--sl-color-neutral-50);
      border-color: var(--sl-color-neutral-300);
    }

    .ai-suggestion-row.selected {
      background: var(--sl-color-primary-50);
      border-color: var(--sl-color-primary-300);
    }

    .ai-suggestion-label {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .ai-suggestion-name {
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
    }

    .ai-suggestion-trigger {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-600);
    }

    .ai-suggestion-aggregate {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    .ai-no-results {
      padding: 1rem;
      text-align: center;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      border: 1px dashed var(--sl-color-neutral-300);
      border-radius: var(--sl-border-radius-medium);
    }
  `;

  /** Current session code (empty for solo mode). */
  @property({ type: String, attribute: 'session-code' }) sessionCode = '';

  /** When true, shows as a compact "Add more events" bar. */
  @property({ type: Boolean }) collapsed = false;

  @state() private _rows: SparkRow[] = [makeEmptyRow()];
  @state() private _selectedTemplate = 'blank';
  @state() private _viewMode: 'canvas' | 'yaml' = 'canvas';
  @state() private _yamlText = '';
  @state() private _yamlError = '';

  // AI Assist dialog state
  @state() private _aiDialogOpen = false;
  @state() private _aiDescription = '';
  @state() private _aiSuggestions: AiSuggestion[] = [];

  private _rowsToYaml(rows: SparkRow[]): string {
    const nonEmpty = rows.filter((r) => r.eventName.trim());
    if (nonEmpty.length === 0) return '';
    const lines = nonEmpty.map((r) => [
      `  - name: ${r.eventName}`,
      `    aggregate: ${r.aggregate || '(unknown)'}`,
      `    trigger: ${r.trigger || '(unknown)'}`,
    ].join('\n'));
    return `domain_events:\n${lines.join('\n')}`;
  }

  private _yamlToRows(yaml: string): SparkRow[] | null {
    // Very simple parser: extract name/aggregate/trigger from YAML blocks
    try {
      const rows: SparkRow[] = [];
      const entryPattern = /- name:\s*(.+?)[\n\r]+\s+aggregate:\s*(.+?)[\n\r]+\s+trigger:\s*(.+?)(?=[\n\r]|$)/gs;
      let match;
      while ((match = entryPattern.exec(yaml)) !== null) {
        rows.push({
          eventName: match[1].trim(),
          aggregate: match[2].trim(),
          trigger: match[3].trim(),
        });
      }
      return rows.length > 0 ? rows : null;
    } catch {
      return null;
    }
  }

  private _switchToYaml() {
    this._yamlText = this._rowsToYaml(this._rows);
    this._yamlError = '';
    this._viewMode = 'yaml';
  }

  private _switchToCanvas() {
    const parsed = this._yamlToRows(this._yamlText);
    if (parsed) {
      this._rows = [...parsed, makeEmptyRow()];
      this._yamlError = '';
    } else if (this._yamlText.trim()) {
      this._yamlError = 'Could not parse YAML. Please check the format.';
      // Don't switch — stay in YAML view
      return;
    }
    this._viewMode = 'canvas';
  }

  private _onTemplateChange(e: CustomEvent) {
    const value = (e.target as HTMLSelectElement & { value: string }).value;
    this._selectedTemplate = value;
    if (value === 'blank') {
      this._rows = [makeEmptyRow()];
    } else {
      const template = TEMPLATES[value];
      if (template) {
        this._rows = [...template.map((r) => ({ ...r })), makeEmptyRow()];
      }
    }
    if (this._viewMode === 'yaml') {
      this._yamlText = this._rowsToYaml(this._rows);
    }
  }

  private _onCellInput(rowIdx: number, field: keyof SparkRow, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const rows = this._rows.map((r, i) => (i === rowIdx ? { ...r, [field]: value } : r));

    // If user types in the placeholder (last) row's event name, add a new placeholder row
    if (rowIdx === this._rows.length - 1 && field === 'eventName' && value.trim()) {
      rows.push(makeEmptyRow());
    }

    this._rows = rows;
  }

  private _onCellKeydown(rowIdx: number, field: keyof SparkRow, e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Add a new row after current, focus its event name input
      const newRows = [...this._rows];
      // If not on last row, insert after current
      if (rowIdx < this._rows.length - 1) {
        newRows.splice(rowIdx + 1, 0, makeEmptyRow());
      }
      this._rows = newRows;
      // Focus the event name input in the row after current
      this.updateComplete.then(() => {
        const inputs = this.renderRoot.querySelectorAll<HTMLInputElement>('.cell-input[data-field="eventName"]');
        const targetInput = inputs[rowIdx + 1];
        targetInput?.focus();
      });
    } else if (e.key === 'Backspace') {
      const row = this._rows[rowIdx];
      // If all three fields are empty, delete row and focus previous
      if (!row.eventName && !row.aggregate && !row.trigger && this._rows.length > 1) {
        e.preventDefault();
        const newRows = this._rows.filter((_, i) => i !== rowIdx);
        this._rows = newRows;
        this.updateComplete.then(() => {
          const inputs = this.renderRoot.querySelectorAll<HTMLInputElement>('.cell-input[data-field="eventName"]');
          const prevIdx = Math.max(0, rowIdx - 1);
          inputs[prevIdx]?.focus();
        });
      }
    }
  }

  private _deleteRow(rowIdx: number) {
    if (this._rows.length <= 1) {
      this._rows = [makeEmptyRow()];
      return;
    }
    this._rows = this._rows.filter((_, i) => i !== rowIdx);
  }

  private _onYamlInput(e: Event) {
    this._yamlText = (e.target as HTMLTextAreaElement).value;
    // Try parsing to validate
    const parsed = this._yamlToRows(this._yamlText);
    if (parsed || !this._yamlText.trim()) {
      this._yamlError = '';
    } else {
      this._yamlError = 'Could not parse YAML. Expected name/aggregate/trigger fields.';
    }
  }

  private _buildCandidateEvents(): CandidateEventsFile {
    const nonEmpty = this._rows.filter((r) => r.eventName.trim());
    const domain_events: DomainEvent[] = nonEmpty.map((r) => ({
      name: r.eventName.trim(),
      aggregate: r.aggregate.trim() || 'Unknown',
      trigger: r.trigger.trim() || 'Unknown',
      payload: [],
      integration: { direction: 'internal' },
      confidence: 'POSSIBLE',
    }));
    return {
      metadata: {
        role: 'spark-canvas',
        scope: 'session',
        goal: 'Collaboratively identified domain events',
        generated_at: new Date().toISOString(),
        event_count: domain_events.length,
        assumption_count: 0,
      },
      domain_events,
      boundary_assumptions: [],
    };
  }

  private _handleSubmit() {
    const nonEmpty = this._rows.filter((r) => r.eventName.trim());
    const candidateEvents = this._buildCandidateEvents();
    this.dispatchEvent(
      new CustomEvent('spark-submit', {
        detail: { rows: nonEmpty, candidateEvents },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _expand() {
    this.collapsed = false;
    this.dispatchEvent(
      new CustomEvent('spark-expand', { bubbles: true, composed: true })
    );
  }

  // ── AI Assist methods ──────────────────────────────────────────────────────

  private _openAiDialog() {
    this._aiDialogOpen = true;
    this._aiDescription = '';
    this._aiSuggestions = [];
  }

  private _generateSuggestions() {
    const existingEventNames = this._rows
      .map((r) => r.eventName.trim())
      .filter((n) => n.length > 0);

    const suggestions = suggestEventsHeuristic(this._aiDescription, existingEventNames);
    // Start with all suggestions selected
    this._aiSuggestions = suggestions.map((s) => ({ ...s, selected: true }));
  }

  private _toggleSuggestion(index: number) {
    this._aiSuggestions = this._aiSuggestions.map((s, i) =>
      i === index ? { ...s, selected: !s.selected } : s
    );
  }

  private _selectAll() {
    this._aiSuggestions = this._aiSuggestions.map((s) => ({ ...s, selected: true }));
  }

  private _deselectAll() {
    this._aiSuggestions = this._aiSuggestions.map((s) => ({ ...s, selected: false }));
  }

  private _acceptSuggestions() {
    const accepted = this._aiSuggestions.filter((s) => s.selected);
    if (accepted.length === 0) return;

    // Remove the trailing placeholder row, append accepted events, re-add placeholder
    const filledRows = this._rows.filter((r) => r.eventName.trim());
    const newRows: SparkRow[] = accepted.map((s) => ({
      eventName: s.name,
      aggregate: s.aggregate,
      trigger: s.trigger,
    }));
    this._rows = [...filledRows, ...newRows, makeEmptyRow()];

    this._aiDialogOpen = false;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render() {
    if (this.collapsed) {
      return this._renderCollapsed();
    }
    return html`${this._renderCanvas()}${this._renderAiDialog()}`;
  }

  private _renderCollapsed() {
    return html`
      <div
        class="collapsed-bar"
        role="button"
        tabindex="0"
        aria-label="${t('spark-canvas.collapsed-label')}"
        @click=${this._expand}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._expand();
          }
        }}
      >
        <sl-icon name="plus-circle" aria-hidden="true"></sl-icon>
        <span>${t('spark-canvas.collapsed-label')}</span>
      </div>
    `;
  }

  private _renderCanvas() {
    const filledRows = this._rows.filter((r) => r.eventName.trim()).length;

    return html`
      <div class="canvas" role="region" aria-label="${t('spark-canvas.title')}">
        <!-- Header -->
        <div class="canvas-header">
          <h2 class="canvas-title">${t('spark-canvas.title')}</h2>
          <div class="header-controls">
            <!-- Quick Start template selector -->
            <sl-select
              value=${this._selectedTemplate}
              size="small"
              aria-label="${t('spark-canvas.template-label')}"
              style="min-width: 180px;"
              @sl-change=${this._onTemplateChange}
            >
              <sl-option value="blank">${t('spark-canvas.template-blank')}</sl-option>
              <sl-option value="ecommerce">${t('spark-canvas.template-ecommerce')}</sl-option>
              <sl-option value="auth">${t('spark-canvas.template-auth')}</sl-option>
              <sl-option value="payment">${t('spark-canvas.template-payment')}</sl-option>
              <sl-option value="subscription">${t('spark-canvas.template-subscription')}</sl-option>
            </sl-select>

            <!-- Canvas / YAML toggle -->
            <div class="view-toggle" role="group" aria-label="View mode">
              <button
                class="view-btn ${this._viewMode === 'canvas' ? 'active' : ''}"
                type="button"
                aria-pressed="${this._viewMode === 'canvas'}"
                @click=${() => {
                  if (this._viewMode === 'yaml') this._switchToCanvas();
                }}
              >${t('spark-canvas.view-canvas')}</button>
              <button
                class="view-btn ${this._viewMode === 'yaml' ? 'active' : ''}"
                type="button"
                aria-pressed="${this._viewMode === 'yaml'}"
                @click=${() => {
                  if (this._viewMode === 'canvas') this._switchToYaml();
                }}
              >${t('spark-canvas.view-yaml')}</button>
            </div>

            <!-- AI Assist button -->
            <sl-tooltip content="${t('spark-canvas.ai-assist')}">
              <sl-button size="small" variant="neutral" @click=${this._openAiDialog}>
                <sl-icon slot="prefix" name="stars" aria-hidden="true"></sl-icon>
                ${t('spark-canvas.ai-assist')}
              </sl-button>
            </sl-tooltip>
          </div>
        </div>

        <!-- Body: Canvas or YAML -->
        ${this._viewMode === 'canvas' ? this._renderGrid() : this._renderYaml()}

        <!-- Footer -->
        <div class="canvas-footer">
          <div class="canvas-footer-left">
            <span class="row-count-badge" aria-live="polite">
              ${filledRows} event${filledRows !== 1 ? 's' : ''} captured
            </span>
          </div>
          <sl-button
            variant="primary"
            ?disabled=${filledRows === 0}
            aria-label="${t('spark-canvas.submit')} (${filledRows} event${filledRows !== 1 ? 's' : ''})"
            @click=${this._handleSubmit}
          >
            <sl-icon slot="prefix" name="cloud-arrow-up" aria-hidden="true"></sl-icon>
            ${t('spark-canvas.submit')}
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderGrid() {
    return html`
      <div class="grid-wrapper">
        <table
          class="grid"
          role="grid"
          aria-label="${t('spark-canvas.title')}"
          aria-rowcount="${this._rows.length}"
        >
          <thead>
            <tr role="row">
              <th scope="col" style="width:2rem" aria-hidden="true"></th>
              <th scope="col">${t('spark-canvas.col-event')}</th>
              <th scope="col">${t('spark-canvas.col-aggregate')}</th>
              <th scope="col">${t('spark-canvas.col-trigger')}</th>
              <th scope="col" style="width:2rem" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            ${this._rows.map((row, idx) => this._renderRow(row, idx))}
          </tbody>
        </table>
      </div>
    `;
  }

  private _renderRow(row: SparkRow, idx: number) {
    const isPlaceholder = idx === this._rows.length - 1;
    const rowLabel = isPlaceholder
      ? t('spark-canvas.add-row')
      : `Row ${idx + 1}: ${row.eventName || 'empty'}`;

    return html`
      <tr role="row" aria-label="${rowLabel}" aria-rowindex="${idx + 1}">
        <td role="rowheader" class="row-num" aria-hidden="true">${isPlaceholder ? '' : idx + 1}</td>

        <td role="gridcell">
          <input
            class="cell-input ${isPlaceholder ? 'placeholder-input' : ''}"
            type="text"
            value=${row.eventName}
            placeholder=${t('spark-canvas.col-event')}
            aria-label="${t('spark-canvas.col-event')}, row ${idx + 1}"
            data-field="eventName"
            @input=${(e: Event) => this._onCellInput(idx, 'eventName', e)}
            @keydown=${(e: KeyboardEvent) => this._onCellKeydown(idx, 'eventName', e)}
          />
        </td>

        <td role="gridcell">
          <input
            class="cell-input ${isPlaceholder ? 'placeholder-input' : ''}"
            type="text"
            value=${row.aggregate}
            placeholder=${t('spark-canvas.col-aggregate')}
            aria-label="${t('spark-canvas.col-aggregate')}, row ${idx + 1}"
            data-field="aggregate"
            @input=${(e: Event) => this._onCellInput(idx, 'aggregate', e)}
            @keydown=${(e: KeyboardEvent) => this._onCellKeydown(idx, 'aggregate', e)}
          />
        </td>

        <td role="gridcell">
          <input
            class="cell-input ${isPlaceholder ? 'placeholder-input' : ''}"
            type="text"
            value=${row.trigger}
            placeholder=${t('spark-canvas.col-trigger')}
            aria-label="${t('spark-canvas.col-trigger')}, row ${idx + 1}"
            data-field="trigger"
            @input=${(e: Event) => this._onCellInput(idx, 'trigger', e)}
            @keydown=${(e: KeyboardEvent) => this._onCellKeydown(idx, 'trigger', e)}
          />
        </td>

        <td role="gridcell" aria-label="Delete row ${idx + 1}">
          ${!isPlaceholder ? html`
            <button
              class="row-delete-btn"
              type="button"
              aria-label="Delete row ${idx + 1}: ${row.eventName}"
              @click=${() => this._deleteRow(idx)}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" aria-hidden="true">
                <line x1="2" y1="2" x2="10" y2="10"></line>
                <line x1="10" y1="2" x2="2" y2="10"></line>
              </svg>
            </button>
          ` : nothing}
        </td>
      </tr>
    `;
  }

  private _renderYaml() {
    return html`
      <div class="yaml-wrapper">
        <textarea
          class="yaml-editor"
          .value=${this._yamlText}
          placeholder="domain_events:\n  - name: OrderPlaced\n    aggregate: Order\n    trigger: Customer submits cart"
          aria-label="YAML editor"
          aria-describedby="yaml-status"
          spellcheck="false"
          @input=${this._onYamlInput}
        ></textarea>
        ${this._yamlError
          ? html`<p id="yaml-status" class="yaml-status invalid" role="alert">${this._yamlError}</p>`
          : this._yamlText.trim()
          ? html`<p id="yaml-status" class="yaml-status valid">Valid YAML format</p>`
          : nothing}
      </div>
    `;
  }

  private _renderAiDialog() {
    const selectedCount = this._aiSuggestions.filter((s) => s.selected).length;
    const hasGenerated = this._aiSuggestions.length > 0;
    const allSelected = this._aiSuggestions.length > 0 && this._aiSuggestions.every((s) => s.selected);

    return html`
      <sl-dialog
        label="${t('spark-canvas.ai-dialog.title')}"
        ?open=${this._aiDialogOpen}
        @sl-after-hide=${() => { this._aiDialogOpen = false; }}
        style="--width: 560px;"
      >
        <div class="ai-dialog-body">
          <!-- Step 1: Description input + Generate button -->
          <div class="ai-generate-row">
            <sl-textarea
              label="${t('spark-canvas.ai-dialog.describe')}"
              placeholder="${t('spark-canvas.ai-dialog.placeholder')}"
              rows="2"
              .value=${this._aiDescription}
              @sl-input=${(e: Event) => {
                this._aiDescription = (e.target as unknown as { value: string }).value;
              }}
            ></sl-textarea>
            <sl-button
              variant="primary"
              ?disabled=${!this._aiDescription.trim()}
              @click=${this._generateSuggestions}
            >
              ${t('spark-canvas.ai-dialog.generate')}
            </sl-button>
          </div>

          <!-- Step 2: Review suggestions (shown after generation attempt) -->
          ${hasGenerated ? html`
            <div class="ai-suggestions-section">
              <div class="ai-suggestions-header">
                <span class="ai-suggestions-count">
                  ${this._aiSuggestions.length} event${this._aiSuggestions.length !== 1 ? 's' : ''} suggested
                </span>
                <div class="ai-suggestions-controls">
                  ${allSelected
                    ? html`
                      <sl-button size="small" variant="text" @click=${this._deselectAll}>
                        ${t('spark-canvas.ai-dialog.deselectAll')}
                      </sl-button>
                    `
                    : html`
                      <sl-button size="small" variant="text" @click=${this._selectAll}>
                        ${t('spark-canvas.ai-dialog.selectAll')}
                      </sl-button>
                    `}
                </div>
              </div>
              <div class="ai-suggestions-list" role="list" aria-label="Suggested events">
                ${this._aiSuggestions.map((s, i) => html`
                  <div
                    class="ai-suggestion-row ${s.selected ? 'selected' : ''}"
                    role="listitem"
                  >
                    <sl-checkbox
                      ?checked=${s.selected}
                      aria-label="${s.name}: ${s.trigger}"
                      @sl-change=${() => this._toggleSuggestion(i)}
                    >
                      <div class="ai-suggestion-label">
                        <span class="ai-suggestion-name">${s.name}</span>
                        <span class="ai-suggestion-trigger">${s.trigger}</span>
                        <span class="ai-suggestion-aggregate">Aggregate: ${s.aggregate}</span>
                      </div>
                    </sl-checkbox>
                  </div>
                `)}
              </div>
            </div>
          ` : nothing}

          <!-- Generated but no results -->
          ${this._aiDescription.trim() && hasGenerated && this._aiSuggestions.length === 0 ? html`
            <p class="ai-no-results" role="status">${t('spark-canvas.ai-dialog.noResults')}</p>
          ` : nothing}
        </div>

        <!-- Footer: Accept button -->
        <sl-button
          slot="footer"
          variant="primary"
          ?disabled=${selectedCount === 0}
          @click=${this._acceptSuggestions}
        >
          ${t('spark-canvas.ai-dialog.accept', { count: String(selectedCount) })}
        </sl-button>
        <sl-button slot="footer" variant="neutral" @click=${() => { this._aiDialogOpen = false; }}>
          Cancel
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'spark-canvas': SparkCanvas;
  }
}
