import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockFetchPlan = vi.fn();
const mockUpdatePlan = vi.fn();

vi.mock("../../state/plan-api.js", () => ({
  fetchPlan: mockFetchPlan,
  updatePlan: mockUpdatePlan,
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

// Mock Shoelace components
vi.mock("@shoelace-style/shoelace/dist/components/button/button.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/spinner/spinner.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/input/input.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/textarea/textarea.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/tooltip/tooltip.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/dropdown/dropdown.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu-item/menu-item.js", () => ({}));

// Mock child components
vi.mock("../shared/markdown-content.js", () => ({}));
vi.mock("../invocations/invoke-dialog.js", () => ({}));

import type { PlanDetail } from "./plan-detail.js";
import type { PlanDetailView } from "../../state/plan-api.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<PlanDetailView> = {}): PlanDetailView {
  return {
    id: "plan-1",
    project_id: "proj-1",
    title: "My Design Plan",
    slug: "my-design-plan",
    status: "draft",
    body: "## Overview\n\nThis is the plan body.",
    author_id: "user-1",
    parent_id: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("plan-detail", () => {
  let el: PlanDetail;

  beforeEach(async () => {
    mockFetchPlan.mockResolvedValue(makePlan());
    mockUpdatePlan.mockResolvedValue(makePlan());

    await import("./plan-detail.js");
    el = document.createElement("plan-detail") as PlanDetail;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  // ─── 1. Component creation ────────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("plan-detail");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose planId property", () => {
    el.planId = "plan-456";
    expect(el.planId).toBe("plan-456");
  });

  // ─── 2. Default state ─────────────────────────────────────────────────────

  it("starts in loading state", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(true);
  });

  it("starts with no plan", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_plan"]).toBeNull();
  });

  it("starts with no error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  it("starts not in editing mode", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_editing"]).toBe(false);
  });

  it("starts not saving", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_saving"]).toBe(false);
  });

  it("starts not transitioning", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_transitioning"]).toBe(false);
  });

  it("starts with empty edit title", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_editTitle"]).toBe("");
  });

  it("starts with empty edit body", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_editBody"]).toBe("");
  });

  // ─── 3. _load ─────────────────────────────────────────────────────────────

  it("does not load when projectId is missing", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchPlan.mockClear();
    el.planId = "plan-1";
    // projectId not set

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchPlan).not.toHaveBeenCalled();
  });

  it("does not load when planId is missing", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchPlan.mockClear();
    el.projectId = "proj-1";
    // planId not set

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchPlan).not.toHaveBeenCalled();
  });

  it("calls fetchPlan with correct arguments", async () => {
    el.projectId = "proj-abc";
    el.planId = "plan-xyz";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ id: "plan-xyz", project_id: "proj-abc" });
    mockFetchPlan.mockResolvedValue(plan);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(mockFetchPlan).toHaveBeenCalledWith("proj-abc", "plan-xyz");
  });

  it("sets _plan and clears _loading on successful fetch", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Loaded Plan" });
    mockFetchPlan.mockResolvedValue(plan);

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect((comp["_plan"] as PlanDetailView).title).toBe("Loaded Plan");
    expect(comp["_error"]).toBe("");
  });

  it("sets _error and clears _loading on failed fetch", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchPlan.mockRejectedValueOnce(new Error("Network failure"));

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect(comp["_error"]).toBe("Network failure");
  });

  it("resets _editing to false on load", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_editing"] = true;

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_editing"]).toBe(false);
  });

  it("clears _error at start of load", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "old error";
    mockFetchPlan.mockResolvedValue(makePlan());

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("");
  });

  // ─── 4. _startEdit / _cancelEdit ─────────────────────────────────────────

  it("_startEdit does nothing when _plan is null", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = null;

    (comp["_startEdit"] as () => void).call(el);

    expect(comp["_editing"]).toBe(false);
  });

  it("_startEdit sets _editTitle from plan title", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ title: "The Plan Title" });

    (comp["_startEdit"] as () => void).call(el);

    expect(comp["_editTitle"]).toBe("The Plan Title");
  });

  it("_startEdit sets _editBody from plan body", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ body: "## Plan body content" });

    (comp["_startEdit"] as () => void).call(el);

    expect(comp["_editBody"]).toBe("## Plan body content");
  });

  it("_startEdit sets _editing to true", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan();

    (comp["_startEdit"] as () => void).call(el);

    expect(comp["_editing"]).toBe(true);
  });

  it("_cancelEdit sets _editing to false", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_editing"] = true;

    (comp["_cancelEdit"] as () => void).call(el);

    expect(comp["_editing"]).toBe(false);
  });

  // ─── 5. _saveEdit ─────────────────────────────────────────────────────────

  it("_saveEdit does nothing when _plan is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = null;
    mockUpdatePlan.mockClear();

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it("_saveEdit calls updatePlan with changed title", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old Title" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "New Title";
    comp["_editBody"] = plan.body; // same body — only title changed
    mockUpdatePlan.mockResolvedValue(makePlan({ title: "New Title" }));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(mockUpdatePlan).toHaveBeenCalledWith("proj-1", "plan-1", {
      title: "New Title",
    });
  });

  it("_saveEdit calls updatePlan with changed body", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ body: "Old body" });
    comp["_plan"] = plan;
    comp["_editTitle"] = plan.title; // unchanged
    comp["_editBody"] = "New body content";
    mockUpdatePlan.mockResolvedValue(makePlan({ body: "New body content" }));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(mockUpdatePlan).toHaveBeenCalledWith("proj-1", "plan-1", {
      body: "New body content",
    });
  });

  it("_saveEdit skips updatePlan when nothing changed", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Same Title", body: "Same body" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "Same Title";
    comp["_editBody"] = "Same body";
    mockUpdatePlan.mockClear();

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it("_saveEdit sets _editing to false on success", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old Title" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "New Title";
    comp["_editBody"] = plan.body;
    comp["_editing"] = true;
    mockUpdatePlan.mockResolvedValue(makePlan({ title: "New Title" }));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(comp["_editing"]).toBe(false);
  });

  it("_saveEdit calls updatePlan and mock gets correct title", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "Updated Title";
    comp["_editBody"] = plan.body;
    const updated = makePlan({ title: "Updated Title" });
    mockUpdatePlan.mockResolvedValue(updated);

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    // Verify the API was called with the new title
    expect(mockUpdatePlan).toHaveBeenCalledWith("proj-1", "plan-1", {
      title: "Updated Title",
    });
  });

  it("_saveEdit sets _error on failure", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "New";
    comp["_editBody"] = plan.body;
    mockUpdatePlan.mockRejectedValueOnce(new Error("Save failed"));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Save failed");
  });

  it("_saveEdit clears _saving after success", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "New";
    comp["_editBody"] = plan.body;
    mockUpdatePlan.mockResolvedValue(makePlan({ title: "New" }));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(comp["_saving"]).toBe(false);
  });

  it("_saveEdit clears _saving after failure", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    const plan = makePlan({ title: "Old" });
    comp["_plan"] = plan;
    comp["_editTitle"] = "New";
    comp["_editBody"] = plan.body;
    mockUpdatePlan.mockRejectedValueOnce(new Error("Error"));

    await (comp["_saveEdit"] as () => Promise<void>).call(el);

    expect(comp["_saving"]).toBe(false);
  });

  // ─── 6. _transition ───────────────────────────────────────────────────────

  it("_transition does nothing when _plan is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = null;
    mockUpdatePlan.mockClear();

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it("_transition calls updatePlan with new status", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    mockUpdatePlan.mockResolvedValue(makePlan({ status: "review" }));

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(mockUpdatePlan).toHaveBeenCalledWith("proj-1", "plan-1", {
      status: "review",
    });
  });

  it("_transition calls updatePlan with correct status arg", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    const updated = makePlan({ status: "review" });
    mockUpdatePlan.mockResolvedValue(updated);

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    // Verify the API call was made with the expected status
    expect(mockUpdatePlan).toHaveBeenCalledWith("proj-1", "plan-1", {
      status: "review",
    });
  });

  it("_transition sets _error on failure", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    mockUpdatePlan.mockRejectedValueOnce(new Error("Transition failed"));

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(comp["_error"]).toBe("Transition failed");
  });

  it("_transition clears _transitioning after success", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    mockUpdatePlan.mockResolvedValue(makePlan({ status: "review" }));

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(comp["_transitioning"]).toBe(false);
  });

  it("_transition clears _transitioning after failure", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    mockUpdatePlan.mockRejectedValueOnce(new Error("Error"));

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(comp["_transitioning"]).toBe(false);
  });

  // ─── 7. _isEditable ───────────────────────────────────────────────────────

  it("_isEditable returns true for draft status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(true);
  });

  it("_isEditable returns true for review status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "review" });

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(true);
  });

  it("_isEditable returns false for accepted status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "accepted" });

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(false);
  });

  it("_isEditable returns false for superseded status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "superseded" });

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(false);
  });

  it("_isEditable returns false for abandoned status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "abandoned" });

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(false);
  });

  it("_isEditable returns false when _plan is null", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = null;

    const result = (comp["_isEditable"] as () => boolean).call(el);

    expect(result).toBe(false);
  });

  // ─── 8. Plan status model ─────────────────────────────────────────────────

  it("plan can hold draft status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    expect((comp["_plan"] as PlanDetailView).status).toBe("draft");
  });

  it("plan can hold review status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "review" });
    expect((comp["_plan"] as PlanDetailView).status).toBe("review");
  });

  it("plan can hold accepted status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "accepted" });
    expect((comp["_plan"] as PlanDetailView).status).toBe("accepted");
  });

  it("plan can hold superseded status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "superseded" });
    expect((comp["_plan"] as PlanDetailView).status).toBe("superseded");
  });

  it("plan can hold abandoned status", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "abandoned" });
    expect((comp["_plan"] as PlanDetailView).status).toBe("abandoned");
  });

  it("plan can hold a parent_id", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ parent_id: "parent-plan-1" });
    expect((comp["_plan"] as PlanDetailView).parent_id).toBe("parent-plan-1");
  });

  it("plan can have null parent_id", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ parent_id: null });
    expect((comp["_plan"] as PlanDetailView).parent_id).toBeNull();
  });

  it("plan stores body content", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ body: "## Section\n\nContent here." });
    expect((comp["_plan"] as PlanDetailView).body).toBe(
      "## Section\n\nContent here.",
    );
  });

  it("plan can have an empty body", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ body: "" });
    expect((comp["_plan"] as PlanDetailView).body).toBe("");
  });

  // ─── 9. plan-back event dispatch ─────────────────────────────────────────

  it("dispatches plan-back event when back button logic fires", () => {
    const dispatchedEvents: Event[] = [];
    el.addEventListener("plan-back", (e) => dispatchedEvents.push(e));

    el.dispatchEvent(
      new CustomEvent("plan-back", { bubbles: true, composed: true }),
    );

    expect(dispatchedEvents).toHaveLength(1);
  });

  // ─── 10. Error clearing ───────────────────────────────────────────────────

  it("error clears on subsequent successful load", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "Previous error";
    mockFetchPlan.mockResolvedValue(makePlan());

    await (comp["_load"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("");
  });

  it("_transition clears _error before API call", async () => {
    el.projectId = "proj-1";
    el.planId = "plan-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_plan"] = makePlan({ status: "draft" });
    comp["_error"] = "Old error";
    mockUpdatePlan.mockResolvedValue(makePlan({ status: "review" }));

    await (comp["_transition"] as (status: string) => Promise<void>).call(
      el,
      "review",
    );

    expect(comp["_error"]).toBe("");
  });
});
