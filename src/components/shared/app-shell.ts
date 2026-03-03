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
import { deriveExplorationData } from '../../lib/exploration-data.js';
import { deriveIntegrationData, deriveComplianceStatus } from '../../lib/integration-data.js';
import { deriveContractEntries, deriveContractsData, deriveProvenanceChain } from '../../lib/contract-data.js';
import { deriveRankedEvents, deriveComparisonPriorities } from '../../lib/ranked-events.js';
import { deriveAgreementsData } from '../../lib/agreements-data.js';
import { deriveWorkflowStatus } from '../../lib/workflow-status-data.js';
import type { SuggestionContext } from '../../lib/format-suggestion.js';
import type { ResolutionSuggestion } from '../../lib/integration-heuristics.js';
import { suggestResolutionHeuristic } from '../../lib/integration-heuristics.js';
import type { MinimapNode, MinimapEdge, ViewTransform, GraphBounds } from '../visualization/flow-minimap.js';
import type { FlowDiagram } from '../visualization/flow-diagram.js';
import type { DetailNodeData } from '../visualization/detail-panel.js';
import type { ExplorationGap, ExplorationPrompt, ExplorationPattern } from '../artifact/exploration-guide.js';
import type { DriftEvent } from '../artifact/drift-notification.js';
import type { ContractEntry } from '../artifact/contract-sidebar.js';
import type { RankedEvent, PrioritySuggestion } from '../visualization/priority-view.js';
import type { WorkItemSuggestion } from '../visualization/breakdown-editor.js';
import { suggestDecomposition } from '../../lib/decomposition-heuristics.js';
import { suggestPriorities } from '../../lib/priority-heuristics.js';
import type { WorkItem, ContractBundle, UnresolvedItem, PendingApproval, Draft, BoundaryAssumption, DelegationLevel, ConflictResolution, EventPriority, SessionConfig } from '../../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../../schema/types.js';
import { loadSessionConfig, saveSessionConfig } from '../../lib/session-config-persistence.js';
import { detectMilestones } from '../../lib/milestone-detector.js';
import type { MilestoneKey, MilestoneState } from '../../lib/milestone-detector.js';
import { resetAllTips } from '../../lib/first-run.js';

