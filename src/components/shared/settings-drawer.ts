import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/drawer/drawer.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import './settings-section.js';

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
        ${this.settings.length === 0
          ? html`<p style="color: var(--sl-color-neutral-500); font-size: 0.875rem;">${t('settingsDrawer.empty')}</p>`
          : html`<settings-section
              .settings=${this.settings}
              idPrefix="drawer-label"
            ></settings-section>`}
      </sl-drawer>
    `;
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
