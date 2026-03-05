export type TaskType = 'epic' | 'story' | 'task' | 'subtask' | 'bug';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'closed';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskComplexity = 'xl' | 'large' | 'medium' | 'small' | 'trivial';

export interface TaskView {
  id: string;
  session_id: string | null;
  project_id: string;
  ticket_number: number;
  ticket_id: string;
  parent_id: string | null;
  task_type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  complexity: TaskComplexity;
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
  ticket_id: string;
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
  blocks: TaskSummaryView[];
  blocked_by: TaskSummaryView[];
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

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_ICONS: Record<TaskPriority, string> = {
  critical: 'exclamation-octagon-fill',
  high: 'arrow-up-circle-fill',
  medium: 'dash-circle',
  low: 'arrow-down-circle-fill',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: 'var(--sl-color-danger-500)',
  high: 'var(--sl-color-warning-500)',
  medium: 'var(--sl-color-neutral-500)',
  low: 'var(--sl-color-primary-300)',
};

export const COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  xl: 'XL',
  large: 'Large',
  medium: 'Medium',
  small: 'Small',
  trivial: 'Trivial',
};
