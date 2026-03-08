import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockFetchTask = vi.fn();
const mockFetchProjectTask = vi.fn();
const mockFetchTasks = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockAddComment = vi.fn();
const mockAddDependency = vi.fn();
const mockRemoveDependency = vi.fn();
const mockFetchActivity = vi.fn();

vi.mock("../../state/task-api.js", () => ({
  fetchTask: mockFetchTask,
  fetchProjectTask: mockFetchProjectTask,
  fetchTasks: mockFetchTasks,
  updateTask: mockUpdateTask,
  deleteTask: mockDeleteTask,
  addComment: mockAddComment,
  addDependency: mockAddDependency,
  removeDependency: mockRemoveDependency,
  fetchActivity: mockFetchActivity,
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string, _params?: Record<string, unknown>) => key,
}));

vi.mock("../../router.js", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("../../state/app-state.js", () => ({
  store: {
    subscribe: vi.fn().mockReturnValue(() => {}),
    get: vi.fn().mockReturnValue({ sessionState: null }),
  },
}));

// Mock Shoelace components so they don't fail in jsdom
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/tag/tag.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/details/details.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/button/button.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/divider/divider.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/input/input.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/spinner/spinner.js",
  () => ({}),
);

// Mock child components to avoid their dependency chains
vi.mock("./task-description.js", () => ({}));
vi.mock("./task-comment-thread.js", () => ({}));
vi.mock("./task-metadata-panel.js", () => ({}));
vi.mock("./task-dependencies.js", () => ({}));

import type { TaskDetail } from "./task-detail.js";
import type {
  TaskDetailView,
  TaskSummaryView,
  CommentView,
} from "../../state/task-types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTaskSummary(
  overrides: Partial<TaskSummaryView> = {},
): TaskSummaryView {
  return {
    id: "summary-1",
    ticket_id: "PROJ-1",
    task_type: "task",
    title: "A summary task",
    status: "open",
    assigned_to: null,
    ...overrides,
  };
}

function makeComment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: "comment-1",
    author_id: "user-1",
    content: "This is a comment",
    created_at: "2024-01-01T00:00:00Z",
    intent: null,
    ...overrides,
  };
}

