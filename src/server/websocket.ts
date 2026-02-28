/**
 * WebSocket server for real-time domain event streaming.
 *
 * Replaces the SSE endpoint with full-duplex WebSocket communication.
 * Extracted as a pure factory function (like createSseHandler) for testability.
 *
 * Message protocol:
 *   Client → Server: { type: "join", sessionCode: string }
 *   Client → Server: { type: "leave" }
 *   Server → Client: { type: "connected" }
 *   Server → Client: { type: "joined", sessionCode: string }
 *   Server → Client: { type: "event", event: DomainEvent }
 *   Server → Client: { type: "error", message: string }
 *   Server → Client: { type: "pong" } (heartbeat response)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type http from 'node:http';
import type { EventStore } from '../contexts/session/event-store.js';
import type { DomainEvent } from '../contexts/session/domain-events.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientMessage {
  type: 'join' | 'leave' | 'ping';
  sessionCode?: string;
}

export interface ServerMessage {
  type: 'connected' | 'joined' | 'event' | 'error' | 'pong';
  sessionCode?: string;
  event?: DomainEvent;
  message?: string;
}

// Internal state per WebSocket connection
interface ClientState {
  sessionCode: string | null;
  isAlive: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Create a WebSocket server attached to the given HTTP server.
 *
 * Call `wss.close()` to shut down cleanly in tests.
 */
export function createWebSocketServer(
  httpServer: http.Server,
  es: EventStore
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  // Map from WebSocket to per-client state (session membership + liveness)
  const clients = new Map<WebSocket, ClientState>();

  // Subscribe to the EventStore once; forward to all clients in the matching session
  const unsubscribeFromStore = es.subscribe((event: DomainEvent) => {
    const msg: ServerMessage = { type: 'event', event };
    const serialized = JSON.stringify(msg);

    for (const [ws, state] of clients) {
      if (
        state.sessionCode === event.sessionCode &&
        ws.readyState === WebSocket.OPEN
      ) {
        ws.send(serialized);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Heartbeat — terminate connections that have gone silent
  // ---------------------------------------------------------------------------

  const heartbeatTimer = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        // No pong received since last ping — terminate the connection
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Ensure the interval doesn't prevent the process from exiting in tests
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }

  // ---------------------------------------------------------------------------
  // Connection handling
  // ---------------------------------------------------------------------------

  wss.on('connection', (ws: WebSocket) => {
    const state: ClientState = { sessionCode: null, isAlive: true };
    clients.set(ws, state);

    // Confirm connection
    sendMessage(ws, { type: 'connected' });

    ws.on('pong', () => {
      const s = clients.get(ws);
      if (s) s.isAlive = true;
    });

    ws.on('message', (raw: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendMessage(ws, { type: 'error', message: 'Invalid JSON message' });
        return;
      }

      handleClientMessage(ws, state, msg, es);
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    unsubscribeFromStore();
  });

  return wss;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleClientMessage(
  ws: WebSocket,
  state: ClientState,
  msg: ClientMessage,
  es: EventStore
): void {
  switch (msg.type) {
    case 'join': {
      const sessionCode = msg.sessionCode?.toUpperCase();
      if (!sessionCode) {
        sendMessage(ws, { type: 'error', message: 'sessionCode is required for join' });
        return;
      }
      state.sessionCode = sessionCode;

      // Replay all historical events for the session so the client is caught up
      const historical = es.getEvents(sessionCode);
      for (const event of historical) {
        sendMessage(ws, { type: 'event', event });
      }

      sendMessage(ws, { type: 'joined', sessionCode });
      break;
    }

    case 'leave': {
      state.sessionCode = null;
      break;
    }

    case 'ping': {
      sendMessage(ws, { type: 'pong' });
      break;
    }

    default: {
      sendMessage(ws, { type: 'error', message: `Unknown message type: ${(msg as { type: string }).type}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
