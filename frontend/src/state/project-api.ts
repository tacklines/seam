import { authStore } from './auth-state.js';
import type { SessionView } from './app-state.js';

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

export interface ProjectView {
  id: string;
  name: string;
  slug: string;
  ticket_prefix: string;
  created_at: string;
  repo_url: string | null;
  default_branch: string | null;
}

export async function fetchProjects(): Promise<ProjectView[]> {
  const res = await fetch(`${API_BASE}/api/projects`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchProject(projectId: string): Promise<ProjectView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createProject(name: string, ticketPrefix?: string, repoUrl?: string): Promise<ProjectView> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, ticket_prefix: ticketPrefix, repo_url: repoUrl }),
  });
  return handleResponse(res);
}

export async function updateProject(projectId: string, updates: { name?: string; ticket_prefix?: string; repo_url?: string; default_branch?: string }): Promise<ProjectView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function fetchProjectSessions(projectId: string): Promise<SessionView[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/sessions`, { headers: authHeaders() });
  return handleResponse(res);
}