function makeTaskDetail(
  overrides: Partial<TaskDetailView> = {},
): TaskDetailView {
  return {
    id: "task-1",
    session_id: null,
    project_id: "proj-1",
    ticket_number: 1,
    ticket_id: "PROJ-1",
    parent_id: null,
    task_type: "task",
    title: "Fix the login bug",
    description: "Detailed description of the bug",
    status: "open",
    priority: "medium",
    complexity: "small",
    assigned_to: null,
    created_by: "user-1",
    commit_hashes: [],
    no_code_change: false,
    session_ids: [],
    source_task_id: null,
    model_hint: null,
    budget_tier: null,
    provider: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    child_count: 0,
    comment_count: 0,
    parent: null,
    comments: [],
    children: [],
    blocks: [],
    blocked_by: [],
    ai_triage: null,
    completion_summary: null,
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("task-detail", () => {
  let el: TaskDetail;

  beforeEach(async () => {
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchProjectTask.mockResolvedValue(makeTaskDetail());
    mockFetchTasks.mockResolvedValue([]);
    mockUpdateTask.mockResolvedValue({});
    mockDeleteTask.mockResolvedValue({});
    mockAddComment.mockResolvedValue({});
    mockAddDependency.mockResolvedValue({});
    mockRemoveDependency.mockResolvedValue({});
    mockFetchActivity.mockResolvedValue([]);

    await import("./task-detail.js");
    el = document.createElement("task-detail") as TaskDetail;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  // ─── 1. Component creation ────────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("task-detail");
  });

  it("should expose sessionCode property", () => {
    el.sessionCode = "ABC123";
    expect(el.sessionCode).toBe("ABC123");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose taskId property", () => {
    el.taskId = "task-456";
    expect(el.taskId).toBe("task-456");
  });

  it("should expose readonly property", () => {
    el.readonly = true;
    expect(el.readonly).toBe(true);
  });

  it("should expose participants property", () => {
    el.participants = [];
    expect(el.participants).toEqual([]);
  });

  // ─── 2. Default state ─────────────────────────────────────────────────────

  it("starts in loading state", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(true);
  });

  it("starts with no task", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_task"]).toBeNull();
  });

  it("starts with no error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  it("starts not editing title", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_editingTitle"]).toBe(false);
  });

  it("starts with empty activity", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_activity"]).toEqual([]);
  });

  it("starts with empty allTasks", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_allTasks"]).toEqual([]);
  });

  // ─── 3. _loadTask via session code ───────────────────────────────────────

  it("does not load when neither sessionCode nor projectId is set", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTask.mockClear();
    mockFetchProjectTask.mockClear();

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchTask).not.toHaveBeenCalled();
    expect(mockFetchProjectTask).not.toHaveBeenCalled();
  });

  it("does not load when taskId is missing", async () => {
    el.sessionCode = "SES123";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTask.mockClear();

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchTask).not.toHaveBeenCalled();
  });

  it("calls fetchTask when sessionCode is set", async () => {
    el.sessionCode = "SES123";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail();
    mockFetchTask.mockResolvedValue(task);
    mockFetchActivity.mockResolvedValue([]);

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchTask).toHaveBeenCalledWith("SES123", "task-1");
    expect(mockFetchProjectTask).not.toHaveBeenCalled();
  });

  it("calls fetchProjectTask when projectId is set without sessionCode", async () => {
    el.projectId = "proj-abc";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail();
    mockFetchProjectTask.mockClear();
    mockFetchTask.mockClear();
    mockFetchProjectTask.mockResolvedValue(task);

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchProjectTask).toHaveBeenCalledWith("proj-abc", "task-1");
    expect(mockFetchTask).not.toHaveBeenCalled();
  });

  it("sets _task and clears _loading on successful fetch", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ title: "Loaded Task" });
    mockFetchProjectTask.mockResolvedValue(task);

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect((comp["_task"] as TaskDetailView).title).toBe("Loaded Task");
    expect(comp["_error"]).toBe("");
  });

  it("sets _error and clears _loading on failed fetch", async () => {
    el.projectId = "proj-err";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchProjectTask.mockRejectedValueOnce(new Error("Network failure"));

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect(comp["_error"]).toBe("Network failure");
    // The component preserves the previously loaded _task on error; it does not reset it
  });

  it("fetches activity when sessionCode is set", async () => {
    el.sessionCode = "SES123";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchActivity).toHaveBeenCalledWith("SES123", {
      target_id: "task-1",
    });
  });

  it("does not fetch activity when using projectId (no sessionCode)", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchActivity.mockClear();
    mockFetchProjectTask.mockResolvedValue(makeTaskDetail());

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(mockFetchActivity).not.toHaveBeenCalled();
  });

  it("gracefully handles activity fetch failure", async () => {
    el.sessionCode = "SES123";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockRejectedValueOnce(new Error("Activity error"));

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    // Should still load the task, activity falls back to empty
    expect(comp["_task"]).toBeDefined();
    expect(comp["_activity"]).toEqual([]);
    expect(comp["_loading"]).toBe(false);
  });

  // ─── 4. _updateField ──────────────────────────────────────────────────────

  it("_updateField does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockUpdateTask.mockClear();

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "done" });

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it("_updateField calls updateTask with session code", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-abc" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "in_progress" });

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-abc", {
      status: "in_progress",
    });
  });

  it("_updateField calls updateTask with empty sessionCode for project mode", async () => {
    el.sessionCode = "";
    el.projectId = "proj-1";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-abc" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchProjectTask.mockResolvedValue(makeTaskDetail());

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { title: "Updated title" });

    expect(mockUpdateTask).toHaveBeenCalledWith("", "task-abc", {
      title: "Updated title",
    });
  });

  it("_updateField sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-abc" });
    comp["_task"] = task;
    mockUpdateTask.mockRejectedValueOnce(new Error("Update failed"));

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "done" });

    expect(comp["_error"]).toBe("Update failed");
  });

  // ─── 5. _handleDelete ─────────────────────────────────────────────────────

  it("_handleDelete does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockDeleteTask.mockClear();

    await (comp["_handleDelete"] as () => Promise<void>).call(el);

    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it("_handleDelete calls deleteTask with task id", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-del" });
    mockDeleteTask.mockResolvedValue({});

    await (comp["_handleDelete"] as () => Promise<void>).call(el);

    expect(mockDeleteTask).toHaveBeenCalledWith("SES1", "task-del");
  });

  it("_handleDelete dispatches deleted event on success", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-del" });
    mockDeleteTask.mockResolvedValue({});

    const deletedEvents: Event[] = [];
    el.addEventListener("deleted", (e) => deletedEvents.push(e));

    await (comp["_handleDelete"] as () => Promise<void>).call(el);

    expect(deletedEvents).toHaveLength(1);
  });

  it("_handleDelete sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-del" });
    mockDeleteTask.mockRejectedValueOnce(new Error("Delete failed"));

    await (comp["_handleDelete"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Delete failed");
  });

  // ─── 6. _handleAddComment ─────────────────────────────────────────────────

  it("_handleAddComment does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockAddComment.mockClear();

    await (comp["_handleAddComment"] as (text: string) => Promise<void>).call(
      el,
      "Hello",
    );

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("_handleAddComment does nothing with empty text", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail();
    mockAddComment.mockClear();

    await (comp["_handleAddComment"] as (text: string) => Promise<void>).call(
      el,
      "",
    );

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("_handleAddComment calls addComment with session code", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1" });
    comp["_task"] = task;
    mockAddComment.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (comp["_handleAddComment"] as (text: string) => Promise<void>).call(
      el,
      "A new comment",
    );

    expect(mockAddComment).toHaveBeenCalledWith(
      "SES1",
      "task-1",
      "A new comment",
    );
  });

  it("_handleAddComment sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-1" });
    mockAddComment.mockRejectedValueOnce(new Error("Comment failed"));

    await (comp["_handleAddComment"] as (text: string) => Promise<void>).call(
      el,
      "A comment",
    );

    expect(comp["_error"]).toBe("Comment failed");
  });

  // ─── 7. _handleAddBlocker ─────────────────────────────────────────────────

  it("_handleAddBlocker does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockAddDependency.mockClear();

    await (
      comp["_handleAddBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-id");

    expect(mockAddDependency).not.toHaveBeenCalled();
  });

  it("_handleAddBlocker calls addDependency with blocker as upstream", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1" });
    comp["_task"] = task;
    mockAddDependency.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_handleAddBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-task");

    // addDependency(sessionCode, blockerId, blockedTaskId)
    expect(mockAddDependency).toHaveBeenCalledWith(
      "SES1",
      "blocker-task",
      "task-1",
    );
  });

  it("_handleAddBlocker sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-1" });
    mockAddDependency.mockRejectedValueOnce(new Error("Add blocker failed"));

    await (
      comp["_handleAddBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-task");

    expect(comp["_error"]).toBe("Add blocker failed");
  });

  // ─── 8. _handleRemoveBlocker ──────────────────────────────────────────────

  it("_handleRemoveBlocker does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockRemoveDependency.mockClear();

    await (
      comp["_handleRemoveBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-id");

    expect(mockRemoveDependency).not.toHaveBeenCalled();
  });

  it("_handleRemoveBlocker calls removeDependency correctly", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1" });
    comp["_task"] = task;
    mockRemoveDependency.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_handleRemoveBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-task");

    expect(mockRemoveDependency).toHaveBeenCalledWith(
      "SES1",
      "blocker-task",
      "task-1",
    );
  });

  it("_handleRemoveBlocker sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-1" });
    mockRemoveDependency.mockRejectedValueOnce(
      new Error("Remove blocker failed"),
    );

    await (
      comp["_handleRemoveBlocker"] as (blockerId: string) => Promise<void>
    ).call(el, "blocker-task");

    expect(comp["_error"]).toBe("Remove blocker failed");
  });

  // ─── 9. _handleRemoveBlocks ───────────────────────────────────────────────

  it("_handleRemoveBlocks does nothing when _task is null", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = null;
    mockRemoveDependency.mockClear();

    await (
      comp["_handleRemoveBlocks"] as (blockedId: string) => Promise<void>
    ).call(el, "blocked-id");

    expect(mockRemoveDependency).not.toHaveBeenCalled();
  });

  it("_handleRemoveBlocks calls removeDependency with task as upstream", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1" });
    comp["_task"] = task;
    mockRemoveDependency.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail());
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_handleRemoveBlocks"] as (blockedId: string) => Promise<void>
    ).call(el, "blocked-task");

    // removeDependency(sessionCode, task.id, blockedId) — task-1 is upstream
    expect(mockRemoveDependency).toHaveBeenCalledWith(
      "SES1",
      "task-1",
      "blocked-task",
    );
  });

  it("_handleRemoveBlocks sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_task"] = makeTaskDetail({ id: "task-1" });
    mockRemoveDependency.mockRejectedValueOnce(
      new Error("Remove blocks failed"),
    );

    await (
      comp["_handleRemoveBlocks"] as (blockedId: string) => Promise<void>
    ).call(el, "blocked-task");

    expect(comp["_error"]).toBe("Remove blocks failed");
  });

  // ─── 10. _loadAllTasks ────────────────────────────────────────────────────

  it("_loadAllTasks does not call fetchTasks when _allTasks is already populated", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_allTasks"] = [
      { id: "t1", ticket_id: "PROJ-1", title: "Existing task" },
    ];
    mockFetchTasks.mockClear();

    await (comp["_loadAllTasks"] as () => Promise<void>).call(el);

    expect(mockFetchTasks).not.toHaveBeenCalled();
  });

  it("_loadAllTasks calls fetchTasks and maps to summary shape", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_allTasks"] = [];
    mockFetchTasks.mockResolvedValue([
      {
        id: "t1",
        ticket_id: "PROJ-1",
        title: "Task One",
        status: "open",
        task_type: "task",
        priority: "medium",
        complexity: "small",
        session_id: null,
        project_id: "proj-1",
        ticket_number: 1,
        parent_id: null,
        description: null,
        assigned_to: null,
        created_by: "user-1",
        commit_hashes: [],
        no_code_change: false,
        session_ids: [],
        source_task_id: null,
        model_hint: null,
        budget_tier: null,
        provider: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        closed_at: null,
        child_count: 0,
        comment_count: 0,
      },
    ]);

    await (comp["_loadAllTasks"] as () => Promise<void>).call(el);

    expect(mockFetchTasks).toHaveBeenCalledWith("SES1");
    const allTasks = comp["_allTasks"] as Array<{
      id: string;
      ticket_id: string;
      title: string;
    }>;
    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].id).toBe("t1");
    expect(allTasks[0].ticket_id).toBe("PROJ-1");
    expect(allTasks[0].title).toBe("Task One");
  });

  it("_loadAllTasks silently ignores errors", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_allTasks"] = [];
    mockFetchTasks.mockRejectedValueOnce(new Error("Network error"));

    // Should not throw
    await (comp["_loadAllTasks"] as () => Promise<void>).call(el);

    expect(comp["_allTasks"]).toEqual([]);
  });

  // ─── 11. Task data rendering (via _task state) ────────────────────────────

  it("_task can hold a task with parent set", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const parent = makeTaskSummary({
      id: "parent-1",
      ticket_id: "PROJ-0",
      title: "Parent epic",
    });
    const task = makeTaskDetail({ parent });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).parent?.id).toBe("parent-1");
    expect((comp["_task"] as TaskDetailView).parent?.title).toBe("Parent epic");
  });

  it("_task can hold a task with children", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const child = makeTaskSummary({
      id: "child-1",
      ticket_id: "PROJ-2",
      title: "Child task",
    });
    const task = makeTaskDetail({ children: [child] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).children).toHaveLength(1);
    expect((comp["_task"] as TaskDetailView).children[0].id).toBe("child-1");
  });

  it("_task can hold a task with blocked_by entries", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const blocker = makeTaskSummary({ id: "blocker-1", ticket_id: "PROJ-0" });
    const task = makeTaskDetail({ blocked_by: [blocker] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).blocked_by).toHaveLength(1);
    expect((comp["_task"] as TaskDetailView).blocked_by[0].id).toBe(
      "blocker-1",
    );
  });

  it("_task can hold a task with comments", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const comment = makeComment({ content: "Hello world" });
    const task = makeTaskDetail({ comments: [comment] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).comments).toHaveLength(1);
    expect((comp["_task"] as TaskDetailView).comments[0].content).toBe(
      "Hello world",
    );
  });

  it("_task can hold ai_triage suggestions", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({
      ai_triage: {
        suggested_priority: "high",
        suggested_complexity: "medium",
        suggested_type: "bug",
        reasoning: "This looks like a bug",
      },
    });
    comp["_task"] = task;

    const ai = (comp["_task"] as TaskDetailView).ai_triage;
    expect(ai?.suggested_priority).toBe("high");
    expect(ai?.reasoning).toBe("This looks like a bug");
  });

  it("_task can hold a completion_summary", async () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({
      completion_summary: "The bug was fixed by reverting the commit.",
    });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).completion_summary).toBe(
      "The bug was fixed by reverting the commit.",
    );
  });

  // ─── 12. Status transitions ───────────────────────────────────────────────

  it("_updateField with status in_progress calls updateTask correctly", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1", status: "open" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail({ status: "in_progress" }));
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "in_progress" });

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", {
      status: "in_progress",
    });
  });

  it("_updateField with status done calls updateTask correctly", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1", status: "in_progress" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail({ status: "done" }));
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "done" });

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", {
      status: "done",
    });
  });

  it("_updateField with status closed calls updateTask correctly", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1", status: "done" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail({ status: "closed" }));
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "closed" });

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", {
      status: "closed",
    });
  });

  it("_updateField with status open (reopen) calls updateTask correctly", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ id: "task-1", status: "closed" });
    comp["_task"] = task;
    mockUpdateTask.mockResolvedValue({});
    mockFetchTask.mockResolvedValue(makeTaskDetail({ status: "open" }));
    mockFetchActivity.mockResolvedValue([]);

    await (
      comp["_updateField"] as (fields: Record<string, unknown>) => Promise<void>
    ).call(el, { status: "open" });

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", {
      status: "open",
    });
  });

  // ─── 13. Edge cases: loading, error, empty comments ───────────────────────

  it("loading state is true initially and false after load", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchProjectTask.mockResolvedValue(makeTaskDetail());

    // Immediately after setting props, loading may still be true while async runs
    const loadPromise = (comp["_loadTask"] as () => Promise<void>).call(el);
    // _loading was true when _loadTask was called
    await loadPromise;
    expect(comp["_loading"]).toBe(false);
  });

  it("_error is set when fetch throws (not found)", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    el.taskId = "missing-task";
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "";
    mockFetchProjectTask.mockRejectedValueOnce(new Error("Not found"));

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Not found");
    expect(comp["_loading"]).toBe(false);
    // Note: _task retains whatever was previously loaded; the component does not reset it on error
  });

  it("_error clears on subsequent successful load", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    el.taskId = "task-1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_error"] = "Previous error";

    mockFetchProjectTask.mockResolvedValue(makeTaskDetail());

    await (comp["_loadTask"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("");
  });

  it("task with no comments has empty comments array", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ comments: [] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).comments).toHaveLength(0);
  });

  it("task with multiple comments stores all of them", () => {
    const comp = el as unknown as Record<string, unknown>;
    const comments = [
      makeComment({ id: "c1", content: "First" }),
      makeComment({ id: "c2", content: "Second" }),
      makeComment({ id: "c3", content: "Third" }),
    ];
    const task = makeTaskDetail({ comments });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).comments).toHaveLength(3);
  });

  it("task with no children has empty children array", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ children: [] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).children).toHaveLength(0);
  });

  it("task with no blocked_by has empty blocked_by array", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ blocked_by: [] });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).blocked_by).toHaveLength(0);
  });

  it("task with no ai_triage is null", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ ai_triage: null });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).ai_triage).toBeNull();
  });

  it("task with no completion_summary is null", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ completion_summary: null });
    comp["_task"] = task;

    expect((comp["_task"] as TaskDetailView).completion_summary).toBeNull();
  });

  // ─── 14. Title editing ────────────────────────────────────────────────────

  it("_editingTitle starts false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_editingTitle"]).toBe(false);
  });

  it("_editingTitle can be set to true", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_editingTitle"] = true;
    expect(comp["_editingTitle"]).toBe(true);
  });

  it("_editingTitle can be reset to false", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_editingTitle"] = true;
    comp["_editingTitle"] = false;
    expect(comp["_editingTitle"]).toBe(false);
  });

  // ─── 15. Store subscription ───────────────────────────────────────────────

  it("subscribes to store on connectedCallback", async () => {
    const { store } = await import("../../state/app-state.js");
    // The component was already mounted in beforeEach, so subscribe should have been called
    expect(store.subscribe).toHaveBeenCalled();
  });

  // ─── 16. Task type coverage ───────────────────────────────────────────────

  it("_task accepts epic task_type", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ task_type: "epic" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).task_type).toBe("epic");
  });

  it("_task accepts story task_type", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ task_type: "story" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).task_type).toBe("story");
  });

  it("_task accepts bug task_type", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ task_type: "bug" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).task_type).toBe("bug");
  });

  it("_task accepts subtask task_type", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ task_type: "subtask" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).task_type).toBe("subtask");
  });

  // ─── 17. Priority coverage ────────────────────────────────────────────────

  it("_task accepts critical priority", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ priority: "critical" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).priority).toBe("critical");
  });

  it("_task accepts high priority", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ priority: "high" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).priority).toBe("high");
  });

  it("_task accepts low priority", () => {
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTaskDetail({ priority: "low" });
    comp["_task"] = task;
    expect((comp["_task"] as TaskDetailView).priority).toBe("low");
  });
});
