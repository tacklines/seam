import {
  CandidateEventsFile,
  LoadedFile,
  JamArtifacts,
  OwnershipAssignment,
  ConflictResolution,
  UnresolvedItem,
  ContractBundle,
  IntegrationReport,
  SessionStatus,
  Participant,
  ParticipantType,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
  EventPriority,
  Vote,
  WorkItem,
  WorkItemDependency,
  Draft,
  Requirement,
  RequirementStatus,
} from '../schema/types.js';
import { EventStore } from '../contexts/session/event-store.js';
import type {
  SessionCreated,
  ParticipantJoined,
  ArtifactSubmitted,
  ContractGenerated,
  ComplianceCheckCompleted,
  SessionPaused,
  SessionResumed,
  SessionClosed,
  SessionConfigured,
  RequirementSubmitted,
} from '../contexts/session/domain-events.js';
import { AgreementService } from '../contexts/agreement/agreement-service.js';
import { canTransition, transitionSession } from './session-state-machine.js';

export type { Participant, ParticipantType };

export interface Submission {
  participantId: string;
  fileName: string;
  data: CandidateEventsFile;
  submittedAt: string;
}

export interface SessionMessage {
  id: string;
  from: string;        // participant name
  fromId: string;      // participant ID
  to?: string;         // participant name (omit for broadcast to all)
  toId?: string;       // participant ID (omit for broadcast to all)
  content: string;
  timestamp: string;   // ISO timestamp
}

