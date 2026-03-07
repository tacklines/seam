import { authStore } from "./auth-state.js";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// --- Project-level agent views ---

export type TaskStatus = "open" | "in_progress" | "done" | "closed";
export type TaskType = "epic" | "story" | "task" | "subtask" | "bug";
export type WorkspaceStatus =
  | "pending"
  | "creating"
  | "running"
  | "stopping"
  | "stopped"
  | "failed"
  | "destroyed";

export interface AgentTaskSummary {
  id: string;
  ticket_id: string;
  title: string;
  status: TaskStatus;
  task_type: TaskType;
}

export interface AgentWorkspaceSummary {
  id: string;
  status: WorkspaceStatus;
  coder_workspace_name: string | null;
  branch: string | null;
  started_at: string | null;
  error_message: string | null;
}

export interface ProjectAgentView {
  id: string;
  display_name: string;
  session_id: string;
  session_code: string;
  session_name: string | null;
  sponsor_name: string | null;
  client_name: string | null;
  client_version: string | null;
  model: string | null;
  joined_at: string;
  disconnected_at: string | null;
  is_online: boolean;
  current_task: AgentTaskSummary | null;
  workspace: AgentWorkspaceSummary | null;
}

export interface AgentActivityItem {
  event_type: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentCommentView {
  id: string;
  task_id: string;
  task_title: string;
  ticket_id: string;
  content: string;
  created_at: string;
}

export interface ProjectAgentDetailView {
  agent: ProjectAgentView;
  recent_activity: AgentActivityItem[];
  recent_comments: AgentCommentView[];
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchProjectAgents(
  projectId: string,
  opts?: { includeDisconnected?: boolean },
): Promise<ProjectAgentView[]> {
  const params = new URLSearchParams();
  if (opts?.includeDisconnected) params.set("include_disconnected", "true");
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/agents${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export async function fetchProjectAgent(
  projectId: string,
  agentId: string,
): Promise<ProjectAgentDetailView> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/agents/${agentId}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

// --- Directed messages ---

export interface MessageView {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export async function fetchMessages(
  sessionCode: string,
  participantId: string,
  opts?: { limit?: number },
): Promise<MessageView[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/api/sessions/${sessionCode}/participants/${participantId}/messages${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export async function sendMessage(
  sessionCode: string,
  participantId: string,
  content: string,
): Promise<MessageView> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${sessionCode}/participants/${participantId}/messages`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content }),
    },
  );
  return handleResponse(res);
}

// --- Tool invocations ---

export interface ToolInvocationView {
  id: string;
  tool_name: string;
  is_error: boolean;
  duration_ms: number;
  created_at: string;
}

export async function fetchToolInvocations(
  sessionCode: string,
  participantId: string,
  opts?: { limit?: number },
): Promise<ToolInvocationView[]> {
  const params = new URLSearchParams({ participant_id: participantId });
  if (opts?.limit) params.set("limit", String(opts.limit));
  const res = await fetch(
    `${API_BASE}/api/sessions/${sessionCode}/tool-invocations?${params}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

// --- Workspace logs ---

export interface WorkspaceLogLine {
  line: string;
  fd: string;
  ts: string;
}

export async function fetchWorkspaceLogs(
  workspaceId: string,
  opts?: { limit?: number },
): Promise<WorkspaceLogLine[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/api/workspaces/${workspaceId}/logs${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}
