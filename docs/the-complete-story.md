# The Complete Story: From Idea to Production

How an idea becomes running software when multiple humans and AI agents collaborate across boundaries. This is the narrative arc the platform enables — each phase shows what happens, who's involved, and what the platform provides.

---

## Act I: Origination

*Where do ideas come from?*

Ideas don't appear from nowhere. They surface through structured observation, customer pain, engineering insight, or market signal. The platform doesn't generate ideas — it gives them a place to land and a path forward.

### Sources

- **Customer pain** — JTBD interviews, support tickets, churn signals
- **Observation** — Luma Institute methods (Looking/Understanding/Making), ethnographic research
- **Engineering insight** — technical debt patterns, o11y anomalies, performance cliffs
- **Market signal** — competitive moves, ecosystem shifts, regulatory changes
- **Data** — usage analytics, funnel analysis, cohort behavior

### What the platform provides

- **Skills**: `/gather` for structured research, ideation-prep skill for pre-session brainstorming
- **MCP tools**: gap_analysis for identifying coverage holes in existing work
- **UI**: guided ideation entry point — choose a method, get contextual help, start exploring

### Output

A raw collection of observations, pain points, and hunches — unstructured but captured.

---

## Act II: Exploration

*What's the real problem? What does "good" look like?*

Before prioritizing, understand. Each framework reveals different facets of the same problem space. They're lenses, not religions — use whichever fits.

### Frameworks

| Framework | Reveals | Best for |
|-----------|---------|----------|
| **JTBD** | What people are hiring the product to do | Reframing features as outcomes |
| **Opportunity Solution Trees** | Outcome → opportunity → solution hierarchy | Connecting solutions back to goals |
| **Design Thinking** | Empathize → Define → Ideate → Prototype → Test | Human-centered discovery |
| **Event Storming** | Domain events, aggregates, bounded contexts | System boundary discovery |

### What the platform provides

- **Skills**: JTBD capture, OST builder, Design Thinking facilitation, `/storm-prep`
- **MCP tools**: artifact versioning (iterate on findings), session context summary
- **UI**: artifact version history, domain term tooltips

### The collaborative dimension

Exploration is most powerful when independent. Each participant explores their own domain before sharing — the same discipline as storm-prep. Independent findings surface real disagreements. If you peek first, you align unconsciously and miss the gaps.

### Output

Structured artifacts per participant: JTBD canvases, opportunity trees, candidate events, design thinking outputs — each with declared assumptions about others' domains.

---

## Act III: Prioritization

*Which problems are worth solving? In what order?*

You always have more ideas than capacity. Prioritization isn't about killing ideas — it's about sequencing them so the most valuable work happens first and the riskiest assumptions get tested earliest.

### Frameworks

| Framework | Measures | Best for |
|-----------|----------|----------|
| **RICE** | Reach, Impact, Confidence, Effort | Quantitative comparison at scale |
| **WSJF** | Cost of delay / job duration | Flow-based prioritization |
| **Kano** | Must-be / Performance / Attractive | Understanding satisfaction drivers |
| **MoSCoW** | Must / Should / Could / Won't | Scope negotiation for a release |
| **Buy-a-Feature** | Participant budget allocation | Collaborative prioritization |
| **Priority Poker** | Consensus scoring | Team alignment |

### What the platform provides

- **Skills**: prioritization framework skills (RICE, WSJF, Kano classify), `/rank`, `/filter`
- **MCP tools**: prioritization input (structured vote/score collection)
- **UI**: prioritization workspace (interactive scoring, drag-and-drop, multi-participant view)

### The collaborative dimension

Prioritization is inherently multi-human. Different stakeholders weight criteria differently. The platform makes the scoring transparent — everyone sees why something ranked where it did, and disagreements become explicit conversations rather than hidden assumptions.

### Output

A ranked backlog with scores, rationale, and participant agreement on sequencing.

---

## Act IV: Decomposition

*How does this break into buildable pieces?*

A prioritized idea isn't buildable. It needs to be sliced into pieces that are independently deliverable, vertically complete, and testable. Each slice should cross system boundaries end-to-end — no "build the database layer" slices.

### Patterns

- **Vertical slicing** — each slice delivers value from UI to data store
- **Story mapping** — arrange slices by user journey, then cut releases horizontally
- **Example mapping** — rules + examples + questions per slice
- **INVEST criteria** — Independent, Negotiable, Valuable, Estimable, Small, Testable

### What the platform provides

- **Skills**: `/decompose`, vertical-slice decomposition skill, `/plan`
- **Cross-cutting awareness**: every slice gets checked against o11y, a11y, i18n, security, DevOps concerns — not as afterthoughts but as first-class acceptance criteria

### Output

A set of vertical slices, each with clear scope, ownership boundaries, and cross-cutting requirements baked in.

---

## Act V: Negotiation

*Where do my pieces touch yours? What shape do the handoffs take?*

This is the phase most teams skip — and where most integration failures originate. When two or more people own different pieces, their work has to agree on shapes at the boundaries. The platform makes this negotiation structured, recorded, and verifiable.

### The workflow

```
/storm-prep (each person, alone — figure out your piece)
       |
       v
  Jam Session (everyone together — the only sync point)
       |
       v
/formalize (each person, alone — turn agreements into contracts)
```

### Storm-prep

Each participant explores their domain independently. Three agents fan out across your code. They return two things:
1. **What happens in your piece** — concrete operations, data flows, API calls
2. **What you're assuming about others' pieces** — every assumption is a question

### Jam

