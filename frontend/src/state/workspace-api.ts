import { authStore } from "./auth-state.js";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface WorkspaceView {
  id: string;
  task_id: string;
  status:
    | "pending"
    | "creating"
    | "running"
    | "stopping"
    | "stopped"
    | "failed"
    | "destroyed";
  coder_workspace_name: string | null;
  template_name: string;
  branch: string | null;
  started_at: string | null;
  stopped_at: string | null;
  error_message: string | null;
  participant_id: string | null;
  participant_name: string | null;
  session_code: string | null;
}

export async function fetchWorkspaces(
  projectId: string,
): Promise<WorkspaceView[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/workspaces`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceView> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/workspaces/${workspaceId}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export async function createWorkspace(
  projectId: string,
  taskId: string,
  opts?: { template_name?: string; branch?: string },
): Promise<WorkspaceView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/workspaces`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ task_id: taskId, ...opts }),
  });
  return handleResponse(res);
}

export async function stopWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceView> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/workspaces/${workspaceId}/stop`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  return handleResponse(res);
}

export async function destroyWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/workspaces/${workspaceId}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export interface WorkspaceEvent {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export async function fetchWorkspaceEvents(
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceEvent[]> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/workspaces/${workspaceId}/events`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export interface CoderStatus {
  enabled: boolean;
  connected: boolean;
  url: string | null;
  user: string | null;
  error: string | null;
  templates: string[];
}

export async function fetchCoderStatus(): Promise<CoderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/coder/status`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}
