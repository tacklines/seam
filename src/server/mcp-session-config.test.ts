/**
 * Tests for the configure_session and get_session_config MCP tool handlers.
 *
 * The MCP server registers tools at process startup via stdio transport, so we
 * cannot directly call registerTool handlers in unit tests. Instead these tests
 * exercise the SessionStore methods that the handlers wrap, using the exact same
 * calling conventions the handlers use. This validates the round-trip logic
 * (error handling, deep-merge, domain-event emission) that each tool exercises.
 */
import { describe, it, expect } from 'vitest';
import { SessionStore } from '../lib/session-store.js';
import { EventStore } from '../contexts/session/event-store.js';
import { DEFAULT_SESSION_CONFIG } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers — mirror the handler patterns used in mcp.ts
// ---------------------------------------------------------------------------

/** Simulates the get_session_config handler logic */
function handleGetSessionConfig(
  store: SessionStore,
  code: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    const config = store.getSessionConfig(code);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ config }) }] };
  } catch {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
      isError: true,
    };
  }
}

/** Simulates the configure_session handler logic */
function handleConfigureSession(
  store: SessionStore,
  code: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delta: Record<string, any>,
  changedBy?: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    const updatedConfig = store.updateSessionConfig(code, delta, changedBy);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ config: updatedConfig }) }] };
  } catch {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests: get_session_config handler
// ---------------------------------------------------------------------------

describe('get_session_config MCP tool handler', () => {
  describe('When the session exists', () => {
    it('Then returns the full config wrapped in { config }', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleGetSessionConfig(store, session.code);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { config: typeof DEFAULT_SESSION_CONFIG };
      expect(body.config).toBeDefined();
      expect(body.config.comparison.sensitivity).toBe(DEFAULT_SESSION_CONFIG.comparison.sensitivity);
      expect(body.config.contracts.strictness).toBe(DEFAULT_SESSION_CONFIG.contracts.strictness);
      expect(body.config.ranking.defaultTier).toBe(DEFAULT_SESSION_CONFIG.ranking.defaultTier);
      expect(body.config.delegation.level).toBe(DEFAULT_SESSION_CONFIG.delegation.level);
      expect(body.config.notifications.toastDuration).toBe(DEFAULT_SESSION_CONFIG.notifications.toastDuration);
    });

    it('Then the returned config reflects a previously applied delta', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      store.updateSessionConfig(session.code, { comparison: { sensitivity: 'exact', autoDetectConflicts: true, suggestResolutions: false } });

      const result = handleGetSessionConfig(store, session.code);

      const body = JSON.parse(result.content[0].text) as { config: typeof DEFAULT_SESSION_CONFIG };
      expect(body.config.comparison.sensitivity).toBe('exact');
      expect(body.config.comparison.suggestResolutions).toBe(false);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleGetSessionConfig(store, 'XXXXXX');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('XXXXXX');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: configure_session handler
// ---------------------------------------------------------------------------

describe('configure_session MCP tool handler', () => {
  describe('When the session exists and a valid delta is provided', () => {
    it('Then returns the full updated config wrapped in { config }', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleConfigureSession(store, session.code, {
        comparison: { sensitivity: 'exact', autoDetectConflicts: true, suggestResolutions: true },
      });

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { config: typeof DEFAULT_SESSION_CONFIG };
      expect(body.config.comparison.sensitivity).toBe('exact');
      // Untouched sections stay at defaults
      expect(body.config.contracts.strictness).toBe(DEFAULT_SESSION_CONFIG.contracts.strictness);
    });

    it('Then deep-merges the delta — unspecified keys keep their current values', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleConfigureSession(store, session.code, {
        notifications: { toastDuration: 3000, silentEvents: [] },
      });

      const body = JSON.parse(result.content[0].text) as { config: typeof DEFAULT_SESSION_CONFIG };
      expect(body.config.notifications.toastDuration).toBe(3000);
      // Other sections remain at their defaults
      expect(body.config.delegation.level).toBe(DEFAULT_SESSION_CONFIG.delegation.level);
    });

    it('Then the updated config is persisted on the session', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      handleConfigureSession(store, session.code, {
        delegation: { level: 'autonomous', approvalExpiry: 3600 },
      });

      const persisted = store.getSessionConfig(session.code);
      expect(persisted.delegation.level).toBe('autonomous');
      expect(persisted.delegation.approvalExpiry).toBe(3600);
    });

    it('Then a subsequent get_session_config call returns the updated values', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      handleConfigureSession(store, session.code, {
        contracts: { strictness: 'strict', driftNotifications: 'batched' },
      });

      const getResult = handleGetSessionConfig(store, session.code);
      const body = JSON.parse(getResult.content[0].text) as { config: typeof DEFAULT_SESSION_CONFIG };
      expect(body.config.contracts.strictness).toBe('strict');
      expect(body.config.contracts.driftNotifications).toBe('batched');
    });
  });

  describe('When an EventStore is wired', () => {
    it('Then emits a SessionConfigured domain event with the correct changedBy', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');

      handleConfigureSession(store, session.code, {
        ranking: { weights: { confidence: 2, complexity: 1, references: 1 }, defaultTier: 'Must Have' },
      }, 'Alice');

      const events = eventStore.getEvents(session.code);
      const configEvent = events.find((e) => e.type === 'SessionConfigured');
      expect(configEvent).toBeDefined();
      expect((configEvent as { changedBy: string }).changedBy).toBe('Alice');
      expect((configEvent as { sessionCode: string }).sessionCode).toBe(session.code);
    });

    it('Then the domain event carries the config delta', () => {
      const eventStore = new EventStore();
      const store = new SessionStore(eventStore);
      const { session } = store.createSession('Alice');

      handleConfigureSession(store, session.code, {
        notifications: { toastDuration: 500, silentEvents: ['ArtifactSubmitted'] },
      }, 'Bob');

      const events = eventStore.getEvents(session.code);
      const configEvent = events.find((e) => e.type === 'SessionConfigured');
      const delta = (configEvent as { configDelta: Record<string, unknown> }).configDelta;
      expect(delta).toBeDefined();
      expect((delta['notifications'] as { toastDuration: number }).toastDuration).toBe(500);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleConfigureSession(store, 'XXXXXX', {
        comparison: { sensitivity: 'exact', autoDetectConflicts: true, suggestResolutions: true },
      });

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('XXXXXX');
    });
  });

  describe('When an empty delta is provided', () => {
    it('Then config remains unchanged', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const before = store.getSessionConfig(session.code);

      handleConfigureSession(store, session.code, {});

      const after = store.getSessionConfig(session.code);
      expect(after).toEqual(before);
    });
  });
});
