# Seam

**Your systems will meet. Make sure they agree.**

Seam is the boundary negotiation platform where teams and AI agents turn integration assumptions into verified contracts — before they become production failures.

---

## The Problem

Teams build in parallel. A backend engineer builds the payment service. A frontend engineer builds the checkout flow. A data engineer builds the analytics pipeline. Each one makes assumptions about the others' work — field names, data shapes, error formats, event sequences.

These assumptions stay invisible until integration. Then comes the scramble: mismatched schemas, renamed fields, API contracts that were never discussed. The failure isn't technical — it's contractual. Nobody negotiated the boundaries.

This is expensive. Integration debugging is the highest-cost phase of parallel development, and it happens at the worst possible time — right before the deadline, when every fix cascades across teams.

---

## What Seam Does

Seam makes the boundaries between systems visible, negotiable, and verifiable. Three verbs describe the entire product:

### Surface

Each participant contributes what they know about their piece of the system — the events it produces, the data it consumes, the assumptions it makes about other pieces. Seam compares these contributions and highlights where assumptions conflict.

*"Your payment service sends `amount` as integer cents. The checkout UI expects `total` as decimal dollars. These overlap."*

Conflicts that would normally surface at merge time become visible while there's still time to negotiate.

### Negotiate

Participants resolve conflicts and record their decisions. Not in chat history or meeting notes — in structured, queryable form. Who decided what, when, and why. Ownership assignments make responsibility explicit: who owns this event, who consumes it, what shape does it take.

Things that can't be resolved immediately get flagged and carry forward. They nag until they're settled.

### Verify

Agreements become machine-readable contracts — typed schemas, mock payloads, validation rules. While teams build independently, Seam checks their work against the contracts. When either side drifts, the violation surfaces immediately. Before merging, a final integration check confirms everything fits.

Integration becomes a verification step, not a debugging session.

---

## How It Works

### Sessions

Everything happens inside a session — a shared workspace with a join code. Someone creates a session, shares the code, and participants join. A session persists until it's explicitly closed, accumulating artifacts, comparisons, agreements, and contracts along the way.

Sessions don't prescribe a process. They provide capabilities that participants use in whatever order makes sense. That said, most sessions follow a natural arc:

| Phase | What happens |
|-------|-------------|
| **Spark** | Participants brainstorm and contribute initial ideas — domain events, API shapes, schema proposals |
| **Explore** | Contributions are reviewed, expanded, and refined |
| **Rank** | Participants prioritize what matters most |
| **Slice** | Large items are decomposed into buildable vertical slices |
| **Agree** | Boundary conflicts are negotiated and decisions are recorded |
| **Build** | Teams execute independently, validated against contracts |
| **Ship** | Integration verification confirms everything fits — go or no-go |

These phases are scaffolding, not gates. A progress indicator shows where you are, but it never blocks you from doing what makes sense. The session grows as content arrives — new capabilities unlock because there's content to fill them, not because you clicked "Next."

### Participants

A participant is anyone or anything that joins a session and contributes. Seam treats all participants as first-class:

| Type | Connects via | Example |
|------|-------------|---------|
| Human | Web browser | Engineer, PM, architect reviewing artifacts |
| AI agent | MCP tools | Claude Code, GPT agent, LangChain pipeline |
| Remote agent | A2A protocol | Agent from another organization or framework |
| Service | MCP or A2A | Validation service, schema generator, CI pipeline |

A human typing in the browser and an AI agent calling an MCP tool produce the same result — a structured artifact in the session. The platform doesn't distinguish between "users" and "tools." It cares that artifacts are valid and agreements are captured.

### Artifacts

Artifacts are the structured contributions participants make: domain events, API specs, schema definitions, design proposals, contract specifications. Each artifact has an author, a timestamp, and metadata — confidence tags, assumptions, declared dependencies.

Artifacts are the unit of collaboration. Seam compares them, detects conflicts between them, and tracks agreements about them.

### Contracts

