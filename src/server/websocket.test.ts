/**
 * Tests for the WebSocket server message handler logic.
 *
 * Uses mock WebSocket objects to exercise the handler without real TCP.
 * This matches the approach used in the original SSE tests and avoids
 * sandbox/network restrictions in test environments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { EventStore } from '../contexts/session/event-store.js';
import type { DomainEvent } from '../contexts/session/domain-events.js';
import type { ServerMessage } from './websocket.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

/**
 * Minimal mock of a `ws` WebSocket.
 * Extends EventEmitter so .on/.emit work as expected.
 * The `readyState` is 1 (OPEN) by default.
 */
class MockWebSocket extends EventEmitter {
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  sent: ServerMessage[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }

  ping(): void {
    // no-op in mock
  }

  terminate(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  /** Helper: simulate an incoming message from the client. */
  receiveRaw(data: string): void {
    this.emit('message', Buffer.from(data));
  }

  /** Helper: simulate an incoming JSON message from the client. */
  receive(msg: object): void {
    this.receiveRaw(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------------------
// Mock WebSocketServer
// ---------------------------------------------------------------------------

/**
 * Simulates the `wss` instance returned by `new WebSocketServer(...)`.
 * Lets us manually trigger a "connection" event.
 */
class MockWss extends EventEmitter {
  closed = false;

  close(): void {
    this.closed = true;
    this.emit('close');
  }

  /** Simulate a new client connecting. */
  connect(ws: MockWebSocket): void {
    this.emit('connection', ws);
  }
}

// ---------------------------------------------------------------------------
// Inline the handler logic for testing without real WebSocketServer
//
// We re-implement the per-connection handler directly, extracted from
// createWebSocketServer. This mirrors how createSseHandler was tested:
// by calling the factory and exercising the returned handler directly.
// ---------------------------------------------------------------------------

import { createWebSocketServer } from './websocket.js';
import type http from 'node:http';

/**
 * Minimal mock HTTP server that supports the 'upgrade' event and .address().
 * Enough for createWebSocketServer to attach without real TCP.
 */
class MockHttpServer extends EventEmitter {
  address() {
    return { port: 9999 };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(sessionCode: string, type: DomainEvent['type'] = 'SessionCreated'): DomainEvent {
  if (type === 'SessionCreated') {
    return {
      eventId: crypto.randomUUID(),
      sessionCode,
      timestamp: new Date().toISOString(),
      type: 'SessionCreated',
      creatorName: 'Alice',
      creatorId: 'p-001',
    };
  }
  if (type === 'ParticipantJoined') {
    return {
      eventId: crypto.randomUUID(),
      sessionCode,
      timestamp: new Date().toISOString(),
      type: 'ParticipantJoined',
      participantId: 'p-002',
      participantName: 'Bob',
      participantType: 'human',
    };
  }
  return {
    eventId: crypto.randomUUID(),
    sessionCode,
    timestamp: new Date().toISOString(),
    type: 'ArtifactSubmitted',
    artifactId: 'a-001',
    participantId: 'p-001',
    fileName: 'events.yaml',
    artifactType: 'candidate-events',
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// Unit tests for the WebSocket protocol handler
//
// Strategy: We mock the `ws` library's WebSocketServer so we can drive
// "connection" events directly with mock WebSocket objects, then verify
// the messages that were sent back.
// ---------------------------------------------------------------------------

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');

  // Return the stored mock wss instance for each test to grab
  let latestWss: MockWss | null = null;

  class WebSocketServerMock extends EventEmitter {
    constructor() {
      super();
      latestWss = this as unknown as MockWss;
    }
    close() {
      this.emit('close');
    }
  }

  class WebSocketMock extends EventEmitter {
    static readonly OPEN = 1;
    readyState = 1;
    sent: string[] = [];
    send(data: string) { this.sent.push(data); }
    ping() {}
    terminate() { this.emit('close'); }
  }

  return {
    WebSocketServer: WebSocketServerMock,
    WebSocket: WebSocketMock,
    // Expose the latest wss so tests can grab it
    _getLatestWss: () => latestWss,
  };
});

// Import AFTER mocking so the module under test gets the mock
const { _getLatestWss } = await import('ws') as unknown as { _getLatestWss: () => MockWss };

// ---------------------------------------------------------------------------
// Helper: create a testable WebSocket handler environment
// ---------------------------------------------------------------------------

function createTestEnvironment() {
  const es = new EventStore();
  // Use a minimal mock http server
  const httpServer = new MockHttpServer() as unknown as http.Server;
  createWebSocketServer(httpServer, es);
  const wss = _getLatestWss();

  function connectClient() {
    const ws = new (class extends EventEmitter {
      static readonly OPEN = 1;
      readyState = 1;
      sent: string[] = [];
      sentParsed: ServerMessage[] = [];

      send(data: string): void {
        this.sent.push(data);
        this.sentParsed.push(JSON.parse(data) as ServerMessage);
      }

      ping(): void {}
      terminate(): void { this.readyState = 3; this.emit('close'); }
      close(): void { this.readyState = 3; this.emit('close'); }

      receive(msg: object): void {
        this.emit('message', Buffer.from(JSON.stringify(msg)));
      }

      receiveRaw(data: string): void {
        this.emit('message', Buffer.from(data));
      }
    })();

    // Trigger the wss 'connection' event with our mock client
    (wss as unknown as EventEmitter).emit('connection', ws);
    return ws;
  }

  return { es, wss, connectClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket server (unit)', () => {
  describe('Given a client connects', () => {
    it('sends a connected message immediately', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      expect(ws.sentParsed[0]).toEqual({ type: 'connected' });
    });
  });

  describe('Given a client sends join with a valid sessionCode', () => {
    it('responds with a joined message for that session', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receive({ type: 'join', sessionCode: 'SESS1' });

      const joinedMsg = ws.sentParsed.find((m) => m.type === 'joined');
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg?.sessionCode).toBe('SESS1');
    });

    it('replays historical events for the session on join', () => {
      const { es, connectClient } = createTestEnvironment();
      es.append('SESS1', makeEvent('SESS1', 'SessionCreated'));
      es.append('SESS1', makeEvent('SESS1', 'ParticipantJoined'));

      const ws = connectClient();
      ws.receive({ type: 'join', sessionCode: 'SESS1' });

      const eventMsgs = ws.sentParsed.filter((m) => m.type === 'event');
      expect(eventMsgs).toHaveLength(2);
      expect(eventMsgs[0].event?.type).toBe('SessionCreated');
      expect(eventMsgs[1].event?.type).toBe('ParticipantJoined');
    });

    it('normalizes sessionCode to uppercase on join', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receive({ type: 'join', sessionCode: 'sess1' });

      const joinedMsg = ws.sentParsed.find((m) => m.type === 'joined');
      expect(joinedMsg?.sessionCode).toBe('SESS1');
    });
  });

  describe('Given a client sends join without sessionCode', () => {
    it('responds with an error message', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receive({ type: 'join' });

      const errorMsg = ws.sentParsed.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg?.message).toMatch(/sessionCode/i);
    });
  });

  describe('Given a live domain event is appended', () => {
    it('broadcasts the event only to clients in that session', () => {
      const { es, connectClient } = createTestEnvironment();

      const ws1 = connectClient();
      const ws2 = connectClient();

      ws1.receive({ type: 'join', sessionCode: 'SESS1' });
      ws2.receive({ type: 'join', sessionCode: 'SESS2' });

      // Clear sent messages so far
      const sentCountBefore1 = ws1.sentParsed.length;
      const sentCountBefore2 = ws2.sentParsed.length;

      es.append('SESS1', makeEvent('SESS1', 'ParticipantJoined'));

      const newForWs1 = ws1.sentParsed.slice(sentCountBefore1);
      const newForWs2 = ws2.sentParsed.slice(sentCountBefore2);

      expect(newForWs1).toHaveLength(1);
      expect(newForWs1[0].type).toBe('event');
      expect(newForWs1[0].event?.sessionCode).toBe('SESS1');

      // ws2 should receive nothing
      expect(newForWs2).toHaveLength(0);
    });

    it('does not broadcast to clients in a different session', () => {
      const { es, connectClient } = createTestEnvironment();
      const ws = connectClient();
      ws.receive({ type: 'join', sessionCode: 'SESS2' });

      const sentBefore = ws.sentParsed.length;
      es.append('SESS1', makeEvent('SESS1', 'SessionCreated'));

      expect(ws.sentParsed.slice(sentBefore)).toHaveLength(0);
    });
  });

  describe('Given a client sends an unknown message type', () => {
    it('responds with an error message', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receive({ type: 'unknownAction' });

      const errorMsg = ws.sentParsed.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
    });
  });

