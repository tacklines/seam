/**
 * Tests for the A2A (Agent-to-Agent) protocol implementation.
 *
 * Covers:
 *   - Agent Card generation
 *   - JSON-RPC envelope validation
 *   - message/send routing per skill
 *   - tasks/get status polling
 *   - tasks/cancel lifecycle
 *   - Error paths for all methods
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAgentCard,
  A2ATaskStore,
  handleA2ARequest,
  parseA2ABody,
  isA2ARoute,
  createA2AHandlers,
} from './a2a.js';
import type { JsonRpcSuccess, JsonRpcError, A2ATask } from './a2a.js';
import { SessionStore } from '../lib/session-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionStore(): SessionStore {
  return new SessionStore();
}

function makeTaskStore(): A2ATaskStore {
  return new A2ATaskStore();
}

function isSuccess(r: JsonRpcSuccess | JsonRpcError): r is JsonRpcSuccess {
  return 'result' in r;
}

function isError(r: JsonRpcSuccess | JsonRpcError): r is JsonRpcError {
  return 'error' in r;
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

describe('buildAgentCard', () => {
  it('returns a valid Agent Card at the expected url', () => {
    const card = buildAgentCard('https://api.example.com');
    expect(card.protocolVersion).toBe('0.2.5');
    expect(card.url).toBe('https://api.example.com/a2a');
    expect(card.name).toMatch(/Seam/);
  });

  it('includes all platform skills', () => {
    const card = buildAgentCard('https://api.example.com');
    const skillIds = card.skills.map((s) => s.id);
    expect(skillIds).toContain('create_session');
    expect(skillIds).toContain('join_session');
    expect(skillIds).toContain('submit_artifact');
    expect(skillIds).toContain('get_session');
    expect(skillIds).toContain('start_jam');
    expect(skillIds).toContain('compare_artifacts');
    expect(skillIds).toContain('query_prep_status');
  });

  it('advertises bearer auth requirement', () => {
    const card = buildAgentCard('https://api.example.com');
    expect(card.securitySchemes).toHaveProperty('bearerAuth');
    const scheme = card.securitySchemes['bearerAuth'] as Record<string, unknown>;
    expect(scheme['type']).toBe('http');
    expect(scheme['scheme']).toBe('bearer');
    expect(card.security).toEqual([{ bearerAuth: [] }]);
  });

  it('uses the provided baseUrl for provider.url', () => {
    const card = buildAgentCard('http://localhost:3002');
    expect(card.provider.url).toBe('http://localhost:3002');
    expect(card.url).toBe('http://localhost:3002/a2a');
  });

  it('each skill has required fields', () => {
    const card = buildAgentCard('https://api.example.com');
    for (const skill of card.skills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(Array.isArray(skill.tags)).toBe(true);
      expect(Array.isArray(skill.inputModes)).toBe(true);
      expect(Array.isArray(skill.outputModes)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// parseA2ABody
// ---------------------------------------------------------------------------

describe('parseA2ABody', () => {
  it('parses valid JSON', () => {
    const result = parseA2ABody('{"foo":"bar"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ foo: 'bar' });
  });

  it('returns error for invalid JSON', () => {
    const result = parseA2ABody('not json {');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// isA2ARoute
// ---------------------------------------------------------------------------

describe('isA2ARoute', () => {
  it('matches GET /.well-known/agent.json', () => {
    expect(isA2ARoute('GET', '/.well-known/agent.json')).toBe(true);
  });

  it('matches POST /a2a', () => {
    expect(isA2ARoute('POST', '/a2a')).toBe(true);
  });

  it('does not match other routes', () => {
    expect(isA2ARoute('GET', '/api/sessions')).toBe(false);
    expect(isA2ARoute('POST', '/api/sessions')).toBe(false);
    expect(isA2ARoute('DELETE', '/a2a')).toBe(false);
    expect(isA2ARoute('GET', '/a2a')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JSON-RPC envelope validation
// ---------------------------------------------------------------------------

describe('handleA2ARequest – envelope validation', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
  });

  it('rejects non-object body', () => {
    const res = handleA2ARequest('hello', taskStore, sessionStore);
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32600);
  });

  it('rejects missing jsonrpc field', () => {
    const res = handleA2ARequest({ method: 'tasks/get', id: 1 }, taskStore, sessionStore);
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32600);
  });

  it('rejects wrong jsonrpc version', () => {
    const res = handleA2ARequest({ jsonrpc: '1.0', method: 'tasks/get', id: 1 }, taskStore, sessionStore);
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32600);
  });

  it('rejects unknown method', () => {
    const res = handleA2ARequest({ jsonrpc: '2.0', method: 'foo/bar', id: 1 }, taskStore, sessionStore);
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32601);
  });

  it('preserves the request id in the response', () => {
    const res = handleA2ARequest({ jsonrpc: '2.0', method: 'unknown', id: 42 }, taskStore, sessionStore);
    expect(res.id).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// message/send — invalid params
// ---------------------------------------------------------------------------

describe('handleA2ARequest – message/send invalid params', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
  });

  it('returns invalid params when message is missing', () => {
    const res = handleA2ARequest({ jsonrpc: '2.0', method: 'message/send', params: {}, id: 1 }, taskStore, sessionStore);
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32602);
  });

  it('returns invalid params when skill cannot be determined', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'text', text: 'hello' }],
          },
        },
      },
      taskStore,
      sessionStore
    );
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------
// message/send — create_session skill
// ---------------------------------------------------------------------------

describe('message/send – create_session', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
  });

  it('creates a session and returns completed task with join code', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { creatorName: 'Alice' } }],
          },
          configuration: { skill: 'create_session' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
      expect(task.artifacts).toHaveLength(1);
      const artifact = task.artifacts![0];
      const part = artifact.parts[0];
      expect(part.kind).toBe('data');
      if (part.kind === 'data') {
        expect(typeof part.data['code']).toBe('string');
        expect(typeof part.data['participantId']).toBe('string');
      }
    }
  });

  it('fails when creatorName is missing', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: {} }],
          },
          configuration: { skill: 'create_session' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('failed');
      expect(task.status.message).toMatch(/creatorName/);
    }
  });

  it('extracts skill from text part if configuration is absent', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [
              { kind: 'text', text: 'skill: create_session' },
              { kind: 'data', data: { creatorName: 'Bob' } },
            ],
          },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — join_session skill
// ---------------------------------------------------------------------------

describe('message/send – join_session', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;
  let sessionCode: string;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
    const { session } = sessionStore.createSession('Alice');
    sessionCode = session.code;
  });

  it('joins an existing session', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: sessionCode, participantName: 'Bob' } }],
          },
          configuration: { skill: 'join_session' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
      const part = task.artifacts![0].parts[0];
      if (part.kind === 'data') {
        expect(typeof part.data['participantId']).toBe('string');
      }
    }
  });

  it('fails for non-existent session code', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: 'XXXXXX', participantName: 'Bob' } }],
          },
          configuration: { skill: 'join_session' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('failed');
      expect(task.status.message).toMatch(/not found/i);
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — get_session skill
// ---------------------------------------------------------------------------

describe('message/send – get_session', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;
  let sessionCode: string;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
    const { session } = sessionStore.createSession('Alice');
    sessionCode = session.code;
  });

  it('returns session info for existing session', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: sessionCode } }],
          },
          configuration: { skill: 'get_session' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
      const part = task.artifacts![0].parts[0];
      if (part.kind === 'data') {
        expect(part.data['code']).toBe(sessionCode);
        expect(Array.isArray(part.data['participants'])).toBe(true);
      }
    }
  });

  it('fails for unknown session code', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: 'XXXXXX' } }],
          },
          configuration: { skill: 'get_session' },
        },
      },
      taskStore,
      sessionStore
    );

    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('failed');
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — start_jam skill
// ---------------------------------------------------------------------------

describe('message/send – start_jam', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;
  let sessionCode: string;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
    const { session } = sessionStore.createSession('Alice');
    sessionCode = session.code;
  });

  it('starts a jam session', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: sessionCode } }],
          },
          configuration: { skill: 'start_jam' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — compare_artifacts skill
// ---------------------------------------------------------------------------

describe('message/send – compare_artifacts', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;
  let sessionCode: string;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
    const { session } = sessionStore.createSession('Alice');
    sessionCode = session.code;
  });

  it('returns empty overlaps when no submissions', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: sessionCode } }],
          },
          configuration: { skill: 'compare_artifacts' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
      const part = task.artifacts![0].parts[0];
      if (part.kind === 'data') {
        expect(part.data['overlaps']).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — query_prep_status skill
// ---------------------------------------------------------------------------

describe('message/send – query_prep_status', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;
  let sessionCode: string;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
    const { session } = sessionStore.createSession('Alice');
    sessionCode = session.code;
  });

  it('reports no submissions when session is empty', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: sessionCode } }],
          },
          configuration: { skill: 'query_prep_status' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('completed');
      const part = task.artifacts![0].parts[0];
      if (part.kind === 'data') {
        expect(part.data['message']).toMatch(/No submissions/);
      }
    }
  });

  it('fails when code is missing', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: {} }],
          },
          configuration: { skill: 'query_prep_status' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('failed');
    }
  });
});

// ---------------------------------------------------------------------------
// message/send — unknown skill
// ---------------------------------------------------------------------------

describe('message/send – unknown skill', () => {
  it('returns a failed task for unrecognized skill', () => {
    const taskStore = makeTaskStore();
    const sessionStore = makeSessionStore();

    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: {} }],
          },
          configuration: { skill: 'totally_unknown_skill' },
        },
      },
      taskStore,
      sessionStore
    );

    expect(isSuccess(res)).toBe(true);
    if (isSuccess(res)) {
      const task = res.result as A2ATask;
      expect(task.status.state).toBe('failed');
      expect(task.status.message).toMatch(/Unknown skill/);
    }
  });
});

// ---------------------------------------------------------------------------
// tasks/get
// ---------------------------------------------------------------------------

describe('tasks/get', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
  });

  it('returns a task by id', () => {
    // First create a task via message/send
    const { session } = sessionStore.createSession('Alice');
    const sendRes = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: session.code } }],
          },
          configuration: { skill: 'get_session' },
        },
      },
      taskStore,
      sessionStore
    );
    expect(isSuccess(sendRes)).toBe(true);
    const taskId = (sendRes as JsonRpcSuccess).result as A2ATask;

    const getRes = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/get',
        id: 2,
        params: { id: taskId.id },
      },
      taskStore,
      sessionStore
    );
    expect(isSuccess(getRes)).toBe(true);
    if (isSuccess(getRes)) {
      const task = getRes.result as A2ATask;
      expect(task.id).toBe(taskId.id);
    }
  });

  it('returns task-not-found error for unknown id', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/get',
        id: 1,
        params: { id: 'nonexistent-id' },
      },
      taskStore,
      sessionStore
    );
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32001);
  });

  it('returns invalid params when id is missing', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/get',
        id: 1,
        params: {},
      },
      taskStore,
      sessionStore
    );
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------
// tasks/cancel
// ---------------------------------------------------------------------------

describe('tasks/cancel', () => {
  let taskStore: A2ATaskStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    taskStore = makeTaskStore();
    sessionStore = makeSessionStore();
  });

  it('returns not-found for unknown task id', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/cancel',
        id: 1,
        params: { id: 'no-such-task' },
      },
      taskStore,
      sessionStore
    );
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32001);
  });

  it('rejects cancellation of a completed task', () => {
    const { session } = sessionStore.createSession('Alice');
    const sendRes = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 1,
        params: {
          message: {
            role: 'user',
            parts: [{ kind: 'data', data: { code: session.code } }],
          },
          configuration: { skill: 'get_session' },
        },
      },
      taskStore,
      sessionStore
    );
    const task = (sendRes as JsonRpcSuccess).result as A2ATask;
    expect(task.status.state).toBe('completed');

    const cancelRes = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/cancel',
        id: 2,
        params: { id: task.id },
      },
      taskStore,
      sessionStore
    );
    expect(isError(cancelRes)).toBe(true);
    if (isError(cancelRes)) expect(cancelRes.error.code).toBe(-32002);
  });

  it('returns invalid params when id is missing', () => {
    const res = handleA2ARequest(
      {
        jsonrpc: '2.0',
        method: 'tasks/cancel',
        id: 1,
        params: {},
      },
      taskStore,
      sessionStore
    );
    expect(isError(res)).toBe(true);
    if (isError(res)) expect(res.error.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------
// Task lifecycle — state transitions
// ---------------------------------------------------------------------------

describe('A2ATaskStore lifecycle', () => {
  it('creates a task in submitted state', () => {
    const store = makeTaskStore();
    const task = store.create({ skill: 'create_session', input: {} });
    expect(task.status.state).toBe('submitted');
    expect(typeof task.id).toBe('string');
    expect(typeof task.contextId).toBe('string');
  });

  it('updates task status', () => {
    const store = makeTaskStore();
    const task = store.create({ skill: 'test', input: {} });
    store.update(task.id, { status: { state: 'working', timestamp: new Date().toISOString() } });
    const updated = store.get(task.id);
    expect(updated?.status.state).toBe('working');
  });

  it('returns undefined for unknown id', () => {
    const store = makeTaskStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('returns all tasks via .all()', () => {
    const store = makeTaskStore();
    store.create({ skill: 'a', input: {} });
    store.create({ skill: 'b', input: {} });
    expect(store.all()).toHaveLength(2);
  });

  it('deletes a task', () => {
    const store = makeTaskStore();
    const task = store.create({ skill: 'test', input: {} });
    store.delete(task.id);
    expect(store.get(task.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createA2AHandlers
// ---------------------------------------------------------------------------

describe('createA2AHandlers', () => {
  it('returns handler functions', () => {
    const taskStore = makeTaskStore();
    const sessionStore = makeSessionStore();
    const handlers = createA2AHandlers(taskStore, sessionStore);
    expect(typeof handlers.onAgentCard).toBe('function');
    expect(typeof handlers.onRpc).toBe('function');
  });

  it('onAgentCard returns card with given baseUrl', () => {
    const handlers = createA2AHandlers(makeTaskStore(), makeSessionStore());
    const card = handlers.onAgentCard('https://test.example.com');
    expect(card.url).toBe('https://test.example.com/a2a');
  });

  it('onRpc delegates to handleA2ARequest', () => {
    const taskStore = makeTaskStore();
    const sessionStore = makeSessionStore();
    const handlers = createA2AHandlers(taskStore, sessionStore);
    const res = handlers.onRpc({ jsonrpc: '2.0', method: 'unknown', id: 1 });
    expect(isError(res as JsonRpcSuccess | JsonRpcError)).toBe(true);
  });
});
