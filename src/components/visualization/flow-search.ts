import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import type SlInput from '@shoelace-style/shoelace/dist/components/input/input.js';

@customElement('flow-search')
export class FlowSearch extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    sl-input {
      flex: 1;
      max-width: 360px;
    }

    .match-info {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-600);
      white-space: nowrap;
      min-width: 80px;
    }

    .match-info.has-query {
      color: var(--sl-color-primary-600);
      font-weight: var(--sl-font-weight-semibold);
    }

    .match-info.no-matches {
      color: var(--sl-color-danger-600);
    }
  `;

  /** Number of nodes matching the current search query. */
  @property({ type: Number }) matchCount = 0;

  /** Index (0-based) of the currently focused match. -1 means none focused. */
  @property({ type: Number }) currentMatch = -1;

  @state() private _query = '';

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _onInput(e: Event) {
    const input = e.target as SlInput;
    const value = input.value ?? '';

    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._query = value;
      this.dispatchEvent(
        new CustomEvent('flow-search', {
          detail: { query: value },
          bubbles: true,
          composed: true,
        }),
      );
    }, 300);
  }

  private _onClear() {
    this._query = '';
    this.dispatchEvent(
      new CustomEvent('flow-search', {
        detail: { query: '' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent('flow-search-next', {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private _matchLabel(): string {
    if (!this._query) return '';
    if (this.matchCount === 0) return 'No matches';
    const current = this.currentMatch >= 0 ? this.currentMatch + 1 : 1;
    return `${current} of ${this.matchCount} matches`;
  }

  private _matchClass(): string {
    if (!this._query) return 'match-info';
    if (this.matchCount === 0) return 'match-info no-matches';
    return 'match-info has-query';
  }

  render() {
    return html`
      <div class="search-bar" role="search" aria-label="Search flow diagram nodes">
        <sl-input
          type="search"
          placeholder="Search nodes..."
          label="Search nodes"
          clearable
          size="small"
          aria-label="Search flow diagram nodes. Press Enter to go to next match."
          @sl-input=${this._onInput}
          @sl-clear=${this._onClear}
          @keydown=${this._onKeyDown}
        ></sl-input>
        <span
          class=${this._matchClass()}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >${this._matchLabel()}</span>
      </div>
    `;
  }
}
