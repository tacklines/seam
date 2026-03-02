# Experience Design: The Collaborative Session

How seven phases of collaborative work feel like one continuous conversation — not seven separate screens.

---

## The Expanding Canvas

A session starts small. A lobby card. A join code. A name.

Then it grows. A participant joins and their avatar appears. Someone submits an artifact and a card-view materializes. A second artifact arrives and a comparison surface fades in. Conflicts surface and resolution tools appear inline. Agreements accumulate and contracts emerge.

The user never clicks "Next Phase." They never see a wizard. The canvas expands because there is content to fill it — new capabilities unlock as new artifacts arrive. The rhythm is the same as a conversation flowing from one topic to the next: the shift happens because the previous topic created something worth building on.

**The session is the container for everything.** Even solo exploration creates a local session, so you can invite collaborators later without starting over. The session is identity, state, and history — not a page or a URL, but the workspace itself.

### The Phase Ribbon

A thin horizontal strip sits below the header, always visible. Seven small circles connected by a fine line. Each circle represents a phase of collaborative work:

```
● ─── ● ─── ○ ─── ○ ─── ○ ─── ○ ─── ○
Spark   Explore  Rank   Slice   Agree   Build   Ship
```

Completed phases show a filled circle with a subtle checkmark. The current phase pulses gently. Future phases are dimmed. Clicking a circle scrolls to the relevant content area — the ribbon indicates, it doesn't control.

The ribbon maps UX phases onto the workflow engine's internal phases. The engine tracks seven statuses (`lobby`, `prep`, `compare`, `jam`, `formalize`, `integrate`, `done`) that don't correspond 1:1 with the UX phases:

| UX Phase | Engine Phase(s) | Notes |
|----------|----------------|-------|
| Spark | `lobby` → `prep` | Spark ends when the first artifact is submitted |
| Explore | `prep` | Active while a single participant has submitted |
| Rank | `prep` | Overlaps with Explore — ranking is available once enough events exist |
| Slice | `prep` → `compare` | Decomposition can begin before or after comparison |
| Agree | `compare` → `jam` | The core negotiation phase |
| Build | `formalize` | Executing against contracts |
| Ship | `integrate` → `done` | Verification and go/no-go |

The Phase Ribbon is a UX projection that infers the active phase from `WorkflowStatus` plus additional signals (artifact count, priority data, work items). It is never a gatekeeper — participants can access any content regardless of the ribbon's state.

The phase names in the ribbon are deliberately casual — "Spark" instead of "Origination," "Agree" instead of "Negotiation." The formal names exist in documentation. The ribbon speaks in verbs.

**Keyboard:** `Ctrl+Shift+1` through `Ctrl+Shift+7` jump to phase-associated content. (`Cmd+1–7` is reserved for browser tab switching on macOS.)

### Phases as Scaffolding, Not Gates

The seven phases are a UX narrative — a way to orient users in a process that could otherwise feel formless. They are **not** API constraints. The session server, MCP tools, and A2A protocol impose no phase ordering. An agent can call `record_resolution` before any artifacts are submitted. A human can start decomposing work before comparison.

The Phase Ribbon reflects what has happened, not what must happen next. This preserves the vision principle that "the platform provides primitives, not prescribed phases" (`vision.md`) while giving users a coherent sense of progress.

---

## Phase I: Spark

*"I have an idea."*

The first thing a participant contributes to a session. An event, an aggregate, a domain concept, a hunch. The Spark phase exists to lower the barrier from "I have something in my head" to "the system knows about it."

### What the user sees

> **Scope:** The Spark Canvas is a **new component**. The `file-drop-zone` (existing) and `session-lobby` (existing) continue to work as alternative entry points.

When a session has no artifacts, the main area shows the **Spark Canvas** — a minimal structured editor that doesn't require YAML knowledge.

The canvas is a vertical list of rows. Each row captures one domain event:

| What happened? | To what? | Triggered by? |
|---------------|----------|---------------|
| `OrderPlaced` | Order | User command |
| `PaymentProcessed` | Payment | `OrderPlaced` |
| `_add new event..._ ` | | |

The last row is always an empty placeholder with muted text. Pressing `Enter` in any field creates a new row below. Pressing `Tab` moves between fields. The experience is closer to a spreadsheet than a form — fast, fluid, no submit buttons until you're done.

A **Quick Start** dropdown in the canvas header offers templates: common domain patterns ("E-commerce Order Flow," "User Authentication," "Payment Processing," "Subscription Lifecycle") pre-fill the canvas with 5-8 starter events. The default is "Blank Canvas."

For power users: a toggle switch in the canvas header flips to a raw YAML editor with syntax highlighting and live schema validation. The YAML and canvas views are synchronized — edits in one appear in the other.