When participants reach agreements, those agreements become machine-readable contracts: typed schemas for interfaces each side owns, mock payloads for interfaces they consume, and validation rules their tools can check continuously. Every field in a contract traces back to the artifact, session, and participants that produced it.

Contracts have confidence tags — `CONFIRMED`, `LIKELY`, or `POSSIBLE`. The `POSSIBLE` fields nag until they're settled.

---

## Use Cases

Seam applies wherever two or more participants' work has to agree on a shape at the boundaries:

- **API design** — Frontend and backend teams submit endpoint specs, compare request/response shapes, agree on contracts
- **Event-driven systems** — Teams submit domain event definitions, compare across bounded contexts, agree on ownership and schemas
- **Schema negotiation** — Database teams submit migration proposals, compare column definitions, agree on shared tables
- **Component contracts** — Frontend teams submit component interfaces (props, events), compare integration points, agree on boundaries
- **Data pipeline design** — Teams submit stage definitions, compare input/output schemas, agree on transformation contracts
- **Cross-organization integration** — Teams at different companies negotiate shared API contracts through their respective agents

The common thread: independent work that must agree on shapes at the handoff points.

---

## Who Should Use Seam

**Use Seam when:**
- Two or more participants own different parts of the same system
- Work spans boundaries — frontend/backend, service A/service B, team A/team B, company A/company B
- Integration failures would be expensive or block downstream work
- You need explicit contracts that participants can validate against while building

**Skip it when:**
- One participant owns the full stack end to end
- The work is exploratory and contracts would constrain too early
- Boundaries are internal — you're the only author

Rule of thumb: if two participants would be blocked waiting for each other without a shared agreement, use a session.

---

## What Seam Is Not

- **Not a chat app.** Discussion happens in Slack, on calls, in meetings. Seam is where agreements become structured artifacts.
- **Not a project manager.** No Gantt charts, no story points, no sprint boards. The session lifecycle is the process.
- **Not a code editor.** People write code in their tools. Seam is the coordination layer above code.
- **Not a workflow engine.** The platform provides primitives, not prescribed phases. Use them in whatever order makes sense.

---

## Protocols

Seam is built on two open standards, which means any AI agent or service can participate without vendor lock-in.

**MCP (Model Context Protocol)** — the tool layer. Seam exposes all session capabilities as MCP tools. Any AI agent with an MCP client can create sessions, submit artifacts, query state, record resolutions, and trigger integration checks. The agent's framework doesn't matter — the protocol is the interface.

**A2A (Agent-to-Agent Protocol)** — the collaboration layer. Seam is discoverable as an A2A agent. Remote agents from other organizations or frameworks can discover it, join sessions, exchange artifacts, and receive notifications. This enables cross-organization collaboration without shared infrastructure.

Together: MCP handles "what can I do in this session?" and A2A handles "how do I find and collaborate with agents I don't already know?"

---

## Terminology

| Term | Definition |
|------|-----------|
| **Session** | A shared workspace with a join code, participant registry, and collection of artifacts. The container for all collaboration. |
| **Participant** | Anyone or anything that joins a session — human, AI agent, remote agent, or automated service. |
| **Artifact** | A structured contribution to a session — domain events, API specs, schemas, design proposals. Has an author, timestamp, and metadata. |
| **Seam** | The boundary where two participants' work meets. The place where assumptions must be negotiated into agreements. |
| **Comparison** | Automated analysis of overlapping artifacts to surface conflicts, mismatched assumptions, and gaps. |
| **Agreement** | A recorded decision: what was decided, who agreed, what approach was chosen. Structured and queryable. |
| **Contract** | A machine-readable specification generated from agreements — typed schemas, mock payloads, validation rules. |
| **Integration check** | Verification that independently-produced work complies with agreed contracts and fits together. |

---

## See Also

- [Vision](vision.md) — design principles and protocol architecture
- [The Complete Story](the-complete-story.md) — the seven-act narrative from idea to production
- [Experience Design](experience-design.md) — detailed UX specification for every phase
- [Introduction](seam-intro.md) — core concepts and how the primitives work together
- [How-To](seam-howto.md) — practical walkthrough with a concrete scenario