The human conversation where boundaries get negotiated. Pull up everyone's prep. Hash out the handoffs. Write down what you agree on and what you're still figuring out. Time-boxed to 60 minutes — if it can't be resolved, flag it and move on.

### Formalize

Turn jam agreements into machine-readable contracts: schemas, mocks, validation rules. Every field gets a confidence tag — `CONFIRMED`, `LIKELY`, or `POSSIBLE`. The `POSSIBLE` fields nag until they're settled.

### What the platform provides

- **Skills**: `/storm-prep`, `/formalize`
- **MCP tools**: propose/confirm resolution, explain conflict, what-if preview, session context summary
- **UI**: session dashboard, notification surface, empty state guidance, onboarding flow
- **Session lifecycle**: create, join, submit artifacts, compare, detect conflicts, capture agreements

### The agent-mediated conversational loop

Humans don't have to do all negotiation directly. An agent can:
- Explore session context on behalf of a human
- Iterate on artifacts through conversation
- Explain conflicts in plain language
- Propose resolutions pending human confirmation
- Perform what-if exploration before committing

The key pattern: **propose, don't decide.** The agent drafts; the human confirms. Progressive delegation lets teams start hands-on and shift autonomy to agents as patterns stabilize.

### Output

Contracts: typed schemas for interfaces each participant owns, mock responses for interfaces they consume, validation rules their sprint agents will check.

---

## Act VI: Execution

*Build your piece, with guardrails that catch drift.*

Normal sprint work, except your agents have contracts. You build against mocks for what you consume and schemas for what you own. If either side drifts from the agreement, the violation surfaces immediately — not at merge time.

### What the platform provides

- **Skills**: `/sprint` (dispatches work with injected learnings and contract validation)
- **MCP tools**: artifact versioning (iterate on implementations), structured notifications (tell others when contracts change)
- **Contracts**: schemas, mocks, and validation rules from Act V

### Contract changes mid-sprint

It happens. When it does: update the contract, tell the other person immediately, both sides adjust. The one thing you can't do is change it silently.

### Output

Your branch, built against verified contracts, ready for integration checking.

---

## Act VII: Integration

*Does everything actually fit together?*

The moment of truth. Before merging, verify that independently-produced work is compatible. This is a verification step, not a debugging session — because you've been checking contracts all along.

### The checks

1. **Contract compliance** — does each side match its own contracts?
2. **Cross-boundary compatibility** — does what one side sends match what the other expects?
3. **Drift detection** — has anything changed since the contracts were agreed?
4. **Go/no-go assessment** — ready to merge, or here's what needs resolution first

### What the platform provides

- **Skills**: `/integrate`
- **MCP tools**: contract compliance checking, integration status
- **UI**: integration report view (fatal / serious / advisory findings)

### Output

Integration report with severity-sorted findings. Clean report = merge and ship. Findings = resolve, re-sprint the affected piece, re-check.

---

## The Arc at a Glance

```
Act I    Origination     Where do ideas come from?
  |
Act II   Exploration     What's the real problem?
  |
Act III  Prioritization  Which problems matter most?
  |
Act IV   Decomposition   How does it break into pieces?
  |
Act V    Negotiation     Where do the pieces touch?
  |
Act VI   Execution       Build with guardrails
  |
Act VII  Integration     Verify everything fits
  |
         Ship
```

### What passes between acts

| From | To | Artifact |
|------|----|----------|
| Origination | Exploration | Raw observations, pain points, signals |
| Exploration | Prioritization | Structured findings (JTBD, OST, events, designs) |
| Prioritization | Decomposition | Ranked backlog with rationale |
| Decomposition | Negotiation | Vertical slices with ownership boundaries |
| Negotiation | Execution | Contracts: schemas, mocks, validation rules |
| Execution | Integration | Branches built against contracts |
| Integration | Ship | Go/no-go report |

### The collaboration gradient

| Act | Who | Sync/Async |
|-----|-----|------------|
| Origination | Individual or small group | Async |
| Exploration | Each participant independently | Async |
| Prioritization | All stakeholders | Sync (scoring) + async (input) |
| Decomposition | Tech leads / architects | Sync or async |
| Negotiation | All boundary owners | **Sync** (jam) + async (prep, formalize) |
| Execution | Each participant independently | Async |
| Integration | One or all participants | Async (automated checks) |

The single synchronous bottleneck is the jam session — and it's the highest-leverage hour in the entire pipeline. Everything before it prepares for that conversation. Everything after it executes the decisions made there.

---

## Where the Platform Sits

The platform is not a project manager, a chat app, or a code editor. It's the **coordination layer** between people's work:

- **Sessions** — shared spaces where collaboration happens
- **Artifacts** — structured outputs with identity, versioning, and provenance
- **Comparisons** — automated conflict detection across artifacts
- **Agreements** — decisions captured in queryable, versionable form
- **Contracts** — machine-readable specifications generated from agreements
- **Verification** — automated fitness checks before merge

Every participant — human in a browser, AI agent via MCP, remote agent via A2A, automated service — interacts through the same protocol primitives. The platform doesn't care who's driving. It cares that artifacts are valid and agreements are captured.

---

## See Also

- [Vision](vision.md) — design principles and protocol architecture
- [Introduction](seam-intro.md) — core concepts and primitives
- [How-To](seam-howto.md) — practical walkthrough of Acts V-VII
- [From Idea to Execution](from-idea-to-execution.docx) — detailed treatment of Acts I-IV
- [Open Collaborative Sessions](open-collaborative-sessions.docx) — domain analysis and architecture for Acts V-VII
