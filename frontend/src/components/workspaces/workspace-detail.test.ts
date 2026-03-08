import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockFetchWorkspace = vi.fn();
const mockFetchWorkspaceEvents = vi.fn();
const mockStopWorkspace = vi.fn();
const mockDestroyWorkspace = vi.fn();

vi.mock("../../state/workspace-api.js", () => ({
  fetchWorkspace: mockFetchWorkspace,
  fetchWorkspaceEvents: mockFetchWorkspaceEvents,
  stopWorkspace: mockStopWorkspace,
  destroyWorkspace: mockDestroyWorkspace,
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string, _params?: Record<string, unknown>) => key,
}));

vi.mock("../../lib/date-utils.js", () => ({
  relativeTime: (_date: string) => "just now",
}));

vi.mock("../../lib/participant-utils.js", () => ({
  WS_STATUS_VARIANT: {
    pending: "neutral",
    creating: "primary",
    running: "success",
    stopping: "warning",
    stopped: "neutral",
    failed: "danger",
    destroyed: "neutral",
  },
}));

// Mock Shoelace components
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/button/button.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/dropdown/dropdown.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu-item/menu-item.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/spinner/spinner.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/divider/divider.js", () => ({}));

// Mock child components
vi.mock("../agents/agent-activity-panel.js", () => ({}));
vi.mock("../invocations/invoke-dialog.js", () => ({}));

