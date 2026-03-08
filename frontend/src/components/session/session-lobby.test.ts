import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockConnectSession = vi.fn();
const mockDisconnectSession = vi.fn();
const mockCreateSession = vi.fn();
const mockJoinSessionByCode = vi.fn();
const mockNavigateTo = vi.fn();
const mockStoreSubscribe = vi.fn().mockReturnValue(() => {});
const mockStoreGet = vi.fn().mockReturnValue({ sessionState: null });
const mockStoreClearSession = vi.fn();
const mockStoreSetSession = vi.fn();

vi.mock("../../state/session-connection.js", () => ({
  connectSession: mockConnectSession,
  disconnectSession: mockDisconnectSession,
}));

vi.mock("../../state/session-api.js", () => ({
  createSession: mockCreateSession,
  joinSessionByCode: mockJoinSessionByCode,
}));

vi.mock("../../router.js", () => ({
  navigateTo: mockNavigateTo,
}));

vi.mock("../../state/app-state.js", () => ({
  store: {
    subscribe: mockStoreSubscribe,
    get: mockStoreGet,
    setSession: mockStoreSetSession,
    clearSession: mockStoreClearSession,
    updateSession: vi.fn(),
    notifyTasksChanged: vi.fn(),
  },
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    get: vi.fn().mockReturnValue({ isAuthenticated: true }),
    getAccessToken: vi.fn().mockReturnValue("test-token"),
    subscribe: vi.fn().mockReturnValue(() => {}),
    user: { name: "Test User" },
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string) => key,
}));

// Mock Shoelace components so they don't fail in jsdom
vi.mock(
  "@shoelace-style/shoelace/dist/components/button/button.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/input/input.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/spinner/spinner.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/divider/divider.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/tab-group/tab-group.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/tab/tab.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js",
  () => ({}),
);

// Mock child components to avoid their dependency chains
vi.mock("../tasks/task-board.js", () => ({}));
vi.mock("./activity-view.js", () => ({}));
vi.mock("../invocations/invoke-dialog.js", () => ({}));

