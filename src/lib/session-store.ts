import type { CandidateEventsFile, LoadedFile } from '../schema/types.js';

/** A participant in a collaborative session */
export interface Participant {
  id: string;
  name: string;
}

/** A YAML submission by a participant */
export interface Submission {
  participantId: string;
  fileName: string;
  data: CandidateEventsFile;
  submittedAt: string;
}

/** A collaborative session */
export interface Session {
  code: string;
  createdAt: string;
  participants: Participant[];
  submissions: Submission[];
}

/** Serialized session (safe to send over the wire) */
export type SerializedSession = Session;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  createSession(creatorName: string): { session: Session; creatorId: string } {
    const creatorId = generateId();
    const code = generateCode();
    const session: Session = {
      code,
      createdAt: new Date().toISOString(),
      participants: [{ id: creatorId, name: creatorName }],
      submissions: [],
    };
    this.sessions.set(code, session);
    return { session, creatorId };
  }

  joinSession(
    code: string,
    participantName: string
  ): { session: Session; participantId: string } | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    const participantId = generateId();
    session.participants.push({ id: participantId, name: participantName });
    return { session, participantId };
  }

  submitYaml(
    code: string,
    participantId: string,
    fileName: string,
    data: CandidateEventsFile
  ): Submission | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    const participant = session.participants.find((p) => p.id === participantId);
    if (!participant) return null;
    const submission: Submission = {
      participantId,
      fileName,
      data,
      submittedAt: new Date().toISOString(),
    };
    // Replace prior submission by same participant
    const idx = session.submissions.findIndex((s) => s.participantId === participantId);
    if (idx >= 0) {
      session.submissions[idx] = submission;
    } else {
      session.submissions.push(submission);
    }
    return submission;
  }

  getSession(code: string): Session | null {
    return this.sessions.get(code) ?? null;
  }

  getSessionFiles(code: string): LoadedFile[] {
    const session = this.sessions.get(code);
    if (!session) return [];
    return session.submissions.map((s) => ({
      filename: s.fileName,
      role: s.data.metadata.role,
      data: s.data,
    }));
  }
}
