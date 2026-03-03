/**
 * Lightweight i18n module for Seam.
 * No heavy framework — just a flat messages object and a t() lookup function.
 *
 * Usage:
 *   import { t } from '@/lib/i18n';
 *   t('shell.addFiles')              // → "Add files"
 *   t('session.nParticipants', { count: 3 }) // → "3 participants"
 *
 * Parameter interpolation: use {{key}} in message strings.
 * Missing key: returns the key itself as a graceful fallback.
 */

export const messages: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // app-shell
  // ---------------------------------------------------------------------------
  'shell.title': 'Seam',
  'shell.addFiles': 'Add files',
  'shell.expandSidebar': 'Expand sidebar',
  'shell.collapseSidebar': 'Collapse sidebar',
  'shell.tab.events': 'Events',
  'shell.tab.flow': 'Flow',
  'shell.tab.conflicts': 'Conflicts',
  'shell.tab.priority': 'Priority',
  'shell.tab.priority.locked': 'Add at least 5 events to unlock priority ranking',
  'shell.tab.breakdown': 'Breakdown',
  'shell.tab.breakdown.locked': 'Submit an artifact to unlock work breakdown',
  'shell.tab.agreements': 'Agreements',
  'shell.tab.contracts': 'Contracts',
  'shell.tab.integration': 'Integration',
  'shell.tab.comparison.locked': 'Add a second perspective to unlock comparison',
  'shell.tab.agreements.locked': 'Add a second perspective to unlock agreements',
  'shell.tab.contracts.locked': 'Add a second perspective to unlock contracts',
  'shell.tab.integration.locked': 'Add a second perspective to unlock integration',
  'shell.contracts.schemaLabel': 'Event Schemas',
  'shell.contracts.provenanceSubject': 'Contract Lineage',
  'shell.contracts.integrationCta.heading': 'Ready for Integration Check',
  'shell.contracts.integrationCta.description': 'All contracts are in place and compliance checks pass. Run an integration check to validate everything works together.',
  'shell.contracts.integrationCta.button': 'Run Integration Check',

  // ---------------------------------------------------------------------------
  // file-drop-zone
  // ---------------------------------------------------------------------------
  'dropZone.ariaLabel': 'Drop perspective YAML files here, or press Enter or Space to browse for files',
  'dropZone.ctaActive': 'Release to upload files',
  'dropZone.ctaIdle': 'Drop perspective YAML files here',
  'dropZone.ctaSecondary': 'or click to browse',
  'dropZone.fileInputAriaLabel': 'Choose perspective YAML files to upload',
  'dropZone.heroTitle': 'Seam',
  'dropZone.heroSubtitle': 'Surface boundaries, negotiate contracts, verify integration',
  'dropZone.hint': 'Supports multiple files for cross-role comparison',
  'dropZone.downloadTemplate': 'Download template',
  'dropZone.formatHelpSummary': 'What format do I need?',
  'dropZone.formatHelpStructure': 'Each file needs a metadata section (your role and scope) and a list of domain events (things that happen in your system).',
  'dropZone.formatHelpFields': 'Each event needs: name (PascalCase, like "OrderPlaced"), aggregate (the thing it belongs to), and trigger (what causes it).',
  'dropZone.formatHelpOptional': 'Optional: payload fields, confidence level (CONFIRMED/LIKELY/POSSIBLE), and boundary assumptions about other systems.',
  'dropZone.sparkCanvasAlt': 'Prefer not to write YAML? Use the Spark Canvas to brainstorm events visually.',
  'dropZone.sparkCanvasLink': 'Open Spark Canvas',

  // ---------------------------------------------------------------------------
  // card-view (artifact)
  // ---------------------------------------------------------------------------
  'cardView.empty': 'Load a perspective YAML file to view events',
  'cardView.nEvents': '{{total}} events',
  'cardView.stat.confirmed': 'confirmed',
  'cardView.stat.likely': 'likely',
  'cardView.stat.possible': 'possible',
  'cardView.stat.inbound': 'inbound',
  'cardView.stat.outbound': 'outbound',
  'cardView.stat.internal': 'internal',
  'cardView.ariaLabel.byConfidence': 'By confidence',
  'cardView.ariaLabel.byDirection': 'By direction',
  'cardView.ariaLabel.eventStats': 'Event statistics',

  // ---------------------------------------------------------------------------
  // event-card
  // ---------------------------------------------------------------------------
  'eventCard.trigger': 'Trigger:',
  'eventCard.state': 'State:',
  'eventCard.channel': 'Channel:',
  'eventCard.payload': 'Payload ({{count}} fields)',
  'eventCard.payloadField': 'field',
  'eventCard.payloadType': 'type',

  // ---------------------------------------------------------------------------
  // filter-panel
  // ---------------------------------------------------------------------------
  'filterPanel.allActive': 'All filters active',
  'filterPanel.nActive': 'Filters ({{count}} active)',
  'filterPanel.confidence': 'Confidence',
  'filterPanel.direction': 'Direction',
  'filterPanel.confidence.confirmed': 'Confirmed',
  'filterPanel.confidence.likely': 'Likely',
  'filterPanel.confidence.possible': 'Possible',
  'filterPanel.direction.inbound': 'Inbound',
  'filterPanel.direction.outbound': 'Outbound',
  'filterPanel.direction.internal': 'Internal',

  // ---------------------------------------------------------------------------
  // aggregate-nav
  // ---------------------------------------------------------------------------
  'aggregateNav.heading': 'Aggregates',
  'aggregateNav.showAll': 'Show all',
  'aggregateNav.showAllAriaLabel': 'Show all aggregates',
  'aggregateNav.filterAriaLabel': 'Filter by aggregate: {{name}}, {{count}} events',

  // ---------------------------------------------------------------------------
  // assumption-list
  // ---------------------------------------------------------------------------
  'assumptionList.empty': 'No boundary assumptions',
  'assumptionList.heading': 'assumptions',
  'assumptionList.stat.confirmed': 'confirmed',
  'assumptionList.stat.likely': 'likely',
  'assumptionList.stat.possible': 'possible',
  'assumptionList.stat.conflicting': 'conflicting',
  'assumptionList.badge.conflicting': 'Conflicting',
  'assumptionList.affects': 'Affects:',
  'assumptionList.verifyWith': 'Verify with:',

  // ---------------------------------------------------------------------------
  // comparison-view
  // ---------------------------------------------------------------------------
  'comparisonView.empty': 'Load two or more perspective YAML files to compare roles',
  'comparisonView.conflicts': 'Conflicts',
  'comparisonView.sharedEvents': 'Shared Events',
  'comparisonView.sharedAggregates': 'Shared Aggregates',
  'comparisonView.noneFound': 'None found',
  'comparisonView.rolePanels': 'Role Panels',
  'comparisonView.nEvents': '{{count}} events',
  'comparisonView.nAssumptions': '{{count}} assumptions',
  'comparisonView.progress': '{{resolved}} of {{total}} conflicts resolved',
  'comparisonView.allResolved': 'All conflicts resolved!',
  'comparisonView.matchedAssumptions': 'Matched Assumptions',
  'comparisonView.matched': 'Matched',
  'comparisonView.needsDiscussion': 'Needs Discussion',
  'comparisonView.assumptionFrom': 'From {{role}}',
  'comparisonView.matchedBy': 'Matched by {{eventName}} ({{role}})',
  'comparisonView.matchReason': '{{reason}}',
  'comparisonView.assumptions': 'Assumptions',
  'comparisonView.formalizeCta.heading': 'All Conflicts Resolved',
  'comparisonView.formalizeCta.description': 'Ready to formalize agreements into contracts',
  'comparisonView.formalizeCta.button': 'Formalize Agreements',
  'comparisonView.export': 'Export Comparison',

  // ---------------------------------------------------------------------------
  // conflict-card
  // ---------------------------------------------------------------------------
  'conflictCard.kind.sharedEvent': 'Shared Event',
  'conflictCard.kind.sharedAggregate': 'Shared Aggregate',
  'conflictCard.kind.assumptionConflict': 'Assumption Conflict',
  'conflictCard.comparisonAriaLabel': 'Side-by-side comparison of {{name}}',
  'conflictCard.conflictingAssumptionsAriaLabel': 'Conflicting assumptions: {{leftId}} vs {{rightId}}',
  'conflictCard.aggregate': 'Aggregate:',
  'conflictCard.trigger': 'Trigger:',
  'conflictCard.state': 'State:',
  'conflictCard.channel': 'Channel:',
  'conflictCard.payload': 'Payload:',
  'conflictCard.none': 'none',
  'conflictCard.affects': 'Affects:',
  'conflictCard.verifyWith': 'Verify with:',
  'conflictCard.affectedWorkItems': 'Affected Work Items',

  // ---------------------------------------------------------------------------
  // detail-panel
  // ---------------------------------------------------------------------------
  'detailPanel.trigger.userCommand': 'User Command',
  'detailPanel.trigger.domainEvent': 'Domain Event',
  'detailPanel.trigger.query': 'Query',
  'detailPanel.trigger.scheduledTask': 'Scheduled Task',
  'detailPanel.trigger.externalSystem': 'External System',
  'detailPanel.direction.inbound': 'Inbound (receives)',
  'detailPanel.direction.outbound': 'Outbound (sends)',
  'detailPanel.direction.internal': 'Internal',
  'detailPanel.kind.aggregate': 'Aggregate',
  'detailPanel.kind.externalSystem': 'External System',
  'detailPanel.aboutAggregate': 'About this aggregate',
  'detailPanel.aboutExternalSystem': 'About this external system',
  'detailPanel.domainEvents': 'Domain Events',
  'detailPanel.domainEvent': 'domain event',
  'detailPanel.domainEvents.plural': 'domain events',
  'detailPanel.nDomainEvents': '{{count}} {{label}}',
  'detailPanel.noEvents': 'No events in this aggregate.',
  'detailPanel.connectedSystems': 'Connected External Systems',
  'detailPanel.connectedEvents': 'Connected Events',
  'detailPanel.connectedEvent': 'connected event',
  'detailPanel.connectedEvents.plural': 'connected events',
  'detailPanel.noConnectedEvents': 'No events connected to this system.',
  'detailPanel.meta.confidenceLevel': 'Confidence Level',
  'detailPanel.meta.trigger': 'What triggers this?',
  'detailPanel.meta.integration': 'Integration',
  'detailPanel.meta.channel': 'Channel',
  'detailPanel.meta.direction': 'Direction',
  'detailPanel.direction.systemToAggregate': 'System sends to aggregate',
  'detailPanel.direction.aggregateToSystem': 'Aggregate sends to system',
  'detailPanel.closeTitle': 'Close panel',
  'detailPanel.closeAriaLabel': 'Close detail panel for {{name}}',
  'detailPanel.defaultAriaLabel': 'Detail panel',
  'detailPanel.breakDownButton': 'Break down',
  'detailPanel.breakDownAriaLabel': 'Break down {{name}} into work items',
  'detailPanel.collapseButton': 'Collapse',
  'detailPanel.collapseAriaLabel': 'Collapse breakdown panel for {{name}}',

  // ---------------------------------------------------------------------------
  // flow-search
  // ---------------------------------------------------------------------------
  'flowSearch.regionAriaLabel': 'Search flow diagram nodes',
  'flowSearch.placeholder': 'Search nodes...',
  'flowSearch.label': 'Search nodes',
  'flowSearch.noMatches': 'No matches',
  'flowSearch.matchCount': '{{current}} of {{total}} matches',

  // ---------------------------------------------------------------------------
  // flow-minimap
  // ---------------------------------------------------------------------------
  'flowMinimap.ariaLabel': 'Flow diagram minimap showing {{count}} nodes. Drag the blue viewport rectangle to navigate.',

  // ---------------------------------------------------------------------------
  // session-lobby
  // ---------------------------------------------------------------------------
  'lobby.heroTitle': 'Seam',
  'lobby.heroSubtitle': 'Your systems will meet. Make sure they agree. Each participant submits their perspective, then explore boundaries and negotiate contracts together.',
  'lobby.sessionOptions': 'Session options',
  'lobby.startSession.title': 'Start a Session',
  'lobby.startSession.description': 'Create a new session and invite your team with a join code',
  'lobby.startSession.ariaLabel': 'Start a Session: Create a new session and invite your team with a join code',
  'lobby.startSession.button': 'Start a Session',
  'lobby.joinSession.title': 'Join a Session',
  'lobby.joinSession.description': 'Enter a join code from your team lead to participate',
  'lobby.joinSession.ariaLabel': 'Join a Session: Enter a join code from your team lead to participate',
  'lobby.joinSession.button': 'Join a Session',
  'lobby.solo.prompt': 'Just exploring?',
  'lobby.solo.link': 'Load files locally',
  'lobby.solo.suffix': 'without a session.',
  'lobby.backAriaLabel': 'Back to landing',
  'lobby.back': 'Back',
  'lobby.yourName': 'Your name',
  'lobby.yourNamePlaceholder': 'Enter your name',
  'lobby.createSession': 'Create Session',
  'lobby.joinCode': 'Join code',
  'lobby.joinCodePlaceholder': 'Enter join code',
  'lobby.joinSession.submit': 'Join Session',
  'lobby.sessionLobby': 'Session Lobby',
  'lobby.shareCode': 'Share this code',
  'lobby.copyCode': 'Copy code',
  'lobby.copyCodeTooltip': 'Copy session code to clipboard',
  'lobby.codeChipAriaLabel': 'Session code {{code}}. Click to copy.',
  'lobby.shareCodeAlert': 'Share code {{code}} with your team so they can join.',
  'lobby.copy': 'Copy',
  'lobby.participants': 'Participants',
  'lobby.status.submitted': 'Submitted',
  'lobby.status.waiting': 'Waiting',
  'lobby.you': '(you)',
  'lobby.loadAndSubmit': 'Load & Submit Files',
  'lobby.viewResults': 'View Combined Results',
  'lobby.waitingForParticipants': 'Waiting for participants to submit files...',
  'lobby.error.nameRequired': 'Please enter your name.',
  'lobby.error.codeRequired': 'Please enter a join code.',
  'lobby.error.joinCodeRequired': 'Please enter a join code.',
  'lobby.error.noFileData': 'No file data available yet. Please wait for participants to submit.',
  'lobby.youHaveSubmitted': 'You have submitted',
  'lobby.codeCopied': 'Copied!',
  'lobby.codeCopiedAriaLabel': 'Session code copied to clipboard',
  'lobby.urlJoinAutoTitle': 'Joining session…',
  'lobby.urlJoinAutoSubtitle': 'Detected session invite link. Joining automatically.',
  'lobby.submission.success': 'Files uploaded! Loading your session...',
  'lobby.howItWorks.heading': 'How it works',
  'lobby.howItWorks.step1.title': 'Share what your system does',
  'lobby.howItWorks.step1.description': 'Describe the events and data your piece of the system handles — what it sends, what it receives, and when.',
  'lobby.howItWorks.step2.title': 'See where things connect',
  'lobby.howItWorks.step2.description': 'Seam compares everyone\'s pieces side by side and shows you exactly where they overlap or conflict.',
  'lobby.howItWorks.step3.title': 'Agree on the boundaries',
  'lobby.howItWorks.step3.description': 'Lock in decisions about who owns what before anyone writes a line of code.',

  // ---------------------------------------------------------------------------
  // error-boundary
  // ---------------------------------------------------------------------------
  'errorBoundary.networkError': 'Unable to reach the server. Check your connection and try again.',
  'errorBoundary.timeoutError': 'Request timed out. Try again.',
  'errorBoundary.unexpectedError': 'Something unexpected happened.',
  'errorBoundary.retry': 'Retry',

  // ---------------------------------------------------------------------------
  // app-shell clipboard paste
  // ---------------------------------------------------------------------------
  'shell.pasteSuccess': 'Pasted YAML loaded — {{count}} events from {{role}}',
  'shell.pasteSuccessAriaLabel': 'YAML pasted from clipboard and loaded successfully',
  'shell.openSettings': 'Open settings',
  'shell.resetHelp': 'Show help tips again',
  'shell.helpReset': 'Help tips re-enabled! They will appear as you navigate.',

  // ---------------------------------------------------------------------------
  // participant-registry
  // ---------------------------------------------------------------------------
  'participantRegistry.regionAriaLabel': 'Participant registry',
  'participantRegistry.noSession': 'No active session',
  'participantRegistry.heading': 'Participants',
  'participantRegistry.nParticipantsAriaLabel': '{{count}} participants',
  'participantRegistry.empty': 'Waiting for participants\u2026',
  'participantRegistry.codeLabel': 'Code:',
  'participantRegistry.copyTooltip': 'Click to copy session code',
  'participantRegistry.codeAriaLabel': 'Session code {{code}}, click to copy',
  'participantRegistry.status.submitted': 'Submitted',
  'participantRegistry.status.waiting': 'Waiting to submit',
  'participantRegistry.you': '(you)',
  'participantRegistry.waiting': 'Waiting\u2026',
  'participantRegistry.sessionCode': 'Session code',

  // ---------------------------------------------------------------------------
  // flag-manager
  // ---------------------------------------------------------------------------
  'flagManager.heading': 'Unresolved Items',
  'flagManager.empty': 'No unresolved items \u2014 everything has been addressed.',
  'flagManager.listAriaLabel': 'Unresolved items',
  'flagManager.itemAriaLabel': 'Unresolved item: {{desc}}',
  'flagManager.formLabel': 'What needs follow-up?',
  'flagManager.descriptionLabel': 'Description',
  'flagManager.descriptionPlaceholder': 'Describe what needs follow-up...',
  'flagManager.relatedOverlapLabel': 'Related overlap (optional)',
  'flagManager.relatedOverlapPlaceholder': 'e.g. overlap-label',
  'flagManager.submitButton': 'Flag it',
  'flagManager.cancelButton': 'Cancel',
  'flagManager.cancelAriaLabel': 'Cancel flagging',
  'flagManager.toggleAriaLabel': 'Flag an unresolved item',
  'flagManager.toggleButton': 'Flag something unresolved',
  'flagManager.error.descriptionRequired': 'Please describe what needs follow-up.',

  // ---------------------------------------------------------------------------
  // resolution-recorder
  // ---------------------------------------------------------------------------
  'resolutionRecorder.groupAriaLabel': 'Record resolution for {{label}}',
  'resolutionRecorder.approachGroupAriaLabel': 'Choose a resolution approach',
  'resolutionRecorder.approach.merge': 'Merge',
  'resolutionRecorder.approach.merge.description': 'Combine both perspectives into one',
  'resolutionRecorder.approach.pickOne': 'Pick One',
  'resolutionRecorder.approach.pickOne.description': 'One role owns this; the other defers',
  'resolutionRecorder.approach.pick-left': 'Pick One',
  'resolutionRecorder.approach.pick-left.description': 'One role owns this; the other defers',
  'resolutionRecorder.approach.split': 'Split',
  'resolutionRecorder.approach.split.description': 'Divide into two separate concepts',
  'resolutionRecorder.approach.custom': 'Custom',
  'resolutionRecorder.approach.custom.description': 'Describe a bespoke resolution',
  'resolutionRecorder.describeLabel': 'Describe the resolution',
  'resolutionRecorder.contextLabel': 'Add context (optional)',
  'resolutionRecorder.submitButton': 'Record resolution',
  'resolutionRecorder.cancelButton': 'Cancel',
  'resolutionRecorder.cancelAriaLabel': 'Cancel \u2014 clear selection',
  'resolutionRecorder.hint': 'Choose an approach above to record how this was resolved.',
  'resolutionRecorder.resolvedBy': 'Resolved by {{names}}',
  'resolutionRecorder.resolvedAriaLabel': 'Conflict resolved',
  'resolutionRecorder.error.descriptionRequired': 'Please describe the resolution.',
  'resolutionRecorder.suggestion.loading': 'Analyzing conflict...',
  'resolutionRecorder.suggestion.banner': 'AI Suggestion',
  'resolutionRecorder.suggestion.confidence': '{{confidence}}% confidence',
  'resolutionRecorder.suggestion.apply': 'Apply',
  'resolutionRecorder.suggestion.dismiss': 'Dismiss',

  // ---------------------------------------------------------------------------
  // ownership-grid
  // ---------------------------------------------------------------------------
  'ownershipGrid.empty': 'No aggregates or roles to display.',
  'ownershipGrid.emptyHint': 'Load perspective files to see the ownership grid.',
  'ownershipGrid.ariaLabel': 'Aggregate ownership grid',
  'ownershipGrid.column.aggregate': 'Aggregate',
  'ownershipGrid.status': '{{assigned}} of {{total}} aggregate(s) assigned. Click a role cell to assign ownership.',
  'ownershipGrid.cell.owns': '{{role}} owns {{agg}}. Click to reassign.',
  'ownershipGrid.cell.notOwns': '{{role}} does not own {{agg}}. Click to assign.',
  'ownershipGrid.cell.owner': 'Owner',
  'ownershipGrid.cell.assign': 'Assign',

  // ---------------------------------------------------------------------------
  // contract-diff
  // ---------------------------------------------------------------------------
  'contractDiff.empty': 'Provide two contract bundles to compare versions',
  'contractDiff.error': 'Unable to compute diff',
  'contractDiff.noChanges': 'No changes between these contract versions',
  'contractDiff.ariaLabel.all': 'All contract changes',
  'contractDiff.ariaLabel.events': 'Event contract changes',
  'contractDiff.ariaLabel.boundaries': 'Boundary contract changes',
  'contractDiff.empty.events': 'No event contract changes',
  'contractDiff.empty.boundaries': 'No boundary contract changes',
  'contractDiff.nChanges': '{{count}} changes',
  'contractDiff.nAdded': '{{count}} added',
  'contractDiff.nRemoved': '{{count}} removed',
  'contractDiff.nModified': '{{count}} modified',
  'contractDiff.tab.all': 'All ({{count}})',
  'contractDiff.tab.events': 'Events ({{count}})',
  'contractDiff.tab.boundaries': 'Boundaries ({{count}})',
  'contractDiff.kind.event': 'Event',
  'contractDiff.kind.boundary': 'Boundary',
  'contractDiff.legend': 'Legend',
  'contractDiff.changeType.added': 'Added',
  'contractDiff.changeType.removed': 'Removed',
  'contractDiff.changeType.modified': 'Modified',

  // ---------------------------------------------------------------------------
  // provenance-explorer
  // ---------------------------------------------------------------------------
  'provenanceExplorer.empty': 'No provenance chain available',
  'provenanceExplorer.headingPrefix': 'Provenance of',
  'provenanceExplorer.ariaLabel': 'Provenance chain for {{subject}}',
  'provenanceExplorer.ariaLabelDefault': 'Provenance chain',
  'provenanceExplorer.step': 'Step {{n}} of {{total}}:',
  'provenanceExplorer.at': 'at {{timestamp}}',
  'provenanceExplorer.legend': 'Legend',
  'provenanceExplorer.kind.resolution': 'resolution',
  'provenanceExplorer.kind.conflict': 'conflict overlap',
  'provenanceExplorer.kind.artifact': 'artifact',
  'provenanceExplorer.kind.participant': 'participant',

  // ---------------------------------------------------------------------------
  // comparison-diff
  // ---------------------------------------------------------------------------
  'comparisonDiff.empty': 'Load two or more perspective YAML files to use the diff view',
  'comparisonDiff.fileA': 'File A',
  'comparisonDiff.fileB': 'File B',
  'comparisonDiff.selectDifferentFiles': 'Select two different files to compare',
  'comparisonDiff.computing': 'Computing layout\u2026',
  'comparisonDiff.summary': '{{total}} events total \u2014 {{shared}} shared, {{onlyA}} only in A, {{onlyB}} only in B',
  'comparisonDiff.svgAriaLabel': 'Overlay diff graph: {{shared}} shared events, {{onlyA}} only in file A, {{onlyB}} only in file B',
  'comparisonDiff.tableAriaLabel': 'Diff events list',
  'comparisonDiff.tableCaption': 'All {{total}} events in the diff',
  'comparisonDiff.col.eventName': 'Event Name',
  'comparisonDiff.col.aggregate': 'Aggregate',
  'comparisonDiff.col.status': 'Status',
  'comparisonDiff.noEvents': 'No events found in selected files',
  'comparisonDiff.svgAriaLabelShort': 'Overlay diff graph',
  'comparisonDiff.status.shared': 'In both files',
  'comparisonDiff.status.only-a': 'Only in file A',
  'comparisonDiff.status.only-b': 'Only in file B',

  // ---------------------------------------------------------------------------
  // suggestion-bar
  // ---------------------------------------------------------------------------
  'suggestion-bar.dismiss': 'Dismiss suggestion',
  'suggestion-bar.aria-label': 'Session suggestion',
  'suggestion.cta.viewConflicts': 'View Conflicts',
  'suggestion.cta.viewContracts': 'View Contracts',
  'suggestion.cta.viewIntegration': 'View Integration',

  // ---------------------------------------------------------------------------
  // settings-drawer
  // ---------------------------------------------------------------------------
  'settings-drawer.title.comparison': 'Comparison Settings',
  'settings-drawer.title.contracts': 'Contract Settings',
  'settings-drawer.title.ranking': 'Priority Settings',
  'settings-drawer.title.delegation': 'Delegation Settings',
  'settings-drawer.title.notifications': 'Notification Settings',

  'settings-drawer.default': 'Default',
  'settings-drawer.on': 'On',
  'settings-drawer.off': 'Off',
  'settings-drawer.modified-indicator': 'Modified from default',
  'settings-drawer.gear-button.aria-label': 'Open {{section}}',

  // Comparison section
  'settings-drawer.comparison.sensitivity': 'Match Sensitivity',
  'settings-drawer.comparison.sensitivity.semantic': 'Semantic (flexible naming)',
  'settings-drawer.comparison.sensitivity.exact': 'Exact (byte-for-byte)',
  'settings-drawer.comparison.autoDetectConflicts': 'Auto-detect Conflicts',
  'settings-drawer.comparison.suggestResolutions': 'Suggest Resolutions',

  // Contracts section
  'settings-drawer.contracts.strictness': 'Enforcement Strictness',
  'settings-drawer.contracts.strictness.strict': 'Strict (block non-compliant)',
  'settings-drawer.contracts.strictness.warn': 'Warn (surface warnings)',
  'settings-drawer.contracts.strictness.relaxed': 'Relaxed (log only)',
  'settings-drawer.contracts.driftNotifications': 'Drift Notifications',
  'settings-drawer.contracts.driftNotifications.immediate': 'Immediate (toast on each drift)',
  'settings-drawer.contracts.driftNotifications.batched': 'Batched (end-of-session digest)',
  'settings-drawer.contracts.driftNotifications.silent': 'Silent (visible in Contract tab only)',

  // Ranking section
  'settings-drawer.ranking.defaultTier': 'Default Tier',
  'settings-drawer.ranking.tier.mustHave': 'Must Have',
  'settings-drawer.ranking.tier.shouldHave': 'Should Have',
  'settings-drawer.ranking.tier.couldHave': 'Could Have',
  'settings-drawer.ranking.weight.confidence': 'Confidence Weight',
  'settings-drawer.ranking.weight.complexity': 'Complexity Weight',
  'settings-drawer.ranking.weight.references': 'References Weight',

  // Delegation section
  'settings-drawer.delegation.level': 'Autonomy Level',
  'settings-drawer.delegation.level.assisted': 'Assisted (agent proposes, human approves)',
  'settings-drawer.delegation.level.semi-autonomous': 'Semi-autonomous (agent acts, human can undo)',
  'settings-drawer.delegation.level.autonomous': 'Autonomous (agent acts without approval)',
  'settings-drawer.delegation.approvalExpiry': 'Approval Expiry (seconds)',
  'settings-drawer.delegation.approvalExpiry.hint': '24 hours default',

  // Notifications section
  'settings-drawer.notifications.toastDuration': 'Toast Duration (ms)',
  'settings-drawer.notifications.silentEvents': 'Silent Events',
  'settings-drawer.notifications.silentEvents.placeholder': 'EventA, EventB, ...',
  'settings-drawer.notifications.silentEvents.hint': 'Comma-separated event names that will never trigger a toast. Default: none.',

  // ---------------------------------------------------------------------------
  // spark-canvas
  // ---------------------------------------------------------------------------
  'spark-canvas.title': 'Create Your Events',
  'spark-canvas.add-row': 'Add new event...',
  'spark-canvas.submit': 'Submit to Session',
  'spark-canvas.collapsed-label': 'Add more events',
  'spark-canvas.template-label': 'Quick Start',
  'spark-canvas.template-blank': 'Blank Canvas',
  'spark-canvas.template-ecommerce': 'E-commerce Order Flow',
  'spark-canvas.template-auth': 'User Authentication',
  'spark-canvas.template-payment': 'Payment Processing',
  'spark-canvas.template-subscription': 'Subscription Lifecycle',
  'spark-canvas.view-canvas': 'Canvas',
  'spark-canvas.view-yaml': 'YAML',
  'spark-canvas.ai-assist': 'AI Assist',
  'spark-canvas.ai-dialog.title': 'AI Assist',
  'spark-canvas.ai-dialog.describe': 'Describe your system',
  'spark-canvas.ai-dialog.placeholder': 'e.g., An e-commerce platform with orders, payments, and shipping',
  'spark-canvas.ai-dialog.generate': 'Generate Events',
  'spark-canvas.ai-dialog.noResults': 'No matching events found. Try a more specific description.',
  'spark-canvas.ai-dialog.accept': 'Add {{count}} Events',
  'spark-canvas.ai-dialog.selectAll': 'Select All',
  'spark-canvas.ai-dialog.deselectAll': 'Deselect All',
  'spark-canvas.col-event': 'What happened?',
  'spark-canvas.col-aggregate': 'To what?',
  'spark-canvas.col-trigger': 'Triggered by?',

  // ---------------------------------------------------------------------------
  // draft-editor
  // ---------------------------------------------------------------------------
  'draft-editor.title': 'Edit Draft',
  'draft-editor.publish': 'Publish Draft',
  'draft-editor.publish-aria-label': 'Publish this draft to the session',
  'draft-editor.discard': 'Discard',
  'draft-editor.discard-aria-label': 'Discard this draft permanently',
  'draft-editor.empty': 'No draft selected.',
  'draft-editor.no-events': 'No events in this draft.',
  'draft-editor.col-event': 'What happened?',
  'draft-editor.col-aggregate': 'To what?',
  'draft-editor.col-trigger': 'Triggered by?',
  'draft-editor.updated-at': 'Last updated {{time}}',

  // ---------------------------------------------------------------------------
  // priority-view
  // ---------------------------------------------------------------------------
  'priorityView.boardMode': 'Board',
  'priorityView.tableMode': 'Table',
  'priorityView.modeToggleAriaLabel': 'Toggle view mode',
  'priorityView.column.mustHave': 'Must Have',
  'priorityView.column.shouldHave': 'Should Have',
  'priorityView.column.couldHave': 'Could Have',
  'priorityView.empty': 'No events to rank yet.',
  'priorityView.emptyHint': 'Load perspective YAML files to populate events.',
  'priorityView.emptyColumn': 'No events in this tier',
  'priorityView.sortBy': 'Sort by',
  'priorityView.sortBy.score': 'Composite Score',
  'priorityView.sortBy.aggregate': 'Aggregate',
  'priorityView.sortBy.confidence': 'Confidence',
  'priorityView.sortBy.crossRefs': 'Cross-references',
  'priorityView.col.name': 'Name',
  'priorityView.col.aggregate': 'Aggregate',
  'priorityView.col.confidence': 'Confidence',
  'priorityView.col.direction': 'Direction',
  'priorityView.col.crossRefs': 'Cross-refs',
  'priorityView.col.score': 'Score',
  'priorityView.col.tier': 'Priority',
  'priorityView.ariaLabel.board': 'Priority board — drag cards to change tier',
  'priorityView.ariaLabel.table': 'Priority table — sortable by column',
  'priorityView.ariaLabel.column': '{{tier}} column, {{count}} events',
  'priorityView.ariaLabel.card': '{{name}} — {{tier}} — score {{score}}',
  'priorityView.announce.moved': 'Moved {{name}} to {{tier}}',
  'priorityView.dragHint': 'Drag to move between tiers',
  'priorityView.keyboardHint': 'Press Space or Enter to pick up, then Arrow keys to move',

  // ---------------------------------------------------------------------------
  // vote-widget
  // ---------------------------------------------------------------------------
  'voteWidget.upvote': 'Upvote {{name}}',
  'voteWidget.downvote': 'Downvote {{name}}',
  'voteWidget.netVotes': '{{count}} votes',
  'voteWidget.noVotes': 'No votes yet',
  'voteWidget.upVoters': 'Upvoted by: {{names}}',
  'voteWidget.downVoters': 'Downvoted by: {{names}}',
  'voteWidget.alreadyVotedUp': 'You upvoted — click to undo',
  'voteWidget.alreadyVotedDown': 'You downvoted — click to undo',

  // ---------------------------------------------------------------------------
  // suggestion-banner
  // ---------------------------------------------------------------------------
  'suggestionBanner.agentLabel': 'Agent suggestion',
  'suggestionBanner.accept': 'Accept',
  'suggestionBanner.dismiss': 'Dismiss',
  'suggestionBanner.acceptAriaLabel': 'Accept agent suggestion',
  'suggestionBanner.dismissAriaLabel': 'Dismiss agent suggestion',

  // ---------------------------------------------------------------------------
  // breakdown-editor
  // ---------------------------------------------------------------------------
  'breakdownEditor.title': 'Work Item Breakdown',
  'breakdownEditor.addWorkItem': 'Add work item',
  'breakdownEditor.addWorkItemAriaLabel': 'Add a new work item (shortcut: N)',
  'breakdownEditor.empty': 'No work items yet.',
  'breakdownEditor.emptyHint': 'Press the + button or N to add your first work item.',
  'breakdownEditor.workItemTitle': 'Title',
  'breakdownEditor.workItemTitlePlaceholder': 'Short, imperative title...',
  'breakdownEditor.workItemDescription': 'Description',
  'breakdownEditor.workItemDescriptionPlaceholder': 'Context and rationale...',
  'breakdownEditor.acceptanceCriteria': 'Acceptance Criteria',
  'breakdownEditor.acceptanceCriteriaHint': 'Press Enter to add each criterion',
  'breakdownEditor.acceptanceCriteriaPlaceholder': 'Add criterion and press Enter...',
  'breakdownEditor.complexity': 'Complexity',
  'breakdownEditor.linkedEvents': 'Linked Events',
  'breakdownEditor.noLinkedEvents': 'No events linked',
  'breakdownEditor.deleteWorkItem': 'Delete work item',
  'breakdownEditor.deleteWorkItemAriaLabel': 'Delete work item: {{title}}',
  'breakdownEditor.ghostCard.label': 'Suggested',
  'breakdownEditor.ghostCard.accept': 'Accept',
  'breakdownEditor.ghostCard.dismiss': 'Dismiss',
  'breakdownEditor.ghostCard.acceptAriaLabel': 'Accept suggestion: {{title}}',
  'breakdownEditor.ghostCard.dismissAriaLabel': 'Dismiss suggestion: {{title}}',
  'breakdownEditor.complexity.S': 'S — Small',
  'breakdownEditor.complexity.M': 'M — Medium',
  'breakdownEditor.complexity.L': 'L — Large',
  'breakdownEditor.complexity.XL': 'XL — Extra Large',
  'breakdownEditor.workItemCard.ariaLabel': 'Work item: {{title}}, complexity {{complexity}}',

  // ---------------------------------------------------------------------------
  // coverage-matrix
  // ---------------------------------------------------------------------------
  'coverageMatrix.title': 'Event Coverage',
  'coverageMatrix.empty': 'No events or work items to display.',
  'coverageMatrix.ariaLabel': 'Event coverage matrix — rows are events, columns are work items',
  'coverageMatrix.col.event': 'Domain Event',
  'coverageMatrix.covered': 'Covered by {{title}}',
  'coverageMatrix.uncovered': '{{event}} is not covered by any work item',
  'coverageMatrix.cell.covered': '{{workItem}} covers {{event}}',
  'coverageMatrix.cell.notCovered': '{{workItem}} does not cover {{event}}',
  'coverageMatrix.uncoveredCount': '{{count}} uncovered event(s)',
  'coverageMatrix.allCovered': 'All events covered',

  // ---------------------------------------------------------------------------
  // dependency-graph
  // ---------------------------------------------------------------------------
  'dependencyGraph.title': 'Dependencies',
  'dependencyGraph.empty': 'No work items to display.',
  'dependencyGraph.emptyHint': 'Add work items above to see their dependencies here.',
  'dependencyGraph.ariaLabel': 'Work item dependency graph',
  'dependencyGraph.tableCaption': 'Work item dependencies',
  'dependencyGraph.col.from': 'From',
  'dependencyGraph.col.to': 'Depends on',
  'dependencyGraph.noDependencies': 'No dependencies defined',
  'dependencyGraph.noDependenciesHint': 'Drag from one work item node to another to create a dependency.',
  'dependencyGraph.dragHint': 'Drag to create a dependency link',
  'dependencyGraph.dependency': '{{from}} depends on {{to}}',

  // ---------------------------------------------------------------------------
  // settings-drawer (global)
  // ---------------------------------------------------------------------------
  'settingsDrawer.defaultLabel': 'Settings',
  'settingsDrawer.empty': 'No settings available for this section.',
  'settingsDrawer.defaultPrefix': 'Default:',
  'settingsDrawer.defaultTrue': 'On',
  'settingsDrawer.defaultFalse': 'Off',
  'settingsDrawer.modifiedAriaLabel': 'Modified from default',

  // ---------------------------------------------------------------------------
  // settings-gear
  // ---------------------------------------------------------------------------
  'settingsGear.ariaLabel': 'Open {{sectionName}} settings',
  'settingsGear.modifiedAriaLabel': 'This section has modified settings',

  // ---------------------------------------------------------------------------
  // section settings (used by _sectionSettings() in app-shell)
  // ---------------------------------------------------------------------------
  // Comparison section
  'settings.comparison.sensitivity': 'Comparison Sensitivity',
  'settings.comparison.sensitivity.description': 'How strictly event names and field names are compared.',
  'settings.comparison.sensitivity.semantic': 'Semantic — treat camelCase and snake_case as equal',
  'settings.comparison.sensitivity.exact': 'Exact — require byte-for-byte equality',
  'settings.comparison.autoDetectConflicts': 'Auto-detect Conflicts',
  'settings.comparison.autoDetectConflicts.description': 'Automatically detect overlaps and conflicts as artifacts arrive.',
  'settings.comparison.suggestResolutions': 'Suggest Resolutions',
  'settings.comparison.suggestResolutions.description': 'Generate resolution suggestions for detected conflicts.',
  // Contracts section
  'settings.contracts.strictness': 'Contract Strictness',
  'settings.contracts.strictness.description': 'How non-compliant artifacts are handled.',
  'settings.contracts.strictness.strict': 'Strict — block submission',
  'settings.contracts.strictness.warn': 'Warn — surface warnings',
  'settings.contracts.strictness.relaxed': 'Relaxed — log only',
  'settings.contracts.driftNotifications': 'Drift Notifications',
  'settings.contracts.driftNotifications.description': 'When and how participants are notified of contract drift.',
  'settings.contracts.driftNotifications.immediate': 'Immediate — toast on every drift event',
  'settings.contracts.driftNotifications.batched': 'Batched — digest at end of session',
  'settings.contracts.driftNotifications.silent': 'Silent — visible in Contract tab only',
  // Ranking/Priority section
  'settings.ranking.weights.confidence': 'Confidence Weight',
  'settings.ranking.weights.confidence.description': 'Multiplier applied to the confidence score when computing priority.',
  'settings.ranking.weights.complexity': 'Complexity Weight',
  'settings.ranking.weights.complexity.description': 'Multiplier applied to the implementation complexity estimate.',
  'settings.ranking.weights.references': 'References Weight',
  'settings.ranking.weights.references.description': 'Multiplier applied to how many other events reference this one.',
  'settings.ranking.defaultTier': 'Default Tier',
  'settings.ranking.defaultTier.description': 'The MoSCoW tier assigned to newly discovered events before voting.',
  'settings.ranking.defaultTier.mustHave': 'Must Have',
  'settings.ranking.defaultTier.shouldHave': 'Should Have',
  'settings.ranking.defaultTier.couldHave': 'Could Have',
  // Delegation section
  'settings.delegation.level': 'Autonomy Level',
  'settings.delegation.level.description': 'How much autonomy agents have when proposing actions.',
  'settings.delegation.level.assisted': 'Assisted — agent proposes, human approves',
  'settings.delegation.level.semiAutonomous': 'Semi-autonomous — agent acts, human can undo',
  'settings.delegation.level.autonomous': 'Autonomous — agent acts without approval',
  'settings.delegation.approvalExpiry': 'Approval Request Expiry (seconds)',
  'settings.delegation.approvalExpiry.description': 'How long a pending approval request remains active before it expires.',
  // Notifications section
  'settings.notifications.toastDuration': 'Toast Duration (ms)',
  'settings.notifications.toastDuration.description': 'How long toast notifications remain visible before auto-dismissing.',

  // ---------------------------------------------------------------------------
  // schema-display
  // ---------------------------------------------------------------------------
  'schemaDisplay.empty': 'No schema fields defined',
  'schemaDisplay.defaultAriaLabel': 'Schema fields',
  'schemaDisplay.required': 'required',
  'schemaDisplay.optional': 'optional',
  'schemaDisplay.fieldsOfAriaLabel': 'Fields of {{key}}',
  'schemaDisplay.fieldAriaLabel.required': 'required',
  'schemaDisplay.fieldAriaLabel.optional': 'optional',

  // ---------------------------------------------------------------------------
  // compliance-badge
  // ---------------------------------------------------------------------------
  'complianceBadge.status.pass': 'Passing',
  'complianceBadge.status.warn': 'Warning',
  'complianceBadge.status.fail': 'Failing',
  'complianceBadge.ariaLabel': 'Contract compliance: {{status}}. Click for details.',
  'complianceBadge.tooltip.pass': 'All {{count}} contracts passing',
  'complianceBadge.tooltip.warn': '{{count}} drift warning(s) detected',
  'complianceBadge.tooltip.fail': '{{count}} contract violation(s) detected',
  'complianceBadge.severity.error': 'Error',
  'complianceBadge.severity.warning': 'Warning',
  'complianceBadge.detail.owner': 'Owner: {{owner}}',
  'complianceBadge.detail.errorAriaLabel': 'Error: {{event}} — owned by {{owner}}',
  'complianceBadge.detail.warningAriaLabel': 'Warning: {{event}} — owned by {{owner}}',
  'complianceBadge.dialog.title': 'Contract Compliance Details',
  'complianceBadge.dialog.summary': '{{total}} issue(s) detected',
  'complianceBadge.dialog.errors': '{{count}} error(s)',
  'complianceBadge.dialog.warnings': '{{count}} warning(s)',
  'complianceBadge.dialog.listAriaLabel': 'Compliance issues',
  'complianceBadge.dialog.allPassing': 'All contracts are passing — no drift detected.',

  // ---------------------------------------------------------------------------
  // drift-notification
  // ---------------------------------------------------------------------------
  'driftNotification.title': 'Contract Drift Detected',
  'driftNotification.message': '{{participant}}\u2019s latest submission changes the {{event}} payload.',
  'driftNotification.ariaLabel': 'Drift alert: {{participant}} changed {{event}}',
  'driftNotification.closeAriaLabel': 'Dismiss drift notification for {{event}}',
  'driftNotification.queue': '{{count}} more drift notification(s) queued',

  // ---------------------------------------------------------------------------
  // contract-sidebar
  // ---------------------------------------------------------------------------
  'contractSidebar.heading': 'Contracts',
  'contractSidebar.empty.title': 'No contracts loaded yet',
  'contractSidebar.empty.hint': 'Contracts appear here once the session reaches the Build phase.',
  'contractSidebar.status.pass': 'Pass',
  'contractSidebar.status.warn': 'Warning',
  'contractSidebar.status.fail': 'Fail',
  'contractSidebar.consumers': '{{count}} consumer(s)',
  'contractSidebar.row.ariaLabel': '{{event}}: {{status}}, {{consumers}} consumer(s). Click to select.',
  'contractSidebar.ownerGroupAriaLabel': 'Contracts owned by {{owner}}: {{count}} total',
  'contractSidebar.contractListAriaLabel': 'Contracts owned by {{owner}}',

  // ---------------------------------------------------------------------------
  // go-no-go-verdict
  // ---------------------------------------------------------------------------
  'goNoGoVerdict.label.go': 'GO',
  'goNoGoVerdict.label.noGo': 'NO-GO',
  'goNoGoVerdict.label.caution': 'CAUTION',
  'goNoGoVerdict.celebration': 'All systems go. Your team aligned on {{contractCount}} contracts across {{aggregateCount}} aggregates.',

  // ---------------------------------------------------------------------------
  // boundary-map
  // ---------------------------------------------------------------------------
  'boundaryMap.title': 'Boundary Map',
  'boundaryMap.empty': 'No bounded contexts to display.',
  'boundaryMap.status.pass': 'Compliant',
  'boundaryMap.status.warn': 'Advisory',
  'boundaryMap.status.fail': 'Non-compliant',
  'boundaryMap.edge.ariaLabel': '{{from}} to {{to}}: {{status}}',
  'boundaryMap.legend.label': 'Legend:',
  'boundaryMap.legend.ariaLabel': 'Boundary map legend',
  'boundaryMap.table.ariaLabel': 'Boundary connections',
  'boundaryMap.table.caption': 'All bounded context connections and their compliance status',
  'boundaryMap.table.col.from': 'From',
  'boundaryMap.table.col.to': 'To',
  'boundaryMap.table.col.status': 'Status',

  // ---------------------------------------------------------------------------
  // integration-dashboard
  // ---------------------------------------------------------------------------
  'integrationDashboard.title': 'Integration Dashboard',
  'integrationDashboard.gridAriaLabel': 'Integration dashboard — checks, boundary map, and verdict',
  'integrationDashboard.runChecks.label': 'Run Checks',
  'integrationDashboard.runChecks.ariaLabel': 'Re-run all integration checks',

  'integrationDashboard.checks.heading': 'Checks',
  'integrationDashboard.checks.listAriaLabel': 'Integration checks',
  'integrationDashboard.checks.summaryAriaLabel': 'Check results summary',
  'integrationDashboard.checks.total': '{{count}} checks',
  'integrationDashboard.checks.passing': '{{count}} passing',
  'integrationDashboard.checks.warning': '{{count}} advisory',
  'integrationDashboard.checks.failing': '{{count}} failing',
  'integrationDashboard.checks.empty': 'No integration checks available.',

  'integrationDashboard.check.status.pass': 'Pass',
  'integrationDashboard.check.status.warn': 'Advisory',
  'integrationDashboard.check.status.fail': 'Fail',
  'integrationDashboard.check.itemAriaLabel': '{{label}}: {{status}}',
  'integrationDashboard.check.detailsSummary': 'Details',
  'integrationDashboard.check.owner': 'Owner: {{owner}}',
  'integrationDashboard.check.createWorkItem': 'Create work item',
  'integrationDashboard.check.createWorkItemAriaLabel': 'Create a work item to fix: {{label}}',

  'integrationDashboard.boundary.heading': 'Boundary Map',

  'integrationDashboard.verdict.heading': 'Verdict',
  'integrationDashboard.verdict.go.summary': 'All checks pass. Ready to ship.',
  'integrationDashboard.verdict.noGo.summary': '{{count}} issue(s) require resolution.',
  'integrationDashboard.verdict.caution.summary': 'All critical checks pass, but {{count}} advisory item(s) found.',
  'integrationDashboard.export': 'Export Report',

  // ---------------------------------------------------------------------------
  // help-tip
  // ---------------------------------------------------------------------------
  'helpTip.gotIt': 'Got it',
  'helpTip.dismiss': 'Dismiss help tip',
  'helpTip.comparison-view': 'These are events that appear in multiple participants\u2019 submissions. Amber means they overlap but differ \u2014 the same event has different definitions.',
  'helpTip.conflict-resolve': 'Choose how your team wants to handle this overlap. Most teams start with Merge.',
  'helpTip.priority-view': 'Drag events between columns to set priority. Scores are computed from confidence, complexity, and how many participants reference the event.',
  'helpTip.breakdown-editor': 'Break large events into smaller, more focused domain events. Each slice should represent a single meaningful state change.',
  'helpTip.integration-dashboard': 'This dashboard shows how domain events flow between services and external systems. Green means confirmed integration; amber means assumed.',
  'helpTip.file-drop': 'Drop your perspective YAML file here to load your domain events. You can load multiple files to compare roles.',
  'helpTip.comparisonView': 'Compare how different participants see the same domain events. Look for shared events and conflicts.',
  'helpTip.priorityView': 'Drag events between priority tiers or vote to help the team decide what matters most.',
  'helpTip.breakdownEditor': 'Break prioritized events into work items. Link events to tasks and track coverage.',
  'helpTip.integrationDashboard': 'Review integration checks across all boundaries. Green means ready to ship.',
  'helpTip.sparkCanvas': 'Start by adding domain events here. Type event names, aggregates, and triggers — or drop a YAML file.',
  'helpTip.agreementsTab': 'Review overlapping domain events between roles. Resolve conflicts by choosing how your team handles each overlap.',
  'helpTip.conflictResolve': 'Each conflict card shows differences between submissions. Use the suggestion banner or write your own resolution, then submit to record the team\'s decision.',
  'helpTip.contractsTab': 'Formalized event contracts appear here. Review schemas, check provenance, and verify compliance before integration.',

  // ---------------------------------------------------------------------------
  // onboarding-overlay
  // ---------------------------------------------------------------------------
  'onboardingOverlay.title': 'Welcome to Seam',
  'onboardingOverlay.description': 'The boundary negotiation platform where teams turn integration assumptions into verified contracts. Upload your perspectives, explore boundaries, and negotiate agreements.',
  'onboardingOverlay.step1.label': 'Upload your YAML file',
  'onboardingOverlay.step2.label': 'Explore the event flow',
  'onboardingOverlay.step3.label': 'Collaborate with your team',
  'onboardingOverlay.getStarted': 'Get Started',
  'onboardingOverlay.skip': 'Skip intro',
  'onboardingOverlay.ariaLabel': 'Welcome onboarding overlay',
  'onboardingOverlay.closeAriaLabel': 'Close onboarding overlay',
  'onboardingOverlay.stepsAriaLabel': 'Three steps to get started',

  // ---------------------------------------------------------------------------
  // empty-state
  // ---------------------------------------------------------------------------
  'emptyState.defaultTitle': 'Nothing here yet',
  'emptyState.defaultDescription': 'There is no content to display.',

  // Phase-specific empty state messages
  'emptyState.priority.heading': 'No priorities yet',
  'emptyState.priority.description': 'Load multiple files to start ranking events by importance',
  'emptyState.breakdown.heading': 'No work items yet',
  'emptyState.breakdown.description': 'Break ranked events into concrete work items with dependencies',
  'emptyState.agreements.heading': 'No Overlaps Detected',
  'emptyState.agreements.description': 'When multiple artifacts share the same domain events, overlaps appear here for resolution. Load at least two files to begin.',
  'emptyState.cardView.heading': 'No Artifacts Loaded',
  'emptyState.cardView.description': 'Drop or paste perspective YAML files to see domain events organized by role and aggregate.',
  'emptyState.flowDiagram.heading': 'No Event Flow Yet',
  'emptyState.flowDiagram.description': 'Load perspective YAML files to see how domain events flow between aggregates.',
  'emptyState.contracts.heading': 'No contracts yet',
  'emptyState.contracts.description': 'Formalize agreements into versioned event contracts',
  'emptyState.integration.heading': 'Ready to ship?',
  'emptyState.integration.description': 'Run integration checks to verify all contracts are satisfied',
  'emptyState.comparison.heading': 'Load two or more files to compare',
  'emptyState.comparison.description': 'Load perspective YAML files from multiple roles to see conflicts, shared events, and overlaps',

  // ---------------------------------------------------------------------------
  // phase-ribbon
  // ---------------------------------------------------------------------------
  'phaseRibbon.ariaLabel': 'Session progress',
  'phaseRibbon.spark': 'Spark',
  'phaseRibbon.explore': 'Explore',
  'phaseRibbon.rank': 'Rank',
  'phaseRibbon.slice': 'Slice',
  'phaseRibbon.agree': 'Agree',
  'phaseRibbon.build': 'Build',
  'phaseRibbon.ship': 'Ship',
  'phaseRibbon.completed': '{{phase}}, completed',
  'phaseRibbon.current': '{{phase}}, current step',
  'phaseRibbon.upcoming': '{{phase}}, upcoming',

  // ---------------------------------------------------------------------------
  // shortcut-reference component
  // ---------------------------------------------------------------------------
  'shortcuts.dialogTitle': 'Keyboard Shortcuts',
  'shortcuts.noShortcuts': 'No shortcuts registered.',
  'shortcuts.footerNote': 'Press ? anywhere to open this panel',
  'shortcuts.resetDefaults': 'Reset to Defaults',

  // Shortcut categories
  'shortcuts.category.phases': 'Phases',
  'shortcuts.category.actions': 'Actions',
  'shortcuts.category.navigation': 'Navigation',

  // Shortcut descriptions — used in registry.register() calls
  'shortcuts.phase.spark': 'Go to Spark phase',
  'shortcuts.phase.explore': 'Go to Explore phase',
  'shortcuts.phase.rank': 'Go to Rank phase',
  'shortcuts.phase.slice': 'Go to Slice phase',
  'shortcuts.phase.agree': 'Go to Agree phase',
  'shortcuts.phase.build': 'Go to Build phase',
  'shortcuts.phase.ship': 'Go to Ship phase',
  'shortcuts.action.newEvent': 'New event',
  'shortcuts.action.resolve': 'Open resolve dialog',
  'shortcuts.action.confirm': 'Confirm current action',
  'shortcuts.action.cancel': 'Cancel / close dialog',
  'shortcuts.action.openHelp': 'Open keyboard shortcuts',

  // ---------------------------------------------------------------------------
  // approval-queue
  // ---------------------------------------------------------------------------
  'approvalQueue.bellAriaLabel': 'Open approval queue',
  'approvalQueue.bellAriaLabelWithCount': 'Open approval queue, {{count}} pending',
  'approvalQueue.drawerLabel': 'Approval Queue',
  'approvalQueue.drawerSubtitle': 'Review and approve or reject agent-proposed actions',
  'approvalQueue.listAriaLabel': 'Pending approval items',
  'approvalQueue.empty': 'All caught up!',
  'approvalQueue.emptyHint': 'Agent-proposed actions will appear here for your review.',
  'approvalQueue.itemAriaLabel': 'Pending approval: {{action}}',
  'approvalQueue.agentLabel': 'Agent: {{id}}',
  'approvalQueue.viewDetails': 'View reasoning',
  'approvalQueue.accept': 'Accept',
  'approvalQueue.reject': 'Reject',
  'approvalQueue.expired': 'Expired',
  'approvalQueue.expiresInHours': 'Expires in {{hours}} hour(s)',
  'approvalQueue.expiresInMinutes': 'Expires in {{minutes}} minute(s)',

  // ---------------------------------------------------------------------------
  // delegation-toggle
  // ---------------------------------------------------------------------------
  'delegationToggle.label': 'Agent autonomy',
  'delegationToggle.level.assisted': 'Assisted',
  'delegationToggle.level.semi_autonomous': 'Semi-autonomous',
  'delegationToggle.level.autonomous': 'Autonomous',
  'delegationToggle.description.assisted': 'Agents suggest, humans approve',
  'delegationToggle.description.semi_autonomous': 'Agents handle routine tasks',
  'delegationToggle.description.autonomous': 'Agents act as full participants',
  'delegationToggle.confirmTitle': 'Increase agent autonomy?',
  'delegationToggle.confirmMessage': 'Agents will be able to {{action}} without your approval. You can review and undo any action from the session history.',
  'delegationToggle.confirmUndo': 'You can review and undo any action from the session history.',
  'delegationToggle.confirmAction.semiAutonomous': 'handle routine tasks',
  'delegationToggle.confirmAction.autonomous': 'act as full participants',
  'delegationToggle.confirm': 'Confirm',
  'delegationToggle.cancel': 'Cancel',

  // Activity pulse
  'activityPulse.artifact': '{{name}} submitted an artifact',
  'activityPulse.resolution': '{{name}} resolved a conflict',
  'activityPulse.assignment': '{{name}} assigned ownership',

  // Milestone celebrations
  'milestone.firstArtifact': 'First perspective submitted! Waiting for others...',
  'milestone.allSubmitted': "Everyone's in! Ready to explore overlaps.",
  'milestone.allResolved': 'All conflicts resolved! Ready for contracts.',
  'milestone.integrationGo': 'All systems go. Ship it!',
  'milestone.dismiss': 'Dismiss',

  // Exploration Guide
  'explorationGuide.title': 'Exploration Guide',
  'explorationGuide.completeness': 'Completeness',
  'explorationGuide.completenessScore': '{{score}}% complete',
  'explorationGuide.gaps': '{{count}} gaps found',
  'explorationGuide.noGaps': 'Looking good! No gaps detected.',
  'explorationGuide.prompts': 'Heuristic Prompts',
  'explorationGuide.promptDismiss': 'Next prompt',
  'explorationGuide.addEvent': 'Add event',
  'explorationGuide.addAssumption': 'Add assumption',
  'explorationGuide.patterns': 'Related Patterns',
  'explorationGuide.patternAdd': 'Add',
  'explorationGuide.patternDismiss': 'Skip',
  'explorationGuide.noPatterns': 'No pattern suggestions for current events.',
  'explorationGuide.empty.title': 'Start exploring',
  'explorationGuide.empty.description': 'Submit your first domain events to start exploring. The guide will help you find gaps, suggest missing events, and recommend patterns.',
  'explorationGuide.empty.completeness': 'Track how complete your model is',
  'explorationGuide.empty.prompts': 'Get questions that reveal missing events',
  'explorationGuide.empty.patterns': 'Discover common domain patterns',
  'explorationGuide.compareReady.title': 'Compare Ready',
  'explorationGuide.compareReady.description': '{{count}} overlapping events found across participants',
  'explorationGuide.compareReady.detail': 'Comparison reveals where participants agree, conflict, or cover different ground.',
  'explorationGuide.compareReady.viewButton': 'View Comparison',

  // Flow diagram hints
  'flowHints.suggested': 'Suggested: {{name}}',
  'flowHints.accept': 'Add this event',

  // ---------------------------------------------------------------------------
  // settings-dialog
  // ---------------------------------------------------------------------------
  'settingsDialog.title': 'Settings',
  'settingsDialog.session': 'Session',
  'settingsDialog.artifacts': 'Artifacts',
  'settingsDialog.comparison': 'Comparison',
  'settingsDialog.contracts': 'Contracts',
  'settingsDialog.notifications': 'Notifications',
  'settingsDialog.delegation': 'Delegation',
  'settingsDialog.shortcuts': 'Shortcuts',
  'settingsDialog.sessionName': 'Session name',
  'settingsDialog.participantLimit': 'Participant limit',
  'settingsDialog.workflowTemplate': 'Workflow template',
  'settingsDialog.validationStrictness': 'Validation strictness',
  'settingsDialog.autoValidate': 'Auto-validate on submit',
  'settingsDialog.comparisonSensitivity': 'Comparison sensitivity',
  'settingsDialog.autoSuggestResolutions': 'Auto-suggest resolutions',
  'settingsDialog.contractStrictness': 'Contract strictness',
  'settingsDialog.driftNotifications': 'Drift notifications',
  'settingsDialog.complianceCheckFrequency': 'Compliance check frequency',
  'settingsDialog.showArtifactToasts': 'Artifact notifications',
  'settingsDialog.showResolutionToasts': 'Resolution notifications',
  'settingsDialog.showPresenceToasts': 'Presence notifications',
  'settingsDialog.showMilestoneToasts': 'Milestone celebrations',
  'settingsDialog.defaultDelegationLevel': 'Default delegation level',
  'settingsDialog.resetShortcut': 'Reset',
  'settingsDialog.resetAllShortcuts': 'Reset All to Defaults',
  'settingsDialog.shortcutAction': 'Action',
  'settingsDialog.shortcutBinding': 'Binding',

  // ---------------------------------------------------------------------------
  // participant-presence
  // ---------------------------------------------------------------------------
  'presence.viewing': '{{name}} is viewing {{view}}',
  'presence.viewingMultiple': '{{names}} are viewing',

  // ---------------------------------------------------------------------------
  // glossary — plain-language definitions for DDD / boundary negotiation terms
  // ---------------------------------------------------------------------------
  'glossary.aggregate': 'A cluster of related things that change together. Think of it as a "unit of work" — like an Order with its line items.',
  'glossary.domain-event': 'Something important that happened in your system. Written in past tense, like "OrderPlaced" or "PaymentReceived".',
  'glossary.bounded-context': "A team's area of responsibility. Each context has its own vocabulary — \"Account\" means different things to Sales vs. Billing.",
  'glossary.command': 'An action someone or something requests. Like "Place Order" or "Cancel Subscription". Commands can succeed or fail.',
  'glossary.policy': 'An automatic reaction to an event. "When payment fails, notify the customer." Policies connect events to commands.',
  'glossary.read-model': 'A view built from events to answer a specific question. Like a dashboard showing "Orders this month".',
  'glossary.assumption': "Something you believe is true but haven't proven. Surfacing assumptions early prevents expensive surprises later.",
  'glossary.overlap': 'When two people describe the same event differently. Overlaps are opportunities for alignment, not errors.',
  'glossary.conflict': 'A disagreement about how something should work. Conflicts are valuable — they reveal hidden complexity.',
  'glossary.contract': "A formal agreement about an event's shape and meaning. Contracts prevent miscommunication between teams.",
};

/**
 * Look up a message by key, interpolating any {{param}} placeholders.
 * Returns the key itself if no message is found (graceful fallback).
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = messages[key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{{${name}}}`
  );
}
