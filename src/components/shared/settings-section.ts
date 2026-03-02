import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { SettingItem } from './settings-drawer.js';

import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';

/**
 * `<settings-section>` — Renders a list of `SettingItem` objects as labeled rows.
 *
 * Each row shows a label, the current control, a blue dot when modified, the
 * default value in muted text, and an optional description. Controls save
 * immediately — there is no Save button.
 *
 * Used by both `<settings-drawer>` and `<settings-dialog>` to avoid duplicating
 * rendering logic.
 *
 * @fires setting-changed - `detail: { key: string; value: unknown }`
 */
@customElement('settings-section')
export class SettingsSection extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 0.25rem 0;
    }

    .setting-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .setting-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .setting-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--sl-color-neutral-900);
    }

    /* Blue dot for modified settings */
    .modified-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      flex-shrink: 0;
      display: inline-block;
    }

    .setting-default {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-500);
      margin-top: 0.125rem;
    }

    .setting-description {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-600);
      line-height: 1.4;
      margin-top: 0.125rem;
    }

    .setting-control {
      margin-top: 0.25rem;
    }

    sl-switch {
      --sl-toggle-size-medium: 1.125rem;
    }

    sl-select,
    sl-input {
      --sl-input-font-size-medium: 0.875rem;
    }
  `;

  /** Settings to render */
  @property({ attribute: false }) settings: SettingItem[] = [];

  /**
   * Prefix used when generating element IDs for `aria-labelledby` associations.
   * Consumers that host multiple sections should pass a unique prefix to avoid
   * duplicate IDs in the document.
   */
  @property() idPrefix = 'label';

  render() {
    return html`
      <div class="settings-list">
        ${this.settings.map((item) => this._renderSetting(item))}
      </div>
    `;
  }

  private _isModified(item: SettingItem): boolean {
    return JSON.stringify(item.value) !== JSON.stringify(item.defaultValue);
  }

  private _formatDefault(item: SettingItem): string {
    const val = item.defaultValue;
    if (typeof val === 'boolean') return val ? t('settingsDrawer.defaultTrue') : t('settingsDrawer.defaultFalse');
    return String(val);
  }

  private _renderSetting(item: SettingItem) {
    const modified = this._isModified(item);
    const labelId = `${this.idPrefix}-${item.key}`;

    return html`
      <div class="setting-row">
        <div class="setting-header">
          <span class="setting-label" id=${labelId}>${item.label}</span>
          ${modified ? html`<span class="modified-dot" aria-label=${t('settingsDrawer.modifiedAriaLabel')}></span>` : nothing}
        </div>
        ${item.description
          ? html`<div class="setting-description">${item.description}</div>`
          : nothing}
        <div class="setting-control">
          ${this._renderControl(item, labelId)}
        </div>
        <div class="setting-default">
          ${t('settingsDrawer.defaultPrefix')} ${this._formatDefault(item)}
        </div>
      </div>
    `;
  }

  private _renderControl(item: SettingItem, labelId: string) {
    switch (item.type) {
      case 'select':
        return html`
          <sl-select
            value=${String(item.value)}
            aria-labelledby=${labelId}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value;
              this._emitChange(item.key, val);
            }}
          >
            ${(item.options ?? []).map(
              (opt) => html`<sl-option value=${opt.value}>${opt.label}</sl-option>`
            )}
          </sl-select>
        `;

      case 'switch':
        return html`
          <sl-switch
            ?checked=${Boolean(item.value)}
            aria-labelledby=${labelId}
            @sl-change=${(e: Event) => {
              const checked = (e.target as unknown as { checked: boolean }).checked;
              this._emitChange(item.key, checked);
            }}
          ></sl-switch>
        `;

      case 'number':
        return html`
          <sl-input
            type="number"
            value=${String(item.value)}
            aria-labelledby=${labelId}
            @sl-change=${(e: Event) => {
              const val = Number((e.target as HTMLInputElement).value);
              this._emitChange(item.key, val);
            }}
          ></sl-input>
        `;

      case 'input':
      default:
        return html`
          <sl-input
            type="text"
            value=${String(item.value)}
            aria-labelledby=${labelId}
            @sl-change=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value;
              this._emitChange(item.key, val);
            }}
          ></sl-input>
        `;
    }
  }

  private _emitChange(key: string, value: unknown) {
    this.dispatchEvent(
      new CustomEvent('setting-changed', {
        detail: { key, value },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-section': SettingsSection;
  }
}
