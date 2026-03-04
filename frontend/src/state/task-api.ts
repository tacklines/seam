import { authStore } from './auth-state.js';
import type { TaskView, TaskDetailView, CommentView, TaskType, TaskStatus } from './task-types.js';

const API_BASE = '';

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchTasks(
  sessionCode: string,
  filters?: { task_type?: TaskType; status?: TaskStatus; parent_id?: string; assigned_to?: string },
): Promise<TaskView[]> {
  const params = new URLSearchParams();
  if (filters?.task_type) params.set('task_type', filters.task_type);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.parent_id) params.set('parent_id', filters.parent_id);
  if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);

  const qs = params.toString();
  const url = `${API_BASE}/api/sessions/${sessionCode}/tasks${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleResponse<TaskView[]>(res);
}

export async function fetchTask(sessionCode: string, taskId: string): Promise<TaskDetailView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/tasks/${taskId}`, {
    headers: authHeaders(),
  });
  return handleResponse<TaskDetailView>(res);
}

export async function createTask(
  sessionCode: string,
  data: { task_type: string; title: string; description?: string; parent_id?: string; assigned_to?: string },
): Promise<TaskView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<TaskView>(res);
}

export async function updateTask(
  sessionCode: string,
  taskId: string,
  data: { title?: string; description?: string | null; status?: string; assigned_to?: string | null; parent_id?: string; commit_sha?: string },
): Promise<TaskView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<TaskView>(res);
}

export async function deleteTask(sessionCode: string, taskId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function addComment(
  sessionCode: string,
  taskId: string,
  content: string,
): Promise<CommentView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  return handleResponse<CommentView>(res);
}
