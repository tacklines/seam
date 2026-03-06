#!/usr/bin/env python3
"""Batch-translate i18n strings via ollama translategemma:27b."""

import json
import os
import re
import sys
import urllib.request

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://192.168.1.14:11434") + "/api/chat"
MODEL = "translategemma:27b"

# English source strings (key -> value) — extracted from frontend/src/lib/i18n.ts messagesEn
EN_STRINGS: dict[str, str] = {
    # app-shell
    "app.brand": "Seam",
    "app.auth.loading": "Authenticating...",
    "app.login.title": "Seam",
    "app.login.description": "Collaborative sessions where humans and AI agents work together.",
    "app.login.signIn": "Sign in",
    "app.sidebar.toggleLabel": "Toggle sidebar",
    "app.sidebar.session": "Session",
    "app.sidebar.agentCode": "Agent Code",
    "app.sidebar.agentCodeHint": "Share with your AI agents",
    "app.sidebar.participants": "Participants",
    "app.sidebar.youTag": "you",
    "app.sidebar.backToProject": "Back to Project",
    "app.header.orgPersonal": "Personal",
    "app.header.settings": "Settings",
    "app.header.signOut": "Sign out",
    "app.header.unreadMentions": "You have {{count}} unread mention(s)",
    "app.tooltip.clickToCopy": "Click to copy",

    # presence-bar
    "presence.participants": "Session participants",
    "presence.online": "Online",
    "presence.offline": "Offline",
    "presence.you": "(you)",
    "presence.aiAgent": "AI Agent",
    "presence.participant": "Participant",
    "presence.agentOf": "Agent of {{name}}",
    "presence.clickToOpenConsole": "Click to open console",
    "presence.removeFromSession": "Remove from session",
    "presence.moreParticipants": "{{count}} more participants",

    # activity-feed
    "activity.label": "Activity",
    "activity.empty": "No activity yet",
    "activity.showAll": "Show all activity",

    # question-panel
    "questions.label": "Questions",
    "questions.tab.pending": "Pending",
    "questions.tab.all": "All",
    "questions.empty": "No {{filter}} questions",
    "questions.answerPlaceholder": "Type your answer...",
    "questions.answerButton": "Answer",
    "questions.cancelButton": "Cancel",
    "questions.dismissButton": "Dismiss",
    "questions.answeredBy": "Answered by {{name}}",

    # notes-panel
    "notes.label": "Notes",
    "notes.save": "Save",
    "notes.cancel": "Cancel",
    "notes.empty": "No notes yet. Click + to create one.",
    "notes.lastEditedBy": "Last edited by {{name}}",

    # session-lobby
    "lobby.title": "Start Collaborating",
    "lobby.subtitle": "Create a session and invite humans and AI agents to work together in real time.",
    "lobby.newSession": "New Session",
    "lobby.newSessionDesc": "Create a session and get a join code to share.",
    "lobby.joinSession": "Join Session",
    "lobby.joinSessionDesc": "Enter a code to join an existing session.",
    "lobby.back": "Back",
    "lobby.createTitle": "New Session",
    "lobby.sessionNameLabel": "Session Name",
    "lobby.sessionNamePlaceholder": "e.g. Sprint Planning, Bug Triage",
    "lobby.createButton": "Create Session",
    "lobby.joinTitle": "Join Session",
    "lobby.joinCodeLabel": "Join Code",
    "lobby.joinCodePlaceholder": "e.g. ABC123",
    "lobby.joinButton": "Join",
    "lobby.errorJoinCode": "Please enter a join code",
    "lobby.errorCreate": "Failed to create session",
    "lobby.errorJoin": "Failed to join session",
    "lobby.errorRejoin": "Failed to rejoin session",

    # activity-view
    "activityView.title": "Session Activity",
    "activityView.filterAllTypes": "All Event Types",
    "activityView.filterAllParticipants": "All Participants",
    "activityView.refresh": "Refresh",
    "activityView.empty": "No activity yet",
    "activityView.emptyFiltered": "No matching activity",
    "activityView.event.taskCreated": "Task Created",
    "activityView.event.taskUpdated": "Task Updated",
    "activityView.event.taskClosed": "Task Closed",
    "activityView.event.taskDeleted": "Task Deleted",
    "activityView.event.comment": "Comment",
    "activityView.event.joined": "Joined",
    "activityView.event.sessionCreated": "Session Created",

    # agent-console
    "agentConsole.online": "Online",
    "agentConsole.offline": "Offline",
    "agentConsole.agentOf": "Agent of {{name}}",
    "agentConsole.closeEsc": "Close (Esc)",
    "agentConsole.tab.messages": "Messages",
    "agentConsole.tab.activity": "Activity",
    "agentConsole.tab.workspace": "Workspace",
    "agentConsole.messages.empty": "No messages yet",
    "agentConsole.messages.emptyHint": "Send a message to direct this agent.",
    "agentConsole.messages.placeholder": "Message {{name}}...",
    "agentConsole.activity.empty": "No activity yet",
    "agentConsole.activity.emptyHint": "Activity will appear here as the agent works.",
    "agentConsole.workspace.empty": "No workspace info available",
    "agentConsole.workspace.emptyHint": "Workspace details appear here when the agent has an active Coder workspace.",
    "agentConsole.workspace.status": "Status",
    "agentConsole.workspace.branch": "Branch",
    "agentConsole.workspace.error": "Error",
    "agentConsole.workspace.started": "Started",
    "agentConsole.workspace.label": "Workspace",
    "agentConsole.workspace.noWorkspace": "No workspace provisioned",
    "agentConsole.workspace.currentTask": "Current Task",
    "agentConsole.workspace.agentInfo": "Agent Info",
    "agentConsole.workspace.model": "Model: {{model}}",

    # time expressions
    "time.justNow": "just now",
    "time.minutesAgo": "{{count}}m ago",
    "time.hoursAgo": "{{count}}h ago",
    "time.daysAgo": "{{count}}d ago",

    # project-list
    "projectList.title": "Projects",
    "projectList.subtitle": "Select a project to view tasks and sessions",
    "projectList.newProject": "New Project",
    "projectList.dialogLabel": "New Project",
    "projectList.nameLabel": "Project Name",
    "projectList.namePlaceholder": "e.g. My App",
    "projectList.prefixLabel": "Ticket Prefix",
    "projectList.prefixPlaceholder": "TASK",
    "projectList.prefixHelp": "Prefix for ticket IDs (e.g. TASK-1)",
    "projectList.repoLabel": "Repository URL",
    "projectList.repoPlaceholder": "https://github.com/org/repo",
    "projectList.repoHelp": "Optional \u2014 link to the project's git repository",
    "projectList.create": "Create",
    "projectList.errorLoad": "Failed to load projects",
    "projectList.errorCreate": "Failed to create project",
    "projectList.created": "Created {{date}}",

    # project-workspace
    "workspace.backToProjects": "Projects",
    "workspace.tab.overview": "Overview",
    "workspace.tab.tasks": "Tasks",
    "workspace.tab.plans": "Plans",
    "workspace.tab.agents": "Agents",
    "workspace.tab.graph": "Graph",
    "workspace.tab.automations": "Automations",
    "workspace.tab.settings": "Settings",
    "workspace.tab.requirements": "Requirements",
    "workspace.sessions": "Sessions",
    "workspace.newSession": "New Session",
    "workspace.untitledSession": "Untitled session",
    "workspace.online": "{{count}} online",
    "workspace.participants": "{{count}} participant{{suffix}}",
    "workspace.workspaces": "Workspaces",
    "workspace.started": "Started {{time}}",
    "workspace.settings.title": "Project Settings",
    "workspace.settings.nameLabel": "Project Name",
    "workspace.settings.prefixLabel": "Ticket Prefix",
    "workspace.settings.repoLabel": "Repository URL",
    "workspace.settings.repoPlaceholder": "https://github.com/org/repo",
    "workspace.settings.branchLabel": "Default Branch",
    "workspace.settings.branchPlaceholder": "main",
    "workspace.settings.save": "Save Changes",
    "workspace.settings.saved": "Settings saved.",
    "workspace.settings.errorSave": "Failed to save settings",
    "workspace.coder.title": "Coder Integration",
    "workspace.coder.loading": "Loading integration status...",
    "workspace.coder.connected": "Connected",
    "workspace.coder.enabledNotConnected": "Enabled but not connected",
    "workspace.coder.disabled": "Disabled",
    "workspace.coder.status": "Status",
    "workspace.coder.url": "URL",
    "workspace.coder.user": "User",
    "workspace.coder.error": "Error",
    "workspace.coder.templates": "Templates",
    "workspace.coder.loadError": "Could not load Coder integration status.",
    "workspace.errorLoad": "Failed to load project",
    "workspace.errorCreateSession": "Failed to create session",
    "workspace.errorJoinSession": "Failed to join session",
    "workspace.newSession.nameLabel": "Session Name",
    "workspace.newSession.namePlaceholder": "e.g. Sprint Planning",
    "workspace.newSession.nameHelp": "Optional \u2014 give it a name to help others find it",
    "workspace.newSession.create": "Create Session",
    "workspace.notFound": "Project not found",

    # org-dashboard
    "orgDashboard.fallbackName": "Organization",
    "orgDashboard.personalWorkspace": "Your personal workspace",
    "orgDashboard.members": "{{count}} member{{suffix}}",
    "orgDashboard.settings": "Settings",
    "orgDashboard.newProject": "New Project",
    "orgDashboard.dialogLabel": "New Project",
    "orgDashboard.nameLabel": "Project Name",
    "orgDashboard.namePlaceholder": "e.g. My App",
    "orgDashboard.prefixLabel": "Ticket Prefix",
    "orgDashboard.prefixPlaceholder": "TASK",
    "orgDashboard.prefixHelp": "Prefix for ticket IDs (e.g. TASK-1)",
    "orgDashboard.repoLabel": "Repository URL",
    "orgDashboard.repoPlaceholder": "https://github.com/org/repo",
    "orgDashboard.repoHelp": "Optional",
    "orgDashboard.create": "Create",
    "orgDashboard.errorLoad": "Failed to load",
    "orgDashboard.errorCreate": "Failed to create project",
    "orgDashboard.created": "Created {{date}}",

    # org-settings
    "orgSettings.title": "{{name}} Settings",
    "orgSettings.tab.members": "Members",
    "orgSettings.tab.credentials": "Credentials",
    "orgSettings.role.admin": "Admin",
    "orgSettings.role.member": "Member",
    "orgSettings.invitePlaceholder": "Username",
    "orgSettings.invite": "Invite",
    "orgSettings.removeMember": "Remove member",
    "orgSettings.errorInvite": "Failed to invite",
    "orgSettings.errorUpdateRole": "Failed to update role",
    "orgSettings.errorRemoveMember": "Failed to remove member",
    "orgSettings.errorLoad": "Failed to load",

    # credentials
    "cred.type.claudeOauth": "Claude OAuth Token",
    "cred.type.anthropicApiKey": "Anthropic API Key",
    "cred.type.openaiApiKey": "OpenAI API Key",
    "cred.type.googleApiKey": "Google API Key",
    "cred.type.gitToken": "Git Token",
    "cred.type.custom": "Custom",
    "cred.emptyTitle": "No credentials stored yet.",
    "cred.emptyHint": "Add API keys or tokens that will be injected into agent workspaces.",
    "cred.addButton": "Add Credential",
    "cred.addDialog": "Add Credential",
    "cred.nameLabel": "Name",
    "cred.namePlaceholder": "e.g. Claude Max Token",
    "cred.typeLabel": "Type",
    "cred.envVarLabel": "Environment Variable Name",
    "cred.envVarPlaceholder": "MY_SECRET_KEY",
    "cred.injectedAs": "Will be injected as",
    "cred.valueLabel": "Value",
    "cred.valuePlaceholder": "Paste your key or token",
    "cred.save": "Save",
    "cred.rotateDialog": "Rotate Credential",
    "cred.rotateNewValue": "New Value",
    "cred.rotatePlaceholder": "Paste the new key or token",
    "cred.rotate": "Rotate",
    "cred.rotateTooltip": "Rotate value",
    "cred.deleteTooltip": "Delete",
    "cred.added": "Added {{date}}",
    "cred.rotated": "Rotated {{date}}",
    "cred.expires": "Expires {{date}}",
    "cred.never": "Never",
    "cred.errorAdd": "Failed to add credential",
    "cred.errorRotate": "Failed to rotate",
    "cred.errorDelete": "Failed to delete",

    # user-settings
    "userSettings.title": "Personal Settings",
    "userSettings.credTitle": "Personal Credentials",
    "userSettings.credDesc": "Personal tokens like Claude Max/Pro OAuth are tied to your subscription and apply only to agents you launch. They override org-level credentials of the same type.",
    "userSettings.emptyTitle": "No personal credentials stored yet.",
    "userSettings.emptyHint": "Add your Claude Max OAuth token or other personal API keys.",
    "userSettings.addDialog": "Add Personal Credential",
    "userSettings.namePlaceholder": "e.g. My Claude Max Token",
    "userSettings.errorLoad": "Failed to load",

    # requirement-list
    "requirementList.empty": "No requirements yet.",
    "requirementList.newRequirement": "New Requirement",
    "requirementList.dialogLabel": "New Requirement",
    "requirementList.titleLabel": "Title",
    "requirementList.titlePlaceholder": "e.g. Real-time cursor presence",
    "requirementList.priorityLabel": "Priority",
    "requirementList.create": "Create Requirement",
    "requirementList.errorLoad": "Failed to load requirements",
    "requirementList.errorCreate": "Failed to create requirement",
    "requirementList.updated": "Updated {{time}}",
    "requirementList.status.draft": "Draft",
    "requirementList.status.active": "Active",
    "requirementList.status.satisfied": "Satisfied",
    "requirementList.status.archived": "Archived",
    "requirementList.priority.critical": "Critical",
    "requirementList.priority.high": "High",
    "requirementList.priority.medium": "Medium",
    "requirementList.priority.low": "Low",
    "requirementList.tasks": "{{count}} task{{suffix}}",
    "requirementList.children": "{{count}} sub",

    # requirement-detail
    "requirementDetail.notFound": "Requirement not found",
    "requirementDetail.back": "Back to requirements",
    "requirementDetail.edit": "Edit",
    "requirementDetail.cancel": "Cancel",
    "requirementDetail.save": "Save",
    "requirementDetail.descPlaceholder": "Add a description...",
    "requirementDetail.emptyDesc": "No description.",
    "requirementDetail.children": "Sub-requirements",
    "requirementDetail.noChildren": "No sub-requirements.",
    "requirementDetail.linkedTasks": "Linked Tasks",
    "requirementDetail.noTasks": "No linked tasks.",
    "requirementDetail.status": "Status",
    "requirementDetail.priority": "Priority",
    "requirementDetail.created": "Created {{time}}",
    "requirementDetail.updated": "Updated {{time}}",
    "requirementDetail.errorLoad": "Failed to load requirement",
    "requirementDetail.errorSave": "Failed to save",
    "requirementDetail.errorStatus": "Failed to update status",
    "requirementDetail.transition.activate": "Activate",
    "requirementDetail.transition.satisfy": "Mark Satisfied",
    "requirementDetail.transition.archive": "Archive",
    "requirementDetail.transition.reopen": "Reopen",
    "requirementDetail.addChild": "Add Sub-requirement",

    # plan-list
    "planList.empty": "No plans yet.",
    "planList.newPlan": "New Plan",
    "planList.dialogLabel": "New Plan",
    "planList.titleLabel": "Title",
    "planList.titlePlaceholder": "e.g. Auth migration to passkeys",
    "planList.create": "Create Plan",
    "planList.errorLoad": "Failed to load plans",
    "planList.errorCreate": "Failed to create plan",
    "planList.updated": "Updated {{time}}",
    "planList.status.draft": "Draft",
    "planList.status.review": "Review",
    "planList.status.accepted": "Accepted",
    "planList.status.superseded": "Superseded",
    "planList.status.abandoned": "Abandoned",

    # plan-detail
    "planDetail.notFound": "Plan not found",
    "planDetail.edit": "Edit",
    "planDetail.cancel": "Cancel",
    "planDetail.save": "Save",
    "planDetail.placeholder": "Write your plan in Markdown...",
    "planDetail.emptyBody": "No content yet.",
    "planDetail.emptyBodyEditable": "No content yet. Click Edit to start writing.",
    "planDetail.updated": "Updated {{time}}",
    "planDetail.created": "Created {{time}}",
    "planDetail.errorLoad": "Failed to load plan",
    "planDetail.errorSave": "Failed to save",
    "planDetail.errorStatus": "Failed to update status",
    "planDetail.transition.submitForReview": "Submit for Review",
    "planDetail.transition.accept": "Accept",
    "planDetail.transition.returnToDraft": "Return to Draft",
    "planDetail.transition.abandon": "Abandon",
    "planDetail.transition.supersede": "Supersede",

    # agent-list
    "agentList.online": "Online",
    "agentList.total": "Total",
    "agentList.active": "Active",
    "agentList.hideDisconnected": "Hide disconnected",
    "agentList.showAll": "Show all",
    "agentList.empty": "No agents have joined this project yet.",
    "agentList.emptyHint": "Launch agents from a session to see them here.",
    "agentList.workingOn": "Working on",
    "agentList.errorLoad": "Failed to load agents",

    # agent-detail
    "agentDetail.back": "Back to agents",
    "agentDetail.online": "Online",
    "agentDetail.offline": "Offline",
    "agentDetail.model": "Model",
    "agentDetail.client": "Client",
    "agentDetail.session": "Session",
    "agentDetail.sponsoredBy": "Sponsored by",
    "agentDetail.joined": "Joined",
    "agentDetail.disconnected": "Disconnected",
    "agentDetail.currentTask": "Current Task",
    "agentDetail.workspace": "Workspace",
    "agentDetail.workspaceFallback": "Workspace",
    "agentDetail.started": "Started {{time}}",
    "agentDetail.liveActivity": "Live Activity",
    "agentDetail.recentActivity": "Recent Activity",
    "agentDetail.noActivity": "No activity recorded yet.",
    "agentDetail.recentComments": "Recent Comments",
    "agentDetail.noComments": "No comments yet.",
    "agentDetail.errorLoad": "Failed to load agent",

    # agent-activity-panel
    "agentActivity.tab.all": "All",
    "agentActivity.tab.tools": "Tools",
    "agentActivity.tab.output": "Output",
    "agentActivity.live": "Live",
    "agentActivity.emptyAll": "Waiting for agent activity...",
    "agentActivity.emptyTools": "No tool invocations yet.",
    "agentActivity.emptyOutput": "No output captured yet.",
    "agentActivity.kind.tool": "tool",
    "agentActivity.kind.state": "state",
    "agentActivity.errorBadge": "err",
    "agentActivity.errorBadgeFull": "error",

    # task-board
    "taskBoard.title": "Tasks",
    "taskBoard.listView": "List view",
    "taskBoard.boardView": "Board view",
    "taskBoard.refresh": "Refresh",
    "taskBoard.planSprint": "Plan Sprint",
    "taskBoard.launchAgent": "Launch Agent",
    "taskBoard.newTask": "New Task",
    "taskBoard.searchPlaceholder": "Search tasks...",
    "taskBoard.filterAllTypes": "All Types",
    "taskBoard.filterAllStatuses": "All Statuses",
    "taskBoard.filterAllAssignees": "All Assignees",
    "taskBoard.sortNewest": "Newest",
    "taskBoard.sortRecentlyUpdated": "Recently Updated",
    "taskBoard.sortTitleAZ": "Title A-Z",
    "taskBoard.sortType": "Type",
    "taskBoard.showCompleted": "Show {{count}} completed",
    "taskBoard.hideCompleted": "Hide completed",
    "taskBoard.stat.open": "open",
    "taskBoard.stat.inProgress": "in progress",
    "taskBoard.stat.done": "done",
    "taskBoard.stat.closed": "closed",
    "taskBoard.stat.hidden": "hidden",
    "taskBoard.empty": "No tasks yet. Create one to get started.",
    "taskBoard.createTask": "Create Task",
    "taskBoard.batch.selected": "{{count}} selected",
    "taskBoard.batch.clear": "Clear",
    "taskBoard.batch.start": "Start",
    "taskBoard.batch.done": "Done",
    "taskBoard.batch.close": "Close",
    "taskBoard.batch.reopen": "Reopen",
    "taskBoard.batch.delete": "Delete",
    "taskBoard.action.startWork": "Start Work",
    "taskBoard.action.markDone": "Mark Done",
    "taskBoard.action.close": "Close",
    "taskBoard.action.reopen": "Reopen",
    "taskBoard.action.addChild": "Add Child Task",
    "taskBoard.action.delete": "Delete",
    "taskBoard.action.actions": "Actions",
    "taskBoard.kanban.noTasks": "No tasks",
    "taskBoard.kanban.addTask": "Add task",
    "taskBoard.sprint.title": "In sprint",
    "taskBoard.sprint.selectSession": "Select a sprint session...",
    "taskBoard.sprint.newName": "New sprint name...",
    "taskBoard.sprint.createSprint": "Create Sprint",
    "taskBoard.sprint.startSprint": "Start Sprint",
    "taskBoard.sprint.selectFirst": "Select or create a sprint session first",
    "taskBoard.sprint.dragHint": "Drag tasks here to plan your sprint",
    "taskBoard.sprint.taskCount": "{{count}} task{{suffix}}",
    "taskBoard.sprint.errorAdd": "Failed to add task to sprint",
    "taskBoard.sprint.errorRemove": "Failed to remove task from sprint",
    "taskBoard.create.title": "New Task",
    "taskBoard.create.typeLabel": "Type",
    "taskBoard.create.titleLabel": "Title",
    "taskBoard.create.titlePlaceholder": "What needs to be done?",
    "taskBoard.create.descLabel": "Description",
    "taskBoard.create.descPlaceholder": "Optional details (markdown supported)",
    "taskBoard.create.assigneeLabel": "Assignee",
    "taskBoard.create.unassigned": "Unassigned",
    "taskBoard.create.priorityLabel": "Priority",
    "taskBoard.create.complexityLabel": "Complexity",
    "taskBoard.create.parentLabel": "Parent",
    "taskBoard.create.parentNone": "None (top-level)",
    "taskBoard.create.submit": "Create",
    "taskBoard.agent.title": "Launch Agent",
    "taskBoard.agent.typeLabel": "Agent Type",
    "taskBoard.agent.typeCoder": "Coder",
    "taskBoard.agent.typePlanner": "Planner",
    "taskBoard.agent.typeReviewer": "Reviewer",
    "taskBoard.agent.branchLabel": "Branch",
    "taskBoard.agent.branchPlaceholder": "Auto-generated...",
    "taskBoard.agent.branchHelp": "Leave empty to auto-create...",
    "taskBoard.agent.instructionsLabel": "Instructions",
    "taskBoard.agent.instructionsPlaceholder": "Optional: what should the agent focus on?",
    "taskBoard.agent.launch": "Launch",
    "taskBoard.errorLoad": "Failed to load tasks",
    "taskBoard.errorCreate": "Failed to create task",
    "taskBoard.errorUpdate": "Failed to update task",
    "taskBoard.errorDelete": "Failed to delete task",
    "taskBoard.errorLaunch": "Failed to launch agent",
    "taskBoard.errorSprint": "Failed to create sprint session",
    "taskBoard.shortcuts.title": "Keyboard Shortcuts",
    "taskBoard.shortcuts.newTask": "New task",
    "taskBoard.shortcuts.refresh": "Refresh",
    "taskBoard.shortcuts.toggleView": "Toggle list/board",
    "taskBoard.shortcuts.search": "Search",
    "taskBoard.shortcuts.escape": "Go back / Clear selection",
    "taskBoard.shortcuts.help": "This help",
    "taskBoard.scopeAll": "All Project",
    "taskBoard.scopeSession": "Session",
    "taskBoard.scopeAllTooltip": "Show only session tasks",
    "taskBoard.scopeSessionTooltip": "Show all project tasks",
    "taskBoard.completedDone": "{{count}} done",
    "taskBoard.hideDone": "Hide done",
    "taskBoard.toast.addedToSprint": "Task added to sprint",
    "taskBoard.toast.removedFromSprint": "Task removed from sprint",
    "taskBoard.toast.sprintCreated": "Sprint session created",
    "taskBoard.toast.agentLaunched": "Agent launched on branch {{branch}}. It will appear in the session shortly.",
    "taskBoard.toast.movedTo": "Moved to {{status}}",
    "taskBoard.toast.batchMoved": "{{count}} task(s) \u2192 {{status}}",
    "taskBoard.toast.batchDeleted": "{{count}} task(s) deleted",
    "taskBoard.toast.taskDeleted": "Task deleted",
    "taskBoard.toast.taskCreated": "Task created",
    "taskBoard.error.batchUpdate": "Batch update failed",
    "taskBoard.error.batchDelete": "Batch delete failed",
    "taskBoard.sidebar.claim": "Claim",
    "taskBoard.sidebar.unclaim": "Unclaim",

    # task-detail
    "taskDetail.notFound": "Task not found",
    "taskDetail.back": "Back",
    "taskDetail.startWork": "Start Work",
    "taskDetail.markDone": "Mark Done",
    "taskDetail.close": "Close",
    "taskDetail.reopen": "Reopen",
    "taskDetail.addChild": "Add Child Task",
    "taskDetail.delete": "Delete Task",
    "taskDetail.blockedBy": "Blocked by",
    "taskDetail.description": "Description",
    "taskDetail.save": "Save",
    "taskDetail.cancel": "Cancel",
    "taskDetail.clickToAdd": "Click to add a description...",
    "taskDetail.children": "Children",
    "taskDetail.add": "Add",
    "taskDetail.noChildren": "No child tasks yet",
    "taskDetail.dependencies": "Dependencies",
    "taskDetail.addBlocker": "Add Blocker",
    "taskDetail.blockedByLabel": "BLOCKED BY",
    "taskDetail.blocksLabel": "BLOCKS",
    "taskDetail.selectBlocker": "Select blocking task...",
    "taskDetail.activity": "Activity",
    "taskDetail.commentPlaceholder": "Add a comment... (Ctrl+Enter to send)",
    "taskDetail.commentSend": "Send",
    "taskDetail.commentPlaceholderShort": "Add a comment...",
    "taskDetail.sidebar.details": "Details",
    "taskDetail.sidebar.ticket": "Ticket",
    "taskDetail.sidebar.type": "Type",
    "taskDetail.sidebar.status": "Status",
    "taskDetail.sidebar.priority": "Priority",
    "taskDetail.sidebar.complexity": "Complexity",
    "taskDetail.sidebar.assignee": "Assignee",
    "taskDetail.sidebar.unassigned": "Unassigned",
    "taskDetail.sidebar.creator": "Creator",
    "taskDetail.sidebar.created": "Created",
    "taskDetail.sidebar.updated": "Updated",
    "taskDetail.sidebar.closed": "Closed",
    "taskDetail.sidebar.commits": "Commits",
    "taskDetail.sidebar.commitPlaceholder": "Enter commit SHA and press Enter",
    "taskDetail.sidebar.addCommit": "+ Add commit",
    "taskDetail.sidebar.noCodeChange": "No code change",
    "taskDetail.sidebar.derivedFrom": "Derived from",
    "taskDetail.sidebar.sourceTask": "Source task",
    "taskDetail.errorLoad": "Failed to load task",
    "taskDetail.errorUpdate": "Failed to update",
    "taskDetail.errorDelete": "Failed to delete",
    "taskDetail.errorComment": "Failed to add comment",
    "taskDetail.errorAddDep": "Failed to add dependency",
    "taskDetail.errorRemoveDep": "Failed to remove dependency",
    "taskDetail.activityCount": "Activity ({{count}})",
    "taskDetail.childrenCount": "Children ({{count}})",

    # dependency-graph
    "graph.searchPlaceholder": "Search tasks...",
    "graph.toggle2d3d": "Toggle 2D/3D view",
    "graph.zoomToFit": "Zoom to fit (F)",
    "graph.resetView": "Reset view (R)",
    "graph.description": "Description",
    "graph.blockedBy": "Blocked by",
    "graph.blocks": "Blocks",
    "graph.legendStatus": "Status",
    "graph.legendOpen": "Open",
    "graph.legendInProgress": "In Progress",
    "graph.legendDone": "Done",
    "graph.legendClosed": "Closed",
    "graph.stats": "{{visible}}/{{total}} nodes \u00b7 {{edges}} edges",
}

