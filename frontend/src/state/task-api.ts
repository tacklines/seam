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
  data: { task_type: string; title: string; description?: string; parent_id?: string; assigned_to?: string; priority?: string; complexity?: string },
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
  data: { title?: string; description?: string | null; status?: string; priority?: string; complexity?: string; assigned_to?: string | null; parent_id?: string; commit_sha?: string | null },
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

export interface ActivityEvent {
  id: string;
  actor_id: string;
  actor_name: string;
  event_type: string;
  target_type: string;
  target_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function fetchActivity(
  sessionCode: string,
  opts?: { limit?: number; target_id?: string },
): Promise<ActivityEvent[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.target_id) params.set('target_id', opts.target_id);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/activity${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse<ActivityEvent[]>(res);
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

// --- Questions ---

export interface QuestionView {
  id: string;
  question_text: string;
  status: 'pending' | 'answered' | 'expired' | 'cancelled';
  asked_by: string;
  asked_by_name: string;
  directed_to: string | null;
  context: Record<string, unknown> | null;
  answer_text: string | null;
  answered_by: string | null;
  answered_by_name: string | null;
  created_at: string;
  answered_at: string | null;
}

export async function fetchQuestions(
  sessionCode: string,
  status = 'pending',
): Promise<QuestionView[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/questions?status=${status}`, {
    headers: authHeaders(),
  });
  return handleResponse<QuestionView[]>(res);
}

export async function answerQuestion(
  sessionCode: string,
  questionId: string,
  answerText: string,
): Promise<QuestionView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/questions/${questionId}/answer`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ answer_text: answerText }),
  });
  return handleResponse<QuestionView>(res);
}

export async function cancelQuestion(
  sessionCode: string,
  questionId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/questions/${questionId}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// --- Notes ---

export interface NoteView {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchNotes(sessionCode: string): Promise<NoteView[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/notes`, {
    headers: authHeaders(),
  });
  return handleResponse<NoteView[]>(res);
}

export async function fetchNote(sessionCode: string, slug: string): Promise<NoteView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/notes/${slug}`, {
    headers: authHeaders(),
  });
  return handleResponse<NoteView>(res);
}

export async function upsertNote(
  sessionCode: string,
  slug: string,
  content: string,
  title?: string,
): Promise<NoteView> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/notes/${slug}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ content, title }),
  });
  return handleResponse<NoteView>(res);
}