import type { WorkspaceDetail } from "./workspace-detail.js";
import type { WorkspaceView, WorkspaceEvent } from "../../state/workspace-api.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorkspace(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    id: "ws-1",
    task_id: "task-1",
    status: "running",
    coder_workspace_name: "seam-agent-abc123",
    template_name: "seam-agent",
    branch: "agent/coder-abc123",
    started_at: "2024-01-01T10:00:00Z",
    stopped_at: null,
    error_message: null,
    participant_id: "part-1",
    participant_name: "Claude Agent",
    session_code: "SESS01",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WorkspaceEvent> = {}): WorkspaceEvent {
  return {
    id: 1,
    event_type: "workspace.running",
    payload: { status: "running" },
    occurred_at: "2024-01-01T10:00:00Z",
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("workspace-detail", () => {
  let el: WorkspaceDetail;

  beforeEach(async () => {
    mockFetchWorkspace.mockResolvedValue(makeWorkspace());
    mockFetchWorkspaceEvents.mockResolvedValue([]);
    mockStopWorkspace.mockResolvedValue(makeWorkspace({ status: "stopping" }));
    mockDestroyWorkspace.mockResolvedValue(undefined);

    await import("./workspace-detail.js");
    el = document.createElement("workspace-detail") as WorkspaceDetail;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  // ─── 1. Component creation ────────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("workspace-detail");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose workspaceId property", () => {
    el.workspaceId = "ws-456";
    expect(el.workspaceId).toBe("ws-456");
  });

  // ─── 2. Default state ─────────────────────────────────────────────────────

  it("starts in loading state", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(true);
  });

  it("starts with no workspace", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_workspace"]).toBeNull();
  });

  it("starts with empty events", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_events"]).toEqual([]);
  });

  it("starts with no error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  // ─── 3. _load ─────────────────────────────────────────────────────────────

  it("does not load when projectId is missing", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockClear();
    el.workspaceId = "ws-1";

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchWorkspace).not.toHaveBeenCalled();
  });

  it("does not load when workspaceId is missing", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockClear();
    el.projectId = "proj-1";

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchWorkspace).not.toHaveBeenCalled();
  });

  it("calls fetchWorkspace with correct arguments", async () => {
    el.projectId = "proj-abc";
    el.workspaceId = "ws-xyz";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockResolvedValue(makeWorkspace({ id: "ws-xyz" }));
    mockFetchWorkspaceEvents.mockResolvedValue([]);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchWorkspace).toHaveBeenCalledWith("proj-abc", "ws-xyz");
  });

  it("calls fetchWorkspaceEvents with correct arguments", async () => {
    el.projectId = "proj-abc";
    el.workspaceId = "ws-xyz";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockResolvedValue(makeWorkspace());
    mockFetchWorkspaceEvents.mockResolvedValue([]);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchWorkspaceEvents).toHaveBeenCalledWith("proj-abc", "ws-xyz");
  });

  it("sets _workspace and _events on successful fetch", async () => {
    el.projectId = "proj-1";
    el.workspaceId = "ws-1";
    const comp = el as unknown as Record<string, unknown>;
    const ws = makeWorkspace({ coder_workspace_name: "my-workspace" });
    const events = [makeEvent()];
    mockFetchWorkspace.mockResolvedValue(ws);
    mockFetchWorkspaceEvents.mockResolvedValue(events);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect((comp["_workspace"] as WorkspaceView).coder_workspace_name).toBe(
      "my-workspace",
    );
    expect(comp["_events"] as WorkspaceEvent[]).toHaveLength(1);
    expect(comp["_error"]).toBe("");
  });

  it("sets _error and clears _loading when fetchWorkspace fails", async () => {
    el.projectId = "proj-1";
    el.workspaceId = "ws-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockRejectedValueOnce(new Error("Network error"));

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect(comp["_error"]).toBe("Network error");
  });

  it("gracefully handles fetchWorkspaceEvents failure (falls back to empty)", async () => {
    el.projectId = "proj-1";
    el.workspaceId = "ws-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchWorkspace.mockResolvedValue(makeWorkspace());
    mockFetchWorkspaceEvents.mockRejectedValueOnce(new Error("Events error"));

    await (comp["_load"] as () => Promise<void>).call(el);

    // Workspace still loads, events fall back to empty
    expect(comp["_workspace"]).toBeDefined();
    expect(comp["_events"]).toEqual([]);
    expect(comp["_loading"]).toBe(false);
  });

  it("clears _error at start of load", async () => {
    el.projectId = "proj-1";
    el.workspaceId = "ws-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "old error";
    mockFetchWorkspace.mockResolvedValue(makeWorkspace());
    mockFetchWorkspaceEvents.mockResolvedValue([]);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("");
  });

  // ─── 4. _stopWorkspace ────────────────────────────────────────────────────

  it("_stopWorkspace does nothing when _workspace is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = null;
    mockStopWorkspace.mockClear();

    await (comp["_stopWorkspace"] as () => Promise<void>).call(el);

    expect(mockStopWorkspace).not.toHaveBeenCalled();
  });

  it("_stopWorkspace calls stopWorkspace with correct args", async () => {
    el.projectId = "proj-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ id: "ws-abc", status: "running" });
    mockStopWorkspace.mockResolvedValue(makeWorkspace({ status: "stopping" }));

    await (comp["_stopWorkspace"] as () => Promise<void>).call(el);

    expect(mockStopWorkspace).toHaveBeenCalledWith("proj-1", "ws-abc");
  });

  it("_stopWorkspace sets status to stopping optimistically", async () => {
    el.projectId = "proj-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "running" });
    mockStopWorkspace.mockResolvedValue(makeWorkspace({ status: "stopping" }));

    await (comp["_stopWorkspace"] as () => Promise<void>).call(el);

    expect((comp["_workspace"] as WorkspaceView).status).toBe("stopping");
  });

  // ─── 5. _destroyWorkspace ─────────────────────────────────────────────────

  it("_destroyWorkspace does nothing when _workspace is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = null;
    mockDestroyWorkspace.mockClear();

    await (comp["_destroyWorkspace"] as () => Promise<void>).call(el);

    expect(mockDestroyWorkspace).not.toHaveBeenCalled();
  });

  it("_destroyWorkspace calls destroyWorkspace with correct args", async () => {
    el.projectId = "proj-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ id: "ws-del" });
    mockDestroyWorkspace.mockResolvedValue(undefined);

    // _destroyWorkspace also calls _goBack which fires an event; intercept it
    el.addEventListener("workspace-back", () => {});

    await (comp["_destroyWorkspace"] as () => Promise<void>).call(el);

    expect(mockDestroyWorkspace).toHaveBeenCalledWith("proj-1", "ws-del");
  });

  it("_destroyWorkspace dispatches workspace-back event on success", async () => {
    el.projectId = "proj-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ id: "ws-del" });
    mockDestroyWorkspace.mockResolvedValue(undefined);

    const backEvents: Event[] = [];
    el.addEventListener("workspace-back", (e) => backEvents.push(e));

    await (comp["_destroyWorkspace"] as () => Promise<void>).call(el);

    expect(backEvents).toHaveLength(1);
  });

  // ─── 6. _goBack ───────────────────────────────────────────────────────────

  it("_goBack dispatches workspace-back event", () => {
    const backEvents: Event[] = [];
    el.addEventListener("workspace-back", (e) => backEvents.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any)._goBack();

    expect(backEvents).toHaveLength(1);
  });

  // ─── 7. _scheduleRefreshIfNeeded ─────────────────────────────────────────

  it("does not schedule refresh for running status", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "running" });
    vi.useFakeTimers();

    (comp["_scheduleRefreshIfNeeded"] as () => void).call(el);

    expect(comp["_refreshTimer"]).toBeNull();
    vi.useRealTimers();
  });

  it("schedules refresh for pending status", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "pending" });
    vi.useFakeTimers();

    (comp["_scheduleRefreshIfNeeded"] as () => void).call(el);

    expect(comp["_refreshTimer"]).not.toBeNull();
    vi.useRealTimers();
  });

  it("schedules refresh for creating status", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "creating" });
    vi.useFakeTimers();

    (comp["_scheduleRefreshIfNeeded"] as () => void).call(el);

    expect(comp["_refreshTimer"]).not.toBeNull();
    vi.useRealTimers();
  });

  it("schedules refresh for stopping status", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "stopping" });
    vi.useFakeTimers();

    (comp["_scheduleRefreshIfNeeded"] as () => void).call(el);

    expect(comp["_refreshTimer"]).not.toBeNull();
    vi.useRealTimers();
  });

  // ─── 8. _payloadSummary ───────────────────────────────────────────────────

  it("_payloadSummary returns empty string for empty payload", () => {
    const comp = el as unknown as Record<string, unknown>;

    const result = (
      comp["_payloadSummary"] as (
        payload: Record<string, unknown>,
      ) => string
    ).call(el, {});

    expect(result).toBe("");
  });

  it("_payloadSummary formats key-value pairs", () => {
    const comp = el as unknown as Record<string, unknown>;

    const result = (
      comp["_payloadSummary"] as (
        payload: Record<string, unknown>,
      ) => string
    ).call(el, { status: "running", branch: "main" });

    expect(result).toContain("status: running");
    expect(result).toContain("branch: main");
  });

  it("_payloadSummary skips null values", () => {
    const comp = el as unknown as Record<string, unknown>;

    const result = (
      comp["_payloadSummary"] as (
        payload: Record<string, unknown>,
      ) => string
    ).call(el, { status: "running", branch: null });

    expect(result).toContain("status: running");
    expect(result).not.toContain("branch");
  });

  it("_payloadSummary limits to 3 entries", () => {
    const comp = el as unknown as Record<string, unknown>;

    const result = (
      comp["_payloadSummary"] as (
        payload: Record<string, unknown>,
      ) => string
    ).call(el, {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
    });

    const parts = result.split(" · ");
    expect(parts.length).toBeLessThanOrEqual(3);
  });

  it("_payloadSummary stringifies non-string values", () => {
    const comp = el as unknown as Record<string, unknown>;

    const result = (
      comp["_payloadSummary"] as (
        payload: Record<string, unknown>,
      ) => string
    ).call(el, { count: 42 });

    expect(result).toContain("count: 42");
  });

  // ─── 9. Workspace state model ─────────────────────────────────────────────

  it("workspace can hold running status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ status: "running" });
    expect((comp["_workspace"] as WorkspaceView).status).toBe("running");
  });

  it("workspace can hold failed status with error message", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({
      status: "failed",
      error_message: "Out of memory",
    });
    expect((comp["_workspace"] as WorkspaceView).status).toBe("failed");
    expect((comp["_workspace"] as WorkspaceView).error_message).toBe(
      "Out of memory",
    );
  });

  it("workspace can have no coder_workspace_name (uses id fallback)", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ coder_workspace_name: null });
    expect((comp["_workspace"] as WorkspaceView).coder_workspace_name).toBeNull();
  });

  it("workspace can have no branch", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({ branch: null });
    expect((comp["_workspace"] as WorkspaceView).branch).toBeNull();
  });

  it("workspace can have no participant", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_workspace"] = makeWorkspace({
      participant_id: null,
      participant_name: null,
    });
    expect((comp["_workspace"] as WorkspaceView).participant_id).toBeNull();
    expect((comp["_workspace"] as WorkspaceView).participant_name).toBeNull();
  });

  it("events can be populated with multiple items", () => {
    const comp = el as unknown as Record<string, unknown>;
    const events = [
      makeEvent({ id: 1, event_type: "workspace.created" }),
      makeEvent({ id: 2, event_type: "workspace.running" }),
    ];
    comp["_events"] = events;
    expect((comp["_events"] as WorkspaceEvent[]).length).toBe(2);
    expect((comp["_events"] as WorkspaceEvent[])[0].event_type).toBe(
      "workspace.created",
    );
    expect((comp["_events"] as WorkspaceEvent[])[1].event_type).toBe(
      "workspace.running",
    );
  });

  // ─── 10. disconnectedCallback cleanup ─────────────────────────────────────

  it("clears refresh timer on disconnect", () => {
    const comp = el as unknown as Record<string, unknown>;
    vi.useFakeTimers();

    // Set up a fake timer ID
    comp["_refreshTimer"] = window.setTimeout(() => {}, 5000);
    expect(comp["_refreshTimer"]).not.toBeNull();

    el.disconnectedCallback();

    expect(comp["_refreshTimer"]).toBeNull();
    vi.useRealTimers();
  });
});
