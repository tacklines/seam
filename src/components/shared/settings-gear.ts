import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';

/**
 * `<settings-gear>` — Gear icon trigger that opens a `<settings-drawer>` for a section.
 *
 * Renders a small icon button at 60% opacity that becomes fully opaque on hover/focus.
 * When `hasModified` is true, a blue dot badge is shown to indicate modified settings.
 * Meets the 44x44px touch target minimum via padding.
 *
 * @fires open-settings - Fired when the gear is activated; `detail: { sectionName: string }`
 */
@customElement('settings-gear')
export class SettingsGear extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .gear-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* Minimum 44x44px touch target */
      min-width: 44px;
      min-height: 44px;
    }

    sl-icon-button {
      font-size: 1rem;
      opacity: 0.6;
      transition: opacity 0.15s ease;
    }

    sl-icon-button:hover,
    sl-icon-button:focus-within {
      opacity: 1;
    }

    /* Blue dot badge for modified state */
    .modified-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      pointer-events: none;
      border: 1.5px solid var(--sl-color-neutral-0, white);
    }
  `;

  /** Name of the section this gear opens settings for */
  @property() sectionName = '';

  /** When true, shows a blue dot to indicate modified settings */
  @property({ type: Boolean }) hasModified = false;

  render() {
    const ariaLabel = t('settingsGear.ariaLabel', { sectionName: this.sectionName });

    return html`
      <div class="gear-wrap">
        <sl-icon-button
          name="gear"
          label=${ariaLabel}
          @click=${this._handleClick}
        ></sl-icon-button>
        ${this.hasModified
          ? html`<span class="modified-badge" aria-label="${t('settingsGear.modifiedAriaLabel')}"></span>`
          : ''}
      </div>
    `;
  }

  private _handleClick() {
    this.dispatchEvent(
      new CustomEvent('open-settings', {
        detail: { sectionName: this.sectionName },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-gear': SettingsGear;
  }
}