For agents: `submit_artifact` via MCP produces the same result. The canvas and the MCP tool both emit `ArtifactSubmitted` domain events. A human typing in the canvas and an agent calling the tool are indistinguishable to every other participant.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `submit_artifact` (existing) | Submit a complete artifact |
| `create_draft` (new) | Create a draft visible only to the author — a staging area before formal submission |
| `suggest_events` (new) | Given a natural-language domain description, return structured candidate events |

The `suggest_events` tool is the "agent helps you brainstorm" primitive. A human describes their domain in a sentence, the agent returns structured events they can review, edit, and accept. In the UI, this surfaces as an "AI Assist" button in the canvas header that opens a chat-style input: "Describe what your system does."

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Default confidence on new events | `LIKELY` | Gear icon in canvas header |
| Default direction | `internal` | Gear icon in canvas header |
| Quick Start template | Blank Canvas | Template dropdown in canvas |
| Auto-validate on keystroke | Off (validate on submit) | Gear icon in canvas header |

### Blending into Explore

When the participant clicks "Submit to session," their events materialize in the card-view. The canvas doesn't disappear — it collapses into a compact "Add more events" bar at the top of the main area, available for quick additions without switching context. The transition is a 300ms ease-in-out animation: canvas slides up, card-view fades in below.

---

## Phase II: Explore

*"What am I missing?"*

Exploration is the phase where initial ideas get tested against heuristics, completeness checks, and domain patterns. The goal is to find gaps before other participants' artifacts reveal them as conflicts.

### What the user sees

> **Scope:** The card-view and aggregate navigation are **existing**. The Exploration Guide sidebar is a **new component**. The flow diagram dashed-outline hints are an **enhancement** to the existing `flow-diagram`.

The existing card-view activates, showing all events grouped by role and aggregate. The sidebar gains a new panel below the aggregate navigation: the **Exploration Guide**.

The Exploration Guide has three expandable sections:

**Completeness Check.** The existing `prep-completeness` analysis, presented as a visual progress ring and a list of specific gaps:
- "Your events cover 3 aggregates but no external systems are defined"
- "The Payment aggregate has commands but no failure events"
- "No assumptions declared — what are you expecting from other participants?"

Each gap is a clickable action item. Clicking "add failure events" opens the Spark Canvas pre-filtered to the relevant aggregate with a prompt: "What could go wrong after PaymentProcessed?"

**Heuristic Prompts.** A rotating set of domain-specific questions generated from the current artifact content:
- "What happens when `OrderPlaced` fails validation?"
- "Who needs to know when `PaymentProcessed` occurs?"
- "What data does the Shipping aggregate need that it doesn't produce?"

Prompts rotate every 30 seconds. Dismissing a prompt replaces it with the next one. Answering a prompt (clicking "Add event" or "Add assumption") captures the response as a new artifact entry.

**Related Patterns.** Based on the aggregates and events defined, suggest common domain patterns from a curated library:
- "You have a Payment aggregate — consider adding: `PaymentFailed`, `PaymentRefunded`, `PaymentDisputed`"
- "OrderPlaced triggers PaymentProcessed — consider adding a `PaymentTimeout` for the unhappy path"

Patterns are suggestions, not requirements. Each has an "Add" button and a "Dismiss" button.

In the flow diagram, the exploration phase adds a subtle visual cue: dashed outlines where expected events are missing based on common patterns. Hovering over a dashed outline shows a tooltip explaining what might belong there.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `query_prep_status` (existing) | Return completeness analysis |
| `suggest_improvements` (new) | Given an artifact, return specific suggestions: missing events, missing assumptions, confidence upgrades |
| `update_artifact` (new) | Replace a submitted artifact with a revised version, preserving the original in version history |

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Heuristic prompts | Enabled | Gear icon in Exploration Guide header |
| Prompt rotation interval | 30 seconds | Gear icon |
| Completeness threshold (below = nudge) | 70% | Gear icon |
| Pattern suggestions | Enabled | Gear icon |

### Blending into Rank

When a second participant submits artifacts, the Conflicts tab badge appears. But before jumping to conflicts, the Exploration Guide adds a new section: **"Compare ready"** — a brief summary of what overlaps exist and a "View comparison" button. No forced transition. The user explores until they're satisfied, then flows into comparison naturally.

---

## Phase III: Rank

*"What matters most?"*

Not everything is equally important. Ranking surfaces the team's collective judgment about what to build first, what to negotiate carefully, and what can wait.

### What the user sees

> **Scope:** The Priority View is an entirely **new component** — no ranking UI exists today.

A **Priority View** tab appears when the session has at least one artifact with 5 or more events. The tab icon is a simple bar chart.

The Priority View has two modes, toggled by a switch in the view header:

**Board mode** (default): A three-column kanban layout — **Must Have**, **Should Have**, **Could Have**. Event cards from the card-view appear as draggable tiles. Drag an event between columns to set its priority. Each card shows a small composite score badge.

