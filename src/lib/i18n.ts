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
  // activity-pulse
  // ---------------------------------------------------------------------------
  'activityPulse.artifact': '{{name}} submitted an artifact',
  'activityPulse.resolution': '{{name}} resolved a conflict',
  'activityPulse.assignment': '{{name}} assigned ownership',

  // ---------------------------------------------------------------------------
  // milestone-celebration
  // ---------------------------------------------------------------------------
  'milestone.firstArtifact': 'First perspective submitted! Waiting for others...',
  'milestone.allSubmitted': "Everyone's in! Ready to explore overlaps.",
  'milestone.allResolved': 'All conflicts resolved! Ready for contracts.',
  'milestone.integrationGo': 'All systems go. Ship it!',
  'milestone.dismiss': 'Dismiss',
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
