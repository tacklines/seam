import { SessionStore } from '../lib/session-store.js';
import { SessionPersistence } from '../lib/session-persistence.js';
import { EventStore } from '../contexts/session/event-store.js';

const DATA_PATH = process.env.SESSION_DATA_PATH ?? './data/sessions.json';

const persistence = new SessionPersistence(DATA_PATH);

/** Shared singleton EventStore used by both the HTTP server and MCP server. */
export const eventStore = new EventStore();

/** Shared singleton SessionStore used by both the HTTP server and MCP server. */
export const sessionStore = new SessionStore();

// Load persisted sessions on startup
try {
  const loaded = persistence.load();
  sessionStore.loadSessions(loaded);
  if (loaded.size > 0) {
    console.error(`[store] restored ${loaded.size} session(s) from ${DATA_PATH}`);
  }
} catch (err) {
  console.error('[store] failed to load persisted sessions:', err);
}

// ---------------------------------------------------------------------------
// Auto-persistence via event subscription
// Debounced: rapid event bursts (e.g. session creation) trigger only one write.
// ---------------------------------------------------------------------------

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    try {
      persistence.save(sessionStore.exportSessions());
    } catch (err) {
      console.error('[store] failed to persist sessions:', err);
    }
  }, 100);
}

eventStore.subscribe(() => {
  schedulePersist();
});
