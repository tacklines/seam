import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionView } from "./app-state.js";

// Mock auth-state before importing session-api
vi.mock("./auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

import { createSession, joinSessionByCode } from "./session-api.js";

const mockSession: SessionView = {
  id: "sess-1",
  code: "ABCDEF",
  name: "Test Session",
  project_id: "proj-1",
  project_name: "Test Project",
  created_at: "2026-01-01T00:00:00Z",
  participants: [
    {
      id: "p-1",
      display_name: "Alice",
      participant_type: "human",
      sponsor_id: null,
      joined_at: "2026-01-01T00:00:00Z",
      is_online: true,
    },
  ],
};

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(ok ? "" : String(body)),
  });
}

describe("createSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/sessions with auth header", async () => {
    const fetchSpy = mockFetch({ session: mockSession, agent_code: "AGT-XYZ" });
    globalThis.fetch = fetchSpy;

    const result = await createSession({
      project_id: "proj-1",
      name: "Sprint 1",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(opts.body as string)).toEqual({
      project_id: "proj-1",
      name: "Sprint 1",
    });
    expect(result.session.code).toBe("ABCDEF");
    expect(result.agent_code).toBe("AGT-XYZ");
  });

  it("omits undefined params from request body", async () => {
    const fetchSpy = mockFetch({ session: mockSession, agent_code: "AGT-XYZ" });
    globalThis.fetch = fetchSpy;

    await createSession({});

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({});
  });

  it("throws on non-ok response", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });
    globalThis.fetch = fetchSpy;

    await expect(createSession({ project_id: "proj-1" })).rejects.toThrow(
      "Forbidden",
    );
  });

  it("throws with HTTP status when response body is empty", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    });
    globalThis.fetch = fetchSpy;

    await expect(createSession({})).rejects.toThrow("HTTP 500");
  });
});

describe("joinSessionByCode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/sessions/:code/join with display_name", async () => {
    const fetchSpy = mockFetch({
      participant_id: "p-1",
      session: mockSession,
      agent_code: "AGT-123",
    });
    globalThis.fetch = fetchSpy;

    const result = await joinSessionByCode("ABCDEF", "Alice");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABCDEF/join");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
    expect(JSON.parse(opts.body as string)).toEqual({ display_name: "Alice" });
    expect(result.participant_id).toBe("p-1");
    expect(result.session.code).toBe("ABCDEF");
  });

  it("throws on non-ok response", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Session not found"),
    });
    globalThis.fetch = fetchSpy;

    await expect(joinSessionByCode("XXXXXX", "Bob")).rejects.toThrow(
      "Session not found",
    );
  });

  it("includes auth header when token present", async () => {
    const fetchSpy = mockFetch({
      participant_id: "p-2",
      session: mockSession,
      agent_code: "AGT-456",
    });
    globalThis.fetch = fetchSpy;

    await joinSessionByCode("ABCDEF", "Charlie");

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
  });
});
