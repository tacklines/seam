import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { registry } from '../../lib/shortcut-registry.js';
import type { Shortcut } from '../../lib/shortcut-registry.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

/**
 * `<shortcut-reference>` — Keyboard shortcut reference panel.
 *
 * Renders as a Shoelace `sl-dialog` listing all registered shortcuts grouped
 * by category. Triggered externally by setting the `open` property, or
 * internally by the registry's `?` shortcut.
 *
 * @fires shortcut-reference-close - Fired when the dialog is dismissed.
 */
@customElement('shortcut-reference')
export class ShortcutReference extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .category-section {
      margin-bottom: 1.5rem;
    }

    .category-section:last-child {
      margin-bottom: 0;
    }

    .category-heading {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sl-color-neutral-500);
      margin: 0 0 0.625rem;
    }

    .shortcut-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.375rem 0;
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .shortcut-row:last-child {
      border-bottom: none;
    }

    .shortcut-description {
      font-size: 0.875rem;
      color: var(--sl-color-neutral-800);
      flex: 1;
      min-width: 0;
    }

    .shortcut-keys {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
      margin-left: 1rem;
    }

    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border: 1px solid var(--sl-color-neutral-300);
      background: var(--sl-color-neutral-50);
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--sl-color-neutral-800);
      box-shadow: 0 1px 0 var(--sl-color-neutral-300);
      min-width: 1.5rem;
      text-align: center;
      white-space: nowrap;
    }

    .key-separator {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-400);
      user-select: none;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0.75rem;
      border-top: 1px solid var(--sl-color-neutral-200);
      margin-top: 0.5rem;
    }

    .footer-note {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-500);
    }

    sl-dialog::part(panel) {
      max-width: 560px;
      width: 90vw;
    }
  `;

  /** Whether the dialog is currently visible. */
  @property({ type: Boolean }) open = false;

  @state() private _shortcuts: Shortcut[] = [];

  connectedCallback() {
    super.connectedCallback();
    this._refreshShortcuts();
    // Refresh when registry resets
    this._boundResetHandler = () => {
      this._refreshShortcuts();
    };
    window.addEventListener('shortcut-registry-reset', this._boundResetHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._boundResetHandler) {
      window.removeEventListener('shortcut-registry-reset', this._boundResetHandler);
      this._boundResetHandler = null;
    }
  }

  private _boundResetHandler: (() => void) | null = null;

  private _refreshShortcuts() {
    this._shortcuts = registry.getAll();
  }

  render() {
    const categories = this._groupByCategory();

    return html`
      <sl-dialog
        label=${t('shortcuts.dialogTitle')}
        ?open=${this.open}
        @sl-after-hide=${this._onClose}
      >
        ${categories.length === 0
          ? html`<p class="footer-note">${t('shortcuts.noShortcuts')}</p>`
          : categories.map(([category, shortcuts]) => this._renderCategory(category, shortcuts))}

        <div class="footer" slot="footer">
          <span class="footer-note">${t('shortcuts.footerNote')}</span>
          <sl-button
            size="small"
            variant="default"
            outline
            @click=${this._onResetDefaults}
          >
            <sl-icon slot="prefix" name="arrow-counterclockwise" aria-hidden="true"></sl-icon>
            ${t('shortcuts.resetDefaults')}
          </sl-button>
        </div>
      </sl-dialog>
    `;
  }

  private _renderCategory(category: string, shortcuts: Shortcut[]) {
    return html`
      <section class="category-section" aria-label=${category}>
        <h3 class="category-heading">${category}</h3>
        <div class="shortcut-list" role="list">
          ${shortcuts.map((s) => this._renderShortcutRow(s))}
        </div>
      </section>
    `;
  }

  private _renderShortcutRow(shortcut: Shortcut) {
    return html`
      <div class="shortcut-row" role="listitem">
        <span class="shortcut-description">${shortcut.description}</span>
        <span class="shortcut-keys" aria-label=${this._keyComboAriaLabel(shortcut)}>
          ${this._renderKeyCombo(shortcut)}
        </span>
      </div>
    `;
  }

  private _renderKeyCombo(shortcut: Shortcut) {
    const keys: string[] = [];

    if (shortcut.ctrl) keys.push('Ctrl');
    if (shortcut.alt) keys.push('Alt');
    if (shortcut.shift) keys.push('Shift');
    if (shortcut.meta) keys.push('Meta');
    keys.push(shortcut.key);

    return keys.map((key, i) =>
      i < keys.length - 1
        ? html`<kbd>${key}</kbd><span class="key-separator" aria-hidden="true">+</span>`
        : html`<kbd>${key}</kbd>`
    );
  }

  private _keyComboAriaLabel(shortcut: Shortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('Meta');
    parts.push(shortcut.key);
    return parts.join(' + ');
  }

  private _groupByCategory(): [string, Shortcut[]][] {
    const map = new Map<string, Shortcut[]>();
    for (const shortcut of this._shortcuts) {
      const list = map.get(shortcut.category) ?? [];
      list.push(shortcut);
      map.set(shortcut.category, list);
    }
    return Array.from(map.entries());
  }

  private _onClose() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('shortcut-reference-close', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onResetDefaults() {
    registry.resetDefaults();
    this._refreshShortcuts();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'shortcut-reference': ShortcutReference;
  }
}
