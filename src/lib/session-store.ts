import { CandidateEventsFile, LoadedFile } from '../schema/types.js';

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

export interface Session {
  code: string;
  createdAt: string;
  participants: Map<string, Participant>;
  submissions: Submission[];
}

export interface SerializedSession {
  code: string;
  createdAt: string;
  participants: Participant[];
  submissions: Submission[];
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function serializeSession(session: Session): SerializedSession {
  return {
    code: session.code,
    createdAt: session.createdAt,
    participants: Array.from(session.participants.values()),
    submissions: session.submissions,
  };
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();

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
    };

    this.sessions.set(code, session);
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
    return submission;
  }

  getSession(code: string): Session | null {
    return this.sessions.get(code.toUpperCase()) ?? null;
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
