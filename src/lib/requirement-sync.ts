import type { Requirement } from '../schema/types.js';

const API_BASE = 'http://localhost:3002';

/**
 * Sync a locally-created requirement to the session server.
 * Returns the server-assigned ID and full requirement on success, or null on failure.
 * Fire-and-forget safe — callers should not block on this result.
 */
export async function syncRequirementToServer(
  sessionCode: string,
  participantId: string,
  statement: string,
): Promise<{ id: string; requirement: Requirement } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionCode}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId, statement }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Remove a requirement from the session server.
 * Fire-and-forget — errors are silently swallowed.
 */
export async function removeRequirementFromServer(
  sessionCode: string,
  requirementId: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/sessions/${sessionCode}/requirements/${requirementId}`, {
      method: 'DELETE',
    });
  } catch {
    // fire-and-forget
  }
}