export interface Session {
  code: string;
  createdAt: string;
  status: SessionStatus;
  participants: Map<string, Participant>;
  submissions: Submission[];
  messages: SessionMessage[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
  config: SessionConfig;
  priorities: EventPriority[];
  votes: Vote[];
  workItems: WorkItem[];
  workItemDependencies: WorkItemDependency[];
  drafts: Draft[];
  requirements: Requirement[];
}

export interface SerializedSession {
  code: string;
  createdAt: string;
  status: SessionStatus;
  participants: Participant[];
  submissions: Submission[];
  messages: SessionMessage[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
  config: SessionConfig;
  priorities: EventPriority[];
  votes: Vote[];
  workItems: WorkItem[];
  workItemDependencies: WorkItemDependency[];
  drafts: Draft[];
  requirements: Requirement[];
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function serializeSession(session: Session): SerializedSession {
  return {
    code: session.code,
    createdAt: session.createdAt,
    status: session.status,
    participants: Array.from(session.participants.values()),
    submissions: session.submissions,
    messages: session.messages,
    jam: session.jam,
    contracts: session.contracts,
    integrationReport: session.integrationReport,
    config: session.config,
    priorities: session.priorities,
    votes: session.votes,
    workItems: session.workItems,
    workItemDependencies: session.workItemDependencies,
    drafts: session.drafts,
    requirements: session.requirements,
  };
}

export function deserializeSession(serialized: SerializedSession): Session {
  return {
    code: serialized.code,
    createdAt: serialized.createdAt,
    status: serialized.status ?? 'active',
    participants: new Map(serialized.participants.map((p) => [p.id, p])),
    submissions: serialized.submissions,
    messages: serialized.messages,
    jam: serialized.jam,
    contracts: serialized.contracts,
    integrationReport: serialized.integrationReport,
    config: serialized.config ?? DEFAULT_SESSION_CONFIG,
    priorities: serialized.priorities ?? [],
    votes: serialized.votes ?? [],
    workItems: serialized.workItems ?? [],
    workItemDependencies: serialized.workItemDependencies ?? [],
    drafts: serialized.drafts ?? [],
    requirements: serialized.requirements ?? [],
  };
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private eventStore: EventStore | null;
  private agreementService: AgreementService;

  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore ?? null;
    this.agreementService = new AgreementService(this.getSession.bind(this), eventStore);
  }

  createSession(creatorName: string): { session: Session; creatorId: string } {
    let code = generateCode();
    while (this.sessions.has(code)) {
      code = generateCode();
    }

    const creatorId = generateId();
    const creator: Participant = {
      id: creatorId,
      name: creatorName,
      joinedAt: new Date().toISOString(),
      type: 'human',
    };

    const session: Session = {
      code,
      createdAt: new Date().toISOString(),
      status: 'active',
      participants: new Map([[creatorId, creator]]),
      submissions: [],
      messages: [],
      jam: null,
      contracts: null,
      integrationReport: null,
      config: { ...DEFAULT_SESSION_CONFIG },
      priorities: [],
      votes: [],
      workItems: [],
      workItemDependencies: [],
      drafts: [],
      requirements: [],
    };

    this.sessions.set(code, session);

    if (this.eventStore) {
      this.eventStore.append(code, {
        type: 'SessionCreated',
        eventId: generateId(),
        sessionCode: code,
        timestamp: session.createdAt,
        creatorName,
        creatorId,
      } satisfies SessionCreated);
    }

    return { session, creatorId };
  }

  joinSession(
    code: string,
    participantName: string,
    participantType: ParticipantType = 'human',
    capabilities?: string[]
  ): { session: Session; participantId: string } | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;

    // Idempotency: if a participant with the same name already exists, return them
    for (const [existingId, existing] of session.participants) {
      if (existing.name === participantName) {
        return { session, participantId: existingId };
      }
    }

    const participantId = generateId();
    const participant: Participant = {
      id: participantId,
      name: participantName,
      joinedAt: new Date().toISOString(),
      type: participantType,
      ...(capabilities !== undefined && { capabilities }),
    };

    session.participants.set(participantId, participant);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ParticipantJoined',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: participant.joinedAt,
        participantId,
        participantName,
        participantType,
      } satisfies ParticipantJoined);
    }

    return { session, participantId };
  }

  submitYaml(
    code: string,
    participantId: string,
    fileName: string,
    data: CandidateEventsFile
  ): Submission | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    if (session.status === 'closed') return null;
    if (!session.participants.has(participantId)) return null;

    // Idempotency: find existing submission for same participant+fileName
    const existingIndex = session.submissions.findIndex(
      (s) => s.participantId === participantId && s.fileName === fileName
    );

    const contentHash = JSON.stringify(data);

    if (existingIndex !== -1) {
      const existing = session.submissions[existingIndex];
      // If content is identical, return the existing submission without mutation
      if (JSON.stringify(existing.data) === contentHash) {
        return existing;
      }
      // Content changed — update in-place (replace the existing entry)
      const updated: Submission = {
        participantId,
        fileName,
        data,
        submittedAt: new Date().toISOString(),
      };
      session.submissions[existingIndex] = updated;

      if (this.eventStore) {
        const version = 2; // existing was version 1; this is an update
        this.eventStore.append(session.code, {
          type: 'ArtifactSubmitted',
          eventId: generateId(),
          sessionCode: session.code,
          timestamp: updated.submittedAt,
          artifactId: generateId(),
          participantId,
          fileName,
          artifactType: 'candidate-events',
          version,
        } satisfies ArtifactSubmitted);
      }

      return updated;
    }

    const submission: Submission = {
      participantId,
      fileName,
      data,
      submittedAt: new Date().toISOString(),
    };

    session.submissions.push(submission);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ArtifactSubmitted',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: submission.submittedAt,
        artifactId: generateId(),
        participantId,
        fileName,
        artifactType: 'candidate-events',
        version: 1,
      } satisfies ArtifactSubmitted);
    }

    return submission;
  }

  getSession(code: string): Session | null {
    return this.sessions.get(code.toUpperCase()) ?? null;
  }

  pauseSession(code: string): boolean {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return false;
    if (!canTransition(session.status, 'pause')) return false;
    session.status = transitionSession(session.status, 'pause');
    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'SessionPaused',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
      } satisfies SessionPaused);
    }
    return true;
  }

  resumeSession(code: string): boolean {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return false;
    if (!canTransition(session.status, 'resume')) return false;
    session.status = transitionSession(session.status, 'resume');
    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'SessionResumed',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
      } satisfies SessionResumed);
    }
    return true;
  }

  closeSession(code: string): boolean {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return false;
    if (!canTransition(session.status, 'close')) return false;
    session.status = transitionSession(session.status, 'close');
    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'SessionClosed',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
      } satisfies SessionClosed);
    }
    return true;
  }

  startJam(code: string): JamArtifacts | null {
    const session = this.sessions.get(code.toUpperCase());
    if (session?.status === 'closed') return null;
    return this.agreementService.startJam(code.toUpperCase());
  }

  resolveConflict(
    code: string,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): ConflictResolution | null {
    const session = this.sessions.get(code.toUpperCase());
    if (session?.status === 'closed') return null;
    return this.agreementService.resolveConflict(code.toUpperCase(), resolution);
  }

  assignOwnership(
    code: string,
    assignment: Omit<OwnershipAssignment, 'assignedAt'>
  ): OwnershipAssignment | null {
    const session = this.sessions.get(code.toUpperCase());
    if (session?.status === 'closed') return null;
    return this.agreementService.assignOwnership(code.toUpperCase(), assignment);
  }

  flagUnresolved(
    code: string,
    item: Omit<UnresolvedItem, 'id' | 'flaggedAt'>
  ): UnresolvedItem | null {
    const session = this.sessions.get(code.toUpperCase());
    if (session?.status === 'closed') return null;
    return this.agreementService.flagUnresolved(code.toUpperCase(), item);
  }

  exportJam(code: string): JamArtifacts | null {
    return this.agreementService.exportJam(code.toUpperCase());
  }

  loadContracts(code: string, bundle: ContractBundle): ContractBundle | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    session.contracts = bundle;

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ContractGenerated',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
        contractId: generateId(),
        version: 1,
      } satisfies ContractGenerated);
    }

    return bundle;
  }

  getContracts(code: string): ContractBundle | null {
    const session = this.sessions.get(code.toUpperCase());
    return session?.contracts ?? null;
  }

  loadIntegrationReport(code: string, report: IntegrationReport): IntegrationReport | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    session.integrationReport = report;

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ComplianceCheckCompleted',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
        contractId: generateId(),
        passed: report.overallStatus === 'pass',
        failures: report.checks
          .filter((c) => c.status === 'fail')
          .map((c) => c.message),
      } satisfies ComplianceCheckCompleted);
    }

    return report;
  }

  getIntegrationReport(code: string): IntegrationReport | null {
    const session = this.sessions.get(code.toUpperCase());
    return session?.integrationReport ?? null;
  }

  getSessionConfig(code: string): SessionConfig {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) throw new Error(`Session not found: ${code}`);
    return session.config;
  }

  updateSessionConfig(
    code: string,
    delta: Partial<SessionConfig>,
    changedBy: string = 'system'
  ): SessionConfig {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) throw new Error(`Session not found: ${code}`);

    // Deep merge: shallow merge at each top-level key
    const updatedConfig: SessionConfig = { ...session.config };
    for (const key of Object.keys(delta) as (keyof SessionConfig)[]) {
      const sectionDelta = delta[key];
      if (sectionDelta !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updatedConfig as any)[key] = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(session.config[key] as any),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(sectionDelta as any),
        };
      }
    }
    session.config = updatedConfig;

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'SessionConfigured',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
        configDelta: delta as Record<string, unknown>,
        changedBy,
      } satisfies SessionConfigured);
    }

    return session.config;
  }

  sendMessage(
    code: string,
    fromId: string,
    content: string,
    toId?: string
  ): SessionMessage | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    if (session.status === 'closed') return null;
    const sender = session.participants.get(fromId);
    if (!sender) return null;

    let recipient: Participant | undefined;
    if (toId) {
      recipient = session.participants.get(toId);
      if (!recipient) return null;
    }

    const msg: SessionMessage = {
      id: generateId(),
      from: sender.name,
      fromId,
      content,
      timestamp: new Date().toISOString(),
    };
    if (toId && recipient) {
      msg.to = recipient.name;
      msg.toId = toId;
    }
    session.messages.push(msg);
    return msg;
  }

  getMessages(
    code: string,
    participantId: string,
    since?: string
  ): SessionMessage[] {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return [];

    return session.messages.filter(msg => {
      // Include if broadcast (no toId) or if sent to this participant or sent by this participant
      const isRelevant = !msg.toId || msg.toId === participantId || msg.fromId === participantId;
      if (!isRelevant) return false;
      if (since) {
        return msg.timestamp > since;
      }
      return true;
    });
  }

  loadSessions(sessions: Map<string, Session>): void {
    for (const [code, session] of sessions) {
      this.sessions.set(code, session);
    }
  }

  exportSessions(): Map<string, Session> {
    return new Map(this.sessions);
  }

  getSessionFiles(code: string): LoadedFile[] {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return [];

    return session.submissions.map((sub) => ({
      filename: sub.fileName,
      role: session.participants.get(sub.participantId)?.name ?? 'unknown',
      data: sub.data,
    }));
  }

  // ---------------------------------------------------------------------------
  // Requirements CRUD
  // ---------------------------------------------------------------------------

  addRequirement(
    code: string,
    participantId: string,
    statement: string,
    tags?: string[]
  ): Requirement | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    if (session.status === 'closed') return null;
    if (!session.participants.has(participantId)) return null;

    const now = new Date().toISOString();
    const requirement: Requirement = {
      id: generateId(),
      statement,
      authorId: participantId,
      status: 'draft',
      priority: 0,
      tags: tags ?? [],
      derivedEvents: [],
      derivedAssumptions: [],
      createdAt: now,
      updatedAt: now,
    };

    session.requirements.push(requirement);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'RequirementSubmitted',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: now,
        requirementId: requirement.id,
        statement,
        authorId: participantId,
        ...(tags && tags.length > 0 ? { tags } : {}),
      } satisfies RequirementSubmitted);
    }

    return requirement;
  }

  updateRequirement(
    code: string,
    requirementId: string,
    updates: Partial<Pick<Requirement, 'status' | 'priority' | 'tags' | 'derivedEvents' | 'derivedAssumptions'>>
  ): Requirement | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
    if (session.status === 'closed') return null;

    const requirement = session.requirements.find(r => r.id === requirementId);
    if (!requirement) return null;

    if (updates.status !== undefined) requirement.status = updates.status;
    if (updates.priority !== undefined) requirement.priority = updates.priority;
    if (updates.tags !== undefined) requirement.tags = updates.tags;
    if (updates.derivedEvents !== undefined) requirement.derivedEvents = updates.derivedEvents;
    if (updates.derivedAssumptions !== undefined) requirement.derivedAssumptions = updates.derivedAssumptions;
    requirement.updatedAt = new Date().toISOString();

    return requirement;
  }

  getRequirements(code: string): Requirement[] {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return [];
    return session.requirements;
  }

  getRequirementCoverage(
    code: string,
    requirementId?: string
  ): { reqId: string; eventCount: number; fulfilled: boolean }[] {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return [];

    let requirements = session.requirements;
    if (requirementId) {
      requirements = requirements.filter(r => r.id === requirementId);
    }

    return requirements.map(r => ({
      reqId: r.id,
      eventCount: r.derivedEvents.length,
      fulfilled: r.derivedEvents.length > 0,
    }));
  }
}
