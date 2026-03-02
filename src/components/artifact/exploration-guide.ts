import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '../shared/domain-tooltip.js';

export interface ExplorationGap {
  message: string;
  action: string;
  aggregate?: string;
}

export interface ExplorationPrompt {
  question: string;
  type: 'event' | 'assumption';
}

export interface ExplorationPattern {
  description: string;
  events: string[];
}

/**
 * Sidebar panel for Phase II that helps users find gaps in their artifacts.
 * Shows completeness progress, heuristic prompts that rotate every 30s,
 * and related domain patterns.
 */
@customElement('exploration-guide')
export class ExplorationGuide extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 320px;
      font-size: var(--sl-font-size-small);
    }

    .guide-title {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      margin: 0 0 0.75rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    /* --- Section headers (summary slot content) --- */
    .section-summary {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-700);
    }

    /* --- Completeness section --- */
    .completeness-content {
      padding: 0.75rem 0.25rem;
    }

    .completeness-ring-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .completeness-ring {
      flex-shrink: 0;
    }

    .completeness-text {
      flex: 1;
    }

    .completeness-score {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-bold);
      color: var(--sl-color-neutral-800);
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .completeness-label {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
    }

    /* --- Gaps list --- */
    .gap-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .gap-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      background: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
      border: 1px solid var(--sl-color-neutral-200);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .gap-item:hover,
    .gap-item:focus-visible {
      background: var(--sl-color-primary-50);
      border-color: var(--sl-color-primary-200);
      outline: none;
    }

    .gap-icon {
      color: var(--sl-color-warning-600);
      flex-shrink: 0;
      margin-top: 1px;
    }

    .gap-text {
      flex: 1;
      color: var(--sl-color-neutral-700);
      line-height: 1.4;
    }

    .gap-action {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-primary-600);
      font-weight: var(--sl-font-weight-semibold);
      flex-shrink: 0;
      align-self: center;
    }

    .no-gaps {
      color: var(--sl-color-success-700);
      padding: 0.375rem 0;
    }

    /* --- Prompts section --- */
    .prompt-content {
      padding: 0.75rem 0.25rem;
    }

    .prompt-card {
      background: var(--sl-color-neutral-50);
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      padding: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .prompt-question {
      color: var(--sl-color-neutral-800);
      line-height: 1.5;
      margin-bottom: 0.625rem;
    }

    .prompt-actions {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }

    .no-prompts {
      color: var(--sl-color-neutral-500);
      font-style: italic;
    }

    /* --- Patterns section --- */
    .patterns-content {
      padding: 0.75rem 0.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pattern-card {
      background: var(--sl-color-neutral-50);
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-medium);
      padding: 0.625rem 0.75rem;
    }

    .pattern-description {
      color: var(--sl-color-neutral-700);
      margin-bottom: 0.375rem;
      line-height: 1.4;
    }

    .pattern-events {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .pattern-event-tag {
      font-size: var(--sl-font-size-x-small);
      background: var(--sl-color-neutral-100);
      color: var(--sl-color-neutral-600);
      padding: 1px 6px;
      border-radius: var(--sl-border-radius-small);
      font-family: 'JetBrains Mono', monospace;
    }

    .pattern-actions {
      display: flex;
      gap: 0.375rem;
    }

    .no-patterns {
      color: var(--sl-color-neutral-500);
      font-style: italic;
    }

    /* Responsive adjustments */
    sl-details::part(base) {
      margin-bottom: 0.5rem;
    }

    sl-details::part(summary) {
      padding: 0.5rem 0.75rem;
    }

    sl-details::part(content) {
      padding: 0 0.75rem;
    }
  `;

  @property({ type: Number }) completenessScore = 0;
  @property({ type: Array }) gaps: ExplorationGap[] = [];
  @property({ type: Array }) prompts: ExplorationPrompt[] = [];
  @property({ type: Array }) patterns: ExplorationPattern[] = [];

  @state() private _currentPromptIndex = 0;

  private _promptTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._startPromptRotation();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopPromptRotation();
  }

  private _startPromptRotation(): void {
    this._stopPromptRotation();
    if (this.prompts.length > 1) {
      this._promptTimer = setInterval(() => {
        this._currentPromptIndex = (this._currentPromptIndex + 1) % this.prompts.length;
      }, 30000);
    }
  }

  private _stopPromptRotation(): void {
    if (this._promptTimer !== null) {
      clearInterval(this._promptTimer);
      this._promptTimer = null;
    }
  }

  private _dismissPrompt(): void {
    if (this.prompts.length === 0) return;
    this._currentPromptIndex = (this._currentPromptIndex + 1) % this.prompts.length;
  }

  private _onGapAction(gap: ExplorationGap): void {
    this.dispatchEvent(
      new CustomEvent('gap-action', {
        detail: { action: gap.action, aggregate: gap.aggregate },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onPromptAction(prompt: ExplorationPrompt): void {
    this.dispatchEvent(
      new CustomEvent('prompt-action', {
        detail: { question: prompt.question, type: prompt.type },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onPatternAdd(pattern: ExplorationPattern): void {
    this.dispatchEvent(
      new CustomEvent('pattern-add', {
        detail: { description: pattern.description, events: pattern.events },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onPatternDismiss(pattern: ExplorationPattern): void {
    this.dispatchEvent(
      new CustomEvent('pattern-dismiss', {
        detail: { description: pattern.description, events: pattern.events },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Compute SVG ring values for the progress circle */
  private _ringValues(): { circumference: number; offset: number; color: string } {
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const clampedScore = Math.max(0, Math.min(100, this.completenessScore));
    const offset = circumference - (clampedScore / 100) * circumference;

    let color: string;
    if (clampedScore >= 70) {
      color = '#16a34a'; // green
    } else if (clampedScore >= 40) {
      color = '#d97706'; // amber
    } else {
      color = '#dc2626'; // red
    }

    return { circumference, offset, color };
  }

  private _renderCompletenessSection() {
    const { circumference, offset, color } = this._ringValues();
    const ringSize = 56;
    const cx = ringSize / 2;
    const cy = ringSize / 2;
    const r = 24;

    return html`
      <div class="completeness-content" role="region" aria-label="${t('explorationGuide.completeness')}">
        <div class="completeness-ring-row">
          <div class="completeness-ring">
            ${svg`
              <svg
                width="${ringSize}"
                height="${ringSize}"
                viewBox="0 0 ${ringSize} ${ringSize}"
                aria-hidden="true"
              >
                <!-- Track circle -->
                <circle
                  cx="${cx}"
                  cy="${cy}"
                  r="${r}"
                  fill="none"
                  stroke="#e5e7eb"
                  stroke-width="5"
                />
                <!-- Progress arc (rotate so 0% starts at top) -->
                <circle
                  cx="${cx}"
                  cy="${cy}"
                  r="${r}"
                  fill="none"
                  stroke="${color}"
                  stroke-width="5"
                  stroke-linecap="round"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${offset}"
                  style="transform: rotate(-90deg); transform-origin: ${cx}px ${cy}px;"
                />
                <!-- Percentage text -->
                <text
                  x="${cx}"
                  y="${cy + 4}"
                  text-anchor="middle"
                  font-size="11"
                  font-weight="700"
                  fill="${color}"
                  font-family="system-ui, sans-serif"
                >${this.completenessScore}%</text>
              </svg>
            `}
          </div>
          <div class="completeness-text">
            <div class="completeness-score">${t('explorationGuide.completenessScore', { score: this.completenessScore })}</div>
            <div class="completeness-label">
              ${this.gaps.length > 0
                ? t('explorationGuide.gaps', { count: this.gaps.length })
                : t('explorationGuide.noGaps')}
            </div>
          </div>
        </div>

        ${this.gaps.length > 0
          ? html`
            <ul class="gap-list" aria-label="Detected gaps">
              ${this.gaps.map((gap) => html`
                <li
                  class="gap-item"
                  tabindex="0"
                  role="button"
                  aria-label="${gap.message} — ${gap.action}"
                  @click=${() => this._onGapAction(gap)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      this._onGapAction(gap);
                    }
                  }}
                >
                  <span class="gap-icon" aria-hidden="true">⚠</span>
                  <span class="gap-text">${gap.message}</span>
                  <span class="gap-action">${gap.action}</span>
                </li>
              `)}
            </ul>
          `
          : html`<div class="no-gaps">${t('explorationGuide.noGaps')}</div>`}
      </div>
    `;
  }

  private _renderPromptsSection() {
    const currentPrompt = this.prompts[this._currentPromptIndex];

    return html`
      <div class="prompt-content" aria-live="polite" aria-atomic="true">
        ${currentPrompt
          ? html`
            <div class="prompt-card">
              <div class="prompt-question">${currentPrompt.question}</div>
              <div class="prompt-actions">
                <sl-button
                  size="small"
                  variant="neutral"
                  @click=${this._dismissPrompt}
                >
                  ${t('explorationGuide.promptDismiss')}
                </sl-button>
                <sl-button
                  size="small"
                  variant="primary"
                  outline
                  @click=${() => this._onPromptAction({ ...currentPrompt, type: 'event' })}
                >
                  <domain-tooltip term="domain-event">${t('explorationGuide.addEvent')}</domain-tooltip>
                </sl-button>
                <sl-button
                  size="small"
                  variant="neutral"
                  outline
                  @click=${() => this._onPromptAction({ ...currentPrompt, type: 'assumption' })}
                >
                  <domain-tooltip term="assumption">${t('explorationGuide.addAssumption')}</domain-tooltip>
                </sl-button>
              </div>
            </div>
          `
          : html`<div class="no-prompts">${t('explorationGuide.noGaps')}</div>`}
      </div>
    `;
  }

  private _renderPatternsSection() {
    return html`
      <div class="patterns-content">
        ${this.patterns.length > 0
          ? this.patterns.map((pattern) => html`
            <div class="pattern-card">
              <div class="pattern-description">${pattern.description}</div>
              ${pattern.events.length > 0
                ? html`
                  <div class="pattern-events" aria-label="Related events">
                    ${pattern.events.map((ev) => html`
                      <span class="pattern-event-tag">${ev}</span>
                    `)}
                  </div>
                `
                : nothing}
              <div class="pattern-actions">
                <sl-button
                  size="small"
                  variant="primary"
                  outline
                  @click=${() => this._onPatternAdd(pattern)}
                >
                  ${t('explorationGuide.patternAdd')}
                </sl-button>
                <sl-button
                  size="small"
                  variant="neutral"
                  @click=${() => this._onPatternDismiss(pattern)}
                >
                  ${t('explorationGuide.patternDismiss')}
                </sl-button>
              </div>
            </div>
          `)
          : html`<div class="no-patterns">${t('explorationGuide.noPatterns')}</div>`}
      </div>
    `;
  }

  render() {
    return html`
      <h2 class="guide-title">${t('explorationGuide.title')}</h2>

      <sl-details>
        <div slot="summary" class="section-summary">
          <span>${t('explorationGuide.completeness')}</span>
          <sl-badge
            variant=${this.completenessScore >= 70 ? 'success' : this.completenessScore >= 40 ? 'warning' : 'danger'}
            pill
          >${this.gaps.length}</sl-badge>
        </div>
        ${this._renderCompletenessSection()}
      </sl-details>

      <sl-details>
        <div slot="summary" class="section-summary">
          <span>${t('explorationGuide.prompts')}</span>
          <sl-badge variant="neutral" pill>${this.prompts.length}</sl-badge>
        </div>
        ${this._renderPromptsSection()}
      </sl-details>

      <sl-details>
        <div slot="summary" class="section-summary">
          <span>${t('explorationGuide.patterns')}</span>
          <sl-badge variant="neutral" pill>${this.patterns.length}</sl-badge>
        </div>
        ${this._renderPatternsSection()}
      </sl-details>
    `;
  }
}
