import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/drawer/drawer.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

/** A single configurable setting item */
export interface SettingItem {
  key: string;
  label: string;
  type: 'select' | 'switch' | 'input' | 'number';
  value: unknown;
  defaultValue: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

/**
 * `<settings-drawer>` — Contextual settings panel that slides in from the right edge.
 *
 * Opens a Shoelace drawer for a specific section. Each setting shows a label, the
 * current input control, and the default value in muted text. Settings that have
 * been changed from their default value show a blue dot indicator. Settings save
 * immediately on change — there is no Save button.
 *
 * @fires setting-changed - `detail: { key: string; value: unknown }`
 */
@customElement('settings-drawer')
export class SettingsDrawer extends LitElement {
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

  /** Name of the section this drawer represents (used as the drawer label) */
  @property() sectionName = '';

  /** Settings to render in this drawer */
  @property({ attribute: false }) settings: SettingItem[] = [];

  /** Whether the drawer is open */
  @property({ type: Boolean }) open = false;

  render() {
    return html`
      <sl-drawer
        label=${this.sectionName || t('settingsDrawer.defaultLabel')}
        ?open=${this.open}
        @sl-after-hide=${this._onDrawerClose}
      >
        <div class="settings-list">
          ${this.settings.map((item) => this._renderSetting(item))}
          ${this.settings.length === 0
            ? html`<p style="color: var(--sl-color-neutral-500); font-size: 0.875rem;">${t('settingsDrawer.empty')}</p>`
            : nothing}
        </div>
      </sl-drawer>
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

    return html`
      <div class="setting-row">
        <div class="setting-header">
          <span class="setting-label" id="label-${item.key}">${item.label}</span>
          ${modified ? html`<span class="modified-dot" aria-label="${t('settingsDrawer.modifiedAriaLabel')}"></span>` : nothing}
        </div>
        ${item.description
          ? html`<div class="setting-description">${item.description}</div>`
          : nothing}
        <div class="setting-control">
          ${this._renderControl(item)}
        </div>
        <div class="setting-default">
          ${t('settingsDrawer.defaultPrefix')} ${this._formatDefault(item)}
        </div>
      </div>
    `;
  }

  private _renderControl(item: SettingItem) {
    switch (item.type) {
      case 'select':
        return html`
          <sl-select
            value=${String(item.value)}
            aria-labelledby="label-${item.key}"
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
            aria-labelledby="label-${item.key}"
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
            aria-labelledby="label-${item.key}"
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
            aria-labelledby="label-${item.key}"
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

  private _onDrawerClose() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('settings-drawer-close', {
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-drawer': SettingsDrawer;
  }
}
