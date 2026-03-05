import { authStore } from './auth-state.js';

const API_BASE = '';

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

export interface LaunchAgentRequest {
  agent_type?: string;
  task_id?: string;
  branch?: string;
  instructions?: string;
}

export interface LaunchAgentResponse {
  workspace_id: string;
  participant_id: string;
  agent_code: string;
  status: string;
}

export async function launchAgent(
  sessionCode: string,
  req: LaunchAgentRequest,
): Promise<LaunchAgentResponse> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/agents`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
