import type { CandidateEventsFile, LoadedFile } from '../schema/types.js';

export interface Session {
  code: string;
  createdAt: Date;
  participants: Map<string, Participant>;
  submissions: Submission[];
}

export interface Participant {
  id: string;
  name: string;
  joinedAt: Date;
}

export interface Submission {
  participantId: string;
  fileName: string;
  data: CandidateEventsFile;
  submittedAt: Date;
}

// Alphabet excluding confusing chars: 0/O, 1/I/L
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    code += CODE_ALPHABET[index];
  }
  return code;
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();

  createSession(creatorName: string): Session {
    let code = generateJoinCode();
    // Retry until we get a unique code
    while (this.sessions.has(code)) {
      code = generateJoinCode();
    }

    const creatorId = crypto.randomUUID();
    const creator: Participant = {
      id: creatorId,
      name: creatorName,
      joinedAt: new Date(),
    };

    const session: Session = {
      code,
      createdAt: new Date(),
      participants: new Map([[creatorId, creator]]),
      submissions: [],
    };

    this.sessions.set(code, session);
    return session;
  }

  joinSession(code: string, participantName: string): Session | null {
    const session = this.sessions.get(code);
    if (!session) return null;

    const participantId = crypto.randomUUID();
    const participant: Participant = {
      id: participantId,
      name: participantName,
      joinedAt: new Date(),
    };

    session.participants.set(participantId, participant);
    return session;
  }

  submitYaml(
    code: string,
    participantId: string,
    fileName: string,
    data: CandidateEventsFile
  ): Submission | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    if (!session.participants.has(participantId)) return null;

    const submission: Submission = {
      participantId,
      fileName,
      data,
      submittedAt: new Date(),
    };

    session.submissions.push(submission);
    return submission;
  }

  getSession(code: string): Session | null {
    return this.sessions.get(code) ?? null;
  }

  getSessionFiles(code: string): LoadedFile[] {
    const session = this.sessions.get(code);
    if (!session) return [];

    return session.submissions.map((submission) => ({
      filename: submission.fileName,
      role: submission.data.metadata.role,
      data: submission.data,
    }));
  }
}