The composite score is computed from three signals:
- Confidence level (CONFIRMED = 3, LIKELY = 2, POSSIBLE = 1)
- Integration complexity (inbound/outbound = 2, internal = 1)
- Cross-references (how many other participants' artifacts mention the same event or aggregate)

**Table mode**: A sortable data table showing all events with columns for name, aggregate, confidence, direction, cross-references, composite score, and priority tier. Column headers are clickable to sort. A "Sort by" dropdown offers preset orderings: "By score," "By aggregate," "By confidence," "By cross-references."

**Voting**: Each event card has a subtle upvote/downvote widget (small chevrons, visible on hover). Click to vote. Vote counts appear as a small number next to the score badge. Votes are per-participant — you can see who voted for what by hovering over the count.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `set_priority` (new) | Set the priority tier for an event |
| `cast_vote` (new) | Record a vote on an event or aggregate |
| `get_priorities` (new) | Return current priorities and vote tallies |
| `suggest_priorities` (new) | Analyze the artifact set and suggest a priority ordering with reasoning |

When an agent calls `suggest_priorities`, the result appears in the Priority View as a "Suggested ordering" banner at the top: "Based on cross-references and confidence levels, I recommend focusing on OrderPlaced, PaymentProcessed, and ShippingInitiated first." Each suggestion has "Accept" and "Dismiss" buttons.

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Scoring weights | Confidence: 1, Complexity: 1, References: 1 | Gear icon in Priority View header |
| Default priority tier for new events | Should Have | Gear icon |
| Voting | Enabled, 1 vote per participant per event | Gear icon |
| Voting visibility | Named (not anonymous) | Gear icon |
| Scoring algorithm | Composite (all three signals) | Gear icon |

### Blending into Slice

Priority data doesn't reset or disappear when decomposition begins. High-priority events get a subtle star indicator that persists into every subsequent view — in the comparison, in contracts, in integration reports. When the user starts decomposing work, the breakdown panel pre-sorts by priority tier.

---

## Phase IV: Slice

*"How does this break into pieces I can build?"*

Decomposition turns prioritized concepts into work items — vertically sliced, independently deliverable, and testable. Each slice crosses system boundaries end-to-end.

### What the user sees

> **Scope:** The detail panel is **existing** (320px slide-in). The Breakdown Editor with work items, coverage matrix, and dependency graph is a **new component** that extends the detail panel.

The Slice phase doesn't get its own tab. Instead, it lives inside the existing **detail panel** (the slide-in panel that opens when clicking an aggregate in the flow diagram).

When viewing an aggregate's detail, a **"Break down"** button appears below the event list. Clicking it expands the detail panel to full width (from 320px to 50% of the viewport, animated over 200ms) and reveals the **Breakdown Editor**.

The Breakdown Editor shows:

**Work items list.** Each work item is a card with:
- Title (editable inline)
- Description (expandable textarea)
- Acceptance criteria (bullet list, add with Enter)
- Complexity (T-shirt sizing: S / M / L / XL, shown as colored badges)
- Linked events (which events from this aggregate the work item addresses — shown as small tags)

Add a new work item with the "+" button or by pressing `N`.

**Coverage matrix.** A compact grid below the work items list. Rows are events in the aggregate, columns are work items. A filled cell means the work item addresses that event. Empty cells in the events column are highlighted amber — these are events with no work item covering them.

**Dependency graph.** A miniature flow diagram (reusing the same layout engine) showing work items as nodes and dependencies as directed edges. Drag from one work item to another to create a dependency. The graph auto-layouts using the existing force-directed engine.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `create_work_items` (new) | Create work items for an aggregate with title, description, acceptance criteria |
| `get_decomposition` (new) | Return the work item tree for a session |
| `suggest_decomposition` (new) | Propose a breakdown of an aggregate into work items based on events and relationships |
| `set_dependency` (new) | Record that one work item depends on another |

`suggest_decomposition` is the agent-powered breakdown assistant. It analyzes the events, their triggers, and their relationships, then proposes work items that follow vertical slicing principles. The suggestions appear in the Breakdown Editor as ghost cards (dashed border, muted text) that the user can accept, edit, or dismiss.

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Complexity scale | T-shirt (S/M/L/XL) | Gear icon in Breakdown Editor header |
| Auto-detect dependencies | On | Gear icon |
| Work item template fields | Title, Description, Acceptance Criteria, Complexity | Gear icon |
| Coverage warnings | On (highlight uncovered events) | Gear icon |

### Blending into Agree

Work items implicitly define boundaries: "this is what I'm building, and here's what I expect from your piece." When the team moves into negotiation, each conflict card in the comparison view shows which work items are affected. A conflict between `OrderCreated` schemas isn't abstract — it's "this affects Alice's work item #3 (Checkout Form) and Bob's work item #1 (Order API)."

---

## Phase V: Agree

*"Where does my piece touch yours?"*

Negotiation is the pivot — the one phase that demands synchronous human conversation. Everything before it is preparation. Everything after it is execution. The platform makes this conversation structured, recorded, and verifiable.

### What the user sees

> **Scope:** The four core components are **existing**: `comparison-view`, `resolution-recorder`, `ownership-grid`, `flag-manager`. Smart Resolution Suggestions, Negotiation Progress bar, and Assumption Matching are **enhancements**.

This is the most-built phase. The existing components handle the core workflow:

- **Comparison View** (`comparison-view`): Overlapping events across participants, with conflict cards highlighting discrepancies. Stats dashboard showing conflict count, shared events, shared aggregates.
- **Resolution Recorder** (`resolution-recorder`): Inline resolution with four approaches — Merge, Pick One, Split, Custom. Pre-filled resolution text for non-custom approaches.
- **Ownership Grid** (`ownership-grid`): Visual assignment matrix. Rows are aggregates, columns are roles. Click to assign.
- **Flag Manager** (`flag-manager`): Track unresolved items with related overlap references.

**Enhancements for the complete experience:**

**Smart Resolution Suggestions.** When a conflict card opens, a light-blue banner appears within the resolution recorder: "Based on the event schemas, merging would combine `amountCents` from Alice's submission with `currency` from Bob's. This preserves both data points." The suggestion has "Apply" and "Dismiss" buttons. Apply pre-fills the resolution text with the merged schema.

The suggestion comes from an MCP tool call (`suggest_resolution`) that runs automatically when a conflict card is expanded. A loading skeleton shows while the suggestion is being computed.

**Negotiation Progress.** At the top of the Comparison view, a progress bar: "8 of 12 conflicts resolved." The remaining conflicts are sorted by priority tier from Phase III — Must Have conflicts appear first. The progress bar fills with a smooth animation as resolutions are recorded.

**Assumption Matching.** Below the conflict cards, a new section: **Matched Assumptions**. When Alice's artifact declares "I assume the cancel endpoint returns a case ID" and Bob's artifact includes `salesforceCaseId` in the response schema, the platform shows a green "Matched" card connecting the assumption to the fulfilling field. Unmatched assumptions are shown in amber with "Needs discussion" labels.

### What agents can do

All existing jam tools apply. In the conversational loop, an agent can:

| Interaction | How it works |
|-------------|-------------|
| Explore context | Agent calls `get_session` + `query_prep_status` to understand the full picture |
| Explain a conflict | Agent calls `compare_artifacts`, then synthesizes a plain-language explanation for the human |
| Propose a resolution | Agent calls `record_resolution` with a pending status. Human sees a "Pending approval" banner and can accept or reject |
| What-if exploration | Agent calls `update_artifact` to revise a draft, then `compare_artifacts` to see how the new version affects overlaps — a two-step preview loop |
| Iterate on an artifact | Agent calls `update_artifact` with revisions, human reviews the diff |

The key pattern: **propose, don't decide.** The agent drafts; the human confirms. This is the `assisted` delegation level (see Settings below).

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Comparison sensitivity | Semantic (treat `amountCents` and `amount_cents` as equivalent) | Gear icon in Comparison View header |
| Auto-detect conflicts | On | Gear icon |
| Smart resolution suggestions | On | Gear icon |
| Suggestion aggressiveness | Conservative (only suggest when confidence > 80%) | Gear icon |
| Conflict types to surface | All (event name, aggregate, payload, assumption) | Gear icon |

### Blending into Build

When all conflicts are resolved (or explicitly flagged as "defer"), a call-to-action appears at the bottom of the Comparison View: "All conflicts resolved. Formalize agreements into contracts." This isn't a separate page — it's a prominent button that triggers contract generation inline. The contracts appear in a new tab that fades in alongside the existing tabs.

---

## Phase VI: Build

*"Build your piece. We'll catch drift."*

Execution is where participants work independently — each building their piece against the contracts agreed in Phase V. The platform provides continuous, unobtrusive compliance checking.

### What the user sees

> **Scope:** The `contract-diff`, `provenance-explorer`, and `schema-display` components are **existing**. The Compliance Badge, Drift Notifications, and Contract Sidebar are **new**.

**Contract Tab.** When contracts are loaded, a new tab appears: "Contracts." It contains the existing `contract-diff`, `provenance-explorer`, and `schema-display` components. The tab badge shows the contract count.

**Compliance Badge.** A persistent indicator in the header, next to the session code:
- Green checkmark: all artifacts comply with contracts
- Amber warning: drift detected but not blocking
- Red X: non-compliance detected

Clicking the badge opens a compliance detail panel showing exactly what's drifted and who needs to fix it.

**Drift Notifications.** When a participant submits an updated artifact that differs from the contract, all other participants see a toast notification: "Alice's latest submission changes the `OrderCreated` payload. Field `shippingAddress` was not in the contract." The notification uses `sl-alert variant="warning"` with `duration="6000"` (auto-dismiss after 6 seconds). Clicking the notification opens the Contract tab with the drift highlighted.

**Contract Sidebar.** Below the aggregate-nav in the sidebar, a "Contracts" section lists event contracts grouped by owner. Each contract shows: event name, owner, consumer count, compliance status icon. Clicking a contract opens the schema-display and provenance-explorer for that event.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `load_contracts` (existing) | Load a contract bundle into the session |
| `diff_contracts` (existing) | Compare contracts against prep submissions |
| `check_compliance` (existing) | Check whether submitted prep events cover the events listed in the contract bundle (event-name coverage, not schema validation) |
| `validate_against_contract` (new) | Check whether an implementation artifact matches the contract schema |
| `report_progress` (new) | Report completion percentage on assigned work items |

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Contract strictness | Warn (non-compliance shows warnings, not blocking errors) | Gear icon in Contract Tab header |
| Drift notifications | Immediate | Gear icon |
| Compliance checking | Automatic on every artifact submission | Gear icon |
| Strictness levels | `strict` (block) / `warn` (notify) / `relaxed` (log only) | Gear icon |

### Blending into Ship

When all work items report 100% progress and the compliance badge is green, the suggestion bar says "Ready for integration check." The Integration tab appears (if not already visible) with a prominent "Run Check" button.

---

## Phase VII: Ship

*"Does everything fit?"*

The final verification. Before merging, the platform checks that independently-produced work is compatible — contract compliance, cross-boundary compatibility, drift detection, and a go/no-go assessment.

### What the user sees

> **Scope:** The integration report data model exists (`load_integration_report`, `query_integration_status`). The Integration Dashboard UI, Boundary Map visualization, and Celebration Moment are all **new components**.

**Integration Dashboard.** A full-width view (no sidebar) with three columns:

Left column: **Checks.** A vertical list of all integration checks, each with a pass/fail/warn icon, a one-line description, and an expandable detail section. Failed checks show: what failed, why, who owns the fix, and a "Create work item" button that feeds back into Phase IV.

Center column: **Boundary Map.** A visual diagram showing how artifacts connect across boundaries — reusing the flow-diagram engine but at the contract level. Green lines for compliant connections, red for non-compliant, amber for warnings.

Right column: **Verdict.** A large status display:
- **GO**: Green background, checkmark, "All checks pass. Ready to ship."
- **NO-GO**: Red background, X, "N issues require resolution." with a severity breakdown.
- **CAUTION**: Amber background, warning icon, "All critical checks pass, but N advisory items found."

**The Celebration Moment.** When integration checks all pass, the GO verdict pulses green three times. A brief confetti animation plays (CSS-only, 2 seconds). The suggestion bar says: "All systems go. Your team aligned on {{contractCount}} contracts across {{aggregateCount}} aggregates." The confetti respects `prefers-reduced-motion` — users who have reduced motion enabled see a simple green flash instead.

This moment is the payoff for the entire pipeline. Make it feel earned.

### What agents can do

| MCP Tool | What it does |
|----------|-------------|
| `load_integration_report` (existing) | Load an integration report into the session |
| `query_integration_status` (existing) | Return integration status with go/no-go assessment |
| `run_integration_check` (new) | Trigger a full integration check, producing a fresh report |
| `get_go_no_go` (new) | Return the boolean verdict with a human-readable summary |

### Defaults and configuration

| Setting | Default | Where to change |
|---------|---------|----------------|
| Auto-run checks on contract change | Off (manual trigger) | Gear icon in Integration Dashboard header |
| Severity thresholds | All critical checks must pass for GO | Gear icon |
| Celebration animation | On | Gear icon |
| Export format | JSON | Gear icon (options: JSON, Markdown) |

---

## The Settings Philosophy

Settings should feel like a conversation with a thoughtful host: "Here's what I set up for you. If you want to change anything, everything is within arm's reach."

### Contextual Settings (the gear icon pattern)

Every section of the UI that has configurable behavior shows a small gear icon in its section header. The icon is muted (60% opacity) until hovered. Clicking it opens an `sl-drawer` from the right edge containing only the settings relevant to that context.

The drawer header shows the section name ("Comparison Settings," "Priority Settings"). Each setting has:
- A clear label
- The current value
- The default value in muted text ("Default: Semantic")
- A blue dot next to settings that have been changed from default

Closing the drawer saves immediately. No "Save" button — settings are live.

### Global Settings (the full surface)

A gear icon in the app-shell header (top right) opens a full `sl-dialog` with a tab group:

| Tab | What's in it |
|-----|-------------|
| **Session** | Name, workflow template, phase sequence, participant limit |
| **Artifacts** | Default schema, validation strictness, auto-validate behavior |
| **Comparison** | Sensitivity, conflict types, auto-suggest |
| **Contracts** | Strictness, drift notifications, compliance frequency |
| **Notifications** | Which events trigger toasts, which are silent |
| **Delegation** | Agent autonomy levels (see below) |
| **Shortcuts** | Full keyboard shortcut reference, customizable bindings |

The global dialog aggregates all the same settings that appear in contextual drawers. Changing a setting in one place updates it in the other. The global dialog is for power users who want to configure everything at once. The contextual drawers are for everyone else.

### Settings Persistence

- **Per-session settings** (comparison sensitivity, contract strictness, scoring weights): stored in session state, shared across all participants. Changing a session setting emits a `SessionConfigured` domain event that all participants receive.
- **Per-user preferences** (notification behavior, keyboard shortcuts, celebration animation): stored in `localStorage`, private to the user.

### The MCP Surface for Settings

| MCP Tool | What it does |
|----------|-------------|
| `configure_session` (new) | Read or modify session-level settings |
| `get_session_config` (new) | Return current session configuration |

This enables agents to set up optimal configurations for specific workflow types. An agent joining a session for API design negotiation might call `configure_session` to set comparison sensitivity to "exact" and contract strictness to "strict."

---

## Magic Moments

The difference between "functional" and "delightful" is in the details. These are specific interactions designed to make the platform feel like it understands what the user needs before they ask.

### Tier 1: Low-effort, high-impact (build first)

#### The Suggestion Bar

A thin strip at the bottom of the main content area, just above the footer (or the fold). It shows one contextual suggestion at a time, phrased as a gentle nudge:

| Session state | Suggestion |
|--------------|-----------|
| Session created, no participants | "Share code **ABC123** with your team to get started" |
| Participants joined, no artifacts | "Everyone's here. Each person submits their domain events independently" |
| One artifact submitted | "Waiting for other participants. Meanwhile, check your completeness score in the sidebar" |
| Two artifacts, no comparison yet | "Two perspectives submitted. The Conflicts tab shows where they overlap" |
| Conflicts detected, none resolved | "12 conflicts found. Start with the highest-priority ones" |
| All conflicts resolved | "All conflicts resolved. Ready to formalize into contracts" |
| Contracts loaded, no integration | "Building against contracts. Run an integration check when ready" |
| Integration passes | "All systems go. Ship it." |

The suggestion bar reads the `nextAction` field from `computeWorkflowStatus()` as a starting signal, then wraps it in conversational, context-aware language. The engine's `nextAction` provides fixed strings (e.g., "Share the join code and wait for participants"); the suggestion bar interpolates session-specific details (participant names, conflict counts, session codes) and adjusts tone. This transformation lives in a dedicated `formatSuggestion()` function, not in the workflow engine itself. The bar slides up from below with a 300ms animation when the suggestion changes.

#### Seamless Artifact Continuity

A participant submits events once in Phase I. Those same events:
- Appear in the card-view (Phase II)
- Get completeness-checked (Phase II)
- Show in the comparison view when overlaps exist (Phase V)
- Become the basis for contracts (Phase VI)
- Get checked for compliance (Phase VII)

No export. No re-upload. No "load your artifacts from the previous phase." The artifact is submitted once and the platform carries it forward through every view. This is the single most important UX principle: **submit once, see everywhere.**

#### "Just Works" Defaults

- **Drag-and-drop a YAML file** onto any surface. The existing `file-drop-zone` handles it anywhere.
- **Paste YAML** from clipboard. A global `Ctrl+V` handler detects valid storm-prep YAML and offers to load it.
- **URL-based session join**: `/?session=ABC123&name=Alice`. If the session exists, auto-join. No manual code entry.
- **Copy join code** with a single click on the code chip. "Copied!" micro-confirmation.
- **Keyboard shortcuts for everything.** `N` for new event. `R` for resolve. `Enter` to confirm. `Escape` to cancel. The full shortcut reference is in the global settings dialog.

### Tier 2: Significant new infrastructure

The following require meaningful new infrastructure:

#### Live Collaboration Indicators

**Presence dots.** In the participant registry and beside artifact cards, a colored dot indicates connection status:
- Green: connected now (WebSocket active)
- Amber: connected within the last 5 minutes
- Gray: offline

**Viewing indicators.** A subtle line of text below the header participant avatars: "Alice is viewing Conflicts · Bob is viewing Flow." Each participant's client sends a lightweight WebSocket message when they switch tabs. This costs almost nothing and provides enormous contextual awareness.

**Activity pulse.** When a participant submits an artifact or records a resolution, their avatar in the header briefly pulses with a ring animation (300ms). Other participants see the pulse in real time — a visual heartbeat of collaboration.

#### Contextual First-Time Help

The first time a user encounters a new capability, a brief overlay explains what they're looking at:

- First time seeing the Comparison View: "These are events that appear in multiple participants' submissions. Amber means they overlap but differ — the same event has different definitions."
- First time seeing a conflict card: a tooltip on the "Resolve" button: "Choose how your team wants to handle this overlap. Most teams start with Merge."
- First time seeing the Priority View: "Drag events between columns to set priority. Scores are computed from confidence, complexity, and how many participants reference the event."

Help appears once per user (tracked in `localStorage`), not once per session. It uses `sl-tooltip` with `trigger="manual"`, appearing for 5 seconds before fading. Dismissing early is always possible with a click or Escape.

---

## MCP Integration: Agent as Participant

The platform treats agents as first-class participants. An agent joins a session, appears in the participant registry with a robot icon, and has the same capabilities as a human. The difference is only the `type` field: `'human'` vs. `'agent'`.

### The Core Rule

**Human actions in the UI and agent actions via MCP produce the same domain events.**

When a human drags an event to "Must Have" in the Priority View, the system emits a `PrioritySet` domain event. When an agent calls `set_priority`, the same event is emitted. Every client — human and agent — receives it via WebSocket and updates their state.

This means:
- Agents can work alongside humans without special integration
- The session history is a complete, protocol-agnostic record of everything that happened
- UI-only features don't exist — everything the UI can do, an MCP tool can do too

### Tool Surface by Phase

| Phase | Existing Tools | New Tools |
|-------|---------------|-----------|
| I. Spark | `create_session`, `join_session`, `submit_artifact` | `create_draft`, `suggest_events` |
| II. Explore | `query_prep_status`, `load_prep_artifact` | `suggest_improvements`, `update_artifact` |
| III. Rank | — | `set_priority`, `cast_vote`, `get_priorities`, `suggest_priorities` |
| IV. Slice | — | `create_work_items`, `get_decomposition`, `suggest_decomposition`, `set_dependency` |
| V. Agree | `compare_artifacts`, `start_jam`, `record_resolution`, `assign_ownership`, `flag_unresolved`, `export_jam_artifacts` | `suggest_resolution` |
| VI. Build | `load_contracts`, `diff_contracts`, `check_compliance` | `validate_against_contract`, `report_progress` |
| VII. Ship | `load_integration_report`, `query_integration_status`, `query_workflow_phase`, `poll_workflow_phase` | `run_integration_check`, `get_go_no_go` |
| Cross-cutting | `send_message`, `get_messages` | `configure_session`, `get_session_config` |

**Total: 22 existing + 17 new = 39 MCP tools.** (Existing count includes scoped-mode variants like `my_session`, `my_submit`, `check_messages`.)

### Scoped Mode

All new tools follow the scoped-mode pattern. When the MCP server starts with `--session=CODE --user=NAME`, tools that normally require session code and participant ID work without them. This makes agent integration frictionless: the agent connects and starts working without passing identity on every call.

### A2A Skill Additions

The Agent Card should advertise skills for the intelligent capabilities: `suggest_events`, `suggest_priorities`, `suggest_decomposition`, `suggest_resolution`, `run_integration_check`. These are the skills that differentiate AI participation from mechanical tool usage.

---

## The Delegation Model

How much can agents do on their own?

### Three Levels

**Assisted** (default): Agents suggest, humans approve. Every agent action that modifies session state (submit artifact, resolve conflict, assign ownership) goes through a "Pending approval" queue. Humans see a notification: "Agent proposed: merge `amountCents` and `currency` fields." Accept or reject with one click.

**Semi-autonomous**: Agents can submit artifacts and run checks without approval. Conflict resolution and ownership assignment still require human confirmation. This is the level for teams that trust their agents for routine work but want human judgment on decisions.

**Autonomous**: Agents act as full participants. All actions take effect immediately. Humans can review and override via session history. This is for advanced teams with well-calibrated agents working in established patterns.

### Configuration

Delegation level is a per-session setting, changeable at any time. It appears in:
- The global settings dialog → Delegation tab
- A quick toggle in the participant registry when viewing an agent's profile

The default is `assisted`. Changing to a higher autonomy level shows a confirmation: "Agents will be able to submit artifacts without your approval. You can review and undo any action from the session history."

### The Approval Queue

When delegation is `assisted`, agent-proposed actions appear in a notification panel (accessible via a bell icon in the header). Each pending action shows:
- What the agent wants to do ("Submit artifact: OrderCreated schema")
- Why (if the agent provided reasoning)
- Accept / Reject buttons
- "View details" link to see the full artifact or resolution

The queue badge shows the count of pending items. Items auto-expire after 24 hours if not reviewed (configurable).

---

## The Collaboration Gradient

| Phase | Who | Sync/Async | Agent Role |
|-------|-----|------------|------------|
| Spark | Individual | Async | Brainstorm assistant |
| Explore | Individual | Async | Completeness checker, pattern suggester |
| Rank | All stakeholders | Async (voting) + sync (discussion) | Priority recommender |
| Slice | Tech leads | Async or sync | Decomposition assistant |
| Agree | All boundary owners | **Sync** (jam) + async (prep, formalize) | Resolution drafter, conflict explainer |
| Build | Individual | Async | Compliance monitor, drift detector |
| Ship | One or all | Async (automated checks) | Integration checker |

The single synchronous bottleneck is the Agree phase — and it's the highest-leverage hour in the entire pipeline. Everything before it prepares for that conversation. Everything after it executes the decisions made there.

The platform's job is to make that synchronous hour as productive as possible by doing all the asynchronous work well.

---

## Appendix: New MCP Tool Schemas

Minimal input/output contracts for the 17 new tools. These are design intent — final schemas will be defined during implementation.

### Phase I: Spark

```typescript
create_draft(input: {
  sessionCode: string;
  participantId: string;
  content: CandidateEventsFile;
}) → { draftId: string }

suggest_events(input: {
  description: string;       // Natural-language domain description
  existingEvents?: string[]; // Event names already defined, to avoid duplicates
}) → { events: CandidateEvent[] }
```

### Phase II: Explore

```typescript
suggest_improvements(input: {
  sessionCode: string;
  fileName: string;          // Which artifact to analyze
}) → { suggestions: Array<{
  type: 'missing_event' | 'missing_assumption' | 'confidence_upgrade' | 'pattern_match';
  description: string;
  suggestedContent?: Partial<CandidateEvent>;
}> }

update_artifact(input: {
  sessionCode: string;
  participantId: string;
  fileName: string;
  content: CandidateEventsFile;
  changeNote?: string;       // Human-readable description of what changed
}) → { version: number }
```

### Phase III: Rank

```typescript
set_priority(input: {
  sessionCode: string;
  eventName: string;
  tier: 'must_have' | 'should_have' | 'could_have';
}) → { updated: boolean }

cast_vote(input: {
  sessionCode: string;
  participantId: string;
  eventName: string;
  direction: 'up' | 'down';
}) → { newCount: number }

get_priorities(input: {
  sessionCode: string;
}) → { events: Array<{ name: string; tier: string; score: number; votes: number }> }

suggest_priorities(input: {
  sessionCode: string;
}) → { suggestions: Array<{ eventName: string; suggestedTier: string; reasoning: string }> }
```

### Phase IV: Slice

```typescript
create_work_items(input: {
  sessionCode: string;
  aggregate: string;
  items: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    complexity: 'S' | 'M' | 'L' | 'XL';
    linkedEvents: string[];
  }>;
}) → { itemIds: string[] }

get_decomposition(input: {
  sessionCode: string;
}) → { aggregates: Array<{ name: string; workItems: WorkItem[]; coverage: Record<string, string[]> }> }

suggest_decomposition(input: {
  sessionCode: string;
  aggregate: string;
}) → { suggestedItems: Array<{ title: string; description: string; linkedEvents: string[]; reasoning: string }> }

set_dependency(input: {
  sessionCode: string;
  fromItemId: string;
  toItemId: string;
}) → { created: boolean }
```

### Phase V: Agree

```typescript
suggest_resolution(input: {
  sessionCode: string;
  overlapLabel: string;
}) → { suggestion: { approach: 'merge' | 'pick-left' | 'split' | 'custom'; resolution: string; confidence: number; reasoning: string } }
```

### Phase VI: Build

```typescript
validate_against_contract(input: {
  sessionCode: string;
  artifactContent: unknown;  // The implementation artifact to validate
  contractEventName: string; // Which contract to validate against
}) → { compliant: boolean; violations: Array<{ field: string; expected: string; actual: string }> }

report_progress(input: {
  sessionCode: string;
  participantId: string;
  workItemId: string;
  percentComplete: number;
  notes?: string;
}) → { updated: boolean }
```

### Phase VII: Ship

```typescript
run_integration_check(input: {
  sessionCode: string;
}) → IntegrationReport

get_go_no_go(input: {
  sessionCode: string;
}) → { verdict: 'go' | 'no_go' | 'caution'; summary: string; checkResults: Array<{ name: string; passed: boolean; severity: string }> }
```

### Cross-cutting

```typescript
configure_session(input: {
  sessionCode: string;
  config: Partial<SessionConfig>;
}) → { applied: SessionConfig }

get_session_config(input: {
  sessionCode: string;
}) → SessionConfig

// SessionConfig shape:
interface SessionConfig {
  comparison: { sensitivity: 'semantic' | 'exact'; autoDetectConflicts: boolean; suggestResolutions: boolean };
  contracts: { strictness: 'strict' | 'warn' | 'relaxed'; driftNotifications: 'immediate' | 'batched' | 'silent' };
  ranking: { weights: { confidence: number; complexity: number; references: number }; defaultTier: string };
  delegation: { level: 'assisted' | 'semi_autonomous' | 'autonomous'; approvalExpiry: number };
  notifications: { toastDuration: number; silentEvents: string[] };
}
```

---

## See Also

- [The Complete Story](the-complete-story.md) — the seven-act narrative arc
- [Vision](vision.md) — design principles and protocol architecture
- [Introduction](seam-intro.md) — core concepts and primitives
- [How-To](seam-howto.md) — practical walkthrough of the Agree → Build → Ship pipeline
