/**
 * Lightweight WebSocket connection for project-level broadcasts.
 *
 * Unlike session-connection.ts (which is tied to a session code), this module
 * manages a shared WS connection for project-scoped events like metrics updates.
 * Multiple subscribers can register callbacks for a project; the connection is
 * opened lazily and closed when the last subscriber disconnects.
 */

function getWsBase(): string {
  const env = (import.meta as any).env?.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

const RECONNECT_MS = 5_000;

interface ProjectConnection {
  ws: WebSocket | null;
  listeners: Map<number, () => void>;
  projectId: string;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  nextId: number;
}

const connections = new Map<string, ProjectConnection>();

function getOrCreateConnection(projectId: string): ProjectConnection {
  let conn = connections.get(projectId);
  if (!conn) {
    conn = {
      ws: null,
      listeners: new Map(),
      projectId,
      reconnectTimer: null,
      nextId: 0,
    };
    connections.set(projectId, conn);
  }
  return conn;
}

function openSocket(conn: ProjectConnection): void {
  if (conn.ws) return;

  const ws = new WebSocket(getWsBase());
  conn.ws = ws;

  ws.addEventListener("open", () => {
    ws.send(
      JSON.stringify({
        type: "subscribe_project",
        projectId: conn.projectId,
      }),
    );
  });

  ws.addEventListener("message", (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: string;
        project_id?: string;
      };
      if (
        msg.type === "metrics_update" &&
        msg.project_id === conn.projectId
      ) {
        for (const cb of conn.listeners.values()) {
          cb();
        }
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener("close", () => {
    conn.ws = null;
    if (conn.listeners.size > 0) {
      conn.reconnectTimer = setTimeout(() => {
        conn.reconnectTimer = null;
        if (conn.listeners.size > 0) {
          openSocket(conn);
        }
      }, RECONNECT_MS);
    }
  });

  ws.addEventListener("error", () => {
    // error always followed by close
  });
}

function teardownConnection(conn: ProjectConnection): void {
  if (conn.reconnectTimer !== null) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }
  if (conn.ws) {
    conn.ws.close();
    conn.ws = null;
  }
  connections.delete(conn.projectId);
}

/**
 * Subscribe to metrics_update events for a project.
 * Returns an unsubscribe function.
 */
export function subscribeProjectMetrics(
  projectId: string,
  onUpdate: () => void,
): () => void {
  const conn = getOrCreateConnection(projectId);
  const id = conn.nextId++;
  conn.listeners.set(id, onUpdate);

  // Open socket if not already connected
  if (!conn.ws) {
    openSocket(conn);
  }

  return () => {
    conn.listeners.delete(id);
    if (conn.listeners.size === 0) {
      teardownConnection(conn);
    }
  };
}

/**
 * Unsubscribe all listeners for a project and close the connection.
 */
export function unsubscribeProjectMetrics(projectId: string): void {
  const conn = connections.get(projectId);
  if (conn) {
    conn.listeners.clear();
    teardownConnection(conn);
  }
}
