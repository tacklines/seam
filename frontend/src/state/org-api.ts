import { authStore } from './auth-state.js';

const API_BASE = '';

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Org types ---

export interface OrgView {
  id: string;
  name: string;
  slug: string;
  personal: boolean;
  role: string;
  created_at: string;
  member_count: number;
}

export interface OrgMemberView {
  user_id: string;
  username: string;
  role: string;
  joined_at: string;
}

export interface CredentialView {
  id: string;
  name: string;
  credential_type: string;
  env_var_name: string | null;
  created_at: string;
  rotated_at: string | null;
  expires_at: string | null;
  created_by_username: string;
}

// --- Org API ---

export async function fetchOrgs(): Promise<OrgView[]> {
  const res = await fetch(`${API_BASE}/api/orgs`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchOrg(slug: string): Promise<OrgView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createOrg(name: string): Promise<OrgView> {
  const res = await fetch(`${API_BASE}/api/orgs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  return handleResponse(res);
}

export async function updateOrg(slug: string, updates: { name?: string }): Promise<OrgView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

// --- Members ---

export async function fetchMembers(slug: string): Promise<OrgMemberView[]> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/members`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function inviteMember(slug: string, username: string, role: string): Promise<OrgMemberView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/members`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, role }),
  });
  return handleResponse(res);
}

export async function updateMemberRole(slug: string, userId: string, role: string): Promise<OrgMemberView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/members/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  return handleResponse(res);
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// --- Org-scoped projects ---

export async function fetchOrgProjects(slug: string): Promise<import('./project-api.js').ProjectView[]> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/projects`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createOrgProject(slug: string, name: string, ticketPrefix?: string, repoUrl?: string): Promise<import('./project-api.js').ProjectView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/projects`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, ticket_prefix: ticketPrefix, repo_url: repoUrl }),
  });
  return handleResponse(res);
}

// --- Credentials ---

export async function fetchCredentials(slug: string): Promise<CredentialView[]> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/credentials`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createCredential(
  slug: string,
  data: { name: string; credential_type: string; value: string; env_var_name?: string; expires_at?: string },
): Promise<CredentialView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/credentials`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function rotateCredential(slug: string, credentialId: string, value: string, expiresAt?: string): Promise<CredentialView> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/credentials/${credentialId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ value, expires_at: expiresAt }),
  });
  return handleResponse(res);
}

export async function deleteCredential(slug: string, credentialId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/orgs/${slug}/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// --- User Credentials ---

export interface UserCredentialView {
  id: string;
  name: string;
  credential_type: string;
  env_var_name: string | null;
  created_at: string;
  rotated_at: string | null;
  expires_at: string | null;
}

export async function fetchUserCredentials(): Promise<UserCredentialView[]> {
  const res = await fetch(`${API_BASE}/api/me/credentials`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createUserCredential(
  data: { name: string; credential_type: string; value: string; env_var_name?: string; expires_at?: string },
): Promise<UserCredentialView> {
  const res = await fetch(`${API_BASE}/api/me/credentials`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function rotateUserCredential(credentialId: string, value: string, expiresAt?: string): Promise<UserCredentialView> {
  const res = await fetch(`${API_BASE}/api/me/credentials/${credentialId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ value, expires_at: expiresAt }),
  });
  return handleResponse(res);
}

export async function deleteUserCredential(credentialId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// --- Org state (simple reactive store) ---

let _currentOrg: OrgView | null = null;
let _orgs: OrgView[] | null = null;
const _listeners = new Set<() => void>();

export function getCurrentOrg(): OrgView | null {
  return _currentOrg;
}

export function getOrgs(): OrgView[] | null {
  return _orgs;
}

export function setCurrentOrg(org: OrgView) {
  _currentOrg = org;
  _listeners.forEach((fn) => fn());
}

export function setOrgs(orgs: OrgView[]) {
  _orgs = orgs;
}

export function subscribeOrg(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function loadAndSelectOrg(slug?: string): Promise<OrgView> {
  if (!_orgs) {
    _orgs = await fetchOrgs();
  }
  const target = slug
    ? _orgs.find((o) => o.slug === slug)
    : _orgs.find((o) => !o.personal) ?? _orgs[0];
  if (!target) throw new Error('No organizations found');
  setCurrentOrg(target);
  return target;
}
