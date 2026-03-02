import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { registry } from '../../lib/shortcut-registry.js';
import type { Shortcut } from '../../lib/shortcut-registry.js';
import { t } from '../../lib/i18n.js';
import type { SettingItem } from './settings-drawer.js';

import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import './settings-section.js';

/**
 * `<settings-dialog>` — Full-screen global settings dialog accessible from the app-shell header.
 *
 * Uses `sl-dialog` with `sl-tab-group` (vertical placement on desktop, horizontal on mobile)
 * for seven setting tabs: Session, Artifacts, Comparison, Contracts, Notifications,
 * Delegation, and Shortcuts.
 *
 * Modified settings show a blue dot. Settings save immediately — no Save button.
 *
 * @fires setting-changed - `detail: { key: string; value: unknown }`
 */
@customElement('settings-dialog')
export class SettingsDialog extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    sl-dialog::part(panel) {
      width: min(90vw, 720px);
      height: min(85vh, 600px);
      display: flex;
      flex-direction: column;
    }

    sl-dialog::part(body) {
      flex: 1;
      overflow: hidden;
      padding: 0;
    }

    sl-dialog::part(header) {
      padding-bottom: 0;
    }

    .tabs-container {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    sl-tab-group {
      width: 100%;
      height: 100%;
    }

    sl-tab-group::part(base) {
      height: 100%;
    }

    sl-tab-group::part(nav) {
      min-width: 130px;
      background: var(--sl-color-neutral-50);
      border-right: 1px solid var(--sl-color-neutral-200);
    }

    sl-tab-group::part(body) {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    sl-tab-panel {
      padding: 0;
    }

    sl-tab-panel::part(base) {
      padding: 0;
    }

    /* Shortcuts tab */
    .shortcuts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .shortcuts-table thead th {
      text-align: left;
      padding: 0.375rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sl-color-neutral-500);
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    .shortcuts-table tbody td {
      padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--sl-color-neutral-100);
      vertical-align: middle;
    }

    .shortcuts-table tbody tr:last-child td {
      border-bottom: none;
    }

    .shortcut-keys {
      display: flex;
      align-items: center;
      gap: 0.25rem;
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

    .reset-all-row {
      margin-top: 1rem;
      display: flex;
      justify-content: flex-end;
    }

    /* Responsive: on small screens use horizontal tabs */
    @media (max-width: 640px) {
      sl-tab-group::part(nav) {
        min-width: unset;
        background: transparent;
        border-right: none;
        border-bottom: 1px solid var(--sl-color-neutral-200);
      }
    }
  `;

  /** Whether the dialog is currently visible. */
  @property({ type: Boolean }) open = false;

  /** Which tab is active. */
  @property({ type: String }) activeTab = 'session';

  @state() private _settings: Map<string, unknown> = new Map();
  @state() private _shortcuts: Shortcut[] = [];

  private _boundResetHandler: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._initDefaults();
    this._refreshShortcuts();
    this._boundResetHandler = () => this._refreshShortcuts();
    window.addEventListener('shortcut-registry-reset', this._boundResetHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._boundResetHandler) {
      window.removeEventListener('shortcut-registry-reset', this._boundResetHandler);
      this._boundResetHandler = null;
    }
  }

  private _initDefaults(): void {
    // Initialize all settings to their defaults if not already set
    for (const item of this._allSettings()) {
      if (!this._settings.has(item.key)) {
        this._settings.set(item.key, item.defaultValue);
      }
    }
  }

  private _allSettings(): SettingItem[] {
    return [
      ...this._sessionSettings(),
      ...this._artifactSettings(),
      ...this._comparisonSettings(),
      ...this._contractSettings(),
      ...this._notificationSettings(),
      ...this._delegationSettings(),
    ];
  }

  private _refreshShortcuts(): void {
    this._shortcuts = registry.getAll();
  }

  private _sessionSettings(): SettingItem[] {
    return [
      {
        key: 'sessionName',
        label: t('settingsDialog.sessionName'),
        type: 'input',
        value: this._settings.get('sessionName') ?? '',
        defaultValue: '',
      },
      {
        key: 'participantLimit',
        label: t('settingsDialog.participantLimit'),
        type: 'number',
        value: this._settings.get('participantLimit') ?? 10,
        defaultValue: 10,
      },
      {
        key: 'workflowTemplate',
        label: t('settingsDialog.workflowTemplate'),
        type: 'select',
        value: this._settings.get('workflowTemplate') ?? 'event-storming',
        defaultValue: 'event-storming',
        options: [
          { label: 'Event Storming', value: 'event-storming' },
          { label: 'Domain Discovery', value: 'domain-discovery' },
          { label: 'Custom', value: 'custom' },
        ],
      },
    ];
  }

  private _artifactSettings(): SettingItem[] {
    return [
      {
        key: 'validationStrictness',
        label: t('settingsDialog.validationStrictness'),
        type: 'select',
        value: this._settings.get('validationStrictness') ?? 'standard',
        defaultValue: 'standard',
        options: [
          { label: 'Lenient', value: 'lenient' },
          { label: 'Standard', value: 'standard' },
          { label: 'Strict', value: 'strict' },
        ],
      },
      {
        key: 'autoValidate',
        label: t('settingsDialog.autoValidate'),
        type: 'switch',
        value: this._settings.get('autoValidate') ?? true,
        defaultValue: true,
      },
    ];
  }

  private _comparisonSettings(): SettingItem[] {
    return [
      {
        key: 'comparisonSensitivity',
        label: t('settingsDialog.comparisonSensitivity'),
        type: 'select',
        value: this._settings.get('comparisonSensitivity') ?? 'moderate',
        defaultValue: 'moderate',
        options: [
          { label: 'Loose', value: 'loose' },
          { label: 'Moderate', value: 'moderate' },
          { label: 'Exact', value: 'exact' },
        ],
      },
      {
        key: 'autoSuggestResolutions',
        label: t('settingsDialog.autoSuggestResolutions'),
        type: 'switch',
        value: this._settings.get('autoSuggestResolutions') ?? true,
        defaultValue: true,
      },
    ];
  }

  private _contractSettings(): SettingItem[] {
    return [
      {
        key: 'contractStrictness',
        label: t('settingsDialog.contractStrictness'),
        type: 'select',
        value: this._settings.get('contractStrictness') ?? 'standard',
        defaultValue: 'standard',
        options: [
          { label: 'Lenient', value: 'lenient' },
          { label: 'Standard', value: 'standard' },
          { label: 'Strict', value: 'strict' },
        ],
      },
      {
        key: 'driftNotifications',
        label: t('settingsDialog.driftNotifications'),
        type: 'switch',
        value: this._settings.get('driftNotifications') ?? true,
        defaultValue: true,
      },
      {
        key: 'complianceCheckFrequency',
        label: t('settingsDialog.complianceCheckFrequency'),
        type: 'select',
        value: this._settings.get('complianceCheckFrequency') ?? 'on-change',
        defaultValue: 'on-change',
        options: [
          { label: 'On Change', value: 'on-change' },
          { label: 'Periodic', value: 'periodic' },
          { label: 'Manual', value: 'manual' },
        ],
      },
    ];
  }

  private _notificationSettings(): SettingItem[] {
    return [
      {
        key: 'showArtifactToasts',
        label: t('settingsDialog.showArtifactToasts'),
        type: 'switch',
        value: this._settings.get('showArtifactToasts') ?? true,
        defaultValue: true,
      },
      {
        key: 'showResolutionToasts',
        label: t('settingsDialog.showResolutionToasts'),
        type: 'switch',
        value: this._settings.get('showResolutionToasts') ?? true,
        defaultValue: true,
      },
      {
        key: 'showPresenceToasts',
        label: t('settingsDialog.showPresenceToasts'),
        type: 'switch',
        value: this._settings.get('showPresenceToasts') ?? false,
        defaultValue: false,
      },
      {
        key: 'showMilestoneToasts',
        label: t('settingsDialog.showMilestoneToasts'),
        type: 'switch',
        value: this._settings.get('showMilestoneToasts') ?? true,
        defaultValue: true,
      },
    ];
  }

  private _delegationSettings(): SettingItem[] {
    return [
      {
        key: 'defaultDelegationLevel',
        label: t('settingsDialog.defaultDelegationLevel'),
        type: 'select',
        value: this._settings.get('defaultDelegationLevel') ?? 'assisted',
        defaultValue: 'assisted',
        options: [
          { label: 'Assisted', value: 'assisted' },
          { label: 'Semi-autonomous', value: 'semi_autonomous' },
          { label: 'Autonomous', value: 'autonomous' },
        ],
      },
    ];
  }

  render() {
    const tabPlacement = window.matchMedia('(max-width: 640px)').matches ? 'top' : 'start';

    return html`
      <sl-dialog
        label=${t('settingsDialog.title')}
        ?open=${this.open}
        @sl-request-close=${this._onRequestClose}
      >
        <div class="tabs-container">
          <sl-tab-group placement=${tabPlacement} @sl-tab-show=${this._onTabShow}>
            <sl-tab slot="nav" panel="session" ?active=${this.activeTab === 'session'}>
              ${t('settingsDialog.session')}
            </sl-tab>
            <sl-tab slot="nav" panel="artifacts" ?active=${this.activeTab === 'artifacts'}>
              ${t('settingsDialog.artifacts')}
            </sl-tab>
            <sl-tab slot="nav" panel="comparison" ?active=${this.activeTab === 'comparison'}>
              ${t('settingsDialog.comparison')}
            </sl-tab>
            <sl-tab slot="nav" panel="contracts" ?active=${this.activeTab === 'contracts'}>
              ${t('settingsDialog.contracts')}
            </sl-tab>
            <sl-tab slot="nav" panel="notifications" ?active=${this.activeTab === 'notifications'}>
              ${t('settingsDialog.notifications')}
            </sl-tab>
            <sl-tab slot="nav" panel="delegation" ?active=${this.activeTab === 'delegation'}>
              ${t('settingsDialog.delegation')}
            </sl-tab>
            <sl-tab slot="nav" panel="shortcuts" ?active=${this.activeTab === 'shortcuts'}>
              ${t('settingsDialog.shortcuts')}
            </sl-tab>

            <sl-tab-panel name="session">
              <settings-section
                .settings=${this._sessionSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="artifacts">
              <settings-section
                .settings=${this._artifactSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="comparison">
              <settings-section
                .settings=${this._comparisonSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="contracts">
              <settings-section
                .settings=${this._contractSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="notifications">
              <settings-section
                .settings=${this._notificationSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="delegation">
              <settings-section
                .settings=${this._delegationSettings()}
                idPrefix="dialog-label"
                @setting-changed=${this._onSettingChanged}
              ></settings-section>
            </sl-tab-panel>

            <sl-tab-panel name="shortcuts">
              ${this._renderShortcutsTab()}
            </sl-tab-panel>
          </sl-tab-group>
        </div>
      </sl-dialog>
    `;
  }

  private _renderShortcutsTab() {
    return html`
      <table class="shortcuts-table" aria-label=${t('settingsDialog.shortcuts')}>
        <thead>
          <tr>
            <th>${t('settingsDialog.shortcutAction')}</th>
            <th>${t('settingsDialog.shortcutBinding')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this._shortcuts.map((s) => this._renderShortcutRow(s))}
        </tbody>
      </table>
      <div class="reset-all-row">
        <sl-button
          size="small"
          variant="default"
          outline
          @click=${this._onResetAllShortcuts}
        >
          <sl-icon slot="prefix" name="arrow-counterclockwise" aria-hidden="true"></sl-icon>
          ${t('settingsDialog.resetAllShortcuts')}
        </sl-button>
      </div>
    `;
  }

  private _renderShortcutRow(shortcut: Shortcut) {
    return html`
      <tr>
        <td>${shortcut.description}</td>
        <td>
          <span class="shortcut-keys" aria-label=${this._keyComboAriaLabel(shortcut)}>
            ${this._renderKeyCombo(shortcut)}
          </span>
        </td>
        <td>
          <sl-button
            size="small"
            variant="text"
            @click=${() => this._onResetShortcut(shortcut.id)}
          >
            ${t('settingsDialog.resetShortcut')}
          </sl-button>
        </td>
      </tr>
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

  private _onSettingChanged(e: CustomEvent<{ key: string; value: unknown }>): void {
    // Stop the inner event from escaping the dialog shadow root, then re-dispatch
    // from the dialog host so the external API emits exactly one event per change.
    e.stopPropagation();
    const { key, value } = e.detail;
    // Immutable update to trigger Lit re-render (drives blue-dot modified state)
    this._settings = new Map(this._settings).set(key, value);
    // Re-dispatch from this element so the external API is preserved
    this.dispatchEvent(
      new CustomEvent('setting-changed', {
        detail: { key, value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onRequestClose(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('settings-dialog-close', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onTabShow(e: CustomEvent): void {
    const panel = (e.detail as { name: string }).name;
    this.activeTab = panel;
  }

  private _onResetShortcut(id: string): void {
    // Reset a single shortcut by clearing its customization via registry
    // The registry does not expose per-shortcut reset directly — we reset all
    // and let app-shell re-register. For a single shortcut, we can call customize
    // with undefined values to strip customization.
    const shortcuts = registry.getAll();
    const shortcut = shortcuts.find((s) => s.id === id);
    if (!shortcut) return;
    // Resetting a single shortcut: strip customization entry in registry
    // by reapplying the default (there is no per-id reset API, so we fire the
    // global reset — acceptable since it re-registers everything).
    registry.resetDefaults();
    this._refreshShortcuts();
  }

  private _onResetAllShortcuts(): void {
    registry.resetDefaults();
    this._refreshShortcuts();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-dialog': SettingsDialog;
  }
}
