import { authStore } from "./auth-state.js";

export interface EventReaction {
  id: string;
  project_id: string;
  name: string;
  event_type: string;
  aggregate_type: string;
  filter: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledJob {
  id: string;
  project_id: string;
  name: string;
  cron_expr: string;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReactionRequest {
  name: string;
  event_type: string;
  aggregate_type: string;
  filter?: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
}

export interface CreateScheduledJobRequest {
  name: string;
  cron_expr: string;
  action_type: string;
  action_config: Record<string, unknown>;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = authStore.getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function fetchReactions(
  projectId: string,
): Promise<EventReaction[]> {
  const resp = await fetch(`/api/projects/${projectId}/reactions`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Failed to fetch reactions: ${resp.status}`);
  return resp.json();
}

export async function createReaction(
  projectId: string,
  data: CreateReactionRequest,
): Promise<EventReaction> {
  const resp = await fetch(`/api/projects/${projectId}/reactions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Failed to create reaction: ${resp.status}`);
  return resp.json();
}

export async function updateReaction(
  projectId: string,
  reactionId: string,
  data: Partial<EventReaction>,
): Promise<EventReaction> {
  const resp = await fetch(
    `/api/projects/${projectId}/reactions/${reactionId}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(data),
    },
  );
  if (!resp.ok) throw new Error(`Failed to update reaction: ${resp.status}`);
  return resp.json();
}

export async function deleteReaction(
  projectId: string,
  reactionId: string,
): Promise<void> {
  const resp = await fetch(
    `/api/projects/${projectId}/reactions/${reactionId}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );
  if (!resp.ok) throw new Error(`Failed to delete reaction: ${resp.status}`);
}

export async function fetchScheduledJobs(
  projectId: string,
): Promise<ScheduledJob[]> {
  const resp = await fetch(`/api/projects/${projectId}/scheduled-jobs`, {
    headers: headers(),
  });
  if (!resp.ok)
    throw new Error(`Failed to fetch scheduled jobs: ${resp.status}`);
  return resp.json();
}

export async function createScheduledJob(
  projectId: string,
  data: CreateScheduledJobRequest,
): Promise<ScheduledJob> {
  const resp = await fetch(`/api/projects/${projectId}/scheduled-jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!resp.ok)
    throw new Error(`Failed to create scheduled job: ${resp.status}`);
  return resp.json();
}

export async function updateScheduledJob(
  projectId: string,
  jobId: string,
  data: Partial<ScheduledJob>,
): Promise<ScheduledJob> {
  const resp = await fetch(
    `/api/projects/${projectId}/scheduled-jobs/${jobId}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(data),
    },
  );
  if (!resp.ok)
    throw new Error(`Failed to update scheduled job: ${resp.status}`);
  return resp.json();
}

export async function deleteScheduledJob(
  projectId: string,
  jobId: string,
): Promise<void> {
  const resp = await fetch(
    `/api/projects/${projectId}/scheduled-jobs/${jobId}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );
  if (!resp.ok)
    throw new Error(`Failed to delete scheduled job: ${resp.status}`);
}

/* ── Hook Bundles ── */

export interface BundleStatus {
  name: string;
  installed: boolean;
  installed_items: string[];
  missing_items: string[];
}

export interface InstallBundleResponse {
  installed: string[];
  skipped: string[];
}

export async function getHookBundles(
  projectId: string,
): Promise<BundleStatus[]> {
  const resp = await fetch(`/api/projects/${projectId}/hook-bundles`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Failed to fetch hook bundles: ${resp.status}`);
  return resp.json();
}

export async function installHookBundle(
  projectId: string,
  bundleName: string,
): Promise<InstallBundleResponse> {
  const resp = await fetch(
    `/api/projects/${projectId}/hook-bundles/${bundleName}`,
    {
      method: "POST",
      headers: headers(),
    },
  );
  if (!resp.ok)
    throw new Error(`Failed to install hook bundle: ${resp.status}`);
  return resp.json();
}