const API_BASE = 'http://localhost:3002';

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
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

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
import '../comparison/comparison-diff.js';
import './aggregate-nav.js';
import './filter-panel.js';
import '../visualization/detail-panel.js';
import './shortcut-reference.js';
import './settings-dialog.js';
import './settings-gear.js';
import './settings-drawer.js';
import type { SettingItem } from './settings-drawer.js';
import './help-tip.js';
import './breakdown-tab.js';
import './agreements-tab.js';
import './contracts-tab.js';
import './integration-tab.js';
import './approval-queue.js';
import type { ApprovalDecidedDetail } from './approval-queue.js';
import '../visualization/priority-view.js';
import type { ProvenanceStep } from '../contract/provenance-explorer.js';
import './suggestion-bar.js';
import './onboarding-overlay.js';
import './milestone-celebration.js';
import './assumption-list.js';
import './delegation-toggle.js';
import './error-boundary.js';
import './empty-state.js';
import './participant-presence.js';

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

    /* ── Mobile: auto-collapse sidebar, compact header ── */
    @media (max-width: 768px) {
      .app-layout {
        --sidebar-width: 0;
        grid-template-columns: 1fr;
        grid-template-rows: var(--header-height) auto 1fr;
        grid-template-areas:
          "header"
          "ribbon"
          "main";
      }

      .sidebar {
        position: fixed;
        top: var(--header-height);
        left: 0;
        bottom: 0;
        width: 280px;
        z-index: 20;
        transform: translateX(-100%);
        transition: transform 0.2s ease;
      }

      /* When sidebar is NOT collapsed on mobile, slide it in as overlay */
      .app-layout:not(.sidebar-collapsed) .sidebar {
        transform: translateX(0);
        box-shadow: 4px 0 12px rgba(0, 0, 0, 0.15);
      }

      .sidebar-toggle {
        position: fixed;
        top: calc(var(--header-height) + 4px);
        left: 4px;
        z-index: 25;
      }

      .header-title {
        font-size: var(--sl-font-size-medium);
      }

      /* Hide file pills on very narrow screens */
      .file-pills {
        display: none;
      }

      .header-right {
        gap: 0.25rem;
      }

      /* Ensure touch targets are at least 44px */
      sl-icon-button {
        min-width: 44px;
        min-height: 44px;
      }
    }

    /* ── Very narrow: further compact ── */
    @media (max-width: 480px) {
      .header {
        padding: 0 0.5rem;
      }

      .header-title {
        font-size: var(--sl-font-size-small);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
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
  @state() private _resolutions: ConflictResolution[] = [];
  @state() private _flaggedItems: UnresolvedItem[] = [];
  @state() private _tierOverrides = new Map<string, 'must_have' | 'should_have' | 'could_have'>();
  @state() private _votes: Record<string, { up: string[]; down: string[] }> = {};
  @state() private _pendingApprovals: PendingApproval[] = [];
  @state() private _activeDraft: Draft | null = null;
  @state() private _sectionSettingsOpen = false;
  @state() private _sectionSettingsName = '';
  @state() private _sessionConfig: SessionConfig = { ...DEFAULT_SESSION_CONFIG };
  @state() private _delegationLevel: DelegationLevel = 'assisted';
  @state() private _suggestions: Map<string, ResolutionSuggestion> = new Map();
  @state() private _suggestionLoadingLabels: Set<string> = new Set();
  @state() private _decompositionSuggestions: WorkItemSuggestion[] = [];
  @state() private _prioritySuggestions: PrioritySuggestion[] = [];
  /** IDs of decomposition suggestions that have been accepted or dismissed this session. */
  private _dismissedDecompositionIds = new Set<string>();
  /** IDs of priority suggestions that have been accepted or dismissed this session. */
  private _dismissedPriorityIds = new Set<string>();
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

    // Hydrate session config from localStorage (survives page refresh)
    this._sessionConfig = loadSessionConfig(this.appState.sessionState?.code);

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
        // Expand spark canvas if collapsed
        this._sparkCollapsed = false;
        // After Lit re-renders, focus the first empty input in spark-canvas
        this.updateComplete.then(() => {
          const sparkCanvas = this.renderRoot.querySelector('spark-canvas');
          const input = sparkCanvas?.shadowRoot?.querySelector<HTMLInputElement>('input');
          input?.focus();
        });
      }
    );

    registry.register(
      { id: 'action.resolve', key: 'r', description: t('shortcuts.action.resolve'), category: t('shortcuts.category.actions') },
      () => {
        // Navigate to comparison view
        if (store.get().activeView !== 'comparison') {
          store.setView('comparison');
        }
        // After Lit re-renders, focus/scroll the first conflict-card
        this.updateComplete.then(() => {
          const comparisonView = this.renderRoot.querySelector('comparison-view');
          const conflictCard = comparisonView?.shadowRoot?.querySelector<HTMLElement>('conflict-card');
          if (conflictCard) {
            conflictCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            conflictCard.focus();
          }
        });
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
    const inSession = !!this.appState.sessionState;

    if (files.length === 0) {
      if (this._soloMode) {
        // Solo mode: full-screen drop zone
        return html`
          <file-drop-zone mode="hero"></file-drop-zone>
          ${this._renderPasteToast()}
          ${this._renderShortcutReference()}
          ${this._renderSettingsDialog()}
          <error-boundary></error-boundary>
        `;
      }
      if (!inSession) {
        // No session yet: show lobby to create/join
        return html`
          <session-lobby
            @session-files-ready=${this._onSessionFilesReady}
            @solo-mode=${this._onSoloMode}
          ></session-lobby>
          ${this._renderPasteToast()}
          ${this._renderShortcutReference()}
          ${this._renderSettingsDialog()}
          <error-boundary></error-boundary>
        `;
      }
      // In session but no files yet: fall through to renderAppLayout()
      // which shows the Spark Canvas as the primary content area
    }

    return html`${this.renderAppLayout()}${this._renderPasteToast()}${this._renderShortcutReference()}${this._renderSettingsDialog()}${this._renderSectionSettingsDrawer()}<error-boundary></error-boundary>`;
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

  private _renderSectionSettingsDrawer() {
    return html`
      <settings-drawer
        sectionName=${this._sectionSettingsName}
        .settings=${this._sectionSettings(this._sectionSettingsName)}
        ?open=${this._sectionSettingsOpen}
        @sl-after-hide=${() => { this._sectionSettingsOpen = false; }}
        @setting-changed=${this._onSettingChanged}
      ></settings-drawer>
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
    const hasRankableArtifact = files.some(f => f.data.domain_events.length >= 5);
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
            ${this.appState.sessionState
              ? html`
                  <participant-presence
                    .participants=${this.appState.sessionState.session.participants}
                    .submittedParticipantIds=${this.appState.sessionState.session.submissions.map((s) => s.participantId)}
                    currentView=${activeView}
                    currentParticipantId=${this.appState.sessionState.participantId}
                  ></participant-presence>
                `
              : nothing}
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
            <delegation-toggle
              level=${this._delegationLevel}
              @level-changed=${this._onDelegationLevelChanged}
            ></delegation-toggle>
            <sl-icon-button
              name="question-circle"
              label=${t('shell.resetHelp')}
              @click=${this._onResetHelp}
            ></sl-icon-button>
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
              const overlapCount = this._comparisonCtrl.overlaps.length;
              return html`
                <exploration-guide
                  .artifactCount=${files.length}
                  .compareReady=${files.length >= 2}
                  .overlapCount=${overlapCount}
                  .completenessScore=${ed.score}
                  .gaps=${ed.gaps}
                  .prompts=${ed.prompts}
                  .patterns=${ed.patterns}
                  @view-comparison=${this._onViewComparison}
                ></exploration-guide>
              `;
            })()}
            <sl-divider></sl-divider>
            ${(() => {
              const allAssumptions: BoundaryAssumption[] = files.flatMap(f => f.data.boundary_assumptions);
              return allAssumptions.length > 0 ? html`
                <assumption-list
                  .assumptions=${allAssumptions}
                  .conflicts=${this._comparisonCtrl.overlaps}
                ></assumption-list>
              ` : nothing;
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
          <help-tip tip-key="spark-canvas" message=${t('helpTip.sparkCanvas')} ?active=${files.length === 0}>
            <spark-canvas
              ?collapsed=${this._sparkCollapsed}
              session-code="${this.appState.sessionState?.code ?? ''}"
              @spark-submit=${this._onSparkSubmit}
            ></spark-canvas>
          </help-tip>
          <sl-tab-group @sl-tab-show=${this.onTabChange} @open-settings=${this._onOpenSectionSettings}>
            <sl-tab slot="nav" panel="cards" ?active=${activeView === 'cards'}>
              ${t('shell.tab.events')}
            </sl-tab>
            <sl-tab slot="nav" panel="flow" ?active=${activeView === 'flow'}>
              ${t('shell.tab.flow')}
            </sl-tab>
            <sl-tooltip content=${t('shell.tab.comparison.locked')} ?disabled=${files.length >= 2}>
              <sl-tab slot="nav" panel="comparison" ?active=${activeView === 'comparison'}
                ?disabled=${files.length < 2}>
                ${t('shell.tab.conflicts')}
                ${conflictCount > 0
                  ? html`<sl-badge class="conflict-badge" variant="warning" pill>${conflictCount}</sl-badge>`
                  : nothing}
                <settings-gear sectionName="comparison"></settings-gear>
              </sl-tab>
            </sl-tooltip>
            <sl-tooltip content=${t('shell.tab.priority.locked')} ?disabled=${hasRankableArtifact}>
              <sl-tab slot="nav" panel="priority" ?active=${activeView === 'priority'}
                ?disabled=${!hasRankableArtifact}>
                ${t('shell.tab.priority')}
                <settings-gear sectionName="priority"></settings-gear>
              </sl-tab>
            </sl-tooltip>
            <sl-tooltip content=${t('shell.tab.breakdown.locked')} ?disabled=${files.length >= 1}>
              <sl-tab slot="nav" panel="breakdown" ?active=${activeView === 'breakdown'}
                ?disabled=${files.length < 1}>
                ${t('shell.tab.breakdown')}
              </sl-tab>
            </sl-tooltip>
            <sl-tooltip content=${t('shell.tab.agreements.locked')} ?disabled=${files.length >= 2}>
              <sl-tab slot="nav" panel="agreements" ?active=${activeView === 'agreements'}
                ?disabled=${files.length < 2}>
                ${t('shell.tab.agreements')}
                <settings-gear sectionName="agree"></settings-gear>
              </sl-tab>
            </sl-tooltip>
            <sl-tooltip content=${t('shell.tab.contracts.locked')} ?disabled=${files.length >= 2}>
              <sl-tab slot="nav" panel="contracts" ?active=${activeView === 'contracts'}
                ?disabled=${files.length < 2}>
                ${t('shell.tab.contracts')}
                <settings-gear sectionName="contracts"></settings-gear>
              </sl-tab>
            </sl-tooltip>
            <sl-tooltip content=${t('shell.tab.integration.locked')} ?disabled=${files.length >= 2}>
              <sl-tab slot="nav" panel="integration" ?active=${activeView === 'integration'}
                ?disabled=${files.length < 2}>
                ${t('shell.tab.integration')}
                <settings-gear sectionName="integration"></settings-gear>
              </sl-tab>
            </sl-tooltip>

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
              <help-tip tip-key="comparison-view" message=${t('helpTip.comparisonView')} ?active=${files.length >= 2}>
                <comparison-view
                  .files=${files}
                  .resolutions=${this._resolutions}
                  .priorities=${this._comparisonPriorities(files)}
                  .workItems=${this._workItems}
                  @formalize-requested=${this._onFormalizeRequested}
                ></comparison-view>
                <comparison-diff .files=${files}></comparison-diff>
              </help-tip>
            </sl-tab-panel>
            <sl-tab-panel name="priority">
              <help-tip tip-key="priority-view" message=${t('helpTip.priorityView')} ?active=${files.length >= 2}>
                <priority-view
                  .events=${this._rankedEvents(files)}
                  .votes=${this._votes}
                  currentParticipant=${participantName}
                  .suggestions=${this._computePrioritySuggestions(files).filter(s => !this._dismissedPriorityIds.has(s.id))}
                  @priority-changed=${this._onPriorityChanged}
                  @vote-cast=${this._onVoteCast}
                  @suggestion-accepted=${this._onPrioritySuggestionAccepted}
                  @suggestion-dismissed=${this._onPrioritySuggestionDismissed}
                ></priority-view>
              </help-tip>
            </sl-tab-panel>
            <sl-tab-panel name="breakdown">
              <breakdown-tab
                .events=${this._breakdownEventNames(files)}
                .workItems=${this._workItems}
                .suggestions=${this._computeDecompositionSuggestions(files).filter(s => !this._dismissedDecompositionIds.has(s.id))}
                .activeDraft=${this._activeDraft}
                .priorities=${this._tierOverrides}
                @work-item-created=${this._onWorkItemCreated}
                @work-item-updated=${this._onWorkItemUpdated}
                @suggestion-accepted=${this._onDecompositionSuggestionAccepted}
                @suggestion-dismissed=${this._onDecompositionSuggestionDismissed}
                @dependency-created=${this._onDependencyCreated}
                @draft-change=${this._onDraftChange}
                @draft-publish=${this._onDraftPublish}
              ></breakdown-tab>
            </sl-tab-panel>
            <sl-tab-panel name="agreements">
              ${(() => {
                const data = this._agreementsData(files);
                return html`
                  <agreements-tab
                    .overlaps=${data.overlaps}
                    .aggregates=${data.aggregates}
                    .roles=${data.roles}
                    sessionCode=${this.appState.sessionState?.code ?? ''}
                    participantName=${participantName}
                    .suggestions=${this._suggestions}
                    .suggestionLoadingLabels=${this._suggestionLoadingLabels}
                    .resolutions=${this._resolutions}
                    .flaggedItems=${this._flaggedItems}
                    @resolution-recorded=${this._onResolutionRecorded}
                    @suggestion-requested=${this._onSuggestionRequested}
                    @item-flagged=${(e: CustomEvent<{ item: UnresolvedItem }>) => {
                      this._flaggedItems = [...this._flaggedItems, e.detail.item];
                    }}
                  ></agreements-tab>
                `;
              })()}
            </sl-tab-panel>
            <sl-tab-panel name="contracts">
              ${(() => {
                const data = this._contractsData(files);
                return html`
                  <contracts-tab
                    .bundle=${data.bundle}
                    .schemas=${data.schemas}
                    .compliance=${this._complianceStatus(files)}
                    .provenanceChain=${this._provenanceChain(files)}
                    .workItemCount=${this._workItems.length}
                    @integration-check-requested=${this._onIntegrationCheckRequested}
                  ></contracts-tab>
                `;
              })()}
            </sl-tab-panel>
            <sl-tab-panel name="integration">
              ${(() => {
                const data = this._integrationData(files);
                const contractsData = this._contractsData(files);
                return html`
                  <integration-tab
                    .checks=${data.checks}
                    .nodes=${data.nodes}
                    .connections=${data.connections}
                    verdict=${data.verdict}
                    verdictSummary=${data.verdictSummary}
                    .contractCount=${data.contractCount}
                    .aggregateCount=${data.aggregateCount}
                    .sourceContracts=${contractsData.bundle.eventContracts.map(ec => ec.eventName)}
                    ?active=${activeView === 'integration'}
                    @create-work-item-requested=${this._onCreateWorkItemFromCheck}
                    @run-checks-requested=${this._onRunChecks}
                  ></integration-tab>
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
            @suggestion-navigate=${this._onSuggestionNavigate}
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
   * Delegates to src/lib/exploration-data.ts.
   */
  private _explorationData(files: AppState['files']) {
    return deriveExplorationData(files);
  }

  /**
   * Derive a WorkflowStatus from the loaded files and available artifacts.
   * Delegates to src/lib/workflow-status-data.ts.
   */
  private _workflowStatus(files: AppState['files']) {
    return deriveWorkflowStatus(
      files,
      this._comparisonCtrl.overlaps,
      this._comparisonCtrl.conflicts,
      this._comparisonCtrl.sharedEvents,
      this._flaggedItems,
    );
  }

  /**
   * Derive integration dashboard data (checks, nodes, connections, verdict, counts)
   * from loaded files and the comparison controller.
   * Delegates to src/lib/integration-data.ts.
   */
  private _integrationData(files: AppState['files']) {
    return deriveIntegrationData(
      files,
      this._comparisonCtrl.conflicts,
      this._comparisonCtrl.sharedEvents,
    );
  }

  private _complianceStatus(files: AppState['files']) {
    return deriveComplianceStatus(
      files,
      this._comparisonCtrl.conflicts,
      this._comparisonCtrl.conflictCount,
    );
  }

  /**
   * Derive ContractEntry[] from loaded files.
   * Events appearing in 2+ files are potential contract points.
   * Delegates to src/lib/contract-data.ts.
   */
  private _contractEntries(files: AppState['files']): ContractEntry[] {
    return deriveContractEntries(files, this._comparisonCtrl.sharedEvents);
  }

  private _onContractSelected(_e: CustomEvent<{ eventName: string; owner: string }>) {
    store.setView('contracts');
  }

  private _onFormalizeRequested() {
    store.setView('contracts');
  }

  private _onIntegrationCheckRequested() {
    this.renderRoot.querySelector('sl-tab-group')?.show('integration');
  }

  private _onSuggestionNavigate(e: CustomEvent<{ panel: string }>) {
    const { panel } = e.detail;
    this.renderRoot.querySelector('sl-tab-group')?.show(panel);
  }

  private _onDelegationLevelChanged(e: CustomEvent<{ level: string }>) {
    this._delegationLevel = e.detail.level as 'assisted' | 'semi_autonomous' | 'autonomous';
  }

  private _onApprovalDecided(e: CustomEvent<ApprovalDecidedDetail>) {
    const { id } = e.detail;
    this._pendingApprovals = this._pendingApprovals.filter((item) => item.id !== id);
    // In a session context, this would also POST to the server
  }

  /**
   * Derive a synthetic ContractBundle from loaded files for the contracts tab.
   * Delegates to src/lib/contract-data.ts.
   */
  private _contractsData(files: AppState['files']) {
    return deriveContractsData(files, this._comparisonCtrl.sharedEvents);
  }

  /**
   * Derive a provenance chain for the contracts tab.
   * Delegates to src/lib/contract-data.ts.
   */
  private _provenanceChain(files: AppState['files']): ProvenanceStep[] {
    return deriveProvenanceChain(
      files,
      this._comparisonCtrl.conflicts,
      this._comparisonCtrl.sharedEvents,
    );
  }

  /**
   * Derive data needed for the agreements tab.
   * Delegates to src/lib/agreements-data.ts.
   */
  private _agreementsData(files: AppState['files']) {
    return deriveAgreementsData(files, this._comparisonCtrl.overlaps);
  }

  /**
   * Derive RankedEvent[] from loaded files for the priority-view component.
   * Delegates to src/lib/ranked-events.ts.
   */
  private _rankedEvents(files: AppState['files']): RankedEvent[] {
    return deriveRankedEvents(files, this._tierOverrides);
  }

  /**
   * Derive EventPriority[] from ranked events for the comparison-view progress bar.
   * Delegates to src/lib/ranked-events.ts.
   */
  private _comparisonPriorities(files: AppState['files']): EventPriority[] {
    return deriveComparisonPriorities(files, this._tierOverrides);
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

  private async _onPhaseNavigate(e: CustomEvent<{ phase: string }>) {
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

    // Wait for tab switch to render before scrolling
    await this.updateComplete;

    // Map phase to a CSS selector for the scroll target within the newly-active tab
    const phaseToSelector: Record<string, string> = {
      spark: 'spark-canvas',
      explore: 'card-view',
      rank: 'priority-view',
      slice: 'breakdown-editor',
      agree: 'resolution-recorder',
      build: 'contract-diff',
      ship: 'integration-dashboard',
    };

    const selector = phaseToSelector[e.detail.phase];
    if (selector) {
      const target =
        this.renderRoot.querySelector(selector) ??
        this.renderRoot.querySelector(`sl-tab-panel[name="${tab}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

    const sessionState = this.appState.sessionState;
    if (sessionState) {
      fetch(`${API_BASE}/api/sessions/${sessionState.code}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: sessionState.participantId,
          fileName: file.filename,
          data: candidateEvents,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const msg = body || `HTTP ${res.status}`;
          console.error('spark-canvas session submit failed:', msg);
          store.addError('spark-canvas.yaml', [msg]);
        }
      }).catch((err: Error) => {
        console.error('spark-canvas session submit error:', err.message);
        store.addError('spark-canvas.yaml', [err.message]);
      });
    }
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

  private _onViewComparison(): void {
    store.setView('comparison');
  }

  private onAggregateSelect(e: CustomEvent) {
    store.setSelectedAggregate(e.detail.aggregate);
  }

  private _onResetHelp() {
    resetAllTips();
    // Show a brief toast confirming tips are re-enabled
    const alert = Object.assign(document.createElement('sl-alert'), {
      variant: 'primary',
      closable: true,
      duration: 3000,
      innerHTML: `<sl-icon name="lightbulb" slot="icon"></sl-icon>${t('shell.helpReset')}`,
    });
    document.body.append(alert);
    (alert as any).toast();
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
    const { key, value } = e.detail;
    // Update _sessionConfig via dot-path key (e.g. 'comparison.sensitivity')
    const parts = key.split('.');
    if (parts.length >= 2) {
      const config = structuredClone(this._sessionConfig) as unknown as Record<string, unknown>;
      let target = config;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]] as Record<string, unknown>;
      }
      target[parts[parts.length - 1]] = value;
      this._sessionConfig = config as unknown as SessionConfig;
      saveSessionConfig(this._sessionConfig, this.appState.sessionState?.code);
    }
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

  private _onOpenSectionSettings(e: CustomEvent<{ sectionName: string }>) {
    this._sectionSettingsName = e.detail.sectionName;
    this._sectionSettingsOpen = true;
  }

  private _sectionSettings(sectionName: string): SettingItem[] {
    const cfg = this._sessionConfig;
    const def = DEFAULT_SESSION_CONFIG;

    switch (sectionName) {
      case 'comparison':
      case 'agree':
        return [
          {
            key: 'comparison.sensitivity',
            label: t('settings.comparison.sensitivity'),
            description: t('settings.comparison.sensitivity.description'),
            type: 'select',
            value: cfg.comparison.sensitivity,
            defaultValue: def.comparison.sensitivity,
            options: [
              { value: 'semantic', label: t('settings.comparison.sensitivity.semantic') },
              { value: 'exact', label: t('settings.comparison.sensitivity.exact') },
            ],
          },
          {
            key: 'comparison.autoDetectConflicts',
            label: t('settings.comparison.autoDetectConflicts'),
            description: t('settings.comparison.autoDetectConflicts.description'),
            type: 'switch',
            value: cfg.comparison.autoDetectConflicts,
            defaultValue: def.comparison.autoDetectConflicts,
          },
          {
            key: 'comparison.suggestResolutions',
            label: t('settings.comparison.suggestResolutions'),
            description: t('settings.comparison.suggestResolutions.description'),
            type: 'switch',
            value: cfg.comparison.suggestResolutions,
            defaultValue: def.comparison.suggestResolutions,
          },
        ];

      case 'contracts':
      case 'build':
        return [
          {
            key: 'contracts.strictness',
            label: t('settings.contracts.strictness'),
            description: t('settings.contracts.strictness.description'),
            type: 'select',
            value: cfg.contracts.strictness,
            defaultValue: def.contracts.strictness,
            options: [
              { value: 'strict', label: t('settings.contracts.strictness.strict') },
              { value: 'warn', label: t('settings.contracts.strictness.warn') },
              { value: 'relaxed', label: t('settings.contracts.strictness.relaxed') },
            ],
          },
          {
            key: 'contracts.driftNotifications',
            label: t('settings.contracts.driftNotifications'),
            description: t('settings.contracts.driftNotifications.description'),
            type: 'select',
            value: cfg.contracts.driftNotifications,
            defaultValue: def.contracts.driftNotifications,
            options: [
              { value: 'immediate', label: t('settings.contracts.driftNotifications.immediate') },
              { value: 'batched', label: t('settings.contracts.driftNotifications.batched') },
              { value: 'silent', label: t('settings.contracts.driftNotifications.silent') },
            ],
          },
        ];

      case 'priority':
      case 'rank':
        return [
          {
            key: 'ranking.weights.confidence',
            label: t('settings.ranking.weights.confidence'),
            description: t('settings.ranking.weights.confidence.description'),
            type: 'number',
            value: cfg.ranking.weights.confidence,
            defaultValue: def.ranking.weights.confidence,
          },
          {
            key: 'ranking.weights.complexity',
            label: t('settings.ranking.weights.complexity'),
            description: t('settings.ranking.weights.complexity.description'),
            type: 'number',
            value: cfg.ranking.weights.complexity,
            defaultValue: def.ranking.weights.complexity,
          },
          {
            key: 'ranking.weights.references',
            label: t('settings.ranking.weights.references'),
            description: t('settings.ranking.weights.references.description'),
            type: 'number',
            value: cfg.ranking.weights.references,
            defaultValue: def.ranking.weights.references,
          },
          {
            key: 'ranking.defaultTier',
            label: t('settings.ranking.defaultTier'),
            description: t('settings.ranking.defaultTier.description'),
            type: 'select',
            value: cfg.ranking.defaultTier,
            defaultValue: def.ranking.defaultTier,
            options: [
              { value: 'Must Have', label: t('settings.ranking.defaultTier.mustHave') },
              { value: 'Should Have', label: t('settings.ranking.defaultTier.shouldHave') },
              { value: 'Could Have', label: t('settings.ranking.defaultTier.couldHave') },
            ],
          },
        ];

      case 'delegation':
        return [
          {
            key: 'delegation.level',
            label: t('settings.delegation.level'),
            description: t('settings.delegation.level.description'),
            type: 'select',
            value: cfg.delegation.level,
            defaultValue: def.delegation.level,
            options: [
              { value: 'assisted', label: t('settings.delegation.level.assisted') },
              { value: 'semi_autonomous', label: t('settings.delegation.level.semiAutonomous') },
              { value: 'autonomous', label: t('settings.delegation.level.autonomous') },
            ],
          },
          {
            key: 'delegation.approvalExpiry',
            label: t('settings.delegation.approvalExpiry'),
            description: t('settings.delegation.approvalExpiry.description'),
            type: 'number',
            value: cfg.delegation.approvalExpiry,
            defaultValue: def.delegation.approvalExpiry,
          },
        ];

      case 'notifications':
        return [
          {
            key: 'notifications.toastDuration',
            label: t('settings.notifications.toastDuration'),
            description: t('settings.notifications.toastDuration.description'),
            type: 'number',
            value: cfg.notifications.toastDuration,
            defaultValue: def.notifications.toastDuration,
          },
        ];

      default:
        return [];
    }
  }

  private _onDraftChange(e: CustomEvent<{ id: string; rows: Array<{ eventName: string; aggregate: string; trigger: string }> }>) {
    if (!this._activeDraft) return;
    const { rows } = e.detail;
    this._activeDraft = {
      ...this._activeDraft,
      updatedAt: new Date().toISOString(),
      content: {
        ...this._activeDraft.content,
        domain_events: rows.map(r => ({
          name: r.eventName,
          aggregate: r.aggregate,
          trigger: r.trigger,
          payload: [],
          integration: { direction: 'internal' as const },
          confidence: 'POSSIBLE' as const,
        })),
      },
    };
  }

  private _onDraftPublish(_e: CustomEvent<{ id: string }>) {
    // Convert draft to a loaded file when published
    if (!this._activeDraft) return;
    store.addFile({
      role: 'draft',
      filename: 'draft.yaml',
      data: this._activeDraft.content,
    });
    this._activeDraft = null;
  }

  private _onResolutionRecorded(e: CustomEvent<{ resolution: ConflictResolution }>) {
    const { resolution } = e.detail;
    // Replace existing resolution for the same overlap label, or append new one
    const existing = this._resolutions.findIndex((r) => r.overlapLabel === resolution.overlapLabel);
    if (existing >= 0) {
      this._resolutions = this._resolutions.map((r, i) => (i === existing ? resolution : r));
    } else {
      this._resolutions = [...this._resolutions, resolution];
    }
  }

  private _onSuggestionRequested(e: CustomEvent<{ overlapLabel: string }>) {
    const { overlapLabel } = e.detail;
    // Skip if already loading or already have a suggestion for this label
    if (this._suggestionLoadingLabels.has(overlapLabel) || this._suggestions.has(overlapLabel)) {
      return;
    }

    // Mark as loading
    this._suggestionLoadingLabels = new Set(this._suggestionLoadingLabels).add(overlapLabel);

    if (this.appState.sessionState?.code) {
      // Session mode: fetch from API
      const sessionCode = this.appState.sessionState.code;
      const apiBase = 'http://localhost:3002';
      fetch(`${apiBase}/api/sessions/${sessionCode}/suggest-resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overlapLabel }),
      })
        .then((res) => res.json())
        .then((body: { suggestion: ResolutionSuggestion }) => {
          const updated = new Map(this._suggestions);
          updated.set(overlapLabel, body.suggestion);
          this._suggestions = updated;
        })
        .catch(() => {
          // On API failure, fall back to heuristic
          const overlapKind = this._comparisonCtrl.overlaps.find((o) => o.label === overlapLabel)?.kind ?? 'same-name';
          const suggestion = suggestResolutionHeuristic(overlapKind, overlapLabel);
          const updated = new Map(this._suggestions);
          updated.set(overlapLabel, suggestion);
          this._suggestions = updated;
        })
        .finally(() => {
          const remaining = new Set(this._suggestionLoadingLabels);
          remaining.delete(overlapLabel);
          this._suggestionLoadingLabels = remaining;
        });
    } else {
      // Solo/offline mode: use heuristic immediately
      const overlapKind = this._comparisonCtrl.overlaps.find((o) => o.label === overlapLabel)?.kind ?? 'same-name';
      const suggestion = suggestResolutionHeuristic(overlapKind, overlapLabel);
      const updated = new Map(this._suggestions);
      updated.set(overlapLabel, suggestion);
      this._suggestions = updated;
      const remaining = new Set(this._suggestionLoadingLabels);
      remaining.delete(overlapLabel);
      this._suggestionLoadingLabels = remaining;
    }
  }

  private _onDecompositionSuggestionAccepted(e: CustomEvent<{ id: string; item: WorkItem }>) {
    const { id, item } = e.detail;
    this._dismissedDecompositionIds.add(id);
    // Add the accepted work item to the work items list
    this._workItems = [...this._workItems, item];
    // Trigger re-render so the ghost card disappears
    this.requestUpdate();
  }

  private _onDecompositionSuggestionDismissed(e: CustomEvent<{ id: string }>) {
    this._dismissedDecompositionIds.add(e.detail.id);
    this.requestUpdate();
  }

  private _onPrioritySuggestionAccepted(e: CustomEvent<{ id: string; text: string }>) {
    this._dismissedPriorityIds.add(e.detail.id);
    this.requestUpdate();
  }

  private _onPrioritySuggestionDismissed(e: CustomEvent<{ id: string }>) {
    this._dismissedPriorityIds.add(e.detail.id);
    this.requestUpdate();
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
   * Compute decomposition suggestions from loaded files and return them as
   * WorkItemSuggestion[] ready to pass to breakdown-editor.
   *
   * Called lazily in the breakdown tab render path.
   * Regenerates whenever files change; uses a simple array assignment to trigger
   * a re-render via the @state decorator.
   */
  private _computeDecompositionSuggestions(files: AppState['files']): WorkItemSuggestion[] {
    if (files.length === 0) return [];
    const allEvents = files.flatMap((f) => f.data.domain_events);
    const aggregateSuggestions = suggestDecomposition(allEvents);
    const result: WorkItemSuggestion[] = [];
    let idx = 0;
    for (const agg of aggregateSuggestions) {
      for (const item of agg.suggestedItems) {
        result.push({
          id: `sug-${idx++}`,
          title: item.title,
          description: item.description,
          complexity: item.complexity,
          linkedEvents: item.linkedEvents,
        });
      }
    }
    return result;
  }

  /**
   * Compute priority suggestions from loaded files and return them as
   * PrioritySuggestion[] ready to pass to priority-view.
   *
   * Skips events that already have manual tier overrides.
   * Called lazily in the priority tab render path.
   */
  private _computePrioritySuggestions(files: AppState['files']): PrioritySuggestion[] {
    if (files.length === 0) return [];
    const allEvents = files.flatMap((f) => f.data.domain_events);

    // Build existing priorities from manual overrides
    const existingPriorities = Array.from(this._tierOverrides.entries()).map(([eventName, tier]) => ({
      eventName,
      participantId: 'local',
      tier,
      setAt: new Date().toISOString(),
    }));

    const results = suggestPriorities(allEvents, existingPriorities);
    return results.map((r) => ({
      id: r.eventName,
      text: r.reason,
    }));
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