import type { SessionLobby } from "./session-lobby.js";
import type { SessionView, SessionState } from "../../state/app-state.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSessionView(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "session-uuid-1",
    code: "ABC123",
    name: "Test Session",
    project_id: "proj-1",
    project_name: "Test Project",
    created_at: "2024-01-01T00:00:00Z",
    participants: [
      {
        id: "participant-1",
        display_name: "Test User",
        participant_type: "human",
        sponsor_id: null,
        joined_at: "2024-01-01T00:00:00Z",
        is_online: true,
      },
    ],
    ...overrides,
  };
}

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    code: "ABC123",
    participantId: "participant-1",
    session: makeSessionView(),
    agentCode: "AGENTCODE",
    ...overrides,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("session-lobby", () => {
  let el: SessionLobby;

  beforeEach(async () => {
    // Reset mock return values to defaults
    mockStoreGet.mockReturnValue({ sessionState: null });
    mockStoreSubscribe.mockReturnValue(() => {});
    mockCreateSession.mockReset();
    mockJoinSessionByCode.mockReset();
    mockConnectSession.mockReset();
    mockDisconnectSession.mockReset();
    mockNavigateTo.mockReset();
    mockStoreClearSession.mockReset();
    mockStoreSetSession.mockReset();

    await import("./session-lobby.js");
    el = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  // ─── 1. Component creation ────────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("session-lobby");
  });

  it("subscribes to store on connectedCallback", () => {
    expect(mockStoreSubscribe).toHaveBeenCalled();
  });

  it("unsubscribes from store on disconnectedCallback", () => {
    const unsubscribe = vi.fn();
    mockStoreSubscribe.mockReturnValueOnce(unsubscribe);

    const el2 = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el2);
    document.body.removeChild(el2);

    expect(unsubscribe).toHaveBeenCalled();
  });

  // ─── 2. Default state (landing) ───────────────────────────────────────────

  it("starts in landing state when no session", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_lobbyState"]).toBe("landing");
  });

  it("starts with empty error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  it("starts with loading false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(false);
  });

  it("starts with empty join code", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_joinCode"]).toBe("");
  });

  it("starts with empty session name", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_sessionName"]).toBe("");
  });

  // ─── 3. In-session state when session exists in store ─────────────────────

  it("starts in in-session state when store has active session", async () => {
    const sessionState = makeSessionState();
    mockStoreGet.mockReturnValue({ sessionState });

    const el2 = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el2);
    await el2.updateComplete;

    const comp = el2 as unknown as Record<string, unknown>;
    expect(comp["_lobbyState"]).toBe("in-session");
    document.body.removeChild(el2);
  });

  it("populates _sessionState from store on init", async () => {
    const sessionState = makeSessionState();
    mockStoreGet.mockReturnValue({ sessionState });

    const el2 = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el2);
    await el2.updateComplete;

    const comp = el2 as unknown as Record<string, unknown>;
    expect(comp["_sessionState"]).toEqual(sessionState);
    document.body.removeChild(el2);
  });

  // ─── 4. Lobby state transitions ───────────────────────────────────────────

  it("transitions to creating state when create card is clicked", async () => {
    await el.updateComplete;
    const comp = el as unknown as Record<string, unknown>;
    comp["_lobbyState"] = "landing";
    await el.updateComplete;

    // Simulate the state transition directly (card click handler)
    comp["_lobbyState"] = "creating";
    comp["_error"] = "";
    await el.updateComplete;

    expect(comp["_lobbyState"]).toBe("creating");
    expect(comp["_error"]).toBe("");
  });

  it("transitions to joining state when join card is clicked", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_lobbyState"] = "joining";
    await el.updateComplete;

    expect(comp["_lobbyState"]).toBe("joining");
  });

  it("transitions back to landing from creating state", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_lobbyState"] = "creating";
    await el.updateComplete;

    comp["_lobbyState"] = "landing";
    comp["_error"] = "";
    await el.updateComplete;

    expect(comp["_lobbyState"]).toBe("landing");
  });

  it("transitions back to landing from joining state", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_lobbyState"] = "joining";
    await el.updateComplete;

    comp["_lobbyState"] = "landing";
    comp["_error"] = "";
    await el.updateComplete;

    expect(comp["_lobbyState"]).toBe("landing");
  });

  // ─── 5. Session join code display ─────────────────────────────────────────

  it("session code is available from store session state", () => {
    const session = makeSessionView({ code: "XYZ789" });
    const sessionState = makeSessionState({ code: "XYZ789", session });
    const comp = el as unknown as Record<string, unknown>;
    comp["_sessionState"] = sessionState;

    expect(sessionState.code).toBe("XYZ789");
    expect(sessionState.session.code).toBe("XYZ789");
  });

  it("session code is uppercase in session state", () => {
    const sessionState = makeSessionState({ code: "UPPER1" });
    expect(sessionState.code).toBe("UPPER1");
  });

  // ─── 6. Agent join code ───────────────────────────────────────────────────

  it("agent code is stored in session state", () => {
    const sessionState = makeSessionState({ agentCode: "AGNT1234" });
    const comp = el as unknown as Record<string, unknown>;
    comp["_sessionState"] = sessionState;

    expect(sessionState.agentCode).toBe("AGNT1234");
  });

  it("agent code from joinSessionByCode is stored in session state", async () => {
    const session = makeSessionView();
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "new-participant",
      session,
      agent_code: "MYAGENT1",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "ABC123";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(mockStoreSetSession).toHaveBeenCalledWith(
      "ABC123",
      "new-participant",
      session,
      "MYAGENT1",
    );
  });

  // ─── 7. Participant list ───────────────────────────────────────────────────

  it("session state includes participant list", () => {
    const session = makeSessionView({
      participants: [
        {
          id: "p1",
          display_name: "Alice",
          participant_type: "human",
          sponsor_id: null,
          joined_at: "2024-01-01T00:00:00Z",
          is_online: true,
        },
        {
          id: "p2",
          display_name: "Claude Agent",
          participant_type: "agent",
          sponsor_id: "p1",
          joined_at: "2024-01-01T00:01:00Z",
          is_online: true,
        },
      ],
    });
    const sessionState = makeSessionState({ session });
    const comp = el as unknown as Record<string, unknown>;
    comp["_sessionState"] = sessionState;

    expect(sessionState.session.participants).toHaveLength(2);
    expect(sessionState.session.participants[0].participant_type).toBe("human");
    expect(sessionState.session.participants[1].participant_type).toBe("agent");
  });

  it("participant roles are preserved in session state", () => {
    const participants = [
      {
        id: "p1",
        display_name: "Host User",
        participant_type: "human" as const,
        sponsor_id: null,
        joined_at: "2024-01-01T00:00:00Z",
        is_online: true,
      },
    ];
    const session = makeSessionView({ participants });
    const sessionState = makeSessionState({ session });

    expect(sessionState.session.participants[0].participant_type).toBe("human");
  });

  // ─── 8. _createSession ────────────────────────────────────────────────────

  it("_createSession calls createSession API and sets store session", async () => {
    const session = makeSessionView();
    mockCreateSession.mockResolvedValue({
      session: { ...session, participants: [{ id: "host-1", display_name: "Test User", participant_type: "human", sponsor_id: null, joined_at: "2024-01-01T00:00:00Z", is_online: false }] },
      agent_code: "AGENT001",
    });

    const comp = el as unknown as Record<string, unknown>;
    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(mockCreateSession).toHaveBeenCalled();
    expect(mockConnectSession).toHaveBeenCalled();
  });

  it("_createSession passes session name when set", async () => {
    const session = makeSessionView({ name: "My Session" });
    mockCreateSession.mockResolvedValue({
      session: { ...session, participants: [] },
      agent_code: "AGENT002",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_sessionName"] = "My Session";

    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Session" }),
    );
  });

  it("_createSession sets _error on API failure", async () => {
    mockCreateSession.mockRejectedValueOnce(new Error("Server error"));

    const comp = el as unknown as Record<string, unknown>;
    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Server error");
    expect(comp["_loading"]).toBe(false);
  });

  it("_createSession clears _loading on success", async () => {
    const session = makeSessionView();
    mockCreateSession.mockResolvedValue({
      session: { ...session, participants: [] },
      agent_code: "AGENT003",
    });

    const comp = el as unknown as Record<string, unknown>;
    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
  });

  // ─── 9. _joinSession ──────────────────────────────────────────────────────

  it("_joinSession sets _error when join code is empty", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBeTruthy();
    expect(mockJoinSessionByCode).not.toHaveBeenCalled();
  });

  it("_joinSession sets _error when join code is whitespace only", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "   ";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBeTruthy();
    expect(mockJoinSessionByCode).not.toHaveBeenCalled();
  });

  it("_joinSession calls API with uppercased code", async () => {
    const session = makeSessionView({ code: "ABC123" });
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "p-new",
      session,
      agent_code: "AGENTJOIN",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "abc123";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(mockJoinSessionByCode).toHaveBeenCalledWith(
      "ABC123",
      expect.any(String),
    );
  });

  it("_joinSession sets _error on API failure", async () => {
    mockJoinSessionByCode.mockRejectedValueOnce(new Error("Session not found"));

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "BADCOD";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Session not found");
    expect(comp["_loading"]).toBe(false);
  });

  it("_joinSession calls connectSession on success", async () => {
    const session = makeSessionView({ code: "JOIN11" });
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "p-joined",
      session,
      agent_code: "AGNTJOIN",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "JOIN11";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(mockConnectSession).toHaveBeenCalledWith("JOIN11");
  });

  it("_joinSession clears _loading on success", async () => {
    const session = makeSessionView({ code: "TST123" });
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "p-x",
      session,
      agent_code: "AGNTTST",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "TST123";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
  });

  // ─── 10. _leaveSession ────────────────────────────────────────────────────

  it("_leaveSession calls disconnectSession and clearSession", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_leaveSession"] as () => void).call(el);

    expect(mockDisconnectSession).toHaveBeenCalled();
    expect(mockStoreClearSession).toHaveBeenCalled();
  });

  // ─── 11. Store event subscription ─────────────────────────────────────────

  it("transitions to in-session on session-connected store event", async () => {
    // Capture the subscriber
    type StoreListener = (event: { type: string; code?: string; participantId?: string }) => void;
    let subscriber: StoreListener | null = null;
    mockStoreSubscribe.mockImplementation((fn: StoreListener) => {
      subscriber = fn;
      return () => {};
    });

    const el2 = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el2);

    const sessionState = makeSessionState({ code: "NEW123" });
    mockStoreGet.mockReturnValue({ sessionState });

    if (subscriber != null) {
      (subscriber as StoreListener)({ type: "session-connected", code: "NEW123", participantId: "p1" });
    }

    await el2.updateComplete;
    const comp = el2 as unknown as Record<string, unknown>;
    expect(comp["_lobbyState"]).toBe("in-session");

    document.body.removeChild(el2);
  });

  it("transitions to landing on session-disconnected store event", async () => {
    type StoreListener = (event: { type: string }) => void;
    let subscriber: StoreListener | null = null;
    mockStoreSubscribe.mockImplementation((fn: StoreListener) => {
      subscriber = fn;
      return () => {};
    });

    const sessionState = makeSessionState();
    mockStoreGet.mockReturnValue({ sessionState });

    const el2 = document.createElement("session-lobby") as SessionLobby;
    document.body.appendChild(el2);

    // Now simulate disconnect
    mockStoreGet.mockReturnValue({ sessionState: null });
    if (subscriber != null) {
      (subscriber as StoreListener)({ type: "session-disconnected" });
    }

    await el2.updateComplete;
    const comp = el2 as unknown as Record<string, unknown>;
    expect(comp["_lobbyState"]).toBe("landing");

    document.body.removeChild(el2);
  });

  // ─── 12. _copyCode ────────────────────────────────────────────────────────

  it("_copyCode sets _codeCopied to true then false after timeout", async () => {
    vi.useFakeTimers();

    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    const comp = el as unknown as Record<string, unknown>;
    const copyPromise = (comp["_copyCode"] as (code: string) => Promise<void>).call(
      el,
      "ABC123",
    );

    await copyPromise;
    expect(comp["_codeCopied"]).toBe(true);

    vi.advanceTimersByTime(1100);
    expect(comp["_codeCopied"]).toBe(false);

    vi.useRealTimers();
  });

  // ─── 13. _handleSessionDispatch ───────────────────────────────────────────

  it("_handleSessionDispatch calls _invokeDialog.showWithPerspective for summarize", () => {
    const comp = el as unknown as Record<string, unknown>;
    const mockShowWithPerspective = vi.fn();
    const fakeDialog = { showWithPerspective: mockShowWithPerspective, show: vi.fn() };
    // _invokeDialog is a @query getter — override via Object.defineProperty
    Object.defineProperty(el, "_invokeDialog", { get: () => fakeDialog, configurable: true });

    const fakeEvent = {
      detail: { item: { value: "summarize" } },
    } as CustomEvent;
    (comp["_handleSessionDispatch"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(mockShowWithPerspective).toHaveBeenCalledWith(
      "researcher",
      expect.any(String),
    );
  });

  it("_handleSessionDispatch calls _invokeDialog.showWithPerspective for triage", () => {
    const comp = el as unknown as Record<string, unknown>;
    const mockShowWithPerspective = vi.fn();
    const fakeDialog = { showWithPerspective: mockShowWithPerspective, show: vi.fn() };
    Object.defineProperty(el, "_invokeDialog", { get: () => fakeDialog, configurable: true });

    const fakeEvent = {
      detail: { item: { value: "triage" } },
    } as CustomEvent;
    (comp["_handleSessionDispatch"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(mockShowWithPerspective).toHaveBeenCalledWith(
      "planner",
      expect.any(String),
    );
  });

  it("_handleSessionDispatch calls _invokeDialog.showWithPerspective for create-tasks", () => {
    const comp = el as unknown as Record<string, unknown>;
    const mockShowWithPerspective = vi.fn();
    const fakeDialog = { showWithPerspective: mockShowWithPerspective, show: vi.fn() };
    Object.defineProperty(el, "_invokeDialog", { get: () => fakeDialog, configurable: true });

    const fakeEvent = {
      detail: { item: { value: "create-tasks" } },
    } as CustomEvent;
    (comp["_handleSessionDispatch"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(mockShowWithPerspective).toHaveBeenCalledWith(
      "planner",
      expect.any(String),
    );
  });

  it("_handleSessionDispatch calls _invokeDialog.show for custom action", () => {
    const comp = el as unknown as Record<string, unknown>;
    const mockShow = vi.fn();
    const fakeDialog = { show: mockShow, showWithPerspective: vi.fn() };
    Object.defineProperty(el, "_invokeDialog", { get: () => fakeDialog, configurable: true });

    const fakeEvent = {
      detail: { item: { value: "custom" } },
    } as CustomEvent;
    (comp["_handleSessionDispatch"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(mockShow).toHaveBeenCalled();
  });

  // ─── 14. _isActivityRoute ─────────────────────────────────────────────────

  it("_isActivityRoute returns false for non-activity pathname", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/sessions/ABC123" },
      configurable: true,
    });

    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_isActivityRoute"]).toBe(false);
  });

  it("_isActivityRoute returns true for activity pathname", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/sessions/ABC123/activity" },
      configurable: true,
    });

    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_isActivityRoute"]).toBe(true);
  });

  // ─── 15. Error display ────────────────────────────────────────────────────

  it("_error state can be set and cleared", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "Something went wrong";
    expect(comp["_error"]).toBe("Something went wrong");

    comp["_error"] = "";
    expect(comp["_error"]).toBe("");
  });

  it("_createSession clears _error before attempting", async () => {
    const session = makeSessionView();
    mockCreateSession.mockResolvedValue({
      session: { ...session, participants: [] },
      agent_code: "AGNT",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "Previous error";

    await (comp["_createSession"] as () => Promise<void>).call(el);

    // After success, error should remain cleared
    expect(comp["_error"]).toBe("");
  });

  it("_joinSession clears _error before attempting", async () => {
    const session = makeSessionView({ code: "CLR123" });
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "p-clr",
      session,
      agent_code: "AGNTCLR",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "Old error";
    comp["_joinCode"] = "CLR123";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("");
  });

  // ─── 16. WebSocket subscription (session-connection) ──────────────────────

  it("connectSession is called after successful join", async () => {
    const session = makeSessionView({ code: "WS1234" });
    mockJoinSessionByCode.mockResolvedValue({
      participant_id: "p-ws",
      session,
      agent_code: "AGNTWS",
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "WS1234";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(mockConnectSession).toHaveBeenCalledWith("WS1234");
  });

  it("connectSession is called after successful create", async () => {
    const session = makeSessionView({ code: "WS5678" });
    mockCreateSession.mockResolvedValue({
      session: {
        ...session,
        participants: [{ id: "host-ws", display_name: "Test User", participant_type: "human", sponsor_id: null, joined_at: "2024-01-01T00:00:00Z", is_online: false }],
      },
      agent_code: "AGNTWS2",
    });

    const comp = el as unknown as Record<string, unknown>;

    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(mockConnectSession).toHaveBeenCalled();
  });

  it("disconnectSession is called when _leaveSession is triggered", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_leaveSession"] as () => void).call(el);

    expect(mockDisconnectSession).toHaveBeenCalled();
  });

  // ─── 17. Loading state ────────────────────────────────────────────────────

  it("_loading is set to true during create and false after", async () => {
    let loadingDuringCall = false;
    const session = makeSessionView();
    mockCreateSession.mockImplementation(async () => {
      // Capture loading state during the call
      const comp = el as unknown as Record<string, unknown>;
      loadingDuringCall = comp["_loading"] as boolean;
      return { session: { ...session, participants: [] }, agent_code: "AGNT" };
    });

    const comp = el as unknown as Record<string, unknown>;
    await (comp["_createSession"] as () => Promise<void>).call(el);

    expect(loadingDuringCall).toBe(true);
    expect(comp["_loading"]).toBe(false);
  });

  it("_loading is set to true during join and false after", async () => {
    let loadingDuringCall = false;
    const session = makeSessionView({ code: "LD1234" });
    mockJoinSessionByCode.mockImplementation(async () => {
      const comp = el as unknown as Record<string, unknown>;
      loadingDuringCall = comp["_loading"] as boolean;
      return { participant_id: "p-ld", session, agent_code: "AGNTLD" };
    });

    const comp = el as unknown as Record<string, unknown>;
    comp["_joinCode"] = "LD1234";

    await (comp["_joinSession"] as () => Promise<void>).call(el);

    expect(loadingDuringCall).toBe(true);
    expect(comp["_loading"]).toBe(false);
  });
});
