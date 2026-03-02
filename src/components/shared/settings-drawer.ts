import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@shoelace-style/shoelace/dist/components/drawer/drawer.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import type {
  SessionConfig,
  ComparisonConfig,
  ContractsConfig,
  RankingConfig,
  DelegationConfig,
  NotificationsConfig,
} from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';

export type SettingsSection = 'comparison' | 'contracts' | 'ranking' | 'delegation' | 'notifications';

/** Detail payload for the `settings-changed` event */
export interface SettingsChangedDetail {
  section: SettingsSection;
  key: string;
  value: unknown;
}

/**
 * Settings Drawer — a contextual gear icon + sl-drawer pattern.
 *
 * Each section of the UI that has configurable behaviour shows a small gear
 * icon. Clicking it opens this drawer from the right edge, containing only
 * the settings relevant to that context.
 *
 * Every setting shows:
 * - Current value (editable control)
 * - Default value in muted text
 * - A blue dot indicator (●) when the value differs from the default
 *
 * Settings save immediately on change. There is no Save button.
 *
 * @fires settings-changed - Fired when any setting changes.
 *   `detail: { section: SettingsSection, key: string, value: unknown }`
 * @fires drawer-closed - Fired when the drawer closes.
 *   No detail payload.
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
      gap: 1.5rem;
      padding: 0.25rem 0;
    }

    .setting-row {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .setting-label-row {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .setting-label {
      font-size: var(--sl-font-size-small, 0.875rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-700, #374151);
    }

    /* Blue dot indicator for modified settings */
    .modified-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--sl-color-primary-500, #3b82f6);
      flex-shrink: 0;
      display: inline-block;
    }

    .default-hint {
      font-size: var(--sl-font-size-x-small, 0.75rem);
      color: var(--sl-color-neutral-500, #6b7280);
      margin-top: 0.125rem;
    }

    sl-select,
    sl-input {
      width: 100%;
    }

    sl-switch {
      margin-top: 0.25rem;
    }

    .section-divider {
      height: 1px;
      background: var(--sl-color-neutral-200, #e5e7eb);
      margin: 0.5rem 0;
    }
  `;

  /** Which section of settings to display */
  @property({ type: String }) section: SettingsSection = 'comparison';

  /** Current full session config */
  @property({ type: Object }) config: SessionConfig = DEFAULT_SESSION_CONFIG;

  /** Whether the drawer is open */
  @property({ type: Boolean }) open = false;

  private _emit(key: string, value: unknown) {
    const detail: SettingsChangedDetail = { section: this.section, key, value };
    this.dispatchEvent(
      new CustomEvent<SettingsChangedDetail>('settings-changed', {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleClose() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('drawer-closed', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _isModified(section: SettingsSection, key: string, value: unknown): boolean {
    const defaults = DEFAULT_SESSION_CONFIG[section] as unknown as Record<string, unknown>;
    if (key === 'weights') {
      // Deep compare weights object
      const defaultWeights = defaults[key] as Record<string, number>;
      const currentWeights = value as Record<string, number>;
      return Object.keys(defaultWeights).some(
        (k) => defaultWeights[k] !== currentWeights[k]
      );
    }
    return defaults[key] !== value;
  }

  private _renderModifiedDot(isModified: boolean) {
    if (!isModified) return nothing;
    return html`
      <span
        class="modified-dot"
        aria-label="${t('settings-drawer.modified-indicator')}"
        title="${t('settings-drawer.modified-indicator')}"
      ></span>
    `;
  }

  private _renderComparisonSettings() {
    const cfg = this.config.comparison;
    const defaults = DEFAULT_SESSION_CONFIG.comparison;

    return html`
      <div class="settings-list">
        <!-- sensitivity -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.comparison.sensitivity')}</span>
            ${this._renderModifiedDot(this._isModified('comparison', 'sensitivity', cfg.sensitivity))}
          </div>
          <sl-select
            label="${t('settings-drawer.comparison.sensitivity')}"
            value=${cfg.sensitivity}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value as ComparisonConfig['sensitivity'];
              this._emit('sensitivity', val);
            }}
          >
            <sl-option value="semantic">${t('settings-drawer.comparison.sensitivity.semantic')}</sl-option>
            <sl-option value="exact">${t('settings-drawer.comparison.sensitivity.exact')}</sl-option>
          </sl-select>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${t(`settings-drawer.comparison.sensitivity.${defaults.sensitivity}`)}
          </div>
        </div>

        <!-- autoDetectConflicts -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.comparison.autoDetectConflicts')}</span>
            ${this._renderModifiedDot(this._isModified('comparison', 'autoDetectConflicts', cfg.autoDetectConflicts))}
          </div>
          <sl-switch
            ?checked=${cfg.autoDetectConflicts}
            aria-label="${t('settings-drawer.comparison.autoDetectConflicts')}"
            @sl-change=${(e: Event) => {
              const checked = (e.target as unknown as { checked: boolean }).checked;
              this._emit('autoDetectConflicts', checked);
            }}
          >${t('settings-drawer.comparison.autoDetectConflicts')}</sl-switch>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.autoDetectConflicts ? t('settings-drawer.on') : t('settings-drawer.off')}
          </div>
        </div>

        <!-- suggestResolutions -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.comparison.suggestResolutions')}</span>
            ${this._renderModifiedDot(this._isModified('comparison', 'suggestResolutions', cfg.suggestResolutions))}
          </div>
          <sl-switch
            ?checked=${cfg.suggestResolutions}
            aria-label="${t('settings-drawer.comparison.suggestResolutions')}"
            @sl-change=${(e: Event) => {
              const checked = (e.target as unknown as { checked: boolean }).checked;
              this._emit('suggestResolutions', checked);
            }}
          >${t('settings-drawer.comparison.suggestResolutions')}</sl-switch>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.suggestResolutions ? t('settings-drawer.on') : t('settings-drawer.off')}
          </div>
        </div>
      </div>
    `;
  }

  private _renderContractsSettings() {
    const cfg = this.config.contracts;
    const defaults = DEFAULT_SESSION_CONFIG.contracts;

    return html`
      <div class="settings-list">
        <!-- strictness -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.contracts.strictness')}</span>
            ${this._renderModifiedDot(this._isModified('contracts', 'strictness', cfg.strictness))}
          </div>
          <sl-select
            label="${t('settings-drawer.contracts.strictness')}"
            value=${cfg.strictness}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value as ContractsConfig['strictness'];
              this._emit('strictness', val);
            }}
          >
            <sl-option value="strict">${t('settings-drawer.contracts.strictness.strict')}</sl-option>
            <sl-option value="warn">${t('settings-drawer.contracts.strictness.warn')}</sl-option>
            <sl-option value="relaxed">${t('settings-drawer.contracts.strictness.relaxed')}</sl-option>
          </sl-select>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${t(`settings-drawer.contracts.strictness.${defaults.strictness}`)}
          </div>
        </div>

        <!-- driftNotifications -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.contracts.driftNotifications')}</span>
            ${this._renderModifiedDot(this._isModified('contracts', 'driftNotifications', cfg.driftNotifications))}
          </div>
          <sl-select
            label="${t('settings-drawer.contracts.driftNotifications')}"
            value=${cfg.driftNotifications}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value as ContractsConfig['driftNotifications'];
              this._emit('driftNotifications', val);
            }}
          >
            <sl-option value="immediate">${t('settings-drawer.contracts.driftNotifications.immediate')}</sl-option>
            <sl-option value="batched">${t('settings-drawer.contracts.driftNotifications.batched')}</sl-option>
            <sl-option value="silent">${t('settings-drawer.contracts.driftNotifications.silent')}</sl-option>
          </sl-select>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${t(`settings-drawer.contracts.driftNotifications.${defaults.driftNotifications}`)}
          </div>
        </div>
      </div>
    `;
  }

  private _renderRankingSettings() {
    const cfg = this.config.ranking;
    const defaults = DEFAULT_SESSION_CONFIG.ranking;

    return html`
      <div class="settings-list">
        <!-- defaultTier -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.ranking.defaultTier')}</span>
            ${this._renderModifiedDot(this._isModified('ranking', 'defaultTier', cfg.defaultTier))}
          </div>
          <sl-select
            label="${t('settings-drawer.ranking.defaultTier')}"
            value=${cfg.defaultTier}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value;
              this._emit('defaultTier', val);
            }}
          >
            <sl-option value="Must Have">${t('settings-drawer.ranking.tier.mustHave')}</sl-option>
            <sl-option value="Should Have">${t('settings-drawer.ranking.tier.shouldHave')}</sl-option>
            <sl-option value="Could Have">${t('settings-drawer.ranking.tier.couldHave')}</sl-option>
          </sl-select>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.defaultTier}
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- weights.confidence -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.ranking.weight.confidence')}</span>
            ${cfg.weights.confidence !== defaults.weights.confidence
              ? this._renderModifiedDot(true)
              : nothing}
          </div>
          <sl-input
            type="number"
            label="${t('settings-drawer.ranking.weight.confidence')}"
            value=${String(cfg.weights.confidence)}
            min="0"
            max="10"
            step="0.1"
            @sl-change=${(e: Event) => {
              const val = parseFloat((e.target as unknown as { value: string }).value);
              this._emit('weights.confidence', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.weights.confidence}
          </div>
        </div>

        <!-- weights.complexity -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.ranking.weight.complexity')}</span>
            ${cfg.weights.complexity !== defaults.weights.complexity
              ? this._renderModifiedDot(true)
              : nothing}
          </div>
          <sl-input
            type="number"
            label="${t('settings-drawer.ranking.weight.complexity')}"
            value=${String(cfg.weights.complexity)}
            min="0"
            max="10"
            step="0.1"
            @sl-change=${(e: Event) => {
              const val = parseFloat((e.target as unknown as { value: string }).value);
              this._emit('weights.complexity', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.weights.complexity}
          </div>
        </div>

        <!-- weights.references -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.ranking.weight.references')}</span>
            ${cfg.weights.references !== defaults.weights.references
              ? this._renderModifiedDot(true)
              : nothing}
          </div>
          <sl-input
            type="number"
            label="${t('settings-drawer.ranking.weight.references')}"
            value=${String(cfg.weights.references)}
            min="0"
            max="10"
            step="0.1"
            @sl-change=${(e: Event) => {
              const val = parseFloat((e.target as unknown as { value: string }).value);
              this._emit('weights.references', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.weights.references}
          </div>
        </div>
      </div>
    `;
  }

  private _renderDelegationSettings() {
    const cfg = this.config.delegation;
    const defaults = DEFAULT_SESSION_CONFIG.delegation;

    return html`
      <div class="settings-list">
        <!-- level -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.delegation.level')}</span>
            ${this._renderModifiedDot(this._isModified('delegation', 'level', cfg.level))}
          </div>
          <sl-select
            label="${t('settings-drawer.delegation.level')}"
            value=${cfg.level}
            @sl-change=${(e: Event) => {
              const val = (e.target as unknown as { value: string }).value as DelegationConfig['level'];
              this._emit('level', val);
            }}
          >
            <sl-option value="assisted">${t('settings-drawer.delegation.level.assisted')}</sl-option>
            <sl-option value="semi_autonomous">${t('settings-drawer.delegation.level.semi-autonomous')}</sl-option>
            <sl-option value="autonomous">${t('settings-drawer.delegation.level.autonomous')}</sl-option>
          </sl-select>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${t(`settings-drawer.delegation.level.${defaults.level.replace('_', '-')}`)}
          </div>
        </div>

        <!-- approvalExpiry -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.delegation.approvalExpiry')}</span>
            ${this._renderModifiedDot(this._isModified('delegation', 'approvalExpiry', cfg.approvalExpiry))}
          </div>
          <sl-input
            type="number"
            label="${t('settings-drawer.delegation.approvalExpiry')}"
            value=${String(cfg.approvalExpiry)}
            min="60"
            step="3600"
            @sl-change=${(e: Event) => {
              const val = parseInt((e.target as unknown as { value: string }).value, 10);
              this._emit('approvalExpiry', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.approvalExpiry}s
            (${t('settings-drawer.delegation.approvalExpiry.hint')})
          </div>
        </div>
      </div>
    `;
  }

  private _renderNotificationsSettings() {
    const cfg = this.config.notifications;
    const defaults = DEFAULT_SESSION_CONFIG.notifications;

    return html`
      <div class="settings-list">
        <!-- toastDuration -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.notifications.toastDuration')}</span>
            ${this._renderModifiedDot(this._isModified('notifications', 'toastDuration', cfg.toastDuration))}
          </div>
          <sl-input
            type="number"
            label="${t('settings-drawer.notifications.toastDuration')}"
            value=${String(cfg.toastDuration)}
            min="1000"
            max="30000"
            step="500"
            @sl-change=${(e: Event) => {
              const val = parseInt((e.target as unknown as { value: string }).value, 10);
              this._emit('toastDuration', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.default')}: ${defaults.toastDuration}ms
          </div>
        </div>

        <!-- silentEvents — simple comma-separated text input -->
        <div class="setting-row">
          <div class="setting-label-row">
            <span class="setting-label">${t('settings-drawer.notifications.silentEvents')}</span>
            ${cfg.silentEvents.length > 0 ? this._renderModifiedDot(true) : nothing}
          </div>
          <sl-input
            label="${t('settings-drawer.notifications.silentEvents')}"
            value=${cfg.silentEvents.join(', ')}
            placeholder="${t('settings-drawer.notifications.silentEvents.placeholder')}"
            @sl-change=${(e: Event) => {
              const raw = (e.target as unknown as { value: string }).value;
              const val = raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              this._emit('silentEvents', val);
            }}
          ></sl-input>
          <div class="default-hint">
            ${t('settings-drawer.notifications.silentEvents.hint')}
          </div>
        </div>
      </div>
    `;
  }

  private _renderSectionContent() {
    switch (this.section) {
      case 'comparison':    return this._renderComparisonSettings();
      case 'contracts':     return this._renderContractsSettings();
      case 'ranking':       return this._renderRankingSettings();
      case 'delegation':    return this._renderDelegationSettings();
      case 'notifications': return this._renderNotificationsSettings();
      default:              return nothing;
    }
  }

  override render() {
    const title = t(`settings-drawer.title.${this.section}`);

    return html`
      <sl-drawer
        label=${title}
        ?open=${this.open}
        placement="end"
        @sl-after-hide=${this._handleClose}
      >
        ${this._renderSectionContent()}
      </sl-drawer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-drawer': SettingsDrawer;
  }
}

// ---------------------------------------------------------------------------
// Gear Icon Button helper component
// ---------------------------------------------------------------------------

/**
 * Settings Gear Button — a small gear icon button that parents place in section
 * headers to open the contextual settings drawer.
 *
 * - 60% opacity by default, 100% on hover/focus
 * - Opacity transition: 200ms ease
 * - Minimum 44x44px touch target via Shoelace icon-button
 *
 * Usage:
 *   <settings-gear-button
 *     section="comparison"
 *     @click=${() => this._openDrawer = true}
 *   ></settings-gear-button>
 */
@customElement('settings-gear-button')
export class SettingsGearButton extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    sl-icon-button {
      font-size: 1rem;
      opacity: 0.6;
      transition: opacity 200ms ease;
    }

    sl-icon-button:hover,
    sl-icon-button:focus-within {
      opacity: 1;
    }
  `;

  /** Which settings section this button opens */
  @property({ type: String }) section: SettingsSection = 'comparison';

  override render() {
    const label = t('settings-drawer.gear-button.aria-label', {
      section: t(`settings-drawer.title.${this.section}`),
    });
    return html`
      <sl-icon-button
        name="gear"
        label=${label}
      ></sl-icon-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-gear-button': SettingsGearButton;
  }
}