# Keys that should NOT be translated (brand names, proper nouns, tech terms)
SKIP_KEYS = {
    "app.brand", "app.login.title",
}

# Preserve {{placeholders}} — keys containing these should keep them intact
PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# Target locales: (locale_code, lang_name, lang_code_bcp47)
TARGETS = [
    ("es-mx", "Mexican Spanish", "es-MX"),
    ("nl", "Dutch", "nl-NL"),
    ("pl", "Polish", "pl-PL"),
    ("he", "Hebrew", "he-IL"),
    ("hi", "Hindi", "hi-IN"),
    ("te", "Telugu", "te-IN"),
    ("ur", "Urdu", "ur-PK"),
    ("pa", "Punjabi", "pa-IN"),
    ("fr", "French", "fr-FR"),
    ("de", "German", "de-DE"),
    ("it", "Italian", "it-IT"),
    ("pt-br", "Portuguese", "pt-BR"),
    ("sv", "Swedish", "sv-SE"),
    ("uk", "Ukrainian", "uk-UA"),
    ("cs", "Czech", "cs-CZ"),
    ("tr", "Turkish", "tr-TR"),
    ("zh", "Chinese", "zh-CN"),
    ("ja", "Japanese", "ja-JP"),
    ("ko", "Korean", "ko-KR"),
    ("th", "Thai", "th-TH"),
    ("vi", "Vietnamese", "vi-VN"),
    ("id", "Indonesian", "id-ID"),
    ("bn", "Bengali", "bn-BD"),
    ("ta", "Tamil", "ta-IN"),
    ("ar", "Arabic", "ar-SA"),
    ("fa", "Persian", "fa-IR"),
    ("sw", "Swahili", "sw-KE"),
    ("am", "Amharic", "am-ET"),
]


