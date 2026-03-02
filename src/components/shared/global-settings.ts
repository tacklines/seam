import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SessionConfig } from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';
import type { SettingItem } from './settings-drawer.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

type TabId = 'session' | 'artifacts' | 'comparison' | 'contracts' | 'notifications' | 'delegation' | 'shortcuts';

/**
 * `<global-settings>` — Full settings dialog with tabbed sections.
 *
 * Wraps a Shoelace `sl-dialog` with an `sl-tab-group` containing 7 tabs,
 * one for each settings domain. Each tab reuses the same setting-row rendering
 * pattern as `<settings-drawer>`. Tab headers show a blue dot when any setting
 * in their section has been modified from the default.
 *
 * @fires config-changed - `detail: { section: string; key: string; value: unknown }`
 */
@customElement('global-settings')
export class GlobalSettings extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    sl-dialog::part(panel) {
      max-width: 700px;
      width: 90vw;
    }

    sl-dialog::part(body) {
      padding: 0;
    }

    sl-tab-group {
      --indicator-color: var(--sl-color-primary-500);
    }

    sl-tab-panel {
      padding: 1.25rem 1.5rem;
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
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

    .modified-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      flex-shrink: 0;
      display: inline-block;
    }

    .tab-modified-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      margin-left: 0.375rem;
      vertical-align: middle;
      flex-shrink: 0;
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

    .shortcuts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .shortcuts-table th {
      text-align: left;
      font-weight: 600;
      color: var(--sl-color-neutral-700);
      padding: 0.375rem 0.5rem;
      border-bottom: 2px solid var(--sl-color-neutral-200);
    }

    .shortcuts-table td {
      padding: 0.5rem;
      border-bottom: 1px solid var(--sl-color-neutral-100);
      color: var(--sl-color-neutral-800);
      vertical-align: middle;
    }

    kbd {
      display: inline-block;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      border: 1px solid var(--sl-color-neutral-300);
      background: var(--sl-color-neutral-50);
      font-family: var(--sl-font-mono);
      font-size: 0.8125rem;
      color: var(--sl-color-neutral-800);
      box-shadow: 0 1px 0 var(--sl-color-neutral-300);
    }

    .placeholder-text {
      color: var(--sl-color-neutral-500);
      font-size: 0.875rem;
      padding: 0.5rem 0;
    }
  `;

  /** Full session configuration object */
  @property({ attribute: false }) config: SessionConfig = { ...DEFAULT_SESSION_CONFIG };

  /** Whether the dialog is open */
  @property({ type: Boolean }) open = false;

  render() {
    return html`
      <sl-dialog
        label=${t('globalSettings.title')}
        ?open=${this.open}
        @sl-after-hide=${this._onDialogClose}
      >
        <sl-tab-group>
          <!-- Session tab -->
          <sl-tab slot="nav" panel="session">
            ${t('globalSettings.tab.session')}
          </sl-tab>

          <!-- Artifacts tab -->
          <sl-tab slot="nav" panel="artifacts">
            ${t('globalSettings.tab.artifacts')}
          </sl-tab>

          <!-- Comparison tab -->
          <sl-tab slot="nav" panel="comparison">
            ${t('globalSettings.tab.comparison')}
            ${this._sectionHasModified('comparison')
              ? html`<span class="tab-modified-dot" aria-label="${t('globalSettings.modifiedAriaLabel')}"></span>`
              : nothing}
          </sl-tab>

          <!-- Contracts tab -->
          <sl-tab slot="nav" panel="contracts">
            ${t('globalSettings.tab.contracts')}
            ${this._sectionHasModified('contracts')
              ? html`<span class="tab-modified-dot" aria-label="${t('globalSettings.modifiedAriaLabel')}"></span>`
              : nothing}
          </sl-tab>

          <!-- Notifications tab -->
          <sl-tab slot="nav" panel="notifications">
            ${t('globalSettings.tab.notifications')}
            ${this._sectionHasModified('notifications')
              ? html`<span class="tab-modified-dot" aria-label="${t('globalSettings.modifiedAriaLabel')}"></span>`
              : nothing}
          </sl-tab>

          <!-- Delegation tab -->
          <sl-tab slot="nav" panel="delegation">
            ${t('globalSettings.tab.delegation')}
            ${this._sectionHasModified('delegation')
              ? html`<span class="tab-modified-dot" aria-label="${t('globalSettings.modifiedAriaLabel')}"></span>`
              : nothing}
          </sl-tab>

          <!-- Shortcuts tab -->
          <sl-tab slot="nav" panel="shortcuts">
            ${t('globalSettings.tab.shortcuts')}
          </sl-tab>

          <!-- Panels -->
          <sl-tab-panel name="session">
            ${this._renderSettingsList(this._sessionSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="artifacts">
            ${this._renderSettingsList(this._artifactsSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="comparison">
            ${this._renderSettingsList(this._comparisonSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="contracts">
            ${this._renderSettingsList(this._contractsSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="notifications">
            ${this._renderSettingsList(this._notificationsSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="delegation">
            ${this._renderSettingsList(this._delegationSettings())}
          </sl-tab-panel>

          <sl-tab-panel name="shortcuts">
            ${this._renderShortcuts()}
          </sl-tab-panel>
        </sl-tab-group>
      </sl-dialog>
    `;
  }

  // ---------------------------------------------------------------------------
  // Settings definitions per tab
  // ---------------------------------------------------------------------------

  private _sessionSettings(): SettingItem[] {
    return [
      {
        key: 'session.name',
        label: t('globalSettings.session.name'),
        type: 'input',
        value: '',
        defaultValue: '',
        description: t('globalSettings.session.nameDescription'),
      },
      {
        key: 'session.participantLimit',
        label: t('globalSettings.session.participantLimit'),
        type: 'number',
        value: 20,
        defaultValue: 20,
        description: t('globalSettings.session.participantLimitDescription'),
      },
    ];
  }

  private _artifactsSettings(): SettingItem[] {
    return [
      {
        key: 'artifacts.autoValidate',
        label: t('globalSettings.artifacts.autoValidate'),
        type: 'switch',
        value: true,
        defaultValue: true,
        description: t('globalSettings.artifacts.autoValidateDescription'),
      },
      {
        key: 'artifacts.validationStrictness',
        label: t('globalSettings.artifacts.validationStrictness'),
        type: 'select',
        value: 'warn',
        defaultValue: 'warn',
        options: [
          { label: t('globalSettings.artifacts.strictnessStrict'), value: 'strict' },
          { label: t('globalSettings.artifacts.strictnessWarn'), value: 'warn' },
          { label: t('globalSettings.artifacts.strictnessRelaxed'), value: 'relaxed' },
        ],
        description: t('globalSettings.artifacts.validationStrictnessDescription'),
      },
    ];
  }

  private _comparisonSettings(): SettingItem[] {
    return [
      {
        key: 'comparison.sensitivity',
        label: t('globalSettings.comparison.sensitivity'),
        type: 'select',
        value: this.config.comparison.sensitivity,
        defaultValue: DEFAULT_SESSION_CONFIG.comparison.sensitivity,
        options: [
          { label: t('globalSettings.comparison.sensitivitySemantic'), value: 'semantic' },
          { label: t('globalSettings.comparison.sensitivityExact'), value: 'exact' },
        ],
        description: t('globalSettings.comparison.sensitivityDescription'),
      },
      {
        key: 'comparison.autoDetectConflicts',
        label: t('globalSettings.comparison.autoDetectConflicts'),
        type: 'switch',
        value: this.config.comparison.autoDetectConflicts,
        defaultValue: DEFAULT_SESSION_CONFIG.comparison.autoDetectConflicts,
        description: t('globalSettings.comparison.autoDetectConflictsDescription'),
      },
      {
        key: 'comparison.suggestResolutions',
        label: t('globalSettings.comparison.suggestResolutions'),
        type: 'switch',
        value: this.config.comparison.suggestResolutions,
        defaultValue: DEFAULT_SESSION_CONFIG.comparison.suggestResolutions,
        description: t('globalSettings.comparison.suggestResolutionsDescription'),
      },
    ];
  }

  private _contractsSettings(): SettingItem[] {
    return [
      {
        key: 'contracts.strictness',
        label: t('globalSettings.contracts.strictness'),
        type: 'select',
        value: this.config.contracts.strictness,
        defaultValue: DEFAULT_SESSION_CONFIG.contracts.strictness,
        options: [
          { label: t('globalSettings.contracts.strictnessStrict'), value: 'strict' },
          { label: t('globalSettings.contracts.strictnessWarn'), value: 'warn' },
          { label: t('globalSettings.contracts.strictnessRelaxed'), value: 'relaxed' },
        ],
        description: t('globalSettings.contracts.strictnessDescription'),
      },
      {
        key: 'contracts.driftNotifications',
        label: t('globalSettings.contracts.driftNotifications'),
        type: 'select',
        value: this.config.contracts.driftNotifications,
        defaultValue: DEFAULT_SESSION_CONFIG.contracts.driftNotifications,
        options: [
          { label: t('globalSettings.contracts.driftImmediate'), value: 'immediate' },
          { label: t('globalSettings.contracts.driftBatched'), value: 'batched' },
          { label: t('globalSettings.contracts.driftSilent'), value: 'silent' },
        ],
        description: t('globalSettings.contracts.driftNotificationsDescription'),
      },
    ];
  }

  private _notificationsSettings(): SettingItem[] {
    return [
      {
        key: 'notifications.toastDuration',
        label: t('globalSettings.notifications.toastDuration'),
        type: 'number',
        value: this.config.notifications.toastDuration,
        defaultValue: DEFAULT_SESSION_CONFIG.notifications.toastDuration,
        description: t('globalSettings.notifications.toastDurationDescription'),
      },
    ];
  }

  private _delegationSettings(): SettingItem[] {
    return [
      {
        key: 'delegation.level',
        label: t('globalSettings.delegation.level'),
        type: 'select',
        value: this.config.delegation.level,
        defaultValue: DEFAULT_SESSION_CONFIG.delegation.level,
        options: [
          { label: t('globalSettings.delegation.levelAssisted'), value: 'assisted' },
          { label: t('globalSettings.delegation.levelSemiAutonomous'), value: 'semi_autonomous' },
          { label: t('globalSettings.delegation.levelAutonomous'), value: 'autonomous' },
        ],
        description: t('globalSettings.delegation.levelDescription'),
      },
      {
        key: 'delegation.approvalExpiry',
        label: t('globalSettings.delegation.approvalExpiry'),
        type: 'number',
        value: this.config.delegation.approvalExpiry,
        defaultValue: DEFAULT_SESSION_CONFIG.delegation.approvalExpiry,
        description: t('globalSettings.delegation.approvalExpiryDescription'),
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  private _renderSettingsList(items: SettingItem[]) {
    return html`
      <div class="settings-list" role="list">
        ${items.map((item) => this._renderSettingRow(item))}
      </div>
    `;
  }

  private _renderSettingRow(item: SettingItem) {
    const modified = this._isModified(item);
    return html`
      <div class="setting-row" role="listitem">
        <div class="setting-header">
          <span class="setting-label" id="gs-label-${item.key}">${item.label}</span>
          ${modified
            ? html`<span class="modified-dot" aria-label="${t('settingsDrawer.modifiedAriaLabel')}"></span>`
            : nothing}
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
            aria-labelledby="gs-label-${item.key}"
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
            aria-labelledby="gs-label-${item.key}"
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
            aria-labelledby="gs-label-${item.key}"
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
            aria-labelledby="gs-label-${item.key}"
            @sl-change=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value;
              this._emitChange(item.key, val);
            }}
          ></sl-input>
        `;
    }
  }

  private _renderShortcuts() {
    const shortcuts = [
      { key: '?', action: t('globalSettings.shortcuts.openHelp') },
      { key: 'Esc', action: t('globalSettings.shortcuts.closeDialog') },
      { key: '/', action: t('globalSettings.shortcuts.focusSearch') },
      { key: 'Tab', action: t('globalSettings.shortcuts.nextControl') },
      { key: 'Shift+Tab', action: t('globalSettings.shortcuts.prevControl') },
      { key: 'Enter / Space', action: t('globalSettings.shortcuts.activate') },
      { key: '← →', action: t('globalSettings.shortcuts.navigateTabs') },
    ];

    return html`
      <table class="shortcuts-table" aria-label="${t('globalSettings.shortcuts.tableAriaLabel')}">
        <thead>
          <tr>
            <th>${t('globalSettings.shortcuts.keyColumn')}</th>
            <th>${t('globalSettings.shortcuts.actionColumn')}</th>
          </tr>
        </thead>
        <tbody>
          ${shortcuts.map(
            (s) => html`
              <tr>
                <td><kbd>${s.key}</kbd></td>
                <td>${s.action}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
    `;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private _isModified(item: SettingItem): boolean {
    return JSON.stringify(item.value) !== JSON.stringify(item.defaultValue);
  }

  private _formatDefault(item: SettingItem): string {
    const val = item.defaultValue;
    if (typeof val === 'boolean') return val ? t('settingsDrawer.defaultTrue') : t('settingsDrawer.defaultFalse');
    return String(val);
  }

  /**
   * Check if any setting in a config section has been modified from the default.
   * Maps section names to the relevant config sub-object keys.
   */
  private _sectionHasModified(section: 'comparison' | 'contracts' | 'notifications' | 'delegation'): boolean {
    const current = this.config[section] as unknown as Record<string, unknown>;
    const defaults = DEFAULT_SESSION_CONFIG[section] as unknown as Record<string, unknown>;
    return Object.keys(defaults).some(
      (key) => JSON.stringify(current[key]) !== JSON.stringify(defaults[key])
    );
  }

  private _emitChange(dotKey: string, value: unknown) {
    // dotKey is like "comparison.sensitivity" — split into section + key
    const dotIdx = dotKey.indexOf('.');
    const section = dotIdx >= 0 ? dotKey.slice(0, dotIdx) : dotKey;
    const key = dotIdx >= 0 ? dotKey.slice(dotIdx + 1) : dotKey;

    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { section, key, value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onDialogClose() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('global-settings-close', {
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'global-settings': GlobalSettings;
  }
}