  describe('Given a client sends invalid JSON', () => {
    it('responds with an error message', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receiveRaw('not valid JSON {{{');

      const errorMsg = ws.sentParsed.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg?.message).toMatch(/invalid json/i);
    });
  });

  describe('Given a client sends ping', () => {
    it('responds with pong', () => {
      const { connectClient } = createTestEnvironment();
      const ws = connectClient();

      ws.receive({ type: 'ping' });

      const pongMsg = ws.sentParsed.find((m) => m.type === 'pong');
      expect(pongMsg).toBeDefined();
    });
  });

  describe('Given a client disconnects', () => {
    it('no longer receives events after disconnecting', () => {
      const { es, connectClient } = createTestEnvironment();
      const ws = connectClient();
      ws.receive({ type: 'join', sessionCode: 'SESS1' });

      // Disconnect
      ws.close();

      const sentBefore = ws.sentParsed.length;
      es.append('SESS1', makeEvent('SESS1', 'ParticipantJoined'));

      // No new messages should arrive
      expect(ws.sentParsed.slice(sentBefore)).toHaveLength(0);
    });
  });

  describe('Given a client sends leave', () => {
    it('stops receiving events for the previously joined session', () => {
      const { es, connectClient } = createTestEnvironment();
      const ws = connectClient();
      ws.receive({ type: 'join', sessionCode: 'SESS1' });

      ws.receive({ type: 'leave' });

      const sentBefore = ws.sentParsed.length;
      es.append('SESS1', makeEvent('SESS1', 'ParticipantJoined'));

      expect(ws.sentParsed.slice(sentBefore)).toHaveLength(0);
    });
  });
});
