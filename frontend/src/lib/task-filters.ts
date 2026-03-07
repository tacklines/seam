import type { TaskView, TaskType, TaskStatus } from "../state/task-types.js";

// ─── Filter state type ───

export interface TaskFilterState {
  searchQuery: string;
  filterType: TaskType | "";
  filterStatus: TaskStatus | "";
  filterAssignee: string;
  hideCompleted: boolean;
  sortBy: "created" | "updated" | "title" | "type";
}

// ─── Pure filter/sort functions ───

/**
 * Apply filter state to a task list, returning only matching tasks.
 * Does not mutate the input array.
 */
export function filterTasks(
  tasks: TaskView[],
  filters: Pick<
    TaskFilterState,
    "hideCompleted" | "filterStatus" | "searchQuery" | "filterAssignee"
  >,
): TaskView[] {
  let result = tasks;

  if (filters.hideCompleted && !filters.filterStatus) {
    result = result.filter(
      (tk) => tk.status !== "done" && tk.status !== "closed",
    );
  }

  if (filters.searchQuery.trim()) {
    const q = filters.searchQuery.toLowerCase();
    result = result.filter(
      (tk) =>
        tk.title.toLowerCase().includes(q) ||
        tk.ticket_id.toLowerCase().includes(q) ||
        tk.description?.toLowerCase().includes(q),
    );
  }

  if (filters.filterAssignee) {
    result = result.filter((tk) => tk.assigned_to === filters.filterAssignee);
  }

  return result;
}

/**
 * Sort a task list by the given criterion.
 * Returns a new array; does not mutate the input.
 */
export function sortTasks(
  tasks: TaskView[],
  sortBy: TaskFilterState["sortBy"],
): TaskView[] {
  const sorted = [...tasks];
  switch (sortBy) {
    case "updated":
      sorted.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      break;
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "type":
      sorted.sort((a, b) => a.task_type.localeCompare(b.task_type));
      break;
    case "created":
    default:
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      break;
  }
  return sorted;
}

/**
 * Count tasks that are done or closed.
 */
export function completedCount(tasks: TaskView[]): number {
  return tasks.filter((tk) => tk.status === "done" || tk.status === "closed")
    .length;
}

/**
 * Return direct children of a parent task.
 */
export function childrenOf(tasks: TaskView[], parentId: string): TaskView[] {
  return tasks.filter((tk) => tk.parent_id === parentId);
}

/**
 * Return [completedChildren, totalChildren] for a parent task.
 */
export function childProgress(
  tasks: TaskView[],
  parentId: string,
): [number, number] {
  const children = childrenOf(tasks, parentId);
  const done = children.filter(
    (tk) => tk.status === "done" || tk.status === "closed",
  ).length;
  return [done, children.length];
}
