export type TaskType = 'epic' | 'story' | 'task' | 'subtask' | 'bug';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'closed';

export interface TaskView {
  id: string;
  session_id: string;
  parent_id: string | null;
  task_type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  commit_sha: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  child_count: number;
  comment_count: number;
}

export interface TaskSummaryView {
  id: string;
  task_type: TaskType;
  title: string;
  status: TaskStatus;
  assigned_to: string | null;
}

export interface CommentView {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface TaskDetailView extends TaskView {
  parent: TaskSummaryView | null;
  comments: CommentView[];
  children: TaskSummaryView[];
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
  subtask: 'Subtask',
  bug: 'Bug',
};

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  epic: 'lightning-charge-fill',
  story: 'bookmark-fill',
  task: 'check-square-fill',
  subtask: 'dash-square-fill',
  bug: 'bug-fill',
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  epic: 'var(--sl-color-purple-500)',
  story: 'var(--sl-color-teal-500)',
  task: 'var(--sl-color-primary-500)',
  subtask: 'var(--sl-color-neutral-500)',
  bug: 'var(--sl-color-danger-500)',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed',
};

export const STATUS_VARIANTS: Record<TaskStatus, string> = {
  open: 'neutral',
  in_progress: 'primary',
  done: 'success',
  closed: 'neutral',
};