def translate(text: str, target_lang: str, target_code: str) -> str:
    prompt = (
        f'<translate source_lang="English" source_lang_code="en-US" '
        f'target_lang="{target_lang}" target_lang_code="{target_code}">'
        f"{text}</translate>"
    )
    payload = json.dumps({
        "model": MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
    return result["message"]["content"].strip()


def restore_placeholders(original: str, translated: str) -> str:
    """Ensure {{placeholders}} from original appear in translated output."""
    orig_placeholders = PLACEHOLDER_RE.findall(original)
    if not orig_placeholders:
        return translated
    for ph in orig_placeholders:
        pattern = "{{" + ph + "}}"
        if pattern not in translated:
            # Try common mangling: spaces, missing braces, translated placeholder name
            # Best effort: append if completely missing
            translated = translated.rstrip(".!") + " " + pattern
    return translated


def make_export_name(locale: str) -> str:
    if "-" in locale:
        parts = locale.split("-")
        return "messages" + parts[0].title() + parts[1].title()
    return "messages" + locale.title()


def generate_locale_file(locale: str, lang_name: str, lang_code: str) -> str:
    export_name = make_export_name(locale)
    translations: dict[str, str] = {}
    total = len(EN_STRINGS)

    for i, (key, en_val) in enumerate(EN_STRINGS.items(), 1):
        if key in SKIP_KEYS:
            translations[key] = en_val
            continue
        print(f"  [{i}/{total}] {key}", end="... ", flush=True)
        translated = translate(en_val, lang_name, lang_code)
        translated = restore_placeholders(en_val, translated)
        print(translated[:60])
        translations[key] = translated

    lines = [f"export const {export_name}: Record<string, string> = {{"]
    for key, val in translations.items():
        escaped = val.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"  '{key}': '{escaped}',")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main():
    targets = TARGETS
    if len(sys.argv) > 1:
        requested = set(sys.argv[1:])
        targets = [t for t in TARGETS if t[0] in requested]

    for locale, lang_name, lang_code in targets:
        print(f"\n=== Translating: {lang_name} ({locale}) ===")
        content = generate_locale_file(locale, lang_name, lang_code)
        path = f"src/lib/i18n.{locale}.ts"
        with open(path, "w") as f:
            f.write(content)
        print(f"  -> Wrote {path}")


if __name__ == "__main__":
    main()
