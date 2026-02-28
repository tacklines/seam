import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Session, Participant, SerializedSession } from './session-store.js';

// ---------------------------------------------------------------------------
// JSON serialization types
// ---------------------------------------------------------------------------

interface PersistenceFile {
  version: 1;
  sessions: SerializedSession[];
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function sessionToJson(session: Session): SerializedSession {
  return {
    code: session.code,
    createdAt: session.createdAt,
    participants: Array.from(session.participants.values()),
    submissions: session.submissions,
    jam: session.jam,
    contracts: session.contracts,
    integrationReport: session.integrationReport,
    messages: session.messages,
  };
}

function sessionFromJson(json: SerializedSession): Session {
  const participants = new Map<string, Participant>(
    json.participants.map((p) => [p.id, p])
  );
  return {
    code: json.code,
    createdAt: json.createdAt,
    participants,
    submissions: json.submissions,
    jam: json.jam,
    contracts: json.contracts,
    integrationReport: json.integrationReport,
    messages: json.messages ?? [],
  };
}

// ---------------------------------------------------------------------------
// SessionPersistence class
// ---------------------------------------------------------------------------

const DEFAULT_FILE_PATH = './data/sessions.json';

export class SessionPersistence {
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_FILE_PATH) {
    this.filePath = filePath;
  }

  save(sessions: Map<string, Session>): void {
    const data: PersistenceFile = {
      version: 1,
      sessions: Array.from(sessions.values()).map(sessionToJson),
    };
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  load(): Map<string, Session> {
    if (!fs.existsSync(this.filePath)) {
      return new Map();
    }

    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const data = JSON.parse(raw) as PersistenceFile;

    const sessions = new Map<string, Session>();
    for (const sessionJson of data.sessions) {
      const session = sessionFromJson(sessionJson);
      sessions.set(session.code, session);
    }
    return sessions;
  }
}
