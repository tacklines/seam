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

export interface InvocationView {
  id: string;
  workspace_id: string;
  project_id: string;
  session_id: string | null;
  task_id: string | null;
  participant_id: string | null;
  agent_perspective: string;
  prompt: string;
  system_prompt_append: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  exit_code: number | null;
  error_message: string | null;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvocationDetailView extends InvocationView {
  result_json: unknown | null;
  output: LogLine[];
}

export interface LogLine {
  line: string;
  fd: string;
  ts: string;
}

export interface CreateInvocationRequest {
  workspace_id?: string;
  agent_perspective: string;
  prompt: string;
  system_prompt_append?: string;
  task_id?: string;
  session_id?: string;
  branch?: string;
}

export async function fetchInvocations(
  projectId: string,
  opts?: { status?: string; workspace_id?: string; task_id?: string; limit?: number },
): Promise<InvocationView[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.workspace_id) params.set("workspace_id", opts.workspace_id);
  if (opts?.task_id) params.set("task_id", opts.task_id);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/invocations${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export async function fetchInvocation(
  invocationId: string,
): Promise<InvocationDetailView> {
  const res = await fetch(`${API_BASE}/api/invocations/${invocationId}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createInvocation(
  projectId: string,
  req: CreateInvocationRequest,
): Promise<InvocationView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/invocations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  return handleResponse(res);
}
