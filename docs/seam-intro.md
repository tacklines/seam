# Open Collaborative Sessions: Introduction

A conceptual entry point for using the platform when two or more participants — human or AI — need to coordinate work that crosses boundaries.

---

## The Problem

Building in parallel works well when one person (or one agent) owns everything. But real projects involve multiple participants with different expertise — a backend engineer, a frontend engineer, a data scientist, a design agent, an integration service — each owning a piece that must fit together cleanly with the others.

The failure mode isn't technical; it's contractual. Each participant works independently, and the integration step reveals incompatible assumptions: mismatched field names, schema shapes that don't exist, API contracts that were never negotiated.

The platform solves this by giving participants a shared session where they submit artifacts, surface assumptions, negotiate agreements, and verify integration — using whatever process works for them. Integration becomes a verification step rather than a debugging session.

---

## Core Concepts

### Sessions

A session is the shared space where collaboration happens. It has a join code, a participant registry, and a collection of artifacts. Sessions are created by any participant and persist until explicitly closed.

Sessions don't prescribe phases or order. They provide primitives — artifact submission, comparison, agreement capture, integration checking — that participants use in whatever sequence makes sense.

### Participants

A participant is anyone or anything that joins a session and contributes. The platform treats all participants as first-class:

| Type | Connects via | Example |
|------|-------------|---------|
| **Human** | Web UI | Engineer reviewing artifacts in a browser |
| **AI agent** | MCP tools | Claude Code, GPT agent, LangChain pipeline |
| **Remote agent** | A2A protocol | Agent from another organization or framework |
| **Service** | MCP or A2A | Validation service, schema generator, CI pipeline |

The platform doesn't distinguish between "users" and "tools." A human submitting a YAML file through the browser and an AI agent submitting one through MCP are doing the same thing — contributing an artifact to the session.

### Artifacts

Artifacts are the structured outputs that participants contribute: schemas, YAML files, design proposals, contract definitions, test fixtures. Each artifact has an author, a timestamp, and optional metadata (confidence tags, assumptions, declared dependencies).

Artifacts are the unit of collaboration. The platform compares them, detects conflicts between them, and tracks agreements about them.

### Agreements

When participants resolve a conflict or assign ownership, the platform captures it as a structured agreement — not buried in chat history, but queryable and versionable. Agreements accumulate into contracts that participants can validate against while they build.

---

## How the Primitives Work Together

The platform provides five capabilities. How you combine them is up to you.

### 1. Submit

Participants contribute artifacts to the session. The platform validates them, timestamps them, and makes them visible to everyone.

### 2. Compare

When multiple artifacts cover overlapping territory, the platform detects conflicts, surfaces mismatched assumptions, and identifies gaps. "Alice's schema says `amountCents: integer`. Bob's says `total: float`. These overlap."

### 3. Agree

Participants resolve conflicts and the platform records the decisions: what was decided, who agreed, what approach was chosen. Things that can't be resolved get flagged and carry forward as unresolved items.

### 4. Formalize

Agreements become machine-readable contracts — typed schemas, mock payloads, validation rules. Contracts have provenance: every field traces back to the artifact, session, and participants that produced it.

### 5. Verify

Before merging, check that independently-produced work fits together. Contract compliance, cross-boundary compatibility, drift detection, and a go/no-go assessment.

---

## Example: API Boundary Negotiation

Product says "add Stripe payments." Two engineers are involved: one owns the payment backend, the other owns the checkout frontend. Both have AI agents assisting them.

**Someone creates a session.** They share the join code. Both engineers join through the web UI. Their AI agents join via MCP.

**Each side submits artifacts independently.** The backend engineer's agent submits a YAML file describing candidate events: `PaymentInitiated`, `PaymentSucceeded`, `PaymentFailed`. The frontend engineer submits a spec describing the checkout flow and what API responses the UI expects. Neither has seen the other's artifacts yet.

**The platform compares.** Overlaps surface: the backend calls it `amount` (integer cents), the frontend assumes `total` (decimal dollars). The platform highlights the conflict and the unmatched assumptions.

**The engineers negotiate.** In a call, on Slack, or directly through the platform's resolution tools — however they prefer. They agree on `amountCents: integer`. They record the resolution in the session. They assign ownership: backend owns `PaymentSucceeded`, frontend consumes it.

**Contracts formalize.** From the agreements, the platform (or an agent) generates JSON schemas for every event, mock payloads for testing, and validation rules. The `PaymentSucceeded` schema now has `amountCents: integer` locked in.

**Both sides build independently.** The frontend develops against mock responses. The backend builds the Stripe integration. If either side drifts from the contract, the violation surfaces immediately — not at merge time.

**Integration verification.** When both sides are done, the platform checks both outputs against the contracts, flags any remaining drift, and produces a go/no-go assessment.

Without the shared session, they discover at merge time that one side renamed a field. With it, they catch that while building.

---

## When to Use a Collaborative Session

**Use a session when:**
- Two or more participants are working different parts of the same system
- Work spans boundaries (frontend/backend, service A/service B, company A/company B)
- Integration failures would be expensive or block downstream work
- You need explicit contracts that participants can validate against

**Skip it when:**
- One participant owns the full stack
- Boundaries are internal — you're the only author
- The work is exploratory and contracts would constrain too early

Rule of thumb: if two participants would be blocked waiting for each other without a shared agreement, use a session.

---

## Why Protocols Matter

The platform is built on two open standards:

**MCP (Model Context Protocol)** — the tool layer. The platform exposes all session capabilities as MCP tools. Any AI agent with an MCP client participates with full capability: create sessions, submit artifacts, query state, record resolutions. The agent's framework doesn't matter.

**A2A (Agent-to-Agent Protocol)** — the collaboration layer. The platform is discoverable as an A2A agent. Remote agents can discover it, join tasks, exchange artifacts asynchronously, and receive notifications about session changes. This enables cross-organization collaboration without shared infrastructure.

Together: MCP handles "what can I do in this session?" and A2A handles "how do I find and collaborate with agents I don't already know?"

---

For the practical walkthrough with concrete steps, see [Collaborative Sessions How-To](seam-howto.md). For the full product vision, see [Vision](vision.md).
