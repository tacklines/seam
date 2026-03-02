import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { store, type AppState } from '../../state/app-state.js';
import { getAllAggregates } from '../../lib/grouping.js';
import { getAggregateColorIndex } from '../../lib/aggregate-colors.js';
import { StoreController } from '../controllers/store-controller.js';
import { ComparisonController } from '../controllers/comparison-controller.js';
import { t } from '../../lib/i18n.js';
import { parseAndValidate } from '../../lib/yaml-loader.js';
import { registry } from '../../lib/shortcut-registry.js';
import { computeWorkflowStatus } from '../../lib/workflow-engine.js';
import type { MinimapNode, MinimapEdge, ViewTransform, GraphBounds } from '../visualization/flow-minimap.js';
import type { FlowDiagram } from '../visualization/flow-diagram.js';
import type { DetailNodeData } from '../visualization/detail-panel.js';

import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/tag/tag.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

import '../artifact/file-drop-zone.js';
import '../session/session-lobby.js';
import './phase-ribbon.js';
import '../artifact/card-view.js';
import '../visualization/flow-diagram.js';
import '../visualization/flow-minimap.js';
import '../visualization/flow-search.js';
import '../comparison/comparison-view.js';
import './aggregate-nav.js';
import './filter-panel.js';
import '../visualization/detail-panel.js';
import './shortcut-reference.js';
import './settings-dialog.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── CSS custom properties ── */
    .app-layout {
      --sidebar-width: 260px;
      --header-height: 56px;

      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: var(--header-height) auto 1fr;
      height: 100vh;
      grid-template-areas:
        "header header"
        "ribbon ribbon"
        "sidebar main";
    }

    .app-layout.sidebar-collapsed {
      grid-template-columns: 0 1fr;
    }

    /* ── Phase Ribbon ── */
    .ribbon {
      grid-area: ribbon;
    }

    /* ── Header ── */
    .header {
      grid-area: header;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      border-bottom: 1px solid var(--border-color, var(--sl-color-neutral-200));
      background: var(--surface-1, var(--sl-color-neutral-0));
      z-index: 10;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .header-title {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-bold);
      color: var(--sl-color-primary-600);
      margin: 0;
      white-space: nowrap;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .file-pills {
      display: flex;
      gap: 0.35rem;
      align-items: center;
      flex-wrap: wrap;
    }

    /* ── Sidebar ── */
    .sidebar {
      grid-area: sidebar;
      background: var(--surface-2, var(--sl-color-neutral-50));
      border-right: 1px solid var(--border-color, var(--sl-color-neutral-200));
      overflow-y: auto;
      overflow-x: hidden;
      transition: width 0.2s ease, opacity 0.2s ease;
    }

    .sidebar-collapsed .sidebar {
      width: 0;
      opacity: 0;
      overflow: hidden;
    }

    .sidebar-toggle {
      display: flex;
      justify-content: flex-end;
      padding: 0.25rem 0.5rem;
    }

    .sidebar-content {
      padding: 0;
    }

    /* ── Main ── */
    .main {
      grid-area: main;
      overflow-y: auto;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .main sl-tab-group {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .main sl-tab-group::part(body) {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .main sl-tab-panel {
      padding: 1rem;
    }
    .main sl-tab-panel[name="flow"] {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Errors ── */
    .errors {
      grid-column: 1 / -1;
      padding: 0.5rem 1rem;
    }

    .errors sl-alert {
      margin-bottom: 0.5rem;
    }

    /* ── Conflict badge ── */
    .conflict-badge {
      vertical-align: middle;
      margin-left: 0.25rem;
    }
  `;

  private _storeCtrl = new StoreController(this, (s) => s);
  private _comparisonCtrl = new ComparisonController(this);

  @state() private _minimapNodes: MinimapNode[] = [];
  @state() private _minimapEdges: MinimapEdge[] = [];
  @state() private _viewTransform: ViewTransform = { x: 0, y: 0, k: 1 };
  @state() private _graphBounds: GraphBounds = { width: 800, height: 500 };
  @state() private _searchQuery = '';
  @state() private _searchMatchCount = 0;
  @state() private _searchCurrentMatch = -1;
  @state() private _detailNodeData: DetailNodeData | null = null;
  @state() private _soloMode = false;
  @state() private _pasteToast: { count: number; role: string } | null = null;
  @state() private _shortcutReferenceOpen = false;
  @state() private _settingsOpen = false;

  private _pasteToastTimer: ReturnType<typeof setTimeout> | null = null;
  private _boundPasteHandler: ((e: ClipboardEvent) => void) | null = null;
  private _boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private get appState(): AppState {
    return this._storeCtrl.value;
  }

  connectedCallback() {
    super.connectedCallback();
    this._boundPasteHandler = (e: ClipboardEvent) => this._onGlobalPaste(e);
    document.addEventListener('paste', this._boundPasteHandler);

    // Load any stored shortcut customizations before registering
    registry.loadFromStorage();
    this._registerShortcuts();

    this._boundKeydownHandler = (e: KeyboardEvent) => {
      if (registry.handleKeydown(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', this._boundKeydownHandler);

    // Re-register defaults after a reset (e.g. from shortcut-reference "Reset" button)
    window.addEventListener('shortcut-registry-reset', this._onRegistryReset);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._boundPasteHandler) {
      document.removeEventListener('paste', this._boundPasteHandler);
      this._boundPasteHandler = null;
    }
    if (this._boundKeydownHandler) {
      document.removeEventListener('keydown', this._boundKeydownHandler);
      this._boundKeydownHandler = null;
    }
    window.removeEventListener('shortcut-registry-reset', this._onRegistryReset);
    if (this._pasteToastTimer !== null) {
      clearTimeout(this._pasteToastTimer);
      this._pasteToastTimer = null;
    }
  }

  private _onRegistryReset = () => {
    this._registerShortcuts();
  };

  private _registerShortcuts() {
    const PHASES = ['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship'] as const;

    // Phase navigation: Ctrl+Shift+1 through Ctrl+Shift+7
    PHASES.forEach((phase, index) => {
      registry.register(
        {
          id: `phase.${phase}`,
          key: String(index + 1),
          ctrl: true,
          shift: true,
          description: t(`shortcuts.phase.${phase}`),
          category: t('shortcuts.category.phases'),
        },
        () => {
          this.dispatchEvent(
            new CustomEvent('phase-navigate', {
              detail: { phase },
              bubbles: true,
              composed: true,
            })
          );
        }
      );
    });

    // Actions
    registry.register(
      { id: 'action.newEvent', key: 'n', description: t('shortcuts.action.newEvent'), category: t('shortcuts.category.actions') },
      () => {
        this.dispatchEvent(new CustomEvent('shortcut-new-event', { bubbles: true, composed: true }));
      }
    );

    registry.register(
      { id: 'action.resolve', key: 'r', description: t('shortcuts.action.resolve'), category: t('shortcuts.category.actions') },
      () => {
        this.dispatchEvent(new CustomEvent('shortcut-resolve', { bubbles: true, composed: true }));
      }
    );

    registry.register(
      { id: 'action.confirm', key: 'Enter', description: t('shortcuts.action.confirm'), category: t('shortcuts.category.actions') },
      () => {
        this.dispatchEvent(new CustomEvent('shortcut-confirm', { bubbles: true, composed: true }));
      }
    );

    registry.register(
      { id: 'action.cancel', key: 'Escape', description: t('shortcuts.action.cancel'), category: t('shortcuts.category.actions') },
      () => {
        this.dispatchEvent(new CustomEvent('shortcut-cancel', { bubbles: true, composed: true }));
      }
    );

    registry.register(
      { id: 'action.openHelp', key: '?', description: t('shortcuts.action.openHelp'), category: t('shortcuts.category.actions') },
      () => {
        this._shortcutReferenceOpen = true;
      }
    );
  }

  private _onGlobalPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    // Only intercept if it looks like storm-prep YAML
    if (!text.includes('role:') && !text.includes('candidateEvents:') && !text.includes('domain_events:')) {
      return;
    }
    const result = parseAndValidate('pasted.yaml', text);
    if (!result.ok) {
      // Invalid YAML — silently ignore, don't interrupt normal paste
      return;
    }
    // Prevent default only after successful parse so normal paste (e.g. into inputs) still works
    // when the content doesn't look like YAML
    store.addFile(result.file);
    const count = result.file.data.domain_events.length;
    const role = result.file.role;
    this._pasteToast = { count, role };
    if (this._pasteToastTimer !== null) {
      clearTimeout(this._pasteToastTimer);
    }
    this._pasteToastTimer = setTimeout(() => {
      this._pasteToast = null;
      this._pasteToastTimer = null;
    }, 4000);
  }

  render() {
    const { files } = this.appState;

    if (files.length === 0) {
      if (this._soloMode) {
        return html`
          <file-drop-zone mode="hero"></file-drop-zone>
          ${this._renderPasteToast()}
          ${this._renderShortcutReference()}
          ${this._renderSettingsDialog()}
        `;
      }
      return html`
        <session-lobby
          @session-files-ready=${this._onSessionFilesReady}
          @solo-mode=${this._onSoloMode}
        ></session-lobby>
        ${this._renderPasteToast()}
        ${this._renderShortcutReference()}
        ${this._renderSettingsDialog()}
      `;
    }

    return html`${this.renderAppLayout()}${this._renderPasteToast()}${this._renderShortcutReference()}${this._renderSettingsDialog()}`;
  }

  private _renderShortcutReference() {
    return html`
      <shortcut-reference
        ?open=${this._shortcutReferenceOpen}
        @shortcut-reference-close=${() => { this._shortcutReferenceOpen = false; }}
      ></shortcut-reference>
    `;
  }

  private _renderSettingsDialog() {
    return html`
      <settings-dialog
        ?open=${this._settingsOpen}
        @settings-dialog-close=${() => { this._settingsOpen = false; }}
        @setting-changed=${this._onSettingChanged}
      ></settings-dialog>
    `;
  }

  private _renderPasteToast() {
    if (!this._pasteToast) return nothing;
    const { count, role } = this._pasteToast;
    return html`
      <sl-alert
        variant="success"
        open
        duration="4000"
        closable
        style="position:fixed;bottom:1rem;right:1rem;z-index:9999;max-width:22rem;"
        aria-label="${t('shell.pasteSuccessAriaLabel')}"
        @sl-after-hide=${() => { this._pasteToast = null; }}
      >
        <sl-icon slot="icon" name="clipboard-check"></sl-icon>
        ${t('shell.pasteSuccess', { count: String(count), role })}
      </sl-alert>
    `;
  }

  private renderAppLayout() {
    const { files, activeView, filters, errors, sidebarCollapsed, selectedAggregate } = this.appState;
    this._comparisonCtrl.setFiles(files);
    const conflictCount = this._comparisonCtrl.conflictCount;

    return html`
      ${errors.length > 0
        ? html`
            <div class="errors" role="alert" aria-live="assertive">
              ${errors.map(
                (err) => html`
                  <sl-alert variant="danger" open closable @sl-after-hide=${() => store.clearErrors()}>
                    <strong>${err.filename}</strong>
                    <ul>
                      ${err.errors.map((e) => html`<li>${e}</li>`)}
                    </ul>
                  </sl-alert>
                `
              )}
            </div>
          `
        : nothing}

      <div class="app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <span class="header-title">${t('shell.title')}</span>
          </div>
          <div class="header-right">
            <div class="file-pills">
              ${files.map(
                (f) => html`
                  <sl-tag size="small" removable @sl-remove=${() => store.removeFile(f.role)}>
                    ${f.role}
                    <sl-badge slot="suffix" variant="neutral">${f.data.domain_events.length}</sl-badge>
                  </sl-tag>
                `
              )}
            </div>
            <sl-button size="small" variant="default" outline @click=${this.onAddFilesClick}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t('shell.addFiles')}
            </sl-button>
            <sl-icon-button
              name="gear"
              label=${t('shell.openSettings')}
              @click=${() => { this._settingsOpen = true; }}
            ></sl-icon-button>
          </div>
        </div>

        <!-- Phase Ribbon -->
        <div class="ribbon">
          <phase-ribbon
            .status=${this._workflowStatus(files)}
            @phase-navigate=${this._onPhaseNavigate}
          ></phase-ribbon>
        </div>

        <!-- Sidebar -->
        <div class="sidebar">
          <div class="sidebar-toggle">
            <sl-button
              size="small"
              variant="text"
              aria-label=${sidebarCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
              @click=${() => store.toggleSidebar()}
            >
              <sl-icon name=${sidebarCollapsed ? 'chevron-right' : 'chevron-left'} aria-hidden="true"></sl-icon>
            </sl-button>
          </div>
          <div class="sidebar-content">
            <aggregate-nav
              .files=${files}
              .selectedAggregate=${selectedAggregate}
              @aggregate-select=${this.onAggregateSelect}
            ></aggregate-nav>
            <sl-divider></sl-divider>
            <filter-panel></filter-panel>
          </div>
        </div>

        <!-- Main content -->
        <div class="main">
          <sl-tab-group @sl-tab-show=${this.onTabChange}>
            <sl-tab slot="nav" panel="cards" ?active=${activeView === 'cards'}>
              ${t('shell.tab.events')}
            </sl-tab>
            <sl-tab slot="nav" panel="flow" ?active=${activeView === 'flow'}>
              ${t('shell.tab.flow')}
            </sl-tab>
            <sl-tab slot="nav" panel="comparison" ?active=${activeView === 'comparison'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.conflicts')}
              ${conflictCount > 0
                ? html`<sl-badge class="conflict-badge" variant="warning" pill>${conflictCount}</sl-badge>`
                : nothing}
            </sl-tab>

            <sl-tab-panel name="cards">
              <card-view
                .files=${files}
                .confidenceFilter=${filters.confidence}
                .directionFilter=${filters.direction}
              ></card-view>
            </sl-tab-panel>
            <sl-tab-panel name="flow">
              <flow-search
                .matchCount=${this._searchMatchCount}
                .currentMatch=${this._searchCurrentMatch}
                @flow-search=${this._onFlowSearch}
                @flow-search-next=${this._onFlowSearchNext}
              ></flow-search>
              <div style="position: relative; flex: 1; min-height: 0;">
                <flow-diagram
                  .files=${files}
                  .searchQuery=${this._searchQuery}
                  @view-transform-changed=${this._onViewTransformChanged}
                  @graph-data-changed=${this._onGraphDataChanged}
                  @search-match-count=${this._onSearchMatchCount}
                  @node-detail=${this._onNodeDetail}
                  id="flow-diagram"
                ></flow-diagram>
                <flow-minimap
                  .nodes=${this._minimapNodes}
                  .edges=${this._minimapEdges}
                  .viewTransform=${this._viewTransform}
                  .graphBounds=${this._graphBounds}
                  @minimap-navigate=${this._onMinimapNavigate}
                ></flow-minimap>
                <detail-panel
                  .nodeData=${this._detailNodeData}
                  @detail-panel-close=${this._onDetailPanelClose}
                ></detail-panel>
              </div>
            </sl-tab-panel>
            <sl-tab-panel name="comparison">
              <comparison-view .files=${files}></comparison-view>
            </sl-tab-panel>
          </sl-tab-group>
        </div>
      </div>

      <!-- Hidden file drop zone triggered by "Add files" button -->
      <file-drop-zone mode="compact" style="display:none" id="hidden-drop"></file-drop-zone>
    `;
  }

  /**
   * Derive a minimal WorkflowStatus from the loaded files for the Phase Ribbon.
   * In standalone (non-session) mode we only know submission count; jam, contracts,
   * and integration artifacts are absent.
   */
  private _workflowStatus(files: AppState['files']) {
    return computeWorkflowStatus({
      participantCount: files.length,
      submissionCount: files.length,
      jam: null,
      contracts: null,
      integrationReport: null,
    });
  }

  private _onPhaseNavigate(e: CustomEvent<{ phase: string }>) {
    // Map UX phase to the most relevant tab
    const phaseToTab: Record<string, 'cards' | 'flow' | 'comparison'> = {
      spark: 'cards',
      explore: 'cards',
      rank: 'cards',
      slice: 'comparison',
      agree: 'comparison',
      build: 'cards',
      ship: 'cards',
    };
    const tab = phaseToTab[e.detail.phase] ?? 'cards';
    store.setView(tab);
  }

  private _onSessionFilesReady(e: CustomEvent<{ files: import('../../schema/types.js').LoadedFile[] }>) {
    store.clearErrors();
    for (const file of e.detail.files) {
      store.addFile(file);
    }
  }

  private _onSoloMode() {
    this._soloMode = true;
  }

  private onTabChange(e: CustomEvent) {
    const panel = (e.detail as { name: string }).name;
    if (panel === 'cards' || panel === 'flow' || panel === 'comparison') {
      store.setView(panel);
    }
  }

  private onAggregateSelect(e: CustomEvent) {
    store.setSelectedAggregate(e.detail.aggregate);
  }

  private onAddFilesClick() {
    const dropZone = this.renderRoot.querySelector<HTMLElement>('#hidden-drop');
    if (dropZone) {
      const input = dropZone.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]');
      input?.click();
    }
  }

  private _onViewTransformChanged(e: CustomEvent) {
    this._viewTransform = e.detail as ViewTransform;
  }

  private _onGraphDataChanged(e: CustomEvent) {
    const { minimapNodes, minimapEdges, graphBounds } = e.detail as {
      minimapNodes: MinimapNode[];
      minimapEdges: MinimapEdge[];
      graphBounds: GraphBounds;
    };
    this._minimapNodes = minimapNodes;
    this._minimapEdges = minimapEdges;
    this._graphBounds = graphBounds;
  }

  private _onMinimapNavigate(e: CustomEvent) {
    e.stopPropagation();
    const flowDiagram = this.renderRoot.querySelector<FlowDiagram>('#flow-diagram');
    if (flowDiagram) {
      flowDiagram.applyMinimapTransform(e.detail as ViewTransform);
    }
  }

  private _onFlowSearch(e: CustomEvent<{ query: string }>) {
    this._searchQuery = e.detail.query;
  }

  private _onFlowSearchNext() {
    const diagram = this.renderRoot.querySelector<FlowDiagram>('#flow-diagram');
    diagram?.nextMatch();
  }

  private _onSearchMatchCount(e: CustomEvent<{ count: number; current: number }>) {
    this._searchMatchCount = e.detail.count;
    this._searchCurrentMatch = e.detail.current;
  }

  private _onNodeDetail(e: CustomEvent<{ kind: 'aggregate' | 'external'; id: string }>) {
    const { kind, id } = e.detail;
    const { files } = this.appState;
    const allAggregates = getAllAggregates(files);

    if (kind === 'aggregate') {
      // id may be a compound aggregate name (e.g., "OrderAggregate")
      // or a leaf event node id with format "Aggregate::EventName"
      // In both cases we show the aggregate detail panel.
      const aggregateName = id.includes('::') ? id.split('::')[0] : id;
      const colorIndex = getAggregateColorIndex(aggregateName, allAggregates);

      // Collect all domain events belonging to this aggregate across all files
      const events = files.flatMap((f) =>
        f.data.domain_events
          .filter((ev) => ev.aggregate === aggregateName)
          .map((ev) => ({
            name: ev.name,
            trigger: ev.trigger,
            confidence: ev.confidence,
            direction: ev.integration.direction,
            channel: ev.integration.channel,
          })),
      );

      // Find connected external systems: events with inbound/outbound integration channel
      const connectedSystems = Array.from(
        new Set(
          files
            .flatMap((f) => f.data.domain_events)
            .filter(
              (ev) =>
                ev.aggregate === aggregateName &&
                (ev.integration.direction === 'inbound' || ev.integration.direction === 'outbound') &&
                ev.integration.channel,
            )
            .map((ev) => ev.integration.channel as string),
        ),
      );

      this._detailNodeData = {
        kind: 'aggregate',
        id: aggregateName,
        label: aggregateName,
        colorIndex,
        events,
        connectedSystems: connectedSystems.length > 0 ? connectedSystems : undefined,
      };
    } else {
      // External system node: id is the system name
      const systemName = id;

      // Collect all events that connect to this external system via their integration channel
      const events = files.flatMap((f) =>
        f.data.domain_events
          .filter(
            (ev) =>
              ev.integration.channel === systemName &&
              (ev.integration.direction === 'inbound' || ev.integration.direction === 'outbound'),
          )
          .map((ev) => ({
            name: ev.name,
            trigger: ev.trigger,
            confidence: ev.confidence,
            direction: ev.integration.direction,
            channel: ev.integration.channel,
          })),
      );

      this._detailNodeData = {
        kind: 'external',
        id,
        label: systemName,
        colorIndex: 0,
        events,
      };
    }
  }

  private _onDetailPanelClose() {
    this._detailNodeData = null;
  }

  private _onSettingChanged(e: CustomEvent<{ key: string; value: unknown }>) {
    // Forward setting-changed events from the dialog to the app level.
    // Parent components or the store can listen for these to apply changes.
    this.dispatchEvent(
      new CustomEvent('setting-changed', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      })
    );
  }
}
