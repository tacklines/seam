import { LitElement, html, css, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { store, type AppState } from '../../state/app-state.js';
import { getAllAggregates } from '../../lib/grouping.js';
import { getAggregateColorIndex } from '../../lib/aggregate-colors.js';
import { StoreController } from '../controllers/store-controller.js';
import { ComparisonController } from '../controllers/comparison-controller.js';
import type { Overlap } from '../../lib/comparison.js';
import { t } from '../../lib/i18n.js';
import { parseAndValidate } from '../../lib/yaml-loader.js';
import { registry } from '../../lib/shortcut-registry.js';
import { computeWorkflowStatus } from '../../lib/workflow-engine.js';
import { computeSessionStatus } from '../../lib/prep-completeness.js';
import type { SuggestionContext } from '../../lib/format-suggestion.js';
import type { MinimapNode, MinimapEdge, ViewTransform, GraphBounds } from '../visualization/flow-minimap.js';
import type { FlowDiagram } from '../visualization/flow-diagram.js';
import type { DetailNodeData } from '../visualization/detail-panel.js';
import type { ExplorationGap, ExplorationPrompt, ExplorationPattern } from '../artifact/exploration-guide.js';
import type { ComplianceDetail } from '../artifact/compliance-badge.js';
import type { DriftEvent } from '../artifact/drift-notification.js';
import type { ContractEntry } from '../artifact/contract-sidebar.js';
import type { RankedEvent } from '../visualization/priority-view.js';
import type { IntegrationCheck, BoundaryNode, BoundaryConnection } from '../visualization/integration-dashboard.js';
import type { WorkItem, ContractBundle, EventContract, BoundaryContract, UnresolvedItem, PendingApproval, JamArtifacts, IntegrationReport } from '../../schema/types.js';
import { detectMilestones } from '../../lib/milestone-detector.js';
import type { MilestoneKey, MilestoneState } from '../../lib/milestone-detector.js';

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

import '../artifact/exploration-guide.js';
import '../artifact/compliance-badge.js';
import '../artifact/drift-notification.js';
import '../artifact/contract-sidebar.js';
import '../artifact/file-drop-zone.js';
import '../session/session-lobby.js';
import '../session/spark-canvas.js';
import '../session/participant-registry.js';
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
import './approval-queue.js';
import type { ApprovalDecidedDetail } from './approval-queue.js';
import '../visualization/priority-view.js';
import '../visualization/breakdown-editor.js';
import '../visualization/coverage-matrix.js';
import '../visualization/dependency-graph.js';
import '../agreement/resolution-recorder.js';
import '../agreement/ownership-grid.js';
import '../agreement/flag-manager.js';
import '../contract/contract-diff.js';
import '../contract/schema-display.js';
import '../contract/provenance-explorer.js';
import type { ProvenanceStep } from '../contract/provenance-explorer.js';
import '../visualization/integration-dashboard.js';
import './suggestion-bar.js';
import './onboarding-overlay.js';
import './milestone-celebration.js';

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

    /* ── Breakdown layout ── */
    .breakdown-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: start;
    }
    .breakdown-sidebar {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    @media (max-width: 900px) {
      .breakdown-layout {
        grid-template-columns: 1fr;
      }
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
  @state() private _sparkCollapsed = false;
  @state() private _pasteToast: { count: number; role: string } | null = null;
  @state() private _shortcutReferenceOpen = false;
  @state() private _settingsOpen = false;
  @state() private _workItems: WorkItem[] = [];
  @state() private _flaggedItems: UnresolvedItem[] = [];
  @state() private _previousContractBundle: ContractBundle | null = null;
  @state() private _lastContractBundle: ContractBundle | null = null;
  @state() private _tierOverrides = new Map<string, 'must_have' | 'should_have' | 'could_have'>();
  @state() private _votes: Record<string, { up: string[]; down: string[] }> = {};
  @state() private _pendingApprovals: PendingApproval[] = [];
  private _prevMilestoneState: MilestoneState = {
    artifactCount: 0,
    participantCount: 0,
    submittedCount: 0,
    unresolvedConflicts: 0,
    integrationStatus: 'pending',
  };

  @query('milestone-celebration') private _celebrationEl!: HTMLElement & { milestone: MilestoneKey; message: string; show(): void };

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

  override updated(_changedProperties: Map<string, unknown>) {
    const current: MilestoneState = {
      artifactCount: this.appState.files.length,
      participantCount: this.appState.sessionState?.session.participants.length ?? this.appState.files.length,
      submittedCount: this.appState.files.length,
      unresolvedConflicts: this._comparisonCtrl.conflictCount,
      integrationStatus: this.appState.files.length >= 2
        ? (this._comparisonCtrl.conflictCount === 0 ? 'go' : 'no-go')
        : 'pending',
    };

    const prev = this._prevMilestoneState;
    const stateChanged =
      current.artifactCount !== prev.artifactCount ||
      current.participantCount !== prev.participantCount ||
      current.submittedCount !== prev.submittedCount ||
      current.unresolvedConflicts !== prev.unresolvedConflicts ||
      current.integrationStatus !== prev.integrationStatus;

    if (stateChanged) {
      this._prevMilestoneState = current;
      const triggered = detectMilestones(prev, current);
      for (const milestone of triggered) {
        if (this._celebrationEl) {
          this._celebrationEl.milestone = milestone;
          this._celebrationEl.message = t(`milestone.${milestone}`);
          this._celebrationEl.show();
        }
      }
    }
  }

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
    // Files loaded via paste — collapse spark canvas so it doesn't dominate the layout
    this._sparkCollapsed = true;
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
    const participantName = this.appState.sessionState
      ? (this.appState.sessionState.session.participants.find(
          (p) => p.id === this.appState.sessionState!.participantId
        )?.name ?? '')
      : '';

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
            ${files.length >= 2
              ? (() => {
                  const compliance = this._complianceStatus(files);
                  return html`<compliance-badge .status=${compliance.status} .details=${compliance.details}></compliance-badge>`;
                })()
              : nothing}
            <sl-button size="small" variant="default" outline @click=${this.onAddFilesClick}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t('shell.addFiles')}
            </sl-button>
            <approval-queue
              .pendingItems=${this._pendingApprovals}
              @approval-decided=${this._onApprovalDecided}
            ></approval-queue>
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
            ${(() => {
              const ed = this._explorationData(files);
              return html`
                <exploration-guide
                  .completenessScore=${ed.score}
                  .gaps=${ed.gaps}
                  .prompts=${ed.prompts}
                  .patterns=${ed.patterns}
                ></exploration-guide>
              `;
            })()}
            <sl-divider></sl-divider>
            <filter-panel
              .confidenceFilter=${this.appState.filters.confidence}
              .directionFilter=${this.appState.filters.direction}
            ></filter-panel>
            ${files.length >= 2
              ? html`
                  <sl-divider></sl-divider>
                  <contract-sidebar
                    .contracts=${this._contractEntries(files)}
                    @contract-selected=${this._onContractSelected}
                  ></contract-sidebar>
                `
              : nothing}
            <sl-divider></sl-divider>
            <participant-registry></participant-registry>
          </div>
        </div>

        <!-- Main content -->
        <div class="main">
          <spark-canvas
            ?collapsed=${this._sparkCollapsed}
            session-code="${this.appState.sessionState?.code ?? ''}"
            @spark-submit=${this._onSparkSubmit}
          ></spark-canvas>
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
            <sl-tab slot="nav" panel="priority" ?active=${activeView === 'priority'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.priority')}
            </sl-tab>
            <sl-tab slot="nav" panel="breakdown" ?active=${activeView === 'breakdown'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.breakdown')}
            </sl-tab>
            <sl-tab slot="nav" panel="agreements" ?active=${activeView === 'agreements'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.agreements')}
            </sl-tab>
            <sl-tab slot="nav" panel="contracts" ?active=${activeView === 'contracts'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.contracts')}
            </sl-tab>
            <sl-tab slot="nav" panel="integration" ?active=${activeView === 'integration'}
              ?disabled=${files.length < 2}>
              ${t('shell.tab.integration')}
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
            <sl-tab-panel name="priority">
              <priority-view
                .events=${this._rankedEvents(files)}
                .votes=${this._votes}
                currentParticipant=${participantName}
                @priority-changed=${this._onPriorityChanged}
                @vote-cast=${this._onVoteCast}
              ></priority-view>
            </sl-tab-panel>
            <sl-tab-panel name="breakdown">
              ${(() => {
                const eventNames = this._breakdownEventNames(files);
                return html`
                  <div class="breakdown-layout">
                    <breakdown-editor
                      .events=${eventNames}
                      .workItems=${this._workItems}
                      @work-item-created=${this._onWorkItemCreated}
                      @work-item-updated=${this._onWorkItemUpdated}
                    ></breakdown-editor>
                    <div class="breakdown-sidebar">
                      <coverage-matrix
                        .events=${eventNames}
                        .workItems=${this._workItems}
                      ></coverage-matrix>
                      <dependency-graph
                        .workItems=${this._workItems}
                        @dependency-created=${this._onDependencyCreated}
                      ></dependency-graph>
                    </div>
                  </div>
                `;
              })()}
            </sl-tab-panel>
            <sl-tab-panel name="agreements">
              ${(() => {
                const data = this._agreementsData(files);
                const sessionCode = this.appState.sessionState?.code ?? '';
                const participantName = this.appState.sessionState
                  ? (this.appState.sessionState.session.participants.find(
                      (p) => p.id === this.appState.sessionState!.participantId
                    )?.name ?? '')
                  : '';
                return html`
                  ${data.overlaps.length > 0
                    ? data.overlaps.map((overlap) => html`
                        <resolution-recorder
                          .overlap=${overlap}
                          sessionCode=${sessionCode}
                          participantName=${participantName}
                        ></resolution-recorder>
                      `)
                    : html`<resolution-recorder></resolution-recorder>`
                  }
                  <ownership-grid
                    .aggregates=${data.aggregates}
                    .roles=${data.roles}
                    sessionCode=${sessionCode}
                    participantName=${participantName}
                  ></ownership-grid>
                  <flag-manager
                    .items=${this._flaggedItems}
                    sessionCode=${sessionCode}
                    participantName=${participantName}
                    .overlapLabels=${data.overlaps.map((o) => o.label)}
                    @item-flagged=${(e: CustomEvent<{ item: UnresolvedItem }>) => {
                      this._flaggedItems = [...this._flaggedItems, e.detail.item];
                    }}
                  ></flag-manager>
                `;
              })()}
            </sl-tab-panel>
            <sl-tab-panel name="contracts">
              ${(() => {
                const data = this._contractsData(files);
                // Track bundle changes for diff: when contract count changes, rotate bundles
                const currentCount = data.bundle.eventContracts.length;
                const lastCount = this._lastContractBundle?.eventContracts.length ?? 0;
                if (currentCount > 0 && currentCount !== lastCount) {
                  this._previousContractBundle = this._lastContractBundle;
                  this._lastContractBundle = data.bundle;
                }
                return html`
                  <contract-diff
                    .bundleBefore=${this._previousContractBundle}
                    .bundleAfter=${data.bundle}
                  ></contract-diff>
                  <schema-display
                    .schema=${data.schemas}
                    label=${t('shell.contracts.schemaLabel')}
                  ></schema-display>
                  <provenance-explorer
                    .chain=${this._provenanceChain(files)}
                    subject=${t('shell.contracts.provenanceSubject')}
                  ></provenance-explorer>
                `;
              })()}
            </sl-tab-panel>
            <sl-tab-panel name="integration">
              ${(() => {
                const data = this._integrationData(files);
                return html`
                  <integration-dashboard
                    .checks=${data.checks}
                    .nodes=${data.nodes}
                    .connections=${data.connections}
                    verdict=${data.verdict}
                    verdictSummary=${data.verdictSummary}
                    contractCount=${data.contractCount}
                    aggregateCount=${data.aggregateCount}
                    @create-work-item-requested=${this._onCreateWorkItemFromCheck}
                    @run-checks-requested=${this._onRunChecks}
                  ></integration-dashboard>
                `;
              })()}
            </sl-tab-panel>
          </sl-tab-group>
          <suggestion-bar
            .status=${this._workflowStatus(files)}
            .context=${{
              sessionCode: this.appState.sessionState?.code ?? 'SOLO',
              participantNames: this.appState.sessionState?.session.participants.map(p => p.name) ?? [],
            } as SuggestionContext}
          ></suggestion-bar>
        </div>
      </div>

      <!-- Hidden file drop zone triggered by "Add files" button -->
      <file-drop-zone mode="compact" style="display:none" id="hidden-drop"></file-drop-zone>
      <!-- Drift notification toast stack (fixed-position, bottom-right) -->
      <drift-notification .drifts=${this._driftEvents(files)}></drift-notification>
      <!-- First-visit onboarding overlay (self-managing via localStorage) -->
      <onboarding-overlay></onboarding-overlay>
      <!-- Milestone celebration toast (shown via .show() on state transitions) -->
      <milestone-celebration></milestone-celebration>
    `;
  }

  /**
   * Derive exploration data (completeness, gaps, prompts, patterns) from the
   * loaded files for the exploration-guide sidebar component.
   * Pure derivation — no side effects.
   */
  private _explorationData(files: AppState['files']): {
    score: number;
    gaps: ExplorationGap[];
    prompts: ExplorationPrompt[];
    patterns: ExplorationPattern[];
  } {
    if (files.length === 0) {
      return { score: 0, gaps: [], prompts: [], patterns: [] };
    }

    const sessionStatus = computeSessionStatus(files);
    const { overallScore, sessionGaps, aggregateCoverage } = sessionStatus;

    // Map gap strings to ExplorationGap objects with action hints
    const gaps: ExplorationGap[] = sessionGaps.map((msg): ExplorationGap => {
      let action = 'Review';
      if (msg.includes('No domain events')) {
        action = 'Add events';
      } else if (msg.includes('No boundary assumptions')) {
        action = 'Add assumptions';
      } else if (msg.includes('inbound') || msg.includes('outbound') || msg.includes('internal')) {
        action = 'Add event';
      } else if (msg.includes('Only one aggregate')) {
        action = 'Broaden scope';
      } else if (msg.includes('POSSIBLE')) {
        action = 'Review confidence';
      } else if (msg.includes('1 participant') || msg.includes('Only 1')) {
        action = 'Invite participant';
      }
      return { message: msg, action };
    });

    // Also include per-file gaps, deduplicating across files
    const perFileGapMessages = new Set<string>(sessionGaps);
    for (const fileEntry of sessionStatus.perFile) {
      for (const gapMsg of fileEntry.status.gaps) {
        if (!perFileGapMessages.has(gapMsg)) {
          perFileGapMessages.add(gapMsg);
          let action = 'Review';
          if (gapMsg.includes('No domain events')) {
            action = 'Add events';
          } else if (gapMsg.includes('No boundary assumptions')) {
            action = 'Add assumptions';
          } else if (gapMsg.includes('Missing') && (gapMsg.includes('inbound') || gapMsg.includes('outbound') || gapMsg.includes('internal'))) {
            action = 'Add event';
          } else if (gapMsg.includes('Only one aggregate')) {
            action = 'Broaden scope';
          } else if (gapMsg.includes('POSSIBLE')) {
            action = 'Review confidence';
          }
          gaps.push({ message: gapMsg, action, aggregate: fileEntry.role });
        }
      }
    }

    // Derive heuristic prompts from aggregates and event landscape
    const prompts: ExplorationPrompt[] = [];

    for (const agg of aggregateCoverage.slice(0, 3)) {
      prompts.push({
        question: `What happens when ${agg} fails to process?`,
        type: 'event',
      });
    }

    prompts.push({
      question: 'What timeout or retry scenarios should be captured as events?',
      type: 'event',
    });

    prompts.push({
      question: 'Are there audit or compliance events that must be recorded?',
      type: 'assumption',
    });

    // Pick a prominent event name from any file for the "who needs to know" prompt
    const firstEvent = files[0]?.data.domain_events[0];
    if (firstEvent) {
      prompts.push({
        question: `Who needs to know when ${firstEvent.name} happens?`,
        type: 'assumption',
      });
    }

    // Derive pattern suggestions from detected aggregates (max 3)
    const patterns: ExplorationPattern[] = [];
    const aggSet = new Set(aggregateCoverage.map((a) => a.toLowerCase()));

    if ((aggSet.has('order') || aggSet.has('payment')) && patterns.length < 3) {
      patterns.push({
        description: 'Saga/Compensation: coordinate multi-step transactions with rollback events',
        events: ['OrderCancelled', 'PaymentRefunded'],
      });
    }

    if ((aggSet.has('user') || aggSet.has('account')) && patterns.length < 3) {
      patterns.push({
        description: 'Identity Lifecycle: track account state transitions and security events',
        events: ['AccountLocked', 'PasswordReset'],
      });
    }

    if (aggregateCoverage.length > 0 && patterns.length < 3) {
      const agg = aggregateCoverage[0];
      patterns.push({
        description: `Audit Trail: record every significant change to ${agg} for compliance and debugging`,
        events: [`${agg}Changed`, `${agg}Archived`],
      });
    }

    return { score: overallScore, gaps, prompts, patterns };
  }

  /**
   * Derive a WorkflowStatus from the loaded files and available artifacts.
   * Jam, contracts, and integration report are derived from existing state
   * so the phase ribbon and suggestion bar can progress past early phases.
   */
  private _workflowStatus(files: AppState['files']) {
    // Derive jam artifacts from overlaps and flagged items
    const overlaps = this._comparisonCtrl.overlaps;
    const jam: JamArtifacts | null = overlaps.length > 0
      ? {
          startedAt: new Date().toISOString(),
          ownershipMap: [],
          resolutions: overlaps
            .filter(o => o.roles.length >= 2)
            .map(o => ({
              overlapLabel: o.label,
              resolution: `Shared by ${o.roles.join(', ')}`,
              chosenApproach: 'merge' as const,
              resolvedBy: o.roles,
              resolvedAt: new Date().toISOString(),
            })),
          unresolved: this._flaggedItems,
        }
      : null;

    // Derive contracts from the current bundle
    const contractsData = this._contractsData(files);
    const contracts: ContractBundle | null =
      contractsData.bundle.eventContracts.length > 0 ? contractsData.bundle : null;

    // Derive integration report from integration data
    // Map dashboard IntegrationCheck (label/description) to schema IntegrationCheck (name/message)
    const integrationData = this._integrationData(files);
    const integrationReport: IntegrationReport | null =
      integrationData.checks.length > 0
        ? {
            generatedAt: new Date().toISOString(),
            sourceContracts: contractsData.bundle.eventContracts.map(ec => ec.eventName),
            checks: integrationData.checks.map(c => ({
              name: c.label,
              status: c.status,
              message: c.description,
              details: c.details,
            })),
            overallStatus: integrationData.checks.every(c => c.status === 'pass')
              ? 'pass'
              : integrationData.checks.some(c => c.status === 'fail')
                ? 'fail'
                : 'warn',
            summary: integrationData.verdictSummary,
          }
        : null;

    return computeWorkflowStatus({
      participantCount: files.length,
      submissionCount: files.length,
      jam,
      contracts,
      integrationReport,
    });
  }

  /**
   * Derive integration dashboard data (checks, nodes, connections, verdict, counts)
   * from loaded files and the comparison controller.
   * Pure derivation — no side effects.
   */
  private _integrationData(files: AppState['files']): {
    checks: IntegrationCheck[];
    nodes: BoundaryNode[];
    connections: BoundaryConnection[];
    verdict: 'go' | 'no-go' | 'caution';
    verdictSummary: string;
    contractCount: number;
    aggregateCount: number;
  } {
    if (files.length === 0) {
      return {
        checks: [],
        nodes: [],
        connections: [],
        verdict: 'go',
        verdictSummary: '',
        contractCount: 0,
        aggregateCount: 0,
      };
    }

    // Build a map of eventName -> aggregate from all files (first occurrence wins)
    const eventAggregateMap = new Map<string, string>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        if (!eventAggregateMap.has(ev.name)) {
          eventAggregateMap.set(ev.name, ev.aggregate);
        }
      }
    }

    // Build a set of event names that have conflicts
    const conflictEventNames = new Set<string>(
      this._comparisonCtrl.conflicts.map((c) => c.label)
    );

    const checks: IntegrationCheck[] = [];

    // For each conflict (assumption-conflict), create a 'fail' check
    for (const conflict of this._comparisonCtrl.conflicts) {
      checks.push({
        id: `conflict-${conflict.label}`,
        label: conflict.label,
        description: `Conflicting boundary assumptions between roles: ${conflict.roles.join(', ')}`,
        status: 'fail',
        details: conflict.details,
        owner: conflict.roles[0],
      });
    }

    // For each shared event with no conflict, create a 'pass' check
    for (const shared of this._comparisonCtrl.sharedEvents) {
      if (!conflictEventNames.has(shared.label)) {
        checks.push({
          id: `shared-${shared.label}`,
          label: shared.label,
          description: `Shared event across roles: ${shared.roles.join(', ')}`,
          status: 'pass',
          details: shared.details,
          owner: shared.roles[0],
        });
      }
    }

    // For boundary assumptions of type 'contract' (integration points needing verification), create 'warn' checks
    for (const file of files) {
      for (const assumption of file.data.boundary_assumptions) {
        if (assumption.type === 'contract') {
          checks.push({
            id: `assumption-${assumption.id}`,
            label: assumption.id,
            description: assumption.statement,
            status: 'warn',
            details: assumption.verify_with ? `Verify with: ${assumption.verify_with}` : undefined,
            owner: file.role,
          });
        }
      }
    }

    // Build BoundaryNodes: one per unique aggregate across all files
    const aggregateSet = new Set<string>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        aggregateSet.add(ev.aggregate);
      }
    }
    const nodes: BoundaryNode[] = [...aggregateSet].map((agg) => ({
      id: agg.toLowerCase().replace(/\s+/g, '-'),
      label: agg,
    }));

    // Build BoundaryConnections: one per shared event between aggregates
    // The 'from' aggregate is the event's primary aggregate; 'to' is the aggregate
    // of the same event in the other file(s) when they differ, or the role's aggregate
    const connections: BoundaryConnection[] = [];
    const seenConnectionKeys = new Set<string>();
    for (const shared of this._comparisonCtrl.sharedEvents) {
      const eventName = shared.label;
      // Find aggregates from different files for this event
      const aggregatesForEvent: string[] = [];
      for (const file of files) {
        for (const ev of file.data.domain_events) {
          if (ev.name === eventName) {
            aggregatesForEvent.push(ev.aggregate);
            break;
          }
        }
      }
      // Create connections between distinct aggregates
      for (let i = 0; i < aggregatesForEvent.length - 1; i++) {
        const fromAgg = aggregatesForEvent[i].toLowerCase().replace(/\s+/g, '-');
        const toAgg = aggregatesForEvent[i + 1].toLowerCase().replace(/\s+/g, '-');
        if (fromAgg === toAgg) continue;
        const key = `${fromAgg}->${toAgg}`;
        if (seenConnectionKeys.has(key)) continue;
        seenConnectionKeys.add(key);
        const hasConflict = conflictEventNames.has(eventName);
        connections.push({
          from: fromAgg,
          to: toAgg,
          status: hasConflict ? 'fail' : 'pass',
          label: eventName,
        });
      }
    }

    // Determine verdict
    const failCount = checks.filter((c) => c.status === 'fail').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const verdict: 'go' | 'no-go' | 'caution' = failCount > 0 ? 'no-go' : warnCount > 0 ? 'caution' : 'go';

    // Build human-readable summary
    const parts: string[] = [];
    if (failCount > 0) parts.push(`${failCount} conflict${failCount !== 1 ? 's' : ''}`);
    if (warnCount > 0) parts.push(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`);
    if (passCount > 0) parts.push(`${passCount} passing`);
    const verdictSummary = parts.length > 0 ? parts.join(', ') : 'No checks';

    return {
      checks,
      nodes,
      connections,
      verdict,
      verdictSummary,
      contractCount: this._comparisonCtrl.sharedEvents.length,
      aggregateCount: aggregateSet.size,
    };
  }

  private _complianceStatus(files: AppState['files']): { status: 'pass' | 'warn' | 'fail'; details: ComplianceDetail[] } {
    if (files.length < 2) {
      return { status: 'pass', details: [] };
    }
    const conflictCount = this._comparisonCtrl.conflictCount;
    if (conflictCount === 0) {
      return { status: 'pass', details: [] };
    }
    const conflicts = this._comparisonCtrl.conflicts;
    const details: ComplianceDetail[] = conflicts.map((conflict) => ({
      eventName: conflict.label,
      owner: conflict.roles.join(', '),
      issue: conflict.details,
      severity: 'warning' as const,
    }));
    const status = conflictCount > 3 ? 'fail' : 'warn';
    return { status, details };
  }

  /**
   * Derive ContractEntry[] from loaded files.
   * Events appearing in 2+ files are potential contract points.
   * Uses sharedEvents from the comparison controller for overlap detection.
   */
  private _contractEntries(files: AppState['files']): ContractEntry[] {
    if (files.length < 2) return [];

    const sharedEvents = this._comparisonCtrl.sharedEvents;
    if (sharedEvents.length === 0) return [];

    // Build a map of eventName -> { aggregate, roles } from all files
    const eventAggregateMap = new Map<string, string>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        if (!eventAggregateMap.has(ev.name)) {
          eventAggregateMap.set(ev.name, ev.aggregate);
        }
      }
    }

    // Build a map of eventName -> all event definitions (for conflict detection)
    const eventDefinitions = new Map<string, { aggregate: string; trigger: string | undefined; role: string }[]>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        const defs = eventDefinitions.get(ev.name) ?? [];
        defs.push({ aggregate: ev.aggregate, trigger: ev.trigger, role: file.role });
        eventDefinitions.set(ev.name, defs);
      }
    }

    return sharedEvents.map((overlap): ContractEntry => {
      const eventName = overlap.label;
      const defs = eventDefinitions.get(eventName) ?? [];
      const owner = defs[0]?.aggregate ?? overlap.roles[0];

      // Consumers are roles that reference this event but are not the first definer
      const consumers = overlap.roles.slice(1);

      // Determine status: fail if aggregates disagree, warn if triggers differ, pass otherwise
      const aggregates = [...new Set(defs.map((d) => d.aggregate))];
      const triggers = [...new Set(defs.map((d) => d.trigger).filter(Boolean))];

      let status: 'pass' | 'warn' | 'fail';
      if (aggregates.length > 1) {
        status = 'fail';
      } else if (triggers.length > 1) {
        status = 'warn';
      } else {
        status = 'pass';
      }

      return { eventName, owner, consumers, status };
    });
  }

  private _onContractSelected(_e: CustomEvent<{ eventName: string; owner: string }>) {
    store.setView('contracts');
  }

  private _onApprovalDecided(e: CustomEvent<ApprovalDecidedDetail>) {
    const { id } = e.detail;
    this._pendingApprovals = this._pendingApprovals.filter((item) => item.id !== id);
    // In a session context, this would also POST to the server
  }

  /**
   * Derive a synthetic ContractBundle from loaded files for the contracts tab.
   * Shared events become EventContracts (version "0.0.1-draft"); aggregates become
   * BoundaryContracts. Also builds a combined schemas map for schema-display.
   */
  private _contractsData(files: AppState['files']): {
    bundle: ContractBundle;
    schemas: Record<string, unknown>;
  } {
    const empty: ContractBundle = {
      generatedAt: new Date().toISOString(),
      eventContracts: [],
      boundaryContracts: [],
    };
    if (files.length < 2) return { bundle: empty, schemas: {} };

    const sharedOverlaps = this._comparisonCtrl.sharedEvents;
    if (sharedOverlaps.length === 0) return { bundle: empty, schemas: {} };

    // Build eventName -> aggregate from all files (first occurrence wins)
    const eventAggregateMap = new Map<string, string>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        if (!eventAggregateMap.has(ev.name)) {
          eventAggregateMap.set(ev.name, ev.aggregate);
        }
      }
    }

    const eventContracts: EventContract[] = sharedOverlaps.map((overlap) => {
      const eventName = overlap.label;
      const aggregate = eventAggregateMap.get(eventName) ?? '';
      const roles = overlap.roles;
      return {
        eventName,
        aggregate,
        version: '0.0.1-draft',
        schema: {},
        owner: roles[0] ?? '',
        consumers: roles.slice(1),
        producedBy: roles[0] ?? '',
      };
    });

    // Group shared events by aggregate for BoundaryContracts
    const aggregateEventsMap = new Map<string, string[]>();
    for (const ec of eventContracts) {
      const evs = aggregateEventsMap.get(ec.aggregate) ?? [];
      evs.push(ec.eventName);
      aggregateEventsMap.set(ec.aggregate, evs);
    }
    const aggregateOwnerMap = new Map<string, string>();
    for (const ec of eventContracts) {
      if (!aggregateOwnerMap.has(ec.aggregate)) {
        aggregateOwnerMap.set(ec.aggregate, ec.owner);
      }
    }

    const boundaryContracts: BoundaryContract[] = [...aggregateEventsMap.entries()].map(
      ([aggregate, events]): BoundaryContract => ({
        boundaryName: aggregate,
        aggregates: [aggregate],
        events,
        owner: aggregateOwnerMap.get(aggregate) ?? '',
        externalDependencies: [],
      })
    );

    const bundle: ContractBundle = {
      generatedAt: new Date().toISOString(),
      eventContracts,
      boundaryContracts,
    };

    // Build combined schema map: eventName -> {} for schema-display
    const schemas: Record<string, unknown> = {};
    for (const ec of eventContracts) {
      schemas[ec.eventName] = { type: 'object', description: `${ec.aggregate} (draft)` };
    }

    return { bundle, schemas };
  }

  /**
   * Derive a provenance chain for the contracts tab, tracing the lineage of
   * contract data back through participants, conflicts, and shared events.
   */
  private _provenanceChain(files: AppState['files']): ProvenanceStep[] {
    if (files.length < 2) return [];
    const chain: ProvenanceStep[] = [];

    // Add participant steps (base of the chain)
    for (const file of files) {
      chain.push({
        kind: 'participant',
        label: file.role,
        detail: `Submitted ${file.data.domain_events.length} events`,
      });
    }

    // Add conflict steps for overlaps
    for (const conflict of this._comparisonCtrl.conflicts) {
      chain.push({
        kind: 'conflict',
        label: conflict.label,
        detail: conflict.details || `Conflict between ${conflict.roles.join(', ')}`,
      });
    }

    // Add resolution steps for shared events (agreements)
    for (const shared of this._comparisonCtrl.sharedEvents) {
      chain.push({
        kind: 'resolution',
        label: shared.label,
        detail: `Agreed by ${shared.roles.join(', ')}`,
      });
    }

    return chain;
  }

  /**
   * Derive data needed for the agreements tab.
   * Returns all overlaps (for resolution-recorder instances), unique aggregate
   * names across all files (for ownership-grid rows), and unique role names
   * across all files (for ownership-grid columns).
   */
  private _agreementsData(files: AppState['files']): {
    overlaps: Overlap[];
    aggregates: string[];
    roles: string[];
  } {
    const overlaps = this._comparisonCtrl.overlaps;
    const aggregateSet = new Set<string>();
    const roleSet = new Set<string>();
    for (const file of files) {
      roleSet.add(file.role);
      for (const ev of file.data.domain_events) {
        aggregateSet.add(ev.aggregate);
      }
    }
    return {
      overlaps,
      aggregates: [...aggregateSet],
      roles: [...roleSet],
    };
  }

  /**
   * Derive RankedEvent[] from loaded files for the priority-view component.
   * Deduplicates by event name (first occurrence wins), computes crossRefs,
   * compositeScore, and tier.
   * Pure derivation — no side effects.
   */
  private _rankedEvents(files: AppState['files']): RankedEvent[] {
    if (files.length === 0) return [];

    // Build: eventName -> first occurrence data + crossRef count
    const eventMap = new Map<string, { event: AppState['files'][number]['data']['domain_events'][number]; crossRefs: number }>();

    for (const file of files) {
      for (const ev of file.data.domain_events) {
        const existing = eventMap.get(ev.name);
        if (existing) {
          existing.crossRefs += 1;
        } else {
          eventMap.set(ev.name, { event: ev, crossRefs: 1 });
        }
      }
    }

    const confidenceWeight: Record<string, number> = { CONFIRMED: 3, LIKELY: 2, POSSIBLE: 1 };
    const directionWeight: Record<string, number> = { outbound: 2, inbound: 1.5, internal: 1 };

    // Max possible raw score: confidenceWeight=3, directionWeight=2, crossRefs=files.length
    // rawMax = 3 * 2 * (1 + files.length * 0.5)
    const maxCrossRefs = files.length;
    const rawMax = 3 * 2 * (1 + maxCrossRefs * 0.5);

    const ranked: RankedEvent[] = [];

    for (const [name, { event, crossRefs }] of eventMap) {
      const cw = confidenceWeight[event.confidence] ?? 1;
      const dw = directionWeight[event.integration?.direction ?? 'internal'] ?? 1;
      const cappedCrossRefs = Math.min(crossRefs, maxCrossRefs);
      const raw = cw * dw * (1 + cappedCrossRefs * 0.5);
      const compositeScore = Math.round((raw / rawMax) * 100 * 10) / 10;

      let tier: RankedEvent['tier'];
      if (compositeScore >= 60) {
        tier = 'must_have';
      } else if (compositeScore >= 30) {
        tier = 'should_have';
      } else {
        tier = 'could_have';
      }

      // Apply user's manual tier override if present
      const overrideTier = this._tierOverrides.get(name);
      if (overrideTier) {
        tier = overrideTier;
      }

      ranked.push({
        name,
        aggregate: event.aggregate,
        confidence: event.confidence,
        direction: event.integration?.direction ?? 'internal',
        crossRefs,
        compositeScore,
        tier,
      });
    }

    return ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  private _onPriorityChanged(e: CustomEvent<{ eventName: string; tier: string }>) {
    const { eventName, tier } = e.detail;
    const newOverrides = new Map(this._tierOverrides);
    newOverrides.set(eventName, tier as 'must_have' | 'should_have' | 'could_have');
    this._tierOverrides = newOverrides;
  }

  private _onVoteCast(e: CustomEvent<{ eventName: string; direction: 'up' | 'down' }>) {
    const { eventName, direction } = e.detail;
    const participantName = this.appState.sessionState
      ? (this.appState.sessionState.session.participants.find(
          (p) => p.id === this.appState.sessionState!.participantId
        )?.name ?? 'Solo')
      : 'Solo';

    const prev = this._votes[eventName] ?? { up: [], down: [] };
    const opposite = direction === 'up' ? 'down' : 'up';

    // Toggle: if already voted in this direction, remove; otherwise add and remove opposite
    const alreadyVoted = prev[direction].includes(participantName);
    const newVotes = { ...this._votes };
    if (alreadyVoted) {
      newVotes[eventName] = {
        up: direction === 'up' ? prev.up.filter((n) => n !== participantName) : prev.up,
        down: direction === 'down' ? prev.down.filter((n) => n !== participantName) : prev.down,
      };
    } else {
      newVotes[eventName] = {
        up: direction === 'up' ? [...prev.up, participantName] : prev.up.filter((n) => n !== participantName),
        down: direction === 'down' ? [...prev.down, participantName] : prev.down.filter((n) => n !== participantName),
      };
    }
    this._votes = newVotes;
  }

  private _onPhaseNavigate(e: CustomEvent<{ phase: string }>) {
    // Map UX phase to the most relevant tab
    const phaseToTab: Record<string, import('../../state/app-state.js').ViewMode> = {
      spark: 'cards',
      explore: 'cards',
      rank: 'priority',
      slice: 'breakdown',
      agree: 'agreements',
      build: 'contracts',
      ship: 'integration',
    };
    const tab = phaseToTab[e.detail.phase] ?? 'cards';
    store.setView(tab);
  }

  private _onSessionFilesReady(e: CustomEvent<{ files: import('../../schema/types.js').LoadedFile[] }>) {
    store.clearErrors();
    for (const file of e.detail.files) {
      store.addFile(file);
    }
    // Files loaded from session — collapse spark canvas so it doesn't dominate the layout
    this._sparkCollapsed = true;
  }

  private _onSoloMode() {
    this._soloMode = true;
  }

  private _onSparkSubmit(e: CustomEvent<{ rows: import('../session/spark-canvas.js').SparkRow[]; candidateEvents: import('../../schema/types.js').CandidateEventsFile }>) {
    const { candidateEvents } = e.detail;
    const file: import('../../schema/types.js').LoadedFile = {
      role: candidateEvents.metadata.role,
      filename: 'spark-canvas.yaml',
      data: candidateEvents,
    };
    store.addFile(file);
    this._sparkCollapsed = true;
  }

  private onTabChange(e: CustomEvent) {
    const panel = (e.detail as { name: string }).name;
    if (
      panel === 'cards' || panel === 'flow' || panel === 'comparison' ||
      panel === 'priority' || panel === 'breakdown' || panel === 'agreements' ||
      panel === 'contracts' || panel === 'integration'
    ) {
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

  private _onWorkItemCreated(e: CustomEvent<{ item: WorkItem }>) {
    this._workItems = [...this._workItems, e.detail.item];
  }

  private _onWorkItemUpdated(e: CustomEvent<{ item: WorkItem }>) {
    this._workItems = this._workItems.map((wi) =>
      wi.id === e.detail.item.id ? e.detail.item : wi
    );
  }

  private _onDependencyCreated(e: CustomEvent<{ fromId: string; toId: string }>) {
    const { fromId, toId } = e.detail;
    // Add the dependency to the source work item
    this._workItems = this._workItems.map((item) =>
      item.id === fromId && !item.dependencies.includes(toId)
        ? { ...item, dependencies: [...item.dependencies, toId] }
        : item
    );
  }

  private _onCreateWorkItemFromCheck(e: CustomEvent<{ checkId: string; checkLabel: string }>) {
    const { checkLabel } = e.detail;
    const newItem: WorkItem = {
      id: `wi-${Date.now().toString(36)}`,
      title: `Resolve: ${checkLabel}`,
      description: `Created from integration check "${checkLabel}"`,
      acceptanceCriteria: [`${checkLabel} check passes`],
      complexity: 'M' as const,
      linkedEvents: [checkLabel],
      dependencies: [],
    };
    this._workItems = [...this._workItems, newItem];
    store.setView('breakdown');
  }

  private _onRunChecks() {
    // Force re-render by requesting update — integration data is derived fresh each render
    this.requestUpdate();
  }

  /**
   * Derive event names for the breakdown tab from loaded files.
   * eventNames: all unique domain event names across all files (for linked-events dropdowns).
   * Work items are tracked separately in this._workItems state.
   */
  private _breakdownEventNames(files: AppState['files']): string[] {
    const eventNameSet = new Set<string>();
    for (const file of files) {
      for (const ev of file.data.domain_events) {
        eventNameSet.add(ev.name);
      }
    }
    return Array.from(eventNameSet);
  }

  /**
   * Derive drift events from comparison conflicts.
   * Each conflict between files represents a "drift" — divergent assumptions
   * about the same event across different roles.
   */
  private _driftEvents(files: AppState['files']): DriftEvent[] {
    if (files.length < 2) return [];
    return this._comparisonCtrl.conflicts.map((conflict) => ({
      id: `drift-${conflict.label}`,
      eventName: conflict.label,
      participantName: conflict.roles.join(' vs '),
      description: conflict.details,
    }));
  }
}
