import {
  CandidateEventsFile,
  LoadedFile,
  JamArtifacts,
  OwnershipAssignment,
  ConflictResolution,
  UnresolvedItem,
  ContractBundle,
  IntegrationReport,
} from '../schema/types.js';
import { EventStore } from '../contexts/session/event-store.js';
import type {
  SessionCreated,
  ParticipantJoined,
  ArtifactSubmitted,
  ContractGenerated,
  ComplianceCheckCompleted,
} from '../contexts/session/domain-events.js';
import { AgreementService } from '../contexts/agreement/agreement-service.js';

export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
}

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
  participants: Map<string, Participant>;
  submissions: Submission[];
  messages: SessionMessage[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
}

export interface SerializedSession {
  code: string;
  createdAt: string;
  participants: Participant[];
  submissions: Submission[];
  messages: SessionMessage[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
  integrationReport: IntegrationReport | null;
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
    participants: Array.from(session.participants.values()),
    submissions: session.submissions,
    messages: session.messages,
    jam: session.jam,
    contracts: session.contracts,
    integrationReport: session.integrationReport,
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
    };

    const session: Session = {
      code,
      createdAt: new Date().toISOString(),
      participants: new Map([[creatorId, creator]]),
      submissions: [],
      messages: [],
      jam: null,
      contracts: null,
      integrationReport: null,
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

  joinSession(code: string, participantName: string): { session: Session; participantId: string } | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;

    const participantId = generateId();
    const participant: Participant = {
      id: participantId,
      name: participantName,
      joinedAt: new Date().toISOString(),
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
        participantType: 'human',
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
    if (!session.participants.has(participantId)) return null;

    const submission: Submission = {
      participantId,
      fileName,
      data,
      submittedAt: new Date().toISOString(),
    };

    session.submissions.push(submission);

    if (this.eventStore) {
      // Count how many times this participant has submitted this fileName
      const version = session.submissions.filter(
        (s) => s.participantId === participantId && s.fileName === fileName
      ).length;
      this.eventStore.append(session.code, {
        type: 'ArtifactSubmitted',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: submission.submittedAt,
        artifactId: generateId(),
        participantId,
        fileName,
        artifactType: 'candidate-events',
        version,
      } satisfies ArtifactSubmitted);
    }

    return submission;
  }

  getSession(code: string): Session | null {
    return this.sessions.get(code.toUpperCase()) ?? null;
  }

  startJam(code: string): JamArtifacts | null {
    return this.agreementService.startJam(code.toUpperCase());
  }

  resolveConflict(
    code: string,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): ConflictResolution | null {
    return this.agreementService.resolveConflict(code.toUpperCase(), resolution);
  }

  assignOwnership(
    code: string,
    assignment: Omit<OwnershipAssignment, 'assignedAt'>
  ): OwnershipAssignment | null {
    return this.agreementService.assignOwnership(code.toUpperCase(), assignment);
  }

  flagUnresolved(
    code: string,
    item: Omit<UnresolvedItem, 'id' | 'flaggedAt'>
  ): UnresolvedItem | null {
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

  sendMessage(
    code: string,
    fromId: string,
    content: string,
    toId?: string
  ): SessionMessage | null {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) return null;
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
}
