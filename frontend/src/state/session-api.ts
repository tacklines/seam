import { authStore } from "./auth-state.js";
import type { SessionView } from "./app-state.js";

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

export interface CreateSessionParams {
  project_id?: string;
  name?: string;
}

export interface CreateSessionResponse {
  session: SessionView;
  agent_code: string;
}

export async function createSession(
  params: CreateSessionParams,
): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<CreateSessionResponse>(res);
}

export interface JoinSessionResponse {
  participant_id: string;
  session: SessionView;
  agent_code: string;
}

export async function joinSessionByCode(
  code: string,
  displayName: string,
): Promise<JoinSessionResponse> {
  const res = await fetch(`${API_BASE}/api/sessions/${code}/join`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ display_name: displayName }),
  });
  return handleResponse<JoinSessionResponse>(res);
}
