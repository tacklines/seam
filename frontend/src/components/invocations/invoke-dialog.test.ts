import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
vi.mock("../../state/invocation-api.js", () => ({
  createInvocation: vi.fn(),
  checkCoderStatus: vi
    .fn()
    .mockResolvedValue({ enabled: true, connected: true }),
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string) => key,
}));

// Mock Shoelace components so they don't fail in jsdom
vi.mock(
  "@shoelace-style/shoelace/dist/components/dialog/dialog.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/input/input.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/textarea/textarea.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/select/select.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/option/option.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/button/button.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));

import type { InvokeDialog } from "./invoke-dialog.js";

describe("invoke-dialog", () => {
  let el: InvokeDialog;

  beforeEach(async () => {
    await import("./invoke-dialog.js");
    el = document.createElement("invoke-dialog") as InvokeDialog;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("invoke-dialog");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose taskId property", () => {
    el.taskId = "task-456";
    expect(el.taskId).toBe("task-456");
  });

  it("show() sets _open to true", () => {
    // Cast to access private state for testing
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_open"]).toBe(false);
    el.show();
    expect(comp["_open"]).toBe(true);
  });

  it("show() clears error and submitting state", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "some error";
    comp["_submitting"] = true;
    el.show();
    expect(comp["_error"]).toBe("");
    expect(comp["_submitting"]).toBe(false);
  });

  it("show() clears resume session ID", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_resumeSessionId"] = "session-abc";
    el.show();
    expect(comp["_resumeSessionId"]).toBe("");
  });

  it("showWithPrompt() sets _open to true and prefills prompt", () => {
    const comp = el as unknown as Record<string, unknown>;
    el.showWithPrompt("Fix the login bug");
    expect(comp["_open"]).toBe(true);
    expect(comp["_prompt"]).toBe("Fix the login bug");
  });

  it("showWithPrompt() clears error state", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "previous error";
    el.showWithPrompt("test prompt");
    expect(comp["_error"]).toBe("");
  });

  it("showWithPerspective() sets perspective and prompt", () => {
    const comp = el as unknown as Record<string, unknown>;
    el.showWithPerspective("reviewer", "Review the PR");
    expect(comp["_open"]).toBe(true);
    expect(comp["_perspective"]).toBe("reviewer");
    expect(comp["_prompt"]).toBe("Review the PR");
  });

  it("showWithPerspective() clears resume session ID", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_resumeSessionId"] = "old-session";
    el.showWithPerspective("planner", "Plan the feature");
    expect(comp["_resumeSessionId"]).toBe("");
  });

  it("showContinue() sets resume session ID and perspective", () => {
    const comp = el as unknown as Record<string, unknown>;
    el.showContinue({
      claude_session_id: "abc-123-session",
      agent_perspective: "coder",
    });
    expect(comp["_open"]).toBe(true);
    expect(comp["_resumeSessionId"]).toBe("abc-123-session");
    expect(comp["_perspective"]).toBe("coder");
  });

  it("showContinue() clears prompt to let user set new instructions", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_prompt"] = "old prompt";
    el.showContinue({
      claude_session_id: "abc-session",
      agent_perspective: "reviewer",
    });
    expect(comp["_prompt"]).toBe("");
  });

  it("hide() sets _open to false", () => {
    const comp = el as unknown as Record<string, unknown>;
    el.show();
    expect(comp["_open"]).toBe(true);
    el.hide();
    expect(comp["_open"]).toBe(false);
  });

  it("submit with empty prompt sets error", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_prompt"] = "";
    comp["_open"] = true;

    // Call the private _submit method
    await (comp["_submit"] as () => Promise<void>).call(el);

    // Should have set an error, not closed
    expect(comp["_error"]).toBeTruthy();
    expect(comp["_open"]).toBe(true);
  });

  it("submit with whitespace-only prompt sets error", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_prompt"] = "   ";
    comp["_open"] = true;

    await (comp["_submit"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBeTruthy();
    expect(comp["_open"]).toBe(true);
  });

  it("default perspective is coder", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_perspective"]).toBe("coder");
  });

  it("default state has _open as false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_open"]).toBe(false);
  });
});
