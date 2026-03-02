/**
 * Lightweight i18n module for multi-human workflows visualizer.
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
  'shell.title': 'Storm-Prep',
  'shell.addFiles': 'Add files',
  'shell.expandSidebar': 'Expand sidebar',
  'shell.collapseSidebar': 'Collapse sidebar',
  'shell.tab.events': 'Events',
  'shell.tab.flow': 'Flow',
  'shell.tab.conflicts': 'Conflicts',

  // ---------------------------------------------------------------------------
  // file-drop-zone
  // ---------------------------------------------------------------------------
  'dropZone.ariaLabel': 'Drop storm-prep YAML files here, or press Enter or Space to browse for files',
  'dropZone.ctaActive': 'Release to upload files',
  'dropZone.ctaIdle': 'Drop storm-prep YAML files here',
  'dropZone.ctaSecondary': 'or click to browse',
  'dropZone.fileInputAriaLabel': 'Choose storm-prep YAML files to upload',
  'dropZone.heroTitle': 'Storm-Prep Visualizer',
  'dropZone.heroSubtitle': 'Visualize and compare domain event candidates across roles',
  'dropZone.hint': 'Supports multiple files for cross-role comparison',

  // ---------------------------------------------------------------------------
  // card-view (artifact)
  // ---------------------------------------------------------------------------
  'cardView.empty': 'Load a storm-prep YAML file to view events',
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
  'comparisonView.empty': 'Load two or more storm-prep YAML files to compare roles',
  'comparisonView.conflicts': 'Conflicts',
  'comparisonView.sharedEvents': 'Shared Events',
  'comparisonView.sharedAggregates': 'Shared Aggregates',
  'comparisonView.noneFound': 'None found',
  'comparisonView.rolePanels': 'Role Panels',
  'comparisonView.nEvents': '{{count}} events',
  'comparisonView.nAssumptions': '{{count}} assumptions',

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
  'lobby.heroTitle': 'Storm-Prep Visualizer',
  'lobby.heroSubtitle': 'Collaborate with your team on Event Storming preparation. Each participant submits their storm-prep file, then explore the combined domain event flow together.',
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

  // ---------------------------------------------------------------------------
  // app-shell clipboard paste
  // ---------------------------------------------------------------------------
  'shell.pasteSuccess': 'Pasted YAML loaded — {{count}} events from {{role}}',
  'shell.pasteSuccessAriaLabel': 'YAML pasted from clipboard and loaded successfully',

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

  // ---------------------------------------------------------------------------
  // ownership-grid
  // ---------------------------------------------------------------------------
  'ownershipGrid.empty': 'No aggregates or roles to display.',
  'ownershipGrid.emptyHint': 'Load storm-prep files to see the ownership grid.',
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
  'comparisonDiff.empty': 'Load two or more storm-prep YAML files to use the diff view',
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
  'priorityView.emptyHint': 'Load storm-prep YAML files to populate events.',
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
  // global-settings
  // ---------------------------------------------------------------------------
  'globalSettings.title': 'Settings',
  'globalSettings.modifiedAriaLabel': 'This section has modified settings',
  'globalSettings.tab.session': 'Session',
  'globalSettings.tab.artifacts': 'Artifacts',
  'globalSettings.tab.comparison': 'Comparison',
  'globalSettings.tab.contracts': 'Contracts',
  'globalSettings.tab.notifications': 'Notifications',
  'globalSettings.tab.delegation': 'Delegation',
  'globalSettings.tab.shortcuts': 'Shortcuts',
  // Session tab
  'globalSettings.session.name': 'Session Name',
  'globalSettings.session.nameDescription': 'A friendly name shown in the session lobby.',
  'globalSettings.session.participantLimit': 'Participant Limit',
  'globalSettings.session.participantLimitDescription': 'Maximum number of participants allowed to join.',
  // Artifacts tab
  'globalSettings.artifacts.autoValidate': 'Auto-validate on Submit',
  'globalSettings.artifacts.autoValidateDescription': 'Automatically validate YAML files when submitted.',
  'globalSettings.artifacts.validationStrictness': 'Validation Strictness',
  'globalSettings.artifacts.validationStrictnessDescription': 'How strictly uploaded artifacts are validated against the schema.',
  'globalSettings.artifacts.strictnessStrict': 'Strict — block on any error',
  'globalSettings.artifacts.strictnessWarn': 'Warn — show warnings, allow through',
  'globalSettings.artifacts.strictnessRelaxed': 'Relaxed — log only',
  // Comparison tab
  'globalSettings.comparison.sensitivity': 'Comparison Sensitivity',
  'globalSettings.comparison.sensitivityDescription': 'How strictly event names and field names are compared.',
  'globalSettings.comparison.sensitivitySemantic': 'Semantic — treat camelCase and snake_case as equal',
  'globalSettings.comparison.sensitivityExact': 'Exact — require byte-for-byte equality',
  'globalSettings.comparison.autoDetectConflicts': 'Auto-detect Conflicts',
  'globalSettings.comparison.autoDetectConflictsDescription': 'Detect overlaps and conflicts automatically as artifacts arrive.',
  'globalSettings.comparison.suggestResolutions': 'Suggest Resolutions',
  'globalSettings.comparison.suggestResolutionsDescription': 'Generate resolution suggestions for detected conflicts.',
  // Contracts tab
  'globalSettings.contracts.strictness': 'Contract Strictness',
  'globalSettings.contracts.strictnessDescription': 'How non-compliant artifacts are handled.',
  'globalSettings.contracts.strictnessStrict': 'Strict — block submission',
  'globalSettings.contracts.strictnessWarn': 'Warn — surface warnings',
  'globalSettings.contracts.strictnessRelaxed': 'Relaxed — log only',
  'globalSettings.contracts.driftNotifications': 'Drift Notifications',
  'globalSettings.contracts.driftNotificationsDescription': 'When and how participants are notified of contract drift.',
  'globalSettings.contracts.driftImmediate': 'Immediate — toast on every drift event',
  'globalSettings.contracts.driftBatched': 'Batched — digest at end of session',
  'globalSettings.contracts.driftSilent': 'Silent — visible in Contract tab only',
  // Notifications tab
  'globalSettings.notifications.toastDuration': 'Toast Duration (ms)',
  'globalSettings.notifications.toastDurationDescription': 'How long toast notifications remain visible before auto-dismissing.',
  // Delegation tab
  'globalSettings.delegation.level': 'Autonomy Level',
  'globalSettings.delegation.levelDescription': 'How much autonomy agents have when proposing actions.',
  'globalSettings.delegation.levelAssisted': 'Assisted — agent proposes, human approves',
  'globalSettings.delegation.levelSemiAutonomous': 'Semi-autonomous — agent acts, human can undo',
  'globalSettings.delegation.levelAutonomous': 'Autonomous — agent acts without approval',
  'globalSettings.delegation.approvalExpiry': 'Approval Request Expiry (seconds)',
  'globalSettings.delegation.approvalExpiryDescription': 'How long a pending approval request remains active before it expires.',
  // Shortcuts tab
  'globalSettings.shortcuts.tableAriaLabel': 'Keyboard shortcuts reference',
  'globalSettings.shortcuts.keyColumn': 'Key',
  'globalSettings.shortcuts.actionColumn': 'Action',
  'globalSettings.shortcuts.openHelp': 'Open keyboard shortcuts',
  'globalSettings.shortcuts.closeDialog': 'Close dialog or drawer',
  'globalSettings.shortcuts.focusSearch': 'Focus search',
  'globalSettings.shortcuts.nextControl': 'Move to next control',
  'globalSettings.shortcuts.prevControl': 'Move to previous control',
  'globalSettings.shortcuts.activate': 'Activate focused element',
  'globalSettings.shortcuts.navigateTabs': 'Navigate between tabs',

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
  'helpTip.file-drop': 'Drop your storm-prep YAML file here to load your domain events. You can load multiple files to compare roles.',

  // ---------------------------------------------------------------------------
  // onboarding-overlay
  // ---------------------------------------------------------------------------
  'onboardingOverlay.title': 'Welcome to Event Storming Visualizer',
  'onboardingOverlay.description': 'This tool helps teams discover and align on domain events. Upload your event files, explore the flow, and collaborate in real time.',
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
