/**
 * HTTP client for the Seam session server.
 *
 * Mirrors the SessionStore API but routes all operations through the HTTP
 * REST endpoints exposed by src/server/http.ts. The MCP server uses this
 * client so that it shares session state with the HTTP server rather than
 * maintaining its own in-process store.
 */

import type {
  CandidateEventsFile,
  LoadedFile,
  ContractBundle,
  IntegrationReport,
  SessionConfig,
} from '../schema/types.js';
import type {
  Session,
  SerializedSession,
  Submission,
  SessionMessage,
} from '../lib/session-store.js';
import type { JamArtifacts, ConflictResolution, OwnershipAssignment, UnresolvedItem, Requirement } from '../schema/types.js';

export interface RequirementCoverage {
  reqId: string;
  eventCount: number;
  fulfilled: boolean;
}

/** Deserializes a SerializedSession (participants as array) back into a Session-like object.
 * Note: participants is kept as an array here since MCP tools only need read access.
 * The returned object is typed as SerializedSession for use in MCP tools that call serializeSession. */
function toSession(data: SerializedSession): SerializedSession {
  return data;
}

export class SessionApiClient {
  constructor(private readonly baseUrl: string) {}

  private async doFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    return fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  }

  private async postJson(path: string, body: unknown): Promise<Response> {
    return this.doFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getSession(code: string): Promise<SerializedSession | null> {
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json() as { session: SerializedSession };
    return toSession(data.session);
  }

  async getSessionFiles(code: string): Promise<LoadedFile[]> {
    const session = await this.getSession(code);
    if (!session) return [];
    return session.submissions.map((sub: Submission) => ({
      filename: sub.fileName,
      role: session.participants.find((p) => p.id === sub.participantId)?.name ?? 'unknown',
      data: sub.data,
    }));
  }

  async createSession(creatorName: string): Promise<{ session: SerializedSession; creatorId: string } | null> {
    const res = await this.postJson('/api/sessions', { creatorName });
    if (!res.ok) return null;
    const data = await res.json() as { code: string; participantId: string; session: SerializedSession };
    return { session: data.session, creatorId: data.participantId };
  }

  async joinSession(
    code: string,
    participantName: string
  ): Promise<{ session: SerializedSession; participantId: string } | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/join`, { participantName });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json() as { participantId: string; session: SerializedSession };
    return { session: toSession(data.session), participantId: data.participantId };
  }

  async submitYaml(
    code: string,
    participantId: string,
    fileName: string,
    data: CandidateEventsFile
  ): Promise<Submission | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/submit`, {
      participantId,
      fileName,
      data,
    });
    if (!res.ok) return null;
    const body = await res.json() as { submission: Submission };
    return body.submission;
  }

  async startJam(code: string): Promise<JamArtifacts | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/jam/start`, {});
    if (!res.ok) return null;
    const data = await res.json() as { jam: JamArtifacts };
    return data.jam;
  }

  async resolveConflict(
    code: string,
    item: { overlapLabel: string; resolution: string; chosenApproach: string; resolvedBy: string[] }
  ): Promise<ConflictResolution | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/jam/resolve`, item);
    if (!res.ok) return null;
    const data = await res.json() as { resolution: ConflictResolution };
    return data.resolution;
  }

  async assignOwnership(
    code: string,
    item: { aggregate: string; ownerRole: string; assignedBy: string }
  ): Promise<OwnershipAssignment | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/jam/assign`, item);
    if (!res.ok) return null;
    const data = await res.json() as { assignment: OwnershipAssignment };
    return data.assignment;
  }

  async flagUnresolved(
    code: string,
    item: { description: string; flaggedBy: string; relatedOverlap?: string }
  ): Promise<UnresolvedItem | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/jam/flag`, item);
    if (!res.ok) return null;
    const data = await res.json() as { item: UnresolvedItem };
    return data.item;
  }

  async exportJam(code: string): Promise<JamArtifacts | null> {
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}/jam`);
    if (!res.ok) return null;
    const data = await res.json() as { jam: JamArtifacts };
    return data.jam;
  }

  async loadContracts(code: string, bundle: ContractBundle): Promise<boolean> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/contracts`, { bundle });
    return res.ok;
  }

  async getContracts(code: string): Promise<ContractBundle | null> {
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}/contracts`);
    if (!res.ok) return null;
    const data = await res.json() as { contracts: ContractBundle | null };
    return data.contracts;
  }

  async loadIntegrationReport(code: string, report: IntegrationReport): Promise<boolean> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/integration-report`, { report });
    return res.ok;
  }

  async getIntegrationReport(code: string): Promise<IntegrationReport | null> {
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}/integration-report`);
    if (!res.ok) return null;
    const data = await res.json() as { report: IntegrationReport | null };
    return data.report;
  }

  async updateSessionConfig(
    code: string,
    config: Partial<SessionConfig>,
    changedBy?: string
  ): Promise<SessionConfig | null> {
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config, changedBy }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { config: SessionConfig };
    return data.config;
  }

  async getSessionConfig(code: string): Promise<SessionConfig | null> {
    const session = await this.getSession(code);
    if (!session) return null;
    return session.config;
  }

  async sendMessage(
    code: string,
    participantId: string,
    content: string,
    toParticipantId?: string
  ): Promise<SessionMessage | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/messages`, {
      fromId: participantId,
      content,
      toId: toParticipantId,
    });
    if (!res.ok) return null;
    const data = await res.json() as { message: SessionMessage };
    return data.message;
  }

  async getMessages(
    code: string,
    participantId: string,
    since?: string
  ): Promise<SessionMessage[]> {
    const params = new URLSearchParams({ participantId });
    if (since) params.set('since', since);
    const res = await this.doFetch(`/api/sessions/${encodeURIComponent(code)}/messages?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as { messages: SessionMessage[] };
    return data.messages;
  }

  async addRequirement(
    code: string,
    participantId: string,
    statement: string,
    tags?: string[]
  ): Promise<Requirement | null> {
    const res = await this.postJson(`/api/sessions/${encodeURIComponent(code)}/requirements`, {
      participantId,
      statement,
      tags,
    });
    if (!res.ok) return null;
    const data = await res.json() as { requirement: Requirement };
    return data.requirement;
  }

  async getRequirements(code: string): Promise<Requirement[]> {
    const session = await this.getSession(code);
    if (!session) return [];
    return session.requirements;
  }

  async getRequirement(code: string, requirementId: string): Promise<Requirement | null> {
    const requirements = await this.getRequirements(code);
    return requirements.find((r) => r.id === requirementId) ?? null;
  }

  async updateRequirement(
    code: string,
    requirementId: string,
    updates: Partial<Requirement>
  ): Promise<boolean> {
    const res = await this.postJson(
      `/api/sessions/${encodeURIComponent(code)}/requirements/${encodeURIComponent(requirementId)}/accept`,
      {
        participantId: updates.authorId ?? 'system',
        eventNames: updates.derivedEvents ?? [],
      }
    );
    return res.ok;
  }

  async getRequirementCoverage(
    code: string,
    requirementId: string
  ): Promise<RequirementCoverage[]> {
    const res = await this.doFetch(
      `/api/sessions/${encodeURIComponent(code)}/requirements/${encodeURIComponent(requirementId)}/coverage`
    );
    if (!res.ok) return [];
    const data = await res.json() as { coverage: RequirementCoverage[] };
    return data.coverage;
  }
}
